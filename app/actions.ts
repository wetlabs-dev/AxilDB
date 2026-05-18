'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { audit, requireUser } from '@/lib/auth'
import {
  collectionPath,
  getCurrentCollectionSlug,
  requireCollectionAdmin,
  requireCollectionLogger,
  requireCollectionViewer,
} from '@/lib/collections'
import { createDemoData } from '@/lib/demo-data'
import { notifyFollowers } from '@/lib/follows'
import { generatePlantId } from '@/lib/plant-id'
import { plantName } from '@/lib/utils'

const val = (fd: FormData, k: string) =>
  String(fd.get(k) || '').trim() || undefined
const speciesVal = (fd: FormData, k = 'species') => val(fd, k)?.toLowerCase()

const date = (s?: string) => (s ? new Date(s) : undefined)
const dec = (s?: string) => (s ? s : undefined)
const back = (fd: FormData) => val(fd, 'back') || '/'
const collectionSlug = async (fd: FormData) => val(fd, 'collectionSlug') || await getCurrentCollectionSlug()
const revalidateDestination = (destination: string) => revalidatePath(destination.split('#')[0] || '/')
const boundedInt = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
const isSportLine = (status?: string | null) =>
  !!status && !['NONE', 'UNSTABLE', 'REVERTED'].includes(status)

function aliasRows(fd: FormData) {
  const names = fd.getAll('aliasName').map((value) => String(value || '').trim())
  const types = fd.getAll('aliasType').map((value) => String(value || '').trim())
  const sources = fd.getAll('aliasSource').map((value) => String(value || '').trim())
  const confidences = fd.getAll('aliasConfidence').map((value) => String(value || '').trim())
  const notes = fd.getAll('aliasNotes').map((value) => String(value || '').trim())

  return names
    .map((name, index) => ({
      name,
      aliasType: types[index] || 'SYNONYM',
      source: sources[index] || undefined,
      confidence: confidences[index] || 'UNCERTAIN',
      notes: notes[index] || undefined,
    }))
    .filter((alias) => alias.name)
}

async function cleanupGenericEntity(collectionId: string, entityType: string, entityId: string) {
  await prisma.note.deleteMany({ where: { collectionId, entityType, entityId } })
  await prisma.photo.deleteMany({ where: { collectionId, entityType, entityId } })
}

async function cleanupPlantInstanceDependents(collectionId: string, id: string) {
  const blooms = await prisma.bloomEvent.findMany({
    where: { collectionId, plantInstanceId: id },
    select: { id: true },
  })

  const bloomIds = blooms.map((b) => b.id)

  if (bloomIds.length > 0) {
    await prisma.photo.deleteMany({
      where: { collectionId, entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
    })

    await prisma.note.deleteMany({
      where: { collectionId, entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
    })
  }

  await cleanupGenericEntity(collectionId, 'PLANT_INSTANCE', id)
}

async function cleanupOrphanPropagationEvents(collectionId: string) {
  const events = await prisma.propagationEvent.findMany({
    where: { collectionId },
    select: {
      id: true,
      _count: { select: { parents: true, children: true, sportRecords: true } },
    },
  })

  const orphanIds = events
    .filter((event) => event._count.parents === 0 && event._count.children === 0 && event._count.sportRecords === 0)
    .map((event) => event.id)

  if (orphanIds.length === 0) return

  await prisma.note.deleteMany({
    where: { collectionId, entityType: 'PROPAGATION_EVENT', entityId: { in: orphanIds } },
  })

  await prisma.photo.deleteMany({
    where: { collectionId, entityType: 'PROPAGATION_EVENT', entityId: { in: orphanIds } },
  })

  await prisma.propagationEvent.deleteMany({ where: { collectionId, id: { in: orphanIds } } })
}

async function followLabel(collectionId: string, entityType: string, entityId: string) {
  if (entityType === 'PLANT_INSTANCE') {
    const instance = await prisma.plantInstance.findFirst({
      where: { id: entityId, collectionId },
      include: { plantDefinition: true },
    })
    return instance ? `${instance.plantId} · ${plantName(instance.plantDefinition)}` : entityId
  }

  if (entityType === 'PLANT_DEFINITION') {
    const definition = await prisma.plantDefinition.findFirst({ where: { id: entityId, collectionId } })
    return definition ? plantName(definition) : entityId
  }

  return entityId
}

export async function followEntity(fd: FormData) {
  const user = await requireUser()
  const context = await requireCollectionViewer(await collectionSlug(fd))
  const scope = val(fd, 'scope')!
  const entityType = val(fd, 'entityType')!
  const entityId = val(fd, 'entityId')!
  const destination = back(fd)
  const label = val(fd, 'label') || await followLabel(context.collection.id, entityType, entityId)

  const follow = await prisma.follow.upsert({
    where: { collectionId_userId_scope_entityType_entityId: { collectionId: context.collection.id, userId: user.id, scope, entityType, entityId } },
    update: { label },
    create: { collectionId: context.collection.id, userId: user.id, scope, entityType, entityId, label },
  })

  await audit(user, 'CREATE', 'FOLLOW', follow.id, `Followed ${label}`, undefined, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function unfollowEntity(fd: FormData) {
  const user = await requireUser()
  const id = val(fd, 'id')!
  const destination = back(fd)
  const context = await requireCollectionViewer(await collectionSlug(fd))
  const follow = await prisma.follow.findFirstOrThrow({
    where: { id, collectionId: context.collection.id },
    include: { collection: { select: { slug: true } } },
  })

  if (follow.userId !== user.id) {
    if (!follow.collection?.slug) throw new Error('You do not have permission to remove this follow.')
    await requireCollectionAdmin(follow.collection.slug)
  }

  await prisma.follow.delete({ where: { id } })
  await audit(user, 'DELETE', 'FOLLOW', id, `Unfollowed ${follow.label}`, follow, follow.collectionId)
  revalidateDestination(destination)
  redirect(destination)
}

export async function createGoverningBody(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const body = await prisma.governingBody.create({
    data: {
      collectionId: collection.id,
      name: val(fd, 'name')!,
      abbreviation: val(fd, 'abbreviation'),
      website: val(fd, 'website'),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'CREATE', 'GOVERNING_BODY', body.id, `Created governing body ${body.name}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, '/settings'))
}

export async function updateGoverningBody(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const existing = await prisma.governingBody.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const body = await prisma.governingBody.update({
    where: { id: existing.id },
    data: {
      name: val(fd, 'name')!,
      abbreviation: val(fd, 'abbreviation'),
      website: val(fd, 'website'),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'UPDATE', 'GOVERNING_BODY', body.id, `Updated governing body ${body.name}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, '/settings'))
}

export async function deleteGoverningBody(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const body = await prisma.governingBody.findFirst({ where: { id, collectionId: collection.id } })
  if (!body) throw new Error('Governing body not found in this collection.')
  await cleanupGenericEntity(collection.id, 'GOVERNING_BODY', id)
  await prisma.governingBody.delete({ where: { id } })
  await audit(user, 'DELETE', 'GOVERNING_BODY', id, `Deleted governing body ${body?.name || id}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, '/settings'))
}

export async function createPlantDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const definition = await prisma.plantDefinition.create({
    data: {
      collectionId: collection.id,
      genus: val(fd, 'genus')!,
      species: speciesVal(fd)!,
      hybridNotation: val(fd, 'hybridNotation'),
      cultivarName: val(fd, 'cultivarName'),
      authority: val(fd, 'authority'),
      cultivarRegistrationNumber: val(fd, 'cultivarRegistrationNumber'),
      governingBodyId: val(fd, 'governingBodyId'),
      confidence: val(fd, 'confidence') || 'UNCERTAIN',
      acquisitionLabel: val(fd, 'acquisitionLabel'),
      provisionalTaxon: val(fd, 'provisionalTaxon'),
      wikipediaUrl: val(fd, 'wikipediaUrl'),
      inaturalistUrl: val(fd, 'inaturalistUrl'),
      powoUrl: val(fd, 'powoUrl'),
      gbifUrl: val(fd, 'gbifUrl'),
      description: val(fd, 'description'),
      notes: val(fd, 'notes'),
      aliases: { create: aliasRows(fd).map((alias) => ({ ...alias, collectionId: collection.id })) },
    },
  })
  await audit(user, 'CREATE', 'PLANT_DEFINITION', definition.id, `Created plant definition ${definition.genus} ${definition.species}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, '/plants'))
}

export async function updatePlantDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  await prisma.plantDefinition.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })

  const definition = await prisma.plantDefinition.update({
    where: { id },
    data: {
      genus: val(fd, 'genus')!,
      species: speciesVal(fd)!,
      hybridNotation: val(fd, 'hybridNotation'),
      cultivarName: val(fd, 'cultivarName'),
      authority: val(fd, 'authority'),
      cultivarRegistrationNumber: val(fd, 'cultivarRegistrationNumber'),
      governingBodyId: val(fd, 'governingBodyId'),
      confidence: val(fd, 'confidence') || 'UNCERTAIN',
      acquisitionLabel: val(fd, 'acquisitionLabel'),
      provisionalTaxon: val(fd, 'provisionalTaxon'),
      wikipediaUrl: val(fd, 'wikipediaUrl'),
      inaturalistUrl: val(fd, 'inaturalistUrl'),
      powoUrl: val(fd, 'powoUrl'),
      gbifUrl: val(fd, 'gbifUrl'),
      description: val(fd, 'description'),
      notes: val(fd, 'notes'),
      aliases: {
        deleteMany: {},
        create: aliasRows(fd).map((alias) => ({ ...alias, collectionId: collection.id })),
      },
    },
  })
  await audit(user, 'UPDATE', 'PLANT_DEFINITION', id, `Updated plant definition ${definition.genus} ${definition.species}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, `/plants/${id}/edit`))
}

export async function deletePlantDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const definition = await prisma.plantDefinition.findFirst({ where: { id, collectionId: collection.id } })
  if (!definition) throw new Error('Plant definition not found in this collection.')

  const instances = await prisma.plantInstance.findMany({
    where: { collectionId: collection.id, plantDefinitionId: id },
    select: { id: true },
  })

  for (const instance of instances) {
    await cleanupPlantInstanceDependents(collection.id, instance.id)
  }

  await cleanupGenericEntity(collection.id, 'PLANT_DEFINITION', id)
  await prisma.plantDefinition.delete({ where: { id } })
  await cleanupOrphanPropagationEvents(collection.id)
  await audit(user, 'DELETE', 'PLANT_DEFINITION', id, `Deleted plant definition ${definition ? `${definition.genus} ${definition.species}` : id}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, '/plants'))
}

export async function createPlantInstance(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId: collection.id }, select: { id: true } })
  const instanceType = val(fd, 'instanceType')!
  const acquisitionDate = date(val(fd, 'acquisitionDate'))
  const propagationDate = date(val(fd, 'propagationDate'))
  const plantId = await generatePlantId(prisma, {
    collectionId: collection.id,
    plantDefinitionId,
    instanceType,
    date: propagationDate || acquisitionDate,
  })

  const instance = await prisma.plantInstance.create({
    data: {
      collectionId: collection.id,
      plantDefinitionId,
      plantId,
      instanceType,
      location: val(fd, 'location'),
      acquisitionDate,
      propagationDate,
      source: val(fd, 'source'),
      distributor: val(fd, 'distributor'),
      stockNumber: val(fd, 'stockNumber'),
      purchasePrice: dec(val(fd, 'purchasePrice')) as any,
    },
  })

  const note = val(fd, 'note')
  if (note) {
    await prisma.note.create({
      data: { collectionId: collection.id, entityType: 'PLANT_INSTANCE', entityId: instance.id, note },
    })
  }

  await audit(user, 'CREATE', 'PLANT_INSTANCE', instance.id, `Created plant instance ${instance.plantId}`, undefined, collection.id)
  await notifyFollowers(prisma, {
    actorUserId: user.id,
    eventType: 'NEW_PLANT',
    subject: `New ${instance.instanceType.toLowerCase()} plant: ${instance.plantId}`,
    body: `${instance.plantId} was added to ${plantName(await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId: collection.id } }))}.`,
    collectionId: collection.id,
    recordPath: collectionPath(collection.slug, `/instances/${instance.id}`),
    plantInstanceIds: [instance.id],
    plantDefinitionIds: [plantDefinitionId],
  })

  redirect(collectionPath(collection.slug, '/instances'))
}

export async function updatePlantInstance(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })

  const instance = await prisma.plantInstance.update({
    where: { id },
    data: {
      plantDefinitionId: val(fd, 'plantDefinitionId')!,
      instanceType: val(fd, 'instanceType')!,
      status: val(fd, 'status') || 'ACTIVE',
      location: val(fd, 'location'),
      acquisitionDate: date(val(fd, 'acquisitionDate')),
      propagationDate: date(val(fd, 'propagationDate')),
      source: val(fd, 'source'),
      distributor: val(fd, 'distributor'),
      stockNumber: val(fd, 'stockNumber'),
      purchasePrice: dec(val(fd, 'purchasePrice')) as any,
      archiveReason: val(fd, 'archiveReason'),
      archiveNotes: val(fd, 'archiveNotes'),
    },
  })
  await audit(user, 'UPDATE', 'PLANT_INSTANCE', id, `Updated plant instance ${instance.plantId}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, `/instances/${id}`))
}

export async function deletePlantInstance(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const instance = await prisma.plantInstance.findFirst({ where: { id, collectionId: collection.id } })
  if (!instance) throw new Error('Plant instance not found in this collection.')

  await cleanupPlantInstanceDependents(collection.id, id)
  await prisma.plantInstance.delete({ where: { id } })
  await cleanupOrphanPropagationEvents(collection.id)
  await audit(user, 'DELETE', 'PLANT_INSTANCE', id, `Deleted plant instance ${instance?.plantId || id}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, '/instances'))
}

export async function archivePlantInstance(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })

  const instance = await prisma.plantInstance.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
      archiveDate: new Date(),
      archiveReason: val(fd, 'archiveReason'),
      archiveNotes: val(fd, 'archiveNotes'),
    },
  })
  await audit(user, 'ARCHIVE', 'PLANT_INSTANCE', id, `Archived plant instance ${instance.plantId}`, undefined, collection.id)
  await notifyFollowers(prisma, {
    collectionId: collection.id,
    actorUserId: user.id,
    eventType: 'ARCHIVE',
    subject: `${instance.plantId} was archived`,
    body: instance.archiveReason || 'A plant you follow was archived.',
    recordPath: collectionPath(collection.slug, `/instances/${id}`),
    plantInstanceIds: [id],
  })

  redirect(collectionPath(collection.slug, `/instances/${id}`))
}

export async function restorePlantInstance(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })

  const instance = await prisma.plantInstance.update({
    where: { id },
    data: { status: 'ACTIVE', archiveDate: null, archiveReason: null, archiveNotes: null },
  })
  await audit(user, 'RESTORE', 'PLANT_INSTANCE', id, `Restored plant instance ${instance.plantId}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, `/instances/${id}`))
}

export async function addNote(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const note = await prisma.note.create({
    data: { collectionId: collection.id, entityType: val(fd, 'entityType')!, entityId: val(fd, 'entityId')!, note: val(fd, 'note')! },
  })
  await audit(user, 'CREATE', 'NOTE', note.id, `Added note to ${note.entityType} ${note.entityId}`, undefined, collection.id)
  if (note.entityType === 'PLANT_INSTANCE') {
    const instance = await prisma.plantInstance.findFirst({ where: { id: note.entityId, collectionId: collection.id } })
    if (instance) {
      await notifyFollowers(prisma, {
        collectionId: collection.id,
        actorUserId: user.id,
        eventType: 'NOTE',
        subject: `New note on ${instance.plantId}`,
        body: note.note,
        recordPath: collectionPath(collection.slug, `/instances/${instance.id}`),
        plantInstanceIds: [instance.id],
        plantDefinitionIds: [instance.plantDefinitionId],
      })
    }
  }

  redirect(back(fd))
}

async function requireReminderAccess(id: string, collectionSlugValue: string) {
  const user = await requireUser()
  const context = await requireCollectionViewer(collectionSlugValue)
  const reminder = await prisma.reminder.findFirstOrThrow({
    where: { id, collectionId: context.collection.id },
    include: { collection: { select: { slug: true } } },
  })

  if (reminder.userId !== user.id) {
    if (!reminder.collection?.slug) throw new Error('You do not have permission to manage this reminder.')
    await requireCollectionAdmin(reminder.collection.slug)
  }

  return { user, reminder }
}

export async function createReminder(fd: FormData) {
  const user = await requireUser()
  const context = await requireCollectionViewer(await collectionSlug(fd))
  const dueAt = date(val(fd, 'dueAt'))
  const destination = back(fd)

  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    throw new Error('A valid reminder date is required.')
  }

  const reminder = await prisma.reminder.create({
    data: {
      collectionId: context.collection.id,
      userId: user.id,
      title: val(fd, 'title') || 'AxilDB reminder',
      body: val(fd, 'body'),
      category: val(fd, 'category') || 'GENERAL',
      entityType: val(fd, 'entityType'),
      entityId: val(fd, 'entityId'),
      dueAt,
      nextSendAt: dueAt,
      rrule: val(fd, 'rrule'),
    },
  })

  await audit(user, 'CREATE', 'REMINDER', reminder.id, `Created reminder ${reminder.title}`, undefined, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function completeReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id, await collectionSlug(fd))

  await prisma.reminder.update({
    where: { id },
    data: { completedAt: new Date(), nextSendAt: null },
  })

  await audit(user, 'COMPLETE', 'REMINDER', id, `Completed reminder ${reminder.title}`, undefined, reminder.collectionId)
  revalidateDestination(destination)
  redirect(destination)
}

export async function pauseReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id, await collectionSlug(fd))

  await prisma.reminder.update({
    where: { id },
    data: { pausedAt: new Date(), nextSendAt: null },
  })

  await audit(user, 'PAUSE', 'REMINDER', id, `Paused reminder ${reminder.title}`, undefined, reminder.collectionId)
  revalidateDestination(destination)
  redirect(destination)
}

export async function resumeReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id, await collectionSlug(fd))

  await prisma.reminder.update({
    where: { id },
    data: { pausedAt: null, nextSendAt: reminder.nextSendAt || reminder.dueAt },
  })

  await audit(user, 'RESUME', 'REMINDER', id, `Resumed reminder ${reminder.title}`, undefined, reminder.collectionId)
  revalidateDestination(destination)
  redirect(destination)
}

export async function deleteReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id, await collectionSlug(fd))

  await prisma.reminder.delete({ where: { id } })

  await audit(user, 'DELETE', 'REMINDER', id, `Deleted reminder ${reminder.title}`, reminder, reminder.collectionId)
  revalidateDestination(destination)
  redirect(destination)
}

export async function markSportCandidate(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const observation = val(fd, 'observation')

  await prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })
  const instance = await prisma.plantInstance.update({
    where: { id },
    data: {
      isSportCandidate: true,
      sportStatus: 'SUSPECTED',
      sportDescription: observation,
    },
  })

  if (observation) {
    await prisma.note.create({
      data: {
        collectionId: collection.id,
        entityType: 'PLANT_INSTANCE',
        entityId: id,
        note: `Sport suspected: ${observation}`,
      },
    })
  }

  await audit(user, 'UPDATE', 'PLANT_INSTANCE', id, `Marked plant instance ${instance.plantId} as a suspected sport`, undefined, collection.id)
  await notifyFollowers(prisma, {
    collectionId: collection.id,
    actorUserId: user.id,
    eventType: 'SPORT',
    subject: `${instance.plantId} was marked as a suspected sport`,
    body: observation || 'A plant you follow has a new sport observation.',
    recordPath: collectionPath(collection.slug, `/instances/${id}`),
    plantInstanceIds: [id],
    plantDefinitionIds: [instance.plantDefinitionId],
  })
  redirect(collectionPath(collection.slug, `/instances/${id}`))
}

export async function markSportReverted(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const observation = val(fd, 'observation')

  await prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })
  const instance = await prisma.plantInstance.update({
    where: { id },
    data: {
      isSportCandidate: false,
      sportStatus: 'REVERTED',
      sportDescription: observation,
    },
  })

  await prisma.note.create({
    data: {
      collectionId: collection.id,
      entityType: 'PLANT_INSTANCE',
      entityId: id,
      note: observation
        ? `Sport reverted: ${observation}`
        : 'Sport reverted: plant appears to match the original cultivar or parent phenotype.',
    },
  })

  await audit(user, 'UPDATE', 'PLANT_INSTANCE', id, `Marked plant instance ${instance.plantId} as reverted`, undefined, collection.id)
  await notifyFollowers(prisma, {
    collectionId: collection.id,
    actorUserId: user.id,
    eventType: 'SPORT',
    subject: `${instance.plantId} was marked reverted`,
    body: observation || 'A followed sport line appears to have reverted.',
    recordPath: collectionPath(collection.slug, `/instances/${id}`),
    plantInstanceIds: [id],
    plantDefinitionIds: [instance.plantDefinitionId],
  })
  redirect(back(fd) || collectionPath(collection.slug, `/instances/${id}`))
}

export async function deleteNote(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const note = await prisma.note.findFirst({ where: { id, collectionId: collection.id } })
  if (!note) throw new Error('Note not found in this collection.')
  await prisma.note.delete({ where: { id } })
  await audit(user, 'DELETE', 'NOTE', id, `Deleted note ${id}`, note, collection.id)
  redirect(back(fd))
}

export async function setCoverPhoto(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const photo = await prisma.photo.findFirstOrThrow({ where: { id, collectionId: collection.id } })

  if (photo.entityType !== 'PLANT_INSTANCE') {
    throw new Error('Only plant instance photos can be selected as cover photos.')
  }

  await prisma.$transaction([
    prisma.photo.updateMany({
      where: { collectionId: collection.id, entityType: 'PLANT_INSTANCE', entityId: photo.entityId },
      data: { isCover: false },
    }),
    prisma.photo.update({
      where: { id },
      data: { isCover: true },
    }),
  ])

  await audit(user, 'UPDATE', 'PHOTO', id, `Selected cover photo for plant instance ${photo.entityId}`, undefined, collection.id)
  redirect(back(fd))
}

export async function setTypePhoto(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const photo = await prisma.photo.findFirstOrThrow({ where: { id, collectionId: collection.id } })

  if (photo.entityType !== 'PLANT_INSTANCE') {
    throw new Error('Only plant instance photos can be selected as type photos.')
  }

  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id: photo.entityId, collectionId: collection.id },
    select: { plantDefinitionId: true },
  })

  const siblingInstances = await prisma.plantInstance.findMany({
    where: { collectionId: collection.id, plantDefinitionId: instance.plantDefinitionId },
    select: { id: true },
  })
  const siblingIds = siblingInstances.map((item) => item.id)

  await prisma.$transaction([
    prisma.photo.updateMany({
      where: { collectionId: collection.id, entityType: 'PLANT_INSTANCE', entityId: { in: siblingIds } },
      data: { isType: false },
    }),
    prisma.photo.update({
      where: { id },
      data: { isType: true },
    }),
  ])

  await audit(user, 'UPDATE', 'PHOTO', id, `Selected type photo for plant definition ${instance.plantDefinitionId}`, undefined, collection.id)
  redirect(back(fd))
}

export async function deletePhoto(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const destination = back(fd)
  const photo = await prisma.photo.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const samePathCount = await prisma.photo.count({ where: { path: photo.path } })

  await prisma.photo.delete({ where: { id } })

  if (samePathCount <= 1 && photo.path.startsWith('/uploads/')) {
    const filename = path.basename(photo.path)
    try {
      await unlink(path.join(process.cwd(), 'public', 'uploads', filename))
    } catch {
      // The database record is the source of truth; missing files should not block cleanup.
    }
  }

  await audit(user, 'DELETE', 'PHOTO', id, `Deleted photo for ${photo.entityType} ${photo.entityId}`, photo, collection.id)
  revalidatePath(destination)
  redirect(destination)
}

export async function openBloomEvent(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id }, select: { id: true } })

  const bloom = await prisma.bloomEvent.create({
    data: {
      collectionId: collection.id,
      plantInstanceId,
      bloomStartDate: date(val(fd, 'bloomStartDate'))!,
      firstBloom: !!fd.get('firstBloom'),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'CREATE', 'BLOOM_EVENT', bloom.id, `Opened bloom event for plant instance ${plantInstanceId}`, undefined, collection.id)
  const instance = await prisma.plantInstance.findFirst({ where: { id: plantInstanceId, collectionId: collection.id } })
  if (instance) {
    await notifyFollowers(prisma, {
      collectionId: collection.id,
      actorUserId: user.id,
      eventType: 'BLOOM',
      subject: `New bloom on ${instance.plantId}`,
      body: val(fd, 'notes') || 'A plant you follow has a newly opened bloom event.',
      recordPath: collectionPath(collection.slug, `/instances/${plantInstanceId}#bloom-${bloom.id}`),
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  revalidatePath(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function updateBloomPeak(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const plantInstanceId = val(fd, 'plantInstanceId')!

  await prisma.bloomEvent.update({
    where: { id },
    data: {
      peakBloomDate: date(val(fd, 'peakBloomDate')) ?? null,
      flowerCount: val(fd, 'flowerCount') ? Number(val(fd, 'flowerCount')) : null,
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'UPDATE', 'BLOOM_EVENT', id, `Updated bloom peak for plant instance ${plantInstanceId}`, undefined, collection.id)
  const instance = await prisma.plantInstance.findFirst({ where: { id: plantInstanceId, collectionId: collection.id } })
  if (instance) {
    await notifyFollowers(prisma, {
      collectionId: collection.id,
      actorUserId: user.id,
      eventType: 'BLOOM',
      subject: `Bloom peak updated for ${instance.plantId}`,
      body: val(fd, 'notes') || 'A bloom event was updated for a plant you follow.',
      recordPath: collectionPath(collection.slug, `/instances/${plantInstanceId}#bloom-${id}`),
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  revalidatePath(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function closeBloomEvent(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const plantInstanceId = val(fd, 'plantInstanceId')!

  await prisma.bloomEvent.update({
    where: { id },
    data: { bloomEndDate: date(val(fd, 'bloomEndDate'))!, notes: val(fd, 'notes') },
  })
  await audit(user, 'UPDATE', 'BLOOM_EVENT', id, `Closed bloom event for plant instance ${plantInstanceId}`, undefined, collection.id)
  const instance = await prisma.plantInstance.findFirst({ where: { id: plantInstanceId, collectionId: collection.id } })
  if (instance) {
    await notifyFollowers(prisma, {
      collectionId: collection.id,
      actorUserId: user.id,
      eventType: 'BLOOM',
      subject: `Bloom closed for ${instance.plantId}`,
      body: val(fd, 'notes') || 'A bloom event was closed for a plant you follow.',
      recordPath: collectionPath(collection.slug, `/instances/${plantInstanceId}#bloom-${id}`),
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  revalidatePath(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function createBloomEvent(fd: FormData) {
  return openBloomEvent(fd)
}

export async function updateBloomEvent(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const plantInstanceId = val(fd, 'plantInstanceId')!
  await prisma.bloomEvent.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })

  await prisma.bloomEvent.update({
    where: { id },
    data: {
      bloomStartDate: date(val(fd, 'bloomStartDate'))!,
      peakBloomDate: date(val(fd, 'peakBloomDate')) ?? null,
      bloomEndDate: date(val(fd, 'bloomEndDate')) ?? null,
      flowerCount: val(fd, 'flowerCount') ? Number(val(fd, 'flowerCount')) : null,
      firstBloom: !!fd.get('firstBloom'),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'UPDATE', 'BLOOM_EVENT', id, `Updated bloom event for plant instance ${plantInstanceId}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function deleteBloomEvent(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const plantInstanceId = val(fd, 'plantInstanceId')!
  await prisma.bloomEvent.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })

  await cleanupGenericEntity(collection.id, 'BLOOM_EVENT', id)
  await prisma.bloomEvent.delete({ where: { id } })
  await audit(user, 'DELETE', 'BLOOM_EVENT', id, `Deleted bloom event for plant instance ${plantInstanceId}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function createPropagationEvent(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const method = val(fd, 'method')!
  const parent1 = val(fd, 'parent1')!
  const parent2 = val(fd, 'parent2')
  const eventDate = date(val(fd, 'date'))!
  const childCount = boundedInt(val(fd, 'childCount'), 1, 1, 50)

  if (method === 'SEED' && !parent2) {
    throw new Error('Sexual reproduction requires two parent plants.')
  }

  const parentPlant = await prisma.plantInstance.findFirstOrThrow({ where: { id: parent1, collectionId: collection.id } })
  if (parent2) {
    await prisma.plantInstance.findFirstOrThrow({ where: { id: parent2, collectionId: collection.id }, select: { id: true } })
  }
  const childSportStatus = isSportLine(parentPlant.sportStatus) ? 'CANDIDATE' : 'NONE'
  const childSportDescription = isSportLine(parentPlant.sportStatus)
    ? `Derived from sport line ${parentPlant.plantId}. Confirm whether the trait propagates true.`
    : undefined

  const event = await prisma.propagationEvent.create({
    data: {
      collectionId: collection.id,
      method,
      date: eventDate,
      notes: val(fd, 'notes'),
      successStatus: val(fd, 'successStatus') || 'PENDING',
      parents: {
        create: [
          { parentPlantInstanceId: parent1, parentRole: method === 'SEED' ? 'SEED_PARENT' : 'SOURCE_PARENT' },
          ...(parent2 ? [{ parentPlantInstanceId: parent2, parentRole: 'POLLEN_PARENT' }] : []),
        ],
      },
    },
  })

  const childCodes: string[] = []
  const childIds: string[] = []

  for (let index = 0; index < childCount; index += 1) {
    const plantId = await generatePlantId(prisma, {
      collectionId: collection.id,
      plantDefinitionId: parentPlant.plantDefinitionId,
      date: eventDate,
      instanceType: 'PROPAGATION',
      method,
    })
    childCodes.push(plantId)

    const child = await prisma.plantInstance.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId: parentPlant.plantDefinitionId,
        plantId,
        instanceType: 'PROPAGATION',
        propagationDate: eventDate,
        location: val(fd, 'location'),
        isSportCandidate: isSportLine(parentPlant.sportStatus),
        sportStatus: childSportStatus,
        sportDescription: childSportDescription,
      },
    })
    childIds.push(child.id)

    await prisma.propagationChild.create({
      data: { propagationEventId: event.id, childPlantInstanceId: child.id },
    })
  }
  await audit(user, 'CREATE', 'PROPAGATION_EVENT', event.id, `Created ${method} propagation event`, { childCodes }, collection.id)
  await notifyFollowers(prisma, {
    collectionId: collection.id,
    actorUserId: user.id,
    eventType: 'PROPAGATION',
    subject: `New ${method.toLowerCase()} propagation from ${parentPlant.plantId}`,
    body: `Created child plants: ${childCodes.join(', ')}`,
    recordPath: collectionPath(collection.slug, '/propagations'),
    plantInstanceIds: [parent1, ...childIds],
    plantDefinitionIds: [parentPlant.plantDefinitionId],
  })

  redirect(collectionPath(collection.slug, '/propagations'))
}

export async function updatePropagationEvent(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  await prisma.propagationEvent.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true } })

  const event = await prisma.propagationEvent.update({
    where: { id },
    data: {
      method: val(fd, 'method')!,
      date: date(val(fd, 'date'))!,
      successStatus: val(fd, 'successStatus') || 'PENDING',
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'UPDATE', 'PROPAGATION_EVENT', id, `Updated ${event.method} propagation event`, undefined, collection.id)

  redirect(collectionPath(collection.slug, '/propagations'))
}

export async function deletePropagationEvent(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const event = await prisma.propagationEvent.findFirst({ where: { id, collectionId: collection.id } })
  if (!event) redirect(collectionPath(collection.slug, '/propagations'))

  await cleanupGenericEntity(collection.id, 'PROPAGATION_EVENT', id)
  await prisma.propagationEvent.delete({ where: { id } })
  await audit(user, 'DELETE', 'PROPAGATION_EVENT', id, `Deleted ${event?.method || ''} propagation event`, event, collection.id)

  redirect(collectionPath(collection.slug, '/propagations'))
}

export async function createSportStabilityRecord(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id }, select: { id: true } })
  await prisma.propagationEvent.findFirstOrThrow({ where: { id: val(fd, 'propagationEventId')!, collectionId: collection.id }, select: { id: true } })
  const propagatedTrue = !!fd.get('propagatedTrue')
  const record = await prisma.sportStabilityRecord.create({
    data: {
      plantInstanceId,
      propagationEventId: val(fd, 'propagationEventId')!,
      propagatedTrue,
      generationNumber: Number(val(fd, 'generationNumber') || 1),
      notes: val(fd, 'notes'),
    },
  })

  const trueRecords = await prisma.sportStabilityRecord.findMany({
    where: { plantInstanceId, propagatedTrue: true },
    select: { generationNumber: true },
  })
  const trueCount = trueRecords.length
  const maxGeneration = trueRecords.reduce((max, item) => Math.max(max, item.generationNumber), 0)
  const nextStatus = trueCount >= 3 || maxGeneration >= 3 ? 'STABLE' : propagatedTrue ? 'CANDIDATE' : 'REVERTED'

  await prisma.plantInstance.update({
    where: { id: plantInstanceId },
    data: { isSportCandidate: nextStatus !== 'REVERTED', sportStatus: nextStatus },
  })

  await audit(user, 'CREATE', 'SPORT_STABILITY_RECORD', record.id, `Added sport stability record`, undefined, collection.id)
  const instance = await prisma.plantInstance.findFirst({ where: { id: plantInstanceId, collectionId: collection.id } })
  if (instance) {
    await notifyFollowers(prisma, {
      collectionId: collection.id,
      actorUserId: user.id,
      eventType: 'SPORT',
      subject: `Sport stability updated for ${instance.plantId}`,
      body: val(fd, 'notes') || `Sport status is now ${nextStatus.toLowerCase()}.`,
      recordPath: collectionPath(collection.slug, `/instances/${plantInstanceId}`),
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  redirect(back(fd))
}

export async function createCultivarFromSport(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!

  const inst = await prisma.plantInstance.findFirstOrThrow({
    where: { id: plantInstanceId, collectionId: collection.id },
    include: { plantDefinition: true },
  })

  const def = await prisma.plantDefinition.create({
    data: {
      collectionId: collection.id,
      genus: val(fd, 'genus') || inst.plantDefinition.genus,
      species: speciesVal(fd) || inst.plantDefinition.species,
      hybridNotation: val(fd, 'hybridNotation') || inst.plantDefinition.hybridNotation,
      cultivarName: val(fd, 'cultivarName')!,
      authority: val(fd, 'authority'),
      cultivarRegistrationNumber: val(fd, 'cultivarRegistrationNumber'),
      governingBodyId: val(fd, 'governingBodyId'),
      confidence: 'CONFIRMED',
      description: val(fd, 'description') || inst.sportDescription,
      notes: `Created from stable sport lineage of ${inst.plantId}.`,
    },
  })

  await prisma.plantInstance.update({
    where: { id: plantInstanceId },
    data: { plantDefinitionId: def.id, sportStatus: 'REGISTERED', isSportCandidate: false },
  })
  await audit(user, 'CREATE', 'PLANT_DEFINITION', def.id, `Created cultivar ${def.cultivarName} from sport ${inst.plantId}`, undefined, collection.id)
  await audit(user, 'UPDATE', 'PLANT_INSTANCE', plantInstanceId, `Reassigned sport ${inst.plantId} to new cultivar ${def.cultivarName}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function populateDemoData(fd?: FormData) {
  const { user, collection } = await requireCollectionAdmin(fd ? await collectionSlug(fd) : await getCurrentCollectionSlug())
  const result = await createDemoData(collection.id)
  await audit(user, 'CREATE', 'DEMO_DATA', result.batch, `Populated demo data batch ${result.batch}`, result, collection.id)

  revalidatePath(collectionPath(collection.slug, '/'))
  revalidatePath(collectionPath(collection.slug, '/plants'))
  revalidatePath(collectionPath(collection.slug, '/instances'))
  revalidatePath(collectionPath(collection.slug, '/propagations'))
  redirect(collectionPath(collection.slug, '/admin-tools'))
}
