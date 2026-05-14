'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { audit, requireAdminUser, requireCreateUser } from '@/lib/auth'

const val = (fd: FormData, k: string) =>
  String(fd.get(k) || '').trim() || undefined

const date = (s?: string) => (s ? new Date(s) : undefined)
const dec = (s?: string) => (s ? s : undefined)
const back = (fd: FormData) => val(fd, 'back') || '/'

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
      cultivarRegistrationNumber: val(fd, 'cultivarRegistrationNumber'),
      governingBodyId: val(fd, 'governingBodyId'),
      description: val(fd, 'description'),
      notes: val(fd, 'notes'),
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
      cultivarRegistrationNumber: val(fd, 'cultivarRegistrationNumber'),
      governingBodyId: val(fd, 'governingBodyId'),
      description: val(fd, 'description'),
      notes: val(fd, 'notes'),
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
  const instance = await prisma.plantInstance.create({
    data: {
      plantDefinitionId: val(fd, 'plantDefinitionId')!,
      plantId: val(fd, 'plantId')!,
      instanceType: val(fd, 'instanceType')!,
      location: val(fd, 'location'),
      acquisitionDate: date(val(fd, 'acquisitionDate')),
      propagationDate: date(val(fd, 'propagationDate')),
      source: val(fd, 'source'),
      distributor: val(fd, 'distributor'),
      stockNumber: val(fd, 'stockNumber'),
      purchasePrice: dec(val(fd, 'purchasePrice')) as any,
      isSportCandidate: !!fd.get('isSportCandidate'),
      sportStatus: val(fd, 'sportStatus') || 'NONE',
      sportDescription: val(fd, 'sportDescription'),
    },
  })
  await audit(user, 'CREATE', 'PLANT_INSTANCE', instance.id, `Created plant instance ${instance.plantId}`)

  redirect('/instances')
}

export async function updatePlantInstance(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!

  const instance = await prisma.plantInstance.update({
    where: { id },
    data: {
      plantDefinitionId: val(fd, 'plantDefinitionId')!,
      plantId: val(fd, 'plantId')!,
      instanceType: val(fd, 'instanceType')!,
      status: val(fd, 'status') || 'ACTIVE',
      location: val(fd, 'location'),
      acquisitionDate: date(val(fd, 'acquisitionDate')),
      propagationDate: date(val(fd, 'propagationDate')),
      source: val(fd, 'source'),
      distributor: val(fd, 'distributor'),
      stockNumber: val(fd, 'stockNumber'),
      purchasePrice: dec(val(fd, 'purchasePrice')) as any,
      isSportCandidate: !!fd.get('isSportCandidate'),
      sportStatus: val(fd, 'sportStatus') || 'NONE',
      sportDescription: val(fd, 'sportDescription'),
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

  redirect(back(fd))
}

export async function deleteNote(fd: FormData) {
  const user = await requireAdminUser()
  const id = val(fd, 'id')!
  const note = await prisma.note.findUnique({ where: { id } })
  await prisma.note.delete({ where: { id } })
  await audit(user, 'DELETE', 'NOTE', id, `Deleted note ${id}`, note)
  redirect(back(fd))
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

  if (method === 'SEED' && !parent2) {
    throw new Error('Sexual reproduction requires two parent plants.')
  }

  const childCodes = String(fd.get('childCodes') || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const parentPlant = await prisma.plantInstance.findUniqueOrThrow({ where: { id: parent1 } })

  const event = await prisma.propagationEvent.create({
    data: {
      method,
      date: date(val(fd, 'date'))!,
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

  for (const code of childCodes) {
    const child = await prisma.plantInstance.create({
      data: {
        plantDefinitionId: parentPlant.plantDefinitionId,
        plantId: code,
        instanceType: 'PROPAGATION',
        propagationDate: date(val(fd, 'date')),
        location: val(fd, 'location'),
        isSportCandidate: !!fd.get('isSportCandidate'),
        sportStatus: val(fd, 'sportStatus') || 'NONE',
        sportDescription: val(fd, 'sportDescription'),
      },
    })

    await prisma.propagationChild.create({
      data: { propagationEventId: event.id, childPlantInstanceId: child.id },
    })
  }
  await audit(user, 'CREATE', 'PROPAGATION_EVENT', event.id, `Created ${method} propagation event`, { childCodes })

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
  const record = await prisma.sportStabilityRecord.create({
    data: {
      plantInstanceId: val(fd, 'plantInstanceId')!,
      propagationEventId: val(fd, 'propagationEventId')!,
      propagatedTrue: !!fd.get('propagatedTrue'),
      generationNumber: Number(val(fd, 'generationNumber') || 1),
      notes: val(fd, 'notes'),
    },
  })
  await audit(user, 'CREATE', 'SPORT_STABILITY_RECORD', record.id, `Added sport stability record`)

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
      cultivarRegistrationNumber: val(fd, 'cultivarRegistrationNumber'),
      governingBodyId: val(fd, 'governingBodyId'),
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
