'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { audit, isAdmin, requireAdminUser, requireCreateUser, requireUser } from '@/lib/auth'
import { createDemoData } from '@/lib/demo-data'
import { notifyFollowers } from '@/lib/follows'
import { generatePlantId } from '@/lib/plant-id'
import { plantName } from '@/lib/utils'

const val = (fd: FormData, k: string) =>
  String(fd.get(k) || '').trim() || undefined

const date = (s?: string) => (s ? new Date(s) : undefined)
const dec = (s?: string) => (s ? s : undefined)
const back = (fd: FormData) => val(fd, 'back') || '/'
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

async function cleanupGenericEntity(entityType: string, entityId: string) {
  await prisma.note.deleteMany({ where: { entityType, entityId } })
  await prisma.photo.deleteMany({ where: { entityType, entityId } })
}

async function cleanupPlantInstanceDependents(id: string) {
  const blooms = await prisma.bloomEvent.findMany({
    where: { plantInstanceId: id },
    select: { id: true },
  })

  const bloomIds = blooms.map((b) => b.id)

  if (bloomIds.length > 0) {
    await prisma.photo.deleteMany({
      where: { entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
    })

    await prisma.note.deleteMany({
      where: { entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
    })
  }

  await cleanupGenericEntity('PLANT_INSTANCE', id)
}

async function cleanupOrphanPropagationEvents() {
  const events = await prisma.propagationEvent.findMany({
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
    where: { entityType: 'PROPAGATION_EVENT', entityId: { in: orphanIds } },
  })

  await prisma.photo.deleteMany({
    where: { entityType: 'PROPAGATION_EVENT', entityId: { in: orphanIds } },
  })

  await prisma.propagationEvent.deleteMany({ where: { id: { in: orphanIds } } })
}

async function followLabel(entityType: string, entityId: string) {
  if (entityType === 'PLANT_INSTANCE') {
    const instance = await prisma.plantInstance.findUnique({
      where: { id: entityId },
      include: { plantDefinition: true },
    })
    return instance ? `${instance.plantId} · ${plantName(instance.plantDefinition)}` : entityId
  }

  if (entityType === 'PLANT_DEFINITION') {
    const definition = await prisma.plantDefinition.findUnique({ where: { id: entityId } })
    return definition ? plantName(definition) : entityId
  }

  return entityId
}

export async function followEntity(fd: FormData) {
  const user = await requireUser()
  const scope = val(fd, 'scope')!
  const entityType = val(fd, 'entityType')!
  const entityId = val(fd, 'entityId')!
  const destination = back(fd)
  const label = val(fd, 'label') || await followLabel(entityType, entityId)

  const follow = await prisma.follow.upsert({
    where: { userId_scope_entityType_entityId: { userId: user.id, scope, entityType, entityId } },
    update: { label },
    create: { userId: user.id, scope, entityType, entityId, label },
  })

  await audit(user, 'CREATE', 'FOLLOW', follow.id, `Followed ${label}`)
  revalidateDestination(destination)
  redirect(destination)
}

export async function unfollowEntity(fd: FormData) {
  const user = await requireUser()
  const id = val(fd, 'id')!
  const destination = back(fd)
  const follow = await prisma.follow.findUniqueOrThrow({ where: { id } })

  if (follow.userId !== user.id && !isAdmin(user)) {
    throw new Error('You do not have permission to remove this follow.')
  }

  await prisma.follow.delete({ where: { id } })
  await audit(user, 'DELETE', 'FOLLOW', id, `Unfollowed ${follow.label}`, follow)
  revalidateDestination(destination)
  redirect(destination)
}

export async function createGoverningBody(fd: FormData) {
  const user = await requireAdminUser()
  const body = await prisma.governingBody.create({
    data: {
      name: val(fd, 'name')!,
      abbreviation: val(fd, 'abbreviation'),
      website: val(fd, 'website'),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'CREATE', 'GOVERNING_BODY', body.id, `Created governing body ${body.name}`)

  redirect('/settings')
}

export async function updateGoverningBody(fd: FormData) {
  const user = await requireAdminUser()
  const body = await prisma.governingBody.update({
    where: { id: val(fd, 'id')! },
    data: {
      name: val(fd, 'name')!,
      abbreviation: val(fd, 'abbreviation'),
      website: val(fd, 'website'),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'UPDATE', 'GOVERNING_BODY', body.id, `Updated governing body ${body.name}`)

  redirect('/settings')
}

export async function deleteGoverningBody(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const body = await prisma.governingBody.findUnique({ where: { id } })
  await cleanupGenericEntity('GOVERNING_BODY', id)
  await prisma.governingBody.delete({ where: { id } })
  await audit(user, 'DELETE', 'GOVERNING_BODY', id, `Deleted governing body ${body?.name || id}`)
  redirect('/settings')
}

export async function createPlantDefinition(fd: FormData) {
  const user = await requireCreateUser()
  const definition = await prisma.plantDefinition.create({
    data: {
      genus: val(fd, 'genus')!,
      species: val(fd, 'species')!,
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
      aliases: { create: aliasRows(fd) },
    },
  })
  await audit(user, 'CREATE', 'PLANT_DEFINITION', definition.id, `Created plant definition ${definition.genus} ${definition.species}`)

  redirect('/plants')
}

export async function updatePlantDefinition(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!

  const definition = await prisma.plantDefinition.update({
    where: { id },
    data: {
      genus: val(fd, 'genus')!,
      species: val(fd, 'species')!,
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
        create: aliasRows(fd),
      },
    },
  })
  await audit(user, 'UPDATE', 'PLANT_DEFINITION', id, `Updated plant definition ${definition.genus} ${definition.species}`)

  redirect(`/plants/${id}/edit`)
}

export async function deletePlantDefinition(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const definition = await prisma.plantDefinition.findUnique({ where: { id } })

  const instances = await prisma.plantInstance.findMany({
    where: { plantDefinitionId: id },
    select: { id: true },
  })

  for (const instance of instances) {
    await cleanupPlantInstanceDependents(instance.id)
  }

  await cleanupGenericEntity('PLANT_DEFINITION', id)
  await prisma.plantDefinition.delete({ where: { id } })
  await cleanupOrphanPropagationEvents()
  await audit(user, 'DELETE', 'PLANT_DEFINITION', id, `Deleted plant definition ${definition ? `${definition.genus} ${definition.species}` : id}`)

  redirect('/plants')
}

export async function createPlantInstance(fd: FormData) {
  const user = await requireCreateUser()
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const instanceType = val(fd, 'instanceType')!
  const acquisitionDate = date(val(fd, 'acquisitionDate'))
  const propagationDate = date(val(fd, 'propagationDate'))
  const plantId = await generatePlantId(prisma, {
    plantDefinitionId,
    instanceType,
    date: propagationDate || acquisitionDate,
  })

  const instance = await prisma.plantInstance.create({
    data: {
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
      data: { entityType: 'PLANT_INSTANCE', entityId: instance.id, note },
    })
  }

  await audit(user, 'CREATE', 'PLANT_INSTANCE', instance.id, `Created plant instance ${instance.plantId}`)
  await notifyFollowers(prisma, {
    actorUserId: user.id,
    eventType: 'NEW_PLANT',
    subject: `New ${instance.instanceType.toLowerCase()} plant: ${instance.plantId}`,
    body: `${instance.plantId} was added to ${plantName(await prisma.plantDefinition.findUniqueOrThrow({ where: { id: plantDefinitionId } }))}.`,
    recordPath: `/instances/${instance.id}`,
    plantInstanceIds: [instance.id],
    plantDefinitionIds: [plantDefinitionId],
  })

  redirect('/instances')
}

export async function updatePlantInstance(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!

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
  await audit(user, 'UPDATE', 'PLANT_INSTANCE', id, `Updated plant instance ${instance.plantId}`)

  redirect(`/instances/${id}`)
}

export async function deletePlantInstance(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const instance = await prisma.plantInstance.findUnique({ where: { id } })

  await cleanupPlantInstanceDependents(id)
  await prisma.plantInstance.delete({ where: { id } })
  await cleanupOrphanPropagationEvents()
  await audit(user, 'DELETE', 'PLANT_INSTANCE', id, `Deleted plant instance ${instance?.plantId || id}`)

  redirect('/instances')
}

export async function archivePlantInstance(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!

  const instance = await prisma.plantInstance.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
      archiveDate: new Date(),
      archiveReason: val(fd, 'archiveReason'),
      archiveNotes: val(fd, 'archiveNotes'),
    },
  })
  await audit(user, 'ARCHIVE', 'PLANT_INSTANCE', id, `Archived plant instance ${instance.plantId}`)
  await notifyFollowers(prisma, {
    actorUserId: user.id,
    eventType: 'ARCHIVE',
    subject: `${instance.plantId} was archived`,
    body: instance.archiveReason || 'A plant you follow was archived.',
    recordPath: `/instances/${id}`,
    plantInstanceIds: [id],
  })

  redirect(`/instances/${id}`)
}

export async function restorePlantInstance(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!

  const instance = await prisma.plantInstance.update({
    where: { id },
    data: { status: 'ACTIVE', archiveDate: null, archiveReason: null, archiveNotes: null },
  })
  await audit(user, 'RESTORE', 'PLANT_INSTANCE', id, `Restored plant instance ${instance.plantId}`)

  redirect(`/instances/${id}`)
}

export async function addNote(fd: FormData) {
  const user = await requireCreateUser()
  const note = await prisma.note.create({
    data: { entityType: val(fd, 'entityType')!, entityId: val(fd, 'entityId')!, note: val(fd, 'note')! },
  })
  await audit(user, 'CREATE', 'NOTE', note.id, `Added note to ${note.entityType} ${note.entityId}`)
  if (note.entityType === 'PLANT_INSTANCE') {
    const instance = await prisma.plantInstance.findUnique({ where: { id: note.entityId } })
    if (instance) {
      await notifyFollowers(prisma, {
        actorUserId: user.id,
        eventType: 'NOTE',
        subject: `New note on ${instance.plantId}`,
        body: note.note,
        recordPath: `/instances/${instance.id}`,
        plantInstanceIds: [instance.id],
        plantDefinitionIds: [instance.plantDefinitionId],
      })
    }
  }

  redirect(back(fd))
}

async function requireReminderAccess(id: string) {
  const user = await requireUser()
  const reminder = await prisma.reminder.findUniqueOrThrow({ where: { id } })

  if (reminder.userId !== user.id && !isAdmin(user)) {
    throw new Error('You do not have permission to manage this reminder.')
  }

  return { user, reminder }
}

export async function createReminder(fd: FormData) {
  const user = await requireUser()
  const dueAt = date(val(fd, 'dueAt'))
  const destination = back(fd)

  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    throw new Error('A valid reminder date is required.')
  }

  const reminder = await prisma.reminder.create({
    data: {
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

  await audit(user, 'CREATE', 'REMINDER', reminder.id, `Created reminder ${reminder.title}`)
  revalidateDestination(destination)
  redirect(destination)
}

export async function completeReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id)

  await prisma.reminder.update({
    where: { id },
    data: { completedAt: new Date(), nextSendAt: null },
  })

  await audit(user, 'COMPLETE', 'REMINDER', id, `Completed reminder ${reminder.title}`)
  revalidateDestination(destination)
  redirect(destination)
}

export async function pauseReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id)

  await prisma.reminder.update({
    where: { id },
    data: { pausedAt: new Date(), nextSendAt: null },
  })

  await audit(user, 'PAUSE', 'REMINDER', id, `Paused reminder ${reminder.title}`)
  revalidateDestination(destination)
  redirect(destination)
}

export async function resumeReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id)

  await prisma.reminder.update({
    where: { id },
    data: { pausedAt: null, nextSendAt: reminder.nextSendAt || reminder.dueAt },
  })

  await audit(user, 'RESUME', 'REMINDER', id, `Resumed reminder ${reminder.title}`)
  revalidateDestination(destination)
  redirect(destination)
}

export async function deleteReminder(fd: FormData) {
  const id = val(fd, 'id')!
  const destination = back(fd)
  const { user, reminder } = await requireReminderAccess(id)

  await prisma.reminder.delete({ where: { id } })

  await audit(user, 'DELETE', 'REMINDER', id, `Deleted reminder ${reminder.title}`, reminder)
  revalidateDestination(destination)
  redirect(destination)
}

export async function markSportCandidate(fd: FormData) {
  const user = await requireCreateUser()
  const id = val(fd, 'id')!
  const observation = val(fd, 'observation')

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
        entityType: 'PLANT_INSTANCE',
        entityId: id,
        note: `Sport suspected: ${observation}`,
      },
    })
  }

  await audit(user, 'UPDATE', 'PLANT_INSTANCE', id, `Marked plant instance ${instance.plantId} as a suspected sport`)
  await notifyFollowers(prisma, {
    actorUserId: user.id,
    eventType: 'SPORT',
    subject: `${instance.plantId} was marked as a suspected sport`,
    body: observation || 'A plant you follow has a new sport observation.',
    recordPath: `/instances/${id}`,
    plantInstanceIds: [id],
    plantDefinitionIds: [instance.plantDefinitionId],
  })
  redirect(`/instances/${id}`)
}

export async function markSportReverted(fd: FormData) {
  const user = await requireCreateUser()
  const id = val(fd, 'id')!
  const observation = val(fd, 'observation')

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
      entityType: 'PLANT_INSTANCE',
      entityId: id,
      note: observation
        ? `Sport reverted: ${observation}`
        : 'Sport reverted: plant appears to match the original cultivar or parent phenotype.',
    },
  })

  await audit(user, 'UPDATE', 'PLANT_INSTANCE', id, `Marked plant instance ${instance.plantId} as reverted`)
  await notifyFollowers(prisma, {
    actorUserId: user.id,
    eventType: 'SPORT',
    subject: `${instance.plantId} was marked reverted`,
    body: observation || 'A followed sport line appears to have reverted.',
    recordPath: `/instances/${id}`,
    plantInstanceIds: [id],
    plantDefinitionIds: [instance.plantDefinitionId],
  })
  redirect(back(fd) || `/instances/${id}`)
}

export async function deleteNote(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const note = await prisma.note.findUnique({ where: { id } })
  await prisma.note.delete({ where: { id } })
  await audit(user, 'DELETE', 'NOTE', id, `Deleted note ${id}`, note)
  redirect(back(fd))
}

export async function setCoverPhoto(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id } })

  if (photo.entityType !== 'PLANT_INSTANCE') {
    throw new Error('Only plant instance photos can be selected as cover photos.')
  }

  await prisma.$transaction([
    prisma.photo.updateMany({
      where: { entityType: 'PLANT_INSTANCE', entityId: photo.entityId },
      data: { isCover: false },
    }),
    prisma.photo.update({
      where: { id },
      data: { isCover: true },
    }),
  ])

  await audit(user, 'UPDATE', 'PHOTO', id, `Selected cover photo for plant instance ${photo.entityId}`)
  redirect(back(fd))
}

export async function setTypePhoto(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id } })

  if (photo.entityType !== 'PLANT_INSTANCE') {
    throw new Error('Only plant instance photos can be selected as type photos.')
  }

  const instance = await prisma.plantInstance.findUniqueOrThrow({
    where: { id: photo.entityId },
    select: { plantDefinitionId: true },
  })

  const siblingInstances = await prisma.plantInstance.findMany({
    where: { plantDefinitionId: instance.plantDefinitionId },
    select: { id: true },
  })
  const siblingIds = siblingInstances.map((item) => item.id)

  await prisma.$transaction([
    prisma.photo.updateMany({
      where: { entityType: 'PLANT_INSTANCE', entityId: { in: siblingIds } },
      data: { isType: false },
    }),
    prisma.photo.update({
      where: { id },
      data: { isType: true },
    }),
  ])

  await audit(user, 'UPDATE', 'PHOTO', id, `Selected type photo for plant definition ${instance.plantDefinitionId}`)
  redirect(back(fd))
}

export async function deletePhoto(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const destination = back(fd)
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id } })
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

  await audit(user, 'DELETE', 'PHOTO', id, `Deleted photo for ${photo.entityType} ${photo.entityId}`, photo)
  revalidatePath(destination)
  redirect(destination)
}

export async function openBloomEvent(fd: FormData) {
  const user = await requireCreateUser()
  const plantInstanceId = val(fd, 'plantInstanceId')!

  const bloom = await prisma.bloomEvent.create({
    data: {
      plantInstanceId,
      bloomStartDate: date(val(fd, 'bloomStartDate'))!,
      firstBloom: !!fd.get('firstBloom'),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'CREATE', 'BLOOM_EVENT', bloom.id, `Opened bloom event for plant instance ${plantInstanceId}`)
  const instance = await prisma.plantInstance.findUnique({ where: { id: plantInstanceId } })
  if (instance) {
    await notifyFollowers(prisma, {
      actorUserId: user.id,
      eventType: 'BLOOM',
      subject: `New bloom on ${instance.plantId}`,
      body: val(fd, 'notes') || 'A plant you follow has a newly opened bloom event.',
      recordPath: `/instances/${plantInstanceId}#bloom-${bloom.id}`,
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  revalidatePath(`/instances/${plantInstanceId}`)
  redirect(`/instances/${plantInstanceId}`)
}

export async function updateBloomPeak(fd: FormData) {
  const user = await requireAdminUser()
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
  await audit(user, 'UPDATE', 'BLOOM_EVENT', id, `Updated bloom peak for plant instance ${plantInstanceId}`)
  const instance = await prisma.plantInstance.findUnique({ where: { id: plantInstanceId } })
  if (instance) {
    await notifyFollowers(prisma, {
      actorUserId: user.id,
      eventType: 'BLOOM',
      subject: `Bloom peak updated for ${instance.plantId}`,
      body: val(fd, 'notes') || 'A bloom event was updated for a plant you follow.',
      recordPath: `/instances/${plantInstanceId}#bloom-${id}`,
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  revalidatePath(`/instances/${plantInstanceId}`)
  redirect(`/instances/${plantInstanceId}`)
}

export async function closeBloomEvent(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const plantInstanceId = val(fd, 'plantInstanceId')!

  await prisma.bloomEvent.update({
    where: { id },
    data: { bloomEndDate: date(val(fd, 'bloomEndDate'))!, notes: val(fd, 'notes') },
  })
  await audit(user, 'UPDATE', 'BLOOM_EVENT', id, `Closed bloom event for plant instance ${plantInstanceId}`)
  const instance = await prisma.plantInstance.findUnique({ where: { id: plantInstanceId } })
  if (instance) {
    await notifyFollowers(prisma, {
      actorUserId: user.id,
      eventType: 'BLOOM',
      subject: `Bloom closed for ${instance.plantId}`,
      body: val(fd, 'notes') || 'A bloom event was closed for a plant you follow.',
      recordPath: `/instances/${plantInstanceId}#bloom-${id}`,
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  revalidatePath(`/instances/${plantInstanceId}`)
  redirect(`/instances/${plantInstanceId}`)
}

export async function createBloomEvent(fd: FormData) {
  return openBloomEvent(fd)
}

export async function updateBloomEvent(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const plantInstanceId = val(fd, 'plantInstanceId')!

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
  await audit(user, 'UPDATE', 'BLOOM_EVENT', id, `Updated bloom event for plant instance ${plantInstanceId}`)

  redirect(`/instances/${plantInstanceId}`)
}

export async function deleteBloomEvent(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const plantInstanceId = val(fd, 'plantInstanceId')!

  await cleanupGenericEntity('BLOOM_EVENT', id)
  await prisma.bloomEvent.delete({ where: { id } })
  await audit(user, 'DELETE', 'BLOOM_EVENT', id, `Deleted bloom event for plant instance ${plantInstanceId}`)

  redirect(`/instances/${plantInstanceId}`)
}

export async function createPropagationEvent(fd: FormData) {
  const user = await requireCreateUser()
  const method = val(fd, 'method')!
  const parent1 = val(fd, 'parent1')!
  const parent2 = val(fd, 'parent2')
  const eventDate = date(val(fd, 'date'))!
  const childCount = boundedInt(val(fd, 'childCount'), 1, 1, 50)

  if (method === 'SEED' && !parent2) {
    throw new Error('Sexual reproduction requires two parent plants.')
  }

  const parentPlant = await prisma.plantInstance.findUniqueOrThrow({ where: { id: parent1 } })
  const childSportStatus = isSportLine(parentPlant.sportStatus) ? 'CANDIDATE' : 'NONE'
  const childSportDescription = isSportLine(parentPlant.sportStatus)
    ? `Derived from sport line ${parentPlant.plantId}. Confirm whether the trait propagates true.`
    : undefined

  const event = await prisma.propagationEvent.create({
    data: {
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
      plantDefinitionId: parentPlant.plantDefinitionId,
      date: eventDate,
      instanceType: 'PROPAGATION',
      method,
    })
    childCodes.push(plantId)

    const child = await prisma.plantInstance.create({
      data: {
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
  await audit(user, 'CREATE', 'PROPAGATION_EVENT', event.id, `Created ${method} propagation event`, { childCodes })
  await notifyFollowers(prisma, {
    actorUserId: user.id,
    eventType: 'PROPAGATION',
    subject: `New ${method.toLowerCase()} propagation from ${parentPlant.plantId}`,
    body: `Created child plants: ${childCodes.join(', ')}`,
    recordPath: '/propagations',
    plantInstanceIds: [parent1, ...childIds],
    plantDefinitionIds: [parentPlant.plantDefinitionId],
  })

  redirect('/propagations')
}

export async function updatePropagationEvent(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!

  const event = await prisma.propagationEvent.update({
    where: { id },
    data: {
      method: val(fd, 'method')!,
      date: date(val(fd, 'date'))!,
      successStatus: val(fd, 'successStatus') || 'PENDING',
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'UPDATE', 'PROPAGATION_EVENT', id, `Updated ${event.method} propagation event`)

  redirect('/propagations')
}

export async function deletePropagationEvent(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const event = await prisma.propagationEvent.findUnique({ where: { id } })

  await cleanupGenericEntity('PROPAGATION_EVENT', id)
  await prisma.propagationEvent.delete({ where: { id } })
  await audit(user, 'DELETE', 'PROPAGATION_EVENT', id, `Deleted ${event?.method || ''} propagation event`)

  redirect('/propagations')
}

export async function createSportStabilityRecord(fd: FormData) {
  const user = await requireCreateUser()
  const plantInstanceId = val(fd, 'plantInstanceId')!
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

  await audit(user, 'CREATE', 'SPORT_STABILITY_RECORD', record.id, `Added sport stability record`)
  const instance = await prisma.plantInstance.findUnique({ where: { id: plantInstanceId } })
  if (instance) {
    await notifyFollowers(prisma, {
      actorUserId: user.id,
      eventType: 'SPORT',
      subject: `Sport stability updated for ${instance.plantId}`,
      body: val(fd, 'notes') || `Sport status is now ${nextStatus.toLowerCase()}.`,
      recordPath: `/instances/${plantInstanceId}`,
      plantInstanceIds: [plantInstanceId],
      plantDefinitionIds: [instance.plantDefinitionId],
    })
  }

  redirect(back(fd))
}

export async function createCultivarFromSport(fd: FormData) {
  const user = await requireAdminUser()
  const plantInstanceId = val(fd, 'plantInstanceId')!

  const inst = await prisma.plantInstance.findUniqueOrThrow({
    where: { id: plantInstanceId },
    include: { plantDefinition: true },
  })

  const def = await prisma.plantDefinition.create({
    data: {
      genus: val(fd, 'genus') || inst.plantDefinition.genus,
      species: val(fd, 'species') || inst.plantDefinition.species,
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
  await audit(user, 'CREATE', 'PLANT_DEFINITION', def.id, `Created cultivar ${def.cultivarName} from sport ${inst.plantId}`)
  await audit(user, 'UPDATE', 'PLANT_INSTANCE', plantInstanceId, `Reassigned sport ${inst.plantId} to new cultivar ${def.cultivarName}`)

  redirect(`/instances/${plantInstanceId}`)
}

export async function populateDemoData() {
  const user = await requireAdminUser()
  const result = await createDemoData()
  await audit(user, 'CREATE', 'DEMO_DATA', result.batch, `Populated demo data batch ${result.batch}`, result)

  revalidatePath('/')
  revalidatePath('/plants')
  revalidatePath('/instances')
  revalidatePath('/propagations')
  redirect('/admin-tools')
}
