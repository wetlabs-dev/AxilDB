'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionLogger, requireCollectionManager } from '@/lib/collections'
import { emitDomainEvent } from '@/lib/events/emit'
import { generatePlantId } from '@/lib/plant-id'
import { plantName } from '@/lib/utils'
import { normalizePlantDefinitionIdentity } from '@/lib/plant-identity'
import { acquisitionProvenanceDisplay, sourceRowsFromForm, validateCommerceSelection, validateSourceRows } from '@/lib/provenance'
import type { AcquisitionAvailability, AcquisitionFulfillmentChoice, AcquisitionStatus } from '@prisma/client'
import { setPlantSubstrate, substrateModes } from '@/lib/substrates'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim() || undefined
const clearableVal = (fd: FormData, key: string) => fd.has(key) ? val(fd, key) || null : undefined
const date = (value?: string) => value ? new Date(value) : undefined
const dec = (value?: string) => value ? value : undefined
const boundedInt = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
const back = (fd: FormData, fallback: string) => val(fd, 'back') || fallback

const acquisitionStatuses = new Set<AcquisitionStatus>([
  'RESEARCHING',
  'WISHLIST',
  'ACTIVELY_SEEKING',
  'ON_HOLD',
  'FULFILLED',
  'NO_LONGER_INTERESTED',
])
const availabilities = new Set<AcquisitionAvailability>(['PLENTY', 'LIMITED', 'LAST_ONE', 'SOLD_OUT', 'UNKNOWN'])
const fulfillmentChoices = new Set<AcquisitionFulfillmentChoice>(['FULFILLED', 'KEEP_ACTIVE', 'REPEAT_PURCHASE'])

function statusValue(input?: string | null): AcquisitionStatus | null {
  if (!input) return null
  const normalized = input.toUpperCase().replaceAll('-', '_') as AcquisitionStatus
  return acquisitionStatuses.has(normalized) ? normalized : null
}

function availabilityValue(input?: string | null): AcquisitionAvailability {
  const normalized = String(input || '').toUpperCase().replaceAll('-', '_') as AcquisitionAvailability
  return availabilities.has(normalized) ? normalized : 'UNKNOWN'
}

function fulfillmentValue(input?: string | null): AcquisitionFulfillmentChoice {
  const normalized = String(input || '').toUpperCase().replaceAll('-', '_') as AcquisitionFulfillmentChoice
  return fulfillmentChoices.has(normalized) ? normalized : 'FULFILLED'
}

function jsonList(value?: string | null) {
  const items = String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

async function scopedDefinition(collectionId: string, id: string) {
  return prisma.plantDefinition.findFirstOrThrow({
    where: { id, collectionId },
    include: { desiredLocation: true },
  })
}

async function preferredProvenanceFromForm(collectionId: string, fd: FormData) {
  const sellerIds = [...new Set(fd.getAll('preferredSellerId').map(String).filter(Boolean))]
  const storefrontIds = [...new Set(fd.getAll('preferredStorefrontId').map(String).filter(Boolean))]
  const distributorIds = [...new Set(fd.getAll('preferredDistributorId').map(String).filter(Boolean))]
  const [sellers, storefronts, distributors] = await Promise.all([
    sellerIds.length ? prisma.seller.findMany({ where: { collectionId, id: { in: sellerIds } }, select: { id: true } }) : [],
    storefrontIds.length ? prisma.sellerStorefront.findMany({ where: { collectionId, id: { in: storefrontIds } }, select: { id: true, sellerId: true } }) : [],
    distributorIds.length ? prisma.distributor.findMany({ where: { collectionId, id: { in: distributorIds } }, select: { id: true } }) : [],
  ])
  if (sellers.length !== sellerIds.length || storefronts.length !== storefrontIds.length || distributors.length !== distributorIds.length) {
    throw new Error('One or more preferred provenance records are outside this collection.')
  }
  const sellersWithStorefronts = new Set(storefronts.map((storefront) => storefront.sellerId))
  const preferredSellers = [
    ...sellers.filter((seller) => !sellersWithStorefronts.has(seller.id)).map((seller) => ({ sellerId: seller.id, sellerStorefrontId: null as string | null })),
    ...storefronts.map((storefront) => ({ sellerId: storefront.sellerId, sellerStorefrontId: storefront.id })),
  ]
  return { preferredSellers, preferredDistributorIds: distributors.map((item) => item.id) }
}

export async function createAcquisitionTarget(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const cultivarName = clearableVal(fd, 'cultivarName')
  const identity = normalizePlantDefinitionIdentity({ genus: val(fd, 'genus'), species: val(fd, 'species'), cultivarName, provisionalTaxon: val(fd, 'provisionalTaxon') })
  const status = statusValue(val(fd, 'acquisitionStatus')) || 'WISHLIST'
  const priority = boundedInt(val(fd, 'acquisitionPriority'), 3, 1, 5)
  const desiredLocationId = clearableVal(fd, 'desiredLocationId')
  if (desiredLocationId) {
    await prisma.location.findFirstOrThrow({ where: { id: desiredLocationId, collectionId: collection.id, status: 'ACTIVE' }, select: { id: true } })
  }
  const preferred = await preferredProvenanceFromForm(collection.id, fd)

  const created = await prisma.$transaction(async (tx) => {
    const definition = await tx.plantDefinition.create({
      data: {
        collectionId: collection.id,
        genus: identity.genus,
        species: identity.species,
        cultivarName,
        provisionalTaxon: identity.provisionalTaxon,
        identificationStatus: identity.identificationStatus,
        confidence: 'UNCERTAIN',
        acquisitionStatus: status,
        acquisitionPriority: priority,
        acquisitionInterestNotes: clearableVal(fd, 'acquisitionInterestNotes'),
        desiredSpecimenSize: clearableVal(fd, 'desiredSpecimenSize'),
        idealPurchasePrice: dec(val(fd, 'idealPurchasePrice')) as any,
        maximumPurchasePrice: dec(val(fd, 'maximumPurchasePrice')) as any,
        desiredLocationId,
        preferredVendorsJson: (jsonList(val(fd, 'preferredVendors')) || null) as any,
        acquisitionResearchSummary: clearableVal(fd, 'acquisitionResearchSummary'),
      },
    })
    if (preferred.preferredSellers.length) await tx.plantDefinitionPreferredSeller.createMany({ data: preferred.preferredSellers.map((item, sortOrder) => ({ collectionId: collection.id, plantDefinitionId: definition.id, sellerId: item.sellerId, sellerStorefrontId: item.sellerStorefrontId, sortOrder })) })
    if (preferred.preferredDistributorIds.length) await tx.plantDefinitionPreferredDistributor.createMany({ data: preferred.preferredDistributorIds.map((distributorId, sortOrder) => ({ collectionId: collection.id, plantDefinitionId: definition.id, distributorId, sortOrder })) })
    await emitDomainEvent(tx, {
      eventType: 'acquisition.intent_updated',
      collectionId: collection.id,
      aggregateId: definition.id,
      actor: { id: user.id, role: user.role },
      idempotencyKey: `acquisition:${definition.id}:created`,
      payload: {
        subjectId: definition.id,
        displayName: plantName(definition),
        title: 'Added acquisition target',
        status,
        priority,
      },
    })
    await emitDomainEvent(tx, {
      eventType: 'wishlist.added', collectionId: collection.id, aggregateId: definition.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `wishlist:${definition.id}:added`,
      payload: { subjectId: definition.id, displayName: plantName(definition), status, priority },
    })
    return definition
  })
  await audit(user, 'CREATE', 'PLANT_DEFINITION', created.id, `Added acquisition target ${plantName(created)}`, { acquisitionStatus: status }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/acquisitions'))
  redirect(collectionPath(collection.slug, `/acquisitions?definition=${created.id}`))
}

export async function updateAcquisitionIntent(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const id = val(fd, 'plantDefinitionId')!
  const existing = await scopedDefinition(collection.id, id)
  const status = statusValue(val(fd, 'acquisitionStatus'))
  const priority = boundedInt(val(fd, 'acquisitionPriority'), 3, 1, 5)
  const desiredLocationId = clearableVal(fd, 'desiredLocationId')
  if (desiredLocationId) {
    await prisma.location.findFirstOrThrow({ where: { id: desiredLocationId, collectionId: collection.id, status: 'ACTIVE' }, select: { id: true } })
  }
  const preferred = await preferredProvenanceFromForm(collection.id, fd)

  const updated = await prisma.$transaction(async (tx) => {
    const definition = await tx.plantDefinition.update({
      where: { id },
      data: {
        acquisitionStatus: status,
        acquisitionPriority: priority,
        acquisitionInterestNotes: clearableVal(fd, 'acquisitionInterestNotes'),
        desiredSpecimenSize: clearableVal(fd, 'desiredSpecimenSize'),
        idealPurchasePrice: dec(val(fd, 'idealPurchasePrice')) as any,
        maximumPurchasePrice: dec(val(fd, 'maximumPurchasePrice')) as any,
        desiredLocationId,
        preferredVendorsJson: (jsonList(val(fd, 'preferredVendors')) || null) as any,
        acquisitionResearchSummary: clearableVal(fd, 'acquisitionResearchSummary'),
      },
    })
    await tx.plantDefinitionPreferredSeller.deleteMany({ where: { plantDefinitionId: id } })
    await tx.plantDefinitionPreferredDistributor.deleteMany({ where: { plantDefinitionId: id } })
    if (preferred.preferredSellers.length) await tx.plantDefinitionPreferredSeller.createMany({ data: preferred.preferredSellers.map((item, sortOrder) => ({ collectionId: collection.id, plantDefinitionId: id, sellerId: item.sellerId, sellerStorefrontId: item.sellerStorefrontId, sortOrder })) })
    if (preferred.preferredDistributorIds.length) await tx.plantDefinitionPreferredDistributor.createMany({ data: preferred.preferredDistributorIds.map((distributorId, sortOrder) => ({ collectionId: collection.id, plantDefinitionId: id, distributorId, sortOrder })) })
    await emitDomainEvent(tx, {
      eventType: 'acquisition.intent_updated',
      collectionId: collection.id,
      aggregateId: id,
      actor: { id: user.id, role: user.role },
      idempotencyKey: `acquisition:${id}:intent:${definition.updatedAt.toISOString()}`,
      payload: {
        subjectId: id,
        displayName: plantName(definition),
        title: 'Acquisition intent updated',
        status,
        priority,
      },
    })
    if (existing.acquisitionStatus !== status) await emitDomainEvent(tx, {
      eventType: existing.acquisitionStatus === 'FULFILLED' && status !== 'FULFILLED' ? 'wishlist.reactivated' : status === 'FULFILLED' ? 'wishlist.fulfilled' : 'wishlist.status_changed',
      collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      idempotencyKey: `wishlist:${id}:status:${definition.updatedAt.toISOString()}`,
      payload: { subjectId: id, displayName: plantName(definition), previousStatus: existing.acquisitionStatus, status },
    })
    return definition
  })
  await audit(user, 'UPDATE', 'PLANT_DEFINITION', id, `Updated acquisition intent for ${plantName(updated)}`, { acquisitionStatus: status, priority }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/acquisitions'))
  redirect(back(fd, collectionPath(collection.slug, `/acquisitions?definition=${id}`)))
}

export async function createAcquisitionResearchEntry(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const definition = await scopedDefinition(collection.id, plantDefinitionId)
  const title = val(fd, 'title') || 'Research note'
  const body = val(fd, 'body')
  if (!body) throw new Error('Research entry body is required.')
  const occurredAt = date(val(fd, 'occurredAt')) || new Date()
  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.acquisitionResearchEntry.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId,
        createdByUserId: user.id,
        title,
        body,
        sourceCitation: clearableVal(fd, 'sourceCitation'),
        urlsJson: jsonList(val(fd, 'urls')) as any,
        occurredAt,
      },
    })
    await emitDomainEvent(tx, {
      eventType: 'acquisition.research_added',
      collectionId: collection.id,
      aggregateId: plantDefinitionId,
      actor: { id: user.id, role: user.role },
      occurredAt,
      idempotencyKey: `acquisition:${plantDefinitionId}:research:${created.id}`,
      payload: {
        subjectId: plantDefinitionId,
        recordId: created.id,
        recordType: 'AcquisitionResearchEntry',
        displayName: plantName(definition),
        title,
        summary: body,
      },
    })
    return created
  })
  await audit(user, 'CREATE', 'ACQUISITION_RESEARCH_ENTRY', entry.id, `Added acquisition research for ${plantName(definition)}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/acquisitions'))
  redirect(back(fd, collectionPath(collection.slug, `/acquisitions?definition=${plantDefinitionId}`)))
}

export async function createPlantObservation(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const definition = await scopedDefinition(collection.id, plantDefinitionId)
  const observedAt = date(val(fd, 'observedAt')) || new Date()
  const distributorId = clearableVal(fd, 'distributorId')
  const distributorOutletId = clearableVal(fd, 'distributorOutletId')
  const sellerId = clearableVal(fd, 'sellerId')
  const sellerStorefrontId = clearableVal(fd, 'sellerStorefrontId')
  const { distributor, outlet: distributorOutlet, seller, storefront } = await validateCommerceSelection(prisma, collection.id, { distributorId, distributorOutletId, sellerId, sellerStorefrontId })
  const observation = await prisma.$transaction(async (tx) => {
    const created = await tx.plantObservation.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId,
        createdByUserId: user.id,
        vendor: seller?.name || distributor?.name || clearableVal(fd, 'vendor'),
        distributorId: distributor?.id || null,
        distributorOutletId: distributorOutlet?.id || null,
        sellerId: seller?.id || null,
        sellerStorefrontId: storefront?.id || null,
        observedAt,
        observedPrice: dec(val(fd, 'observedPrice')) as any,
        currency: val(fd, 'currency') || 'USD',
        specimenSize: clearableVal(fd, 'specimenSize'),
        condition: clearableVal(fd, 'condition'),
        availability: availabilityValue(val(fd, 'availability')),
        notes: clearableVal(fd, 'notes'),
        isPublic: fd.get('isPublic') === 'on',
      },
    })
    await emitDomainEvent(tx, {
      eventType: 'acquisition.observation_added',
      collectionId: collection.id,
      aggregateId: plantDefinitionId,
      actor: { id: user.id, role: user.role },
      occurredAt: observedAt,
      idempotencyKey: `acquisition:${plantDefinitionId}:observation:${created.id}`,
      payload: {
        subjectId: plantDefinitionId,
        recordId: created.id,
        recordType: 'PlantObservation',
        displayName: plantName(definition),
        title: 'Plant observed',
        vendor: created.vendor,
        price: created.observedPrice,
        summary: created.notes || created.vendor || undefined,
      },
    })
    return created
  })
  await audit(user, 'CREATE', 'PLANT_OBSERVATION', observation.id, `Added plant observation for ${plantName(definition)}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/acquisitions'))
  redirect(back(fd, collectionPath(collection.slug, `/acquisitions?definition=${plantDefinitionId}`)))
}

export async function createPlantAcquisitionRecord(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const definition = await scopedDefinition(collection.id, plantDefinitionId)
  const acquiredAt = date(val(fd, 'acquiredAt')) || new Date()
  const quantity = boundedInt(val(fd, 'quantity'), 1, 1, 50)
  const createInstances = val(fd, 'createInstances') !== '0'
  const instanceType = val(fd, 'instanceType') || 'MOTHER'
  const initialLocationId = clearableVal(fd, 'initialLocationId') || definition.desiredLocationId || null
  const location = initialLocationId
    ? await prisma.location.findFirstOrThrow({ where: { id: initialLocationId, collectionId: collection.id, status: 'ACTIVE' } })
    : null
  const observationId = clearableVal(fd, 'observationId')
  if (observationId) {
    await prisma.plantObservation.findFirstOrThrow({ where: { id: observationId, collectionId: collection.id, plantDefinitionId }, select: { id: true } })
  }
  const fulfillmentChoice = fulfillmentValue(val(fd, 'fulfillmentChoice'))
  const distributorId = clearableVal(fd, 'distributorId')
  const distributorOutletId = clearableVal(fd, 'distributorOutletId')
  const sellerId = clearableVal(fd, 'sellerId')
  const sellerStorefrontId = clearableVal(fd, 'sellerStorefrontId')
  const { distributor, outlet: distributorOutlet, seller, storefront } = await validateCommerceSelection(prisma, collection.id, { distributorId, distributorOutletId, sellerId, sellerStorefrontId })
  const sourceRows = sourceRowsFromForm(fd)
  const sourceRecords = await validateSourceRows(prisma, collection.id, sourceRows)
  const sourceNames = new Map(sourceRecords.map((source) => [source.id, source.name]))
  const primarySource = sourceRows.find((row) => row.isPrimary) || sourceRows[0]
  const substrateMode = substrateModes.includes(val(fd, 'substrateMode') as any) ? val(fd, 'substrateMode')! : 'RECEIVED_SUBSTRATE'

  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.plantAcquisitionRecord.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId,
        createdByUserId: user.id,
        observationId,
        vendor: seller?.name || distributor?.name || clearableVal(fd, 'vendor'),
        distributorId: distributor?.id || null,
        distributorOutletId: distributorOutlet?.id || null,
        sellerId: seller?.id || null,
        sellerStorefrontId: storefront?.id || null,
        acquiredAt,
        price: dec(val(fd, 'price')) as any,
        currency: val(fd, 'currency') || 'USD',
        quantity,
        specimenSize: clearableVal(fd, 'specimenSize'),
        potSize: clearableVal(fd, 'potSize'),
        initialLocationId: location?.id || null,
        notes: clearableVal(fd, 'notes'),
        fulfillmentChoice,
      },
    })

    if (sourceRows.length) {
      await tx.acquisitionSource.createMany({
        data: sourceRows.map((row, sortOrder) => ({
          collectionId: collection.id,
          acquisitionRecordId: record.id,
          sourceId: row.sourceId,
          role: row.role,
          sortOrder,
          isPrimary: row.isPrimary || (sortOrder === 0 && !sourceRows.some((item) => item.isPrimary)),
          notes: row.notes,
        })),
      })
    }

    const createdInstances = []
    if (createInstances) {
      for (let index = 0; index < quantity; index += 1) {
        const plantId = await generatePlantId(tx as any, {
          collectionId: collection.id,
          plantDefinitionId,
          instanceType,
          date: acquiredAt,
        })
        const instance = await tx.plantInstance.create({
          data: {
            collectionId: collection.id,
            plantDefinitionId,
            plantId,
            instanceType,
            currentLocationId: location?.id || null,
            acquisitionDate: acquiredAt,
            acquisitionLabel: clearableVal(fd, 'acquisitionLabel'),
            source: primarySource ? sourceNames.get(primarySource.sourceId) : seller?.name || distributor?.name || val(fd, 'source') || val(fd, 'vendor'),
            distributor: seller?.name || distributor?.name || val(fd, 'vendor'),
            purchasePrice: dec(val(fd, 'price')) as any,
          },
        })
        await tx.plantAcquisitionRecordInstance.create({
          data: { acquisitionRecordId: record.id, plantInstanceId: instance.id },
        })
        await emitDomainEvent(tx, {
          eventType: 'plant.created',
          collectionId: collection.id,
          aggregateId: instance.id,
          actor: { id: user.id, role: user.role },
          occurredAt: acquiredAt,
          idempotencyKey: `plant:${instance.id}:created`,
          payload: {
            subjectId: instance.id,
            plantInstanceId: instance.id,
            plantId: instance.plantId,
            displayName: plantName(definition),
            instanceType,
            source: instance.source,
            distributor: instance.distributor,
            acquisitionRecordId: record.id,
            location: location ? { id: location.id, name: location.name, code: location.code } : null,
            summary: val(fd, 'notes') || undefined,
          },
        })
        const substrate = await setPlantSubstrate(tx, {
          collectionId: collection.id, plantInstanceId: instance.id, mode: substrateMode,
          recipeVersionId: clearableVal(fd, 'substrateRecipeVersionId'), description: clearableVal(fd, 'receivedSubstrateDescription'),
          notes: clearableVal(fd, 'substrateNotes'), startedAt: acquiredAt, reason: 'Initial substrate recorded at acquisition', changedByUserId: user.id,
        })
        await emitDomainEvent(tx, {
          eventType: substrateMode === 'RECEIVED_SUBSTRATE' ? 'plant.received_substrate_recorded' : 'plant.substrate_assigned',
          collectionId: collection.id, aggregateId: instance.id, actor: { id: user.id, role: user.role }, occurredAt: acquiredAt,
          idempotencyKey: `plant:${instance.id}:substrate:${substrate.history.id}`,
          payload: { subjectId: instance.id, plantInstanceId: instance.id, plantId: instance.plantId, recordId: substrate.history.id, recordType: 'PlantSubstrateHistory', newMode: substrateMode, newRecipeVersionId: substrate.recipeVersion?.id, displayName: substrate.recipeVersion ? `${substrate.recipeVersion.recipe.name} v${substrate.recipeVersion.versionNumber}` : substrateMode.replaceAll('_', ' ') },
        })
        createdInstances.push(instance)
      }
    }

    const nextStatus = fulfillmentChoice === 'FULFILLED'
      ? 'FULFILLED'
      : fulfillmentChoice === 'REPEAT_PURCHASE'
        ? 'ACTIVELY_SEEKING'
        : definition.acquisitionStatus
    if (nextStatus !== definition.acquisitionStatus) {
      await tx.plantDefinition.update({ where: { id: plantDefinitionId }, data: { acquisitionStatus: nextStatus } })
    }

    await emitDomainEvent(tx, {
      eventType: 'acquisition.recorded',
      collectionId: collection.id,
      aggregateId: plantDefinitionId,
      actor: { id: user.id, role: user.role },
      occurredAt: acquiredAt,
      idempotencyKey: `acquisition:${plantDefinitionId}:record:${record.id}`,
      payload: {
        subjectId: plantDefinitionId,
        recordId: record.id,
        recordType: 'PlantAcquisitionRecord',
        displayName: plantName(definition),
        title: 'Acquisition recorded',
        quantity,
        distributorId: distributor?.id,
        distributorOutletId: distributorOutlet?.id,
        sellerId: seller?.id,
        sellerStorefrontId: storefront?.id,
        sourceIds: sourceRows.map((row) => row.sourceId),
        createdPlantInstanceIds: createdInstances.map((instance) => instance.id),
        summary: val(fd, 'notes') || acquisitionProvenanceDisplay({ seller, storefront, distributor, outlet: distributorOutlet, legacy: val(fd, 'vendor') }),
      },
    })
    return { record, createdInstances }
  })

  await audit(user, 'CREATE', 'PLANT_ACQUISITION_RECORD', result.record.id, `Recorded acquisition for ${plantName(definition)}`, { quantity, createdPlantInstances: result.createdInstances.length }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/acquisitions'))
  revalidatePath(collectionPath(collection.slug, '/instances'))
  redirect(back(fd, collectionPath(collection.slug, `/acquisitions?definition=${plantDefinitionId}`)))
}

export async function savePlantInstanceAcquisition(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const instance = await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id, status: 'ACTIVE' } })
  const sellerId = clearableVal(fd, 'sellerId')
  const sellerStorefrontId = clearableVal(fd, 'sellerStorefrontId')
  const distributorId = clearableVal(fd, 'distributorId')
  const distributorOutletId = clearableVal(fd, 'distributorOutletId')
  const { seller, storefront, distributor, outlet } = await validateCommerceSelection(prisma, collection.id, { sellerId, sellerStorefrontId, distributorId, distributorOutletId })
  const sourceRows = sourceRowsFromForm(fd)
  const sourceRecords = await validateSourceRows(prisma, collection.id, sourceRows)
  const sourceNames = new Map(sourceRecords.map((source) => [source.id, source.name]))
  const primary = sourceRows.find((row) => row.isPrimary) || sourceRows[0]
  const acquiredAt = date(val(fd, 'acquiredAt')) || instance.acquisitionDate || new Date()

  const record = await prisma.$transaction(async (tx) => {
    const requestedId = val(fd, 'acquisitionRecordId')
    const linked = requestedId
      ? await tx.plantAcquisitionRecord.findFirst({ where: { id: requestedId, collectionId: collection.id, plantInstances: { some: { plantInstanceId } } } })
      : await tx.plantAcquisitionRecord.findFirst({ where: { collectionId: collection.id, plantInstances: { some: { plantInstanceId } } }, orderBy: { acquiredAt: 'desc' } })
    const data = {
      vendor: seller?.name || distributor?.name || null,
      sellerId: seller?.id || null,
      sellerStorefrontId: storefront?.id || null,
      distributorId: distributor?.id || storefront?.distributorId || null,
      distributorOutletId: outlet?.id || null,
      acquiredAt,
      price: dec(val(fd, 'price')) as any || null,
      currency: val(fd, 'currency') || 'USD',
      specimenSize: clearableVal(fd, 'specimenSize'),
      potSize: clearableVal(fd, 'potSize'),
      notes: clearableVal(fd, 'notes'),
    }
    const saved = linked
      ? await tx.plantAcquisitionRecord.update({ where: { id: linked.id }, data })
      : await tx.plantAcquisitionRecord.create({ data: { ...data, collectionId: collection.id, plantDefinitionId: instance.plantDefinitionId, createdByUserId: user.id, quantity: 1, plantInstances: { create: { plantInstanceId } } } })
    await tx.acquisitionSource.deleteMany({ where: { acquisitionRecordId: saved.id } })
    if (sourceRows.length) await tx.acquisitionSource.createMany({ data: sourceRows.map((row, sortOrder) => ({ collectionId: collection.id, acquisitionRecordId: saved.id, sourceId: row.sourceId, role: row.role, sortOrder, isPrimary: row.isPrimary || (sortOrder === 0 && !sourceRows.some((item) => item.isPrimary)), notes: row.notes })) })
    await tx.plantInstance.update({ where: { id: instance.id }, data: {
      acquisitionDate: acquiredAt,
      acquisitionLabel: clearableVal(fd, 'acquisitionLabel'),
      purchasePrice: dec(val(fd, 'price')) as any || null,
      source: primary ? sourceNames.get(primary.sourceId) : seller?.name || null,
      distributor: storefront?.handleOrName || seller?.name || distributor?.name || null,
    } })
    await emitDomainEvent(tx, { eventType: 'acquisition.recorded', collectionId: collection.id, aggregateId: saved.id, actor: { id: user.id, role: user.role }, idempotencyKey: `acquisition:${saved.id}:${saved.updatedAt.toISOString()}`, payload: { subjectId: instance.id, plantInstanceId: instance.id, recordId: saved.id, recordType: 'PlantAcquisitionRecord', sellerId: seller?.id, salesChannelId: storefront?.id, summary: linked ? 'Acquisition provenance updated.' : 'Acquisition record created.' } })
    return saved
  })
  await audit(user, 'UPDATE', 'PLANT_ACQUISITION_RECORD', record.id, `Updated acquisition and provenance for ${instance.plantId}`, { plantInstanceId }, collection.id)
  revalidatePath(collectionPath(collection.slug, `/instances/${instance.id}`))
  redirect(collectionPath(collection.slug, `/instances/${instance.id}`))
}

export async function createAcquisitionBatch(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const definitionIds = Array.from(new Set(fd.getAll('definitionId').map(String).filter(Boolean)))
  if (!definitionIds.length) throw new Error('Select at least one wishlist definition.')
  const idempotencyKey = val(fd, 'idempotencyKey')
  if (!idempotencyKey) throw new Error('This acquisition review has expired. Reload it and try again.')
  const existing = await prisma.acquisitionBatch.findUnique({
    where: { collectionId_idempotencyKey: { collectionId: collection.id, idempotencyKey } },
    select: { id: true },
  })
  if (existing) redirect(collectionPath(collection.slug, `/acquisitions/bulk?batch=${existing.id}`))

  const definitions = await prisma.plantDefinition.findMany({
    where: { collectionId: collection.id, id: { in: definitionIds } },
    select: { id: true, genus: true, species: true, cultivarName: true, desiredLocationId: true },
  })
  if (definitions.length !== definitionIds.length) throw new Error('One or more selected definitions are unavailable in this collection.')
  const distributorId = clearableVal(fd, 'distributorId')
  const distributorOutletId = clearableVal(fd, 'distributorOutletId')
  const sellerId = clearableVal(fd, 'sellerId')
  const sellerStorefrontId = clearableVal(fd, 'sellerStorefrontId')
  const { distributor, outlet: distributorOutlet, seller, storefront } = await validateCommerceSelection(prisma, collection.id, { distributorId, distributorOutletId, sellerId, sellerStorefrontId })
  const acquiredAt = date(val(fd, 'acquisitionDate')) || new Date()
  const currency = val(fd, 'currency') || 'USD'
  const requestedLocationIds = definitionIds.map((id) => clearableVal(fd, `initialLocationId:${id}`)).filter(Boolean) as string[]
  const validLocations = requestedLocationIds.length ? await prisma.location.findMany({
    where: { collectionId: collection.id, status: 'ACTIVE', id: { in: requestedLocationIds } },
    select: { id: true, name: true },
  }) : []
  if (validLocations.length !== new Set(requestedLocationIds).size) throw new Error('One or more selected locations are unavailable.')
  const locationById = new Map(validLocations.map((location) => [location.id, location]))

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.acquisitionBatch.create({ data: {
      collectionId: collection.id,
      distributorId: distributor?.id || null,
      distributorOutletId: distributorOutlet?.id || null,
      sellerId: seller?.id || null,
      sellerStorefrontId: storefront?.id || null,
      acquisitionDate: acquiredAt,
      orderNumber: clearableVal(fd, 'orderNumber'),
      currency,
      subtotal: dec(val(fd, 'subtotal')) as any,
      shippingCost: dec(val(fd, 'shippingCost')) as any,
      tax: dec(val(fd, 'tax')) as any,
      totalCost: dec(val(fd, 'totalCost')) as any,
      sharedNotes: clearableVal(fd, 'sharedNotes'),
      idempotencyKey,
      status: 'PROCESSING',
      createdByUserId: user.id,
    } })
    await emitDomainEvent(tx, {
      eventType: 'acquisition.batch_created', collectionId: collection.id, aggregateId: batch.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `acquisition-batch:${batch.id}:created`,
      payload: { subjectId: batch.id, recordId: batch.id, recordType: 'AcquisitionBatch', title: 'Acquisition batch created', itemCount: definitions.length },
    })

    let instanceCount = 0
    for (const definition of definitions) {
      const quantity = boundedInt(val(fd, `quantity:${definition.id}`), 1, 1, 50)
      const createInstances = fd.get(`createInstances:${definition.id}`) === 'on'
      const fulfillmentChoice = fulfillmentValue(val(fd, `fulfillmentChoice:${definition.id}`))
      const locationId = clearableVal(fd, `initialLocationId:${definition.id}`) || definition.desiredLocationId
      const location = locationId ? locationById.get(locationId) || null : null
      const item = await tx.acquisitionBatchItem.create({ data: {
        acquisitionBatchId: batch.id,
        plantDefinitionId: definition.id,
        quantity,
        unitPrice: dec(val(fd, `unitPrice:${definition.id}`)) as any,
        specimenSize: clearableVal(fd, `specimenSize:${definition.id}`),
        potSize: clearableVal(fd, `potSize:${definition.id}`),
        initialLocationId: location?.id || null,
        notes: clearableVal(fd, `notes:${definition.id}`),
        fulfillmentChoice,
        createPlantInstances: createInstances,
      } })
      const record = await tx.plantAcquisitionRecord.create({ data: {
        collectionId: collection.id,
        plantDefinitionId: definition.id,
        createdByUserId: user.id,
        vendor: seller?.name || distributor?.name || null,
        distributorId: distributor?.id || null,
        distributorOutletId: distributorOutlet?.id || null,
        sellerId: seller?.id || null,
        sellerStorefrontId: storefront?.id || null,
        acquiredAt,
        price: dec(val(fd, `unitPrice:${definition.id}`)) as any,
        currency,
        quantity,
        specimenSize: clearableVal(fd, `specimenSize:${definition.id}`),
        potSize: clearableVal(fd, `potSize:${definition.id}`),
        initialLocationId: location?.id || null,
        notes: [clearableVal(fd, 'sharedNotes'), clearableVal(fd, `notes:${definition.id}`)].filter(Boolean).join('\n') || null,
        fulfillmentChoice,
        acquisitionBatchId: batch.id,
      } })
      await tx.acquisitionBatchItem.update({ where: { id: item.id }, data: { createdAcquisitionRecordId: record.id } })
      if (createInstances) {
        for (let index = 0; index < quantity; index += 1) {
          const plantId = await generatePlantId(tx as any, { collectionId: collection.id, plantDefinitionId: definition.id, instanceType: 'MOTHER', date: acquiredAt })
          const instance = await tx.plantInstance.create({ data: {
            collectionId: collection.id, plantDefinitionId: definition.id, plantId, instanceType: 'MOTHER',
            currentLocationId: location?.id || null,
            acquisitionDate: acquiredAt, distributor: seller?.name || distributor?.name || null, purchasePrice: dec(val(fd, `unitPrice:${definition.id}`)) as any,
            acquisitionLabel: clearableVal(fd, `acquisitionLabel:${definition.id}`),
          } })
          await setPlantSubstrate(tx, {
            collectionId: collection.id,
            plantInstanceId: instance.id,
            mode: 'RECEIVED_SUBSTRATE',
            description: 'Substrate as received; composition not yet recorded.',
            startedAt: acquiredAt,
            reason: 'Initial substrate recorded from bulk acquisition',
            changedByUserId: user.id,
          })
          await tx.plantAcquisitionRecordInstance.create({ data: { acquisitionRecordId: record.id, plantInstanceId: instance.id } })
          await emitDomainEvent(tx, {
            eventType: 'acquisition.instance_created', collectionId: collection.id, aggregateId: instance.id,
            actor: { id: user.id, role: user.role }, occurredAt: acquiredAt, idempotencyKey: `acquisition-batch:${batch.id}:instance:${instance.id}`,
            payload: { subjectId: instance.id, plantInstanceId: instance.id, plantId: instance.plantId, recordId: batch.id, recordType: 'AcquisitionBatch' },
          })
          instanceCount += 1
        }
      }
      const nextStatus = fulfillmentChoice === 'FULFILLED' ? 'FULFILLED' : fulfillmentChoice === 'REPEAT_PURCHASE' ? 'ACTIVELY_SEEKING' : undefined
      if (nextStatus) await tx.plantDefinition.update({ where: { id: definition.id }, data: { acquisitionStatus: nextStatus } })
    }
    await tx.acquisitionBatch.update({ where: { id: batch.id }, data: { status: 'COMPLETED' } })
    await emitDomainEvent(tx, {
      eventType: 'acquisition.batch_completed', collectionId: collection.id, aggregateId: batch.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `acquisition-batch:${batch.id}:completed`,
      payload: { subjectId: batch.id, recordId: batch.id, recordType: 'AcquisitionBatch', title: 'Acquisition batch completed', itemCount: definitions.length, instanceCount },
    })
    return { batch, instanceCount }
  })
  await audit(user, 'CREATE', 'ACQUISITION_BATCH', result.batch.id, `Recorded acquisition batch with ${definitions.length} definitions`, { itemCount: definitions.length, instanceCount: result.instanceCount }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/acquisitions'))
  revalidatePath(collectionPath(collection.slug, '/wishlist'))
  redirect(collectionPath(collection.slug, `/acquisitions/bulk?batch=${result.batch.id}`))
}

export async function addIdentificationToWishlist(fd: FormData) {
  const { user, collection, role } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const logId = val(fd, 'identificationLogId')
  const log = await prisma.plantIdentificationLog.findFirst({
    where: { id: logId, collectionId: collection.id },
    include: { matchedPlantDefinition: true, createdPlantDefinition: true },
  })
  if (!log) throw new Error('ID My Plant history item was not found.')
  if (log.userId !== user.id && role !== 'MANAGER') throw new Error('Only collection managers can use another member’s ID result.')
  const definition = [log.createdPlantDefinition, log.matchedPlantDefinition].find((item) => item?.collectionId === collection.id)
  if (!definition) {
    redirect(`${collectionPath(collection.slug, '/plants')}?fromIdentification=${encodeURIComponent(log.id)}&wishlist=1`)
  }
  const previousStatus = definition.acquisitionStatus
  await prisma.$transaction(async (tx) => {
    await tx.plantDefinition.update({ where: { id: definition.id }, data: {
      acquisitionStatus: 'WISHLIST',
      acquisitionPriority: definition.acquisitionPriority || 3,
    } })
    await emitDomainEvent(tx, {
      eventType: previousStatus ? 'wishlist.status_changed' : 'wishlist.added', collectionId: collection.id, aggregateId: definition.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `wishlist:${definition.id}:identification:${log.id}`,
      payload: { subjectId: definition.id, recordId: log.id, recordType: 'PlantIdentificationLog', displayName: plantName(definition), previousStatus, status: 'WISHLIST' },
    })
  })
  await audit(user, 'UPDATE', 'PLANT_DEFINITION', definition.id, `Added ${plantName(definition)} to wishlist from ID My Plant`, { identificationLogId: log.id }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/wishlist'))
  redirect(collectionPath(collection.slug, `/acquisitions?definition=${definition.id}`))
}

export async function updateAcquisitionVisibility(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const visibility = ['PRIVATE', 'MEMBERS', 'PUBLIC'].includes(val(fd, 'acquisitionVisibility') || '')
    ? val(fd, 'acquisitionVisibility')!
    : 'PRIVATE'
  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: { acquisitionVisibility: visibility },
  })
  await audit(user, 'UPDATE', 'COLLECTION', collection.id, `Updated acquisition pipeline visibility for ${collection.name}`, { acquisitionVisibility: visibility }, collection.id)
  revalidatePath(collectionPath(updated.slug, '/collection-settings'))
  redirect(collectionPath(updated.slug, '/collection-settings'))
}
