'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { audit, requireServerAdmin, requireUser } from '@/lib/auth'
import {
  collectionPath,
  getCurrentCollectionSlug,
  requireCollectionAdmin,
  requireCollectionGardener,
  requireCollectionLogger,
  requireCollectionManager,
  requireCollectionViewer,
} from '@/lib/collections'
import {
  careSheetSettingsFromForm,
  dateFromForm,
  generateCareSheetToken,
  hashCareSheetToken,
  normalizeCareSheetMode,
  selectedCareSheetSections,
  taskSnapshotFromQueueItem,
} from '@/lib/care-sheets'
import { getCareQueue } from '@/lib/care-queue'
import { createDemoData } from '@/lib/demo-data'
import { notifyFollowers } from '@/lib/follows'
import { expectedPlantIdForInstance, generatePlantId } from '@/lib/plant-id'
import { nextOccurrence } from '@/lib/reminders'
import { notifySunshineManagers, validateSunshineTarget } from '@/lib/sunshine'
import { addCalendarDays, calendarDayIndexInTimeZone, formatDate, parseDateLocal, parseDateTimeLocal, timeZoneForPreference } from '@/lib/time'
import { plantName } from '@/lib/utils'
import { environmentalHusbandryFields, husbandryFieldNames, husbandryFormValues } from '@/lib/husbandry'
import { definitionData, findMatchingValidatedDefinition, globalGoverningBodyId, husbandryData } from '@/lib/validated-definitions'
import { recordValidatedDefinitionChange, snapshotValidatedDefinition, validatedDefinitionInclude } from '@/lib/collection-updates'
import { collectionRoleAtLeast, isServerAdminRole } from '@/lib/roles'
import { assertLocationParentAllowed, descendantLocationIds, isQuarantineLocation, nextLocationCode, normalizeQuarantineRiskLevel, quarantineChecklistItems } from '@/lib/locations'
import { evaluatePlantLocationCompatibility, getEffectiveLocationEnvironment, getEffectivePlantEnvironmentRequirements } from '@/lib/location-compatibility'
import { emitDomainEvent } from '@/lib/events/emit'

const val = (fd: FormData, k: string) =>
  String(fd.get(k) || '').trim() || undefined
const clearableVal = (fd: FormData, k: string) =>
  fd.has(k) ? val(fd, k) || null : undefined
const speciesVal = (fd: FormData, k = 'species') => val(fd, k)?.toLowerCase()

const date = (s?: string) => (s ? new Date(s) : undefined)
const dec = (s?: string) => (s ? s : undefined)
const clearableDate = (fd: FormData, k: string) =>
  fd.has(k) ? date(val(fd, k)) || null : undefined
const clearableDec = (fd: FormData, k: string) =>
  fd.has(k) ? dec(val(fd, k)) || null : undefined
const checkedValue = (fd: FormData, k: string, defaultValue = false) => {
  const values = fd.getAll(k)
  if (values.length === 0) return defaultValue
  return values.some((value) => ['on', '1', 'true'].includes(String(value)))
}
const clearableInt = (fd: FormData, k: string, min = 1, max = 365) => {
  if (!fd.has(k)) return undefined
  const value = val(fd, k)
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
const acquisitionStatusValue = (fd: FormData, k = 'acquisitionStatus') => {
  if (!fd.has(k)) return undefined
  const value = val(fd, k)
  if (!value) return null
  return ['RESEARCHING', 'WISHLIST', 'ACTIVELY_SEEKING', 'ON_HOLD', 'FULFILLED', 'NO_LONGER_INTERESTED'].includes(value) ? value : null
}
const acquisitionPriorityValue = (fd: FormData, k = 'acquisitionPriority') => {
  if (!fd.has(k)) return undefined
  const value = val(fd, k)
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(1, Math.min(5, Math.floor(parsed)))
}
const jsonListValue = (fd: FormData, k: string) => {
  if (!fd.has(k)) return undefined
  const items = String(fd.get(k) || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : null
}
const back = (fd: FormData) => val(fd, 'back') || '/'
const collectionSlug = async (fd: FormData) => val(fd, 'collectionSlug') || await getCurrentCollectionSlug()
const revalidateDestination = (destination: string) => revalidatePath(destination.split('#')[0] || '/')
const boundedInt = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
const boundedFloat = (value: string | undefined, fallback: number | null, min: number, max: number) => {
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}
const photoFramingData = (fd: FormData) => ({
  cropX: boundedFloat(val(fd, 'cropX'), null, 0, 100),
  cropY: boundedFloat(val(fd, 'cropY'), null, 0, 100),
  cropWidth: boundedFloat(val(fd, 'cropWidth'), null, 0, 100),
  cropHeight: boundedFloat(val(fd, 'cropHeight'), null, 0, 100),
  focalX: boundedFloat(val(fd, 'focalX'), 50, 0, 100),
  focalY: boundedFloat(val(fd, 'focalY'), 50, 0, 100),
})
const isSportLine = (status?: string | null) =>
  !!status && !['NONE', 'UNSTABLE', 'REVERTED'].includes(status)
const careEventForTask = (taskType?: string | null) => {
  if (taskType === 'WATER') return 'WATERED'
  if (taskType === 'FERTILIZE') return 'FERTILIZED'
  if (taskType === 'PROPAGATION_CHECK') return 'PROPAGATION_CHECK'
  if (taskType === 'PEST_CHECK') return 'PEST_CHECK'
  if (taskType === 'HEALTH_CHECK') return 'HEALTH_CHECK'
  if (taskType === 'BLOOM_CHECK') return 'BLOOM_CHECK'
  return 'OTHER'
}
const careEventForBulkCare = (careType?: string | null) => {
  if (careType === 'WATERING') return 'WATERED'
  if (careType === 'FERTILIZING') return 'FERTILIZED'
  if (careType === 'REPOTTING') return 'REPOTTED'
  if (careType === 'PEST_CHECK') return 'PEST_CHECK'
  if (careType === 'HEALTH_CHECK') return 'HEALTH_CHECK'
  if (careType === 'PROPAGATION_CHECK') return 'PROPAGATION_CHECK'
  if (careType === 'BLOOM_CHECK') return 'BLOOM_CHECK'
  return 'OTHER'
}
const domainEventForCare = (eventType: string) => {
  if (eventType === 'WATERED') return 'care.watered' as const
  if (eventType === 'FERTILIZED') return 'care.fertilized' as const
  if (eventType === 'REPOTTED') return 'care.repotting_completed' as const
  if (eventType === 'PEST_CHECK') return 'care.pest_checked' as const
  return 'care.health_checked' as const
}
const queueTaskForBulkCare = (careType?: string | null) => {
  if (careType === 'WATERING') return 'WATER'
  if (careType === 'FERTILIZING') return 'FERTILIZE'
  if (['PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK'].includes(careType || '')) return careType
  if (careType === 'OTHER') return 'REMINDER'
  return null
}
const conditionSeverityValue = (value?: string | null) =>
  ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(value || '') ? value! : 'MODERATE'
const conditionStatusValue = (value?: string | null) =>
  ['OPEN', 'IMPROVING', 'RESOLVED'].includes(value || '') ? value! : 'OPEN'
const conditionQueueTaskType = (category?: string | null, taskType?: string | null) =>
  taskType === 'PEST_CHECK' || category === 'PESTS' ? 'PEST_CHECK' : 'HEALTH_CHECK'

function appendConditionNote(existing: string | null | undefined, note: string | undefined, label: string) {
  if (!note) return existing || null
  const entry = `[${new Date().toISOString()}] ${label}: ${note}`
  return [existing, entry].filter(Boolean).join('\n\n')
}

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

function validationReviewAction(fd: FormData) {
  const action = val(fd, 'reviewAction') || 'REJECT'
  if (['APPROVE', 'REJECT', 'REQUEST_REVISIONS'].includes(action)) return action
  return 'REJECT'
}

function disputeReviewStatus(fd: FormData) {
  const status = val(fd, 'status') || 'RESOLVED'
  if (['RESOLVED', 'REJECTED'].includes(status)) return status
  return 'RESOLVED'
}

async function cleanupGenericEntity(collectionId: string, entityType: string, entityId: string) {
  const photos = await prisma.photo.findMany({
    where: { collectionId, entityType, entityId },
    select: { id: true },
  })
  const photoIds = photos.map((photo) => photo.id)
  await prisma.sunshine.deleteMany({
    where: {
      collectionId,
      OR: [
        { targetType: entityType, targetId: entityId },
        ...(photoIds.length ? [{ targetType: 'PHOTO', targetId: { in: photoIds } }] : []),
      ],
    },
  })
  await prisma.note.deleteMany({ where: { collectionId, entityType, entityId } })
  await prisma.photo.deleteMany({ where: { collectionId, entityType, entityId } })
}

async function assertHusbandryLinkAllowed(collectionId: string, plantDefinitionId: string, sourcePlantDefinitionId: string) {
  if (plantDefinitionId === sourcePlantDefinitionId) throw new Error('A plant definition cannot link husbandry to itself.')
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId }, select: { id: true } })
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: sourcePlantDefinitionId, collectionId }, select: { id: true } })

  const seen = new Set([plantDefinitionId])
  let cursor: string | null = sourcePlantDefinitionId
  while (cursor) {
    if (seen.has(cursor)) throw new Error('That husbandry link would create a circular guide reference.')
    seen.add(cursor)
    const guide: { sourcePlantDefinitionId: string | null } | null = await prisma.plantHusbandryGuide.findFirst({
      where: { collectionId, plantDefinitionId: cursor },
      select: { sourcePlantDefinitionId: true },
    })
    cursor = guide?.sourcePlantDefinitionId || null
  }
}

function husbandryMutationData(fd: FormData) {
  const values: Record<string, string | null | Date> = husbandryFormValues(fd)
  values.reviewStatus = val(fd, 'reviewStatus') || 'DRAFT'
  values.reviewNotes = val(fd, 'reviewNotes') || null
  values.aiModel = val(fd, 'aiModel') || null
  if (values.aiModel && !val(fd, 'existingAiGeneratedAt')) values.aiGeneratedAt = new Date()
  return values
}

async function verifiedFertilizerRecipeId(collectionId: string, recipeId?: string | null) {
  if (!recipeId) return null
  const recipe = await prisma.fertilizerRecipe.findFirst({ where: { id: recipeId, collectionId }, select: { id: true } })
  if (!recipe) throw new Error('Fertilizer recipe not found in this collection.')
  return recipe.id
}

async function maybeCreateMagicFertilizerRecipe(collectionId: string, fd: FormData) {
  if (fd.get('createFertilizerRecipeDraft') !== 'on') return null
  const name = val(fd, 'newFertilizerRecipeName')
  if (!name) return null
  const recipe = await prisma.fertilizerRecipe.upsert({
    where: { collectionId_name: { collectionId, name } },
    update: {
      description: val(fd, 'newFertilizerRecipeDescription') || 'Magic Fill suggested fertilizer recipe draft.',
      declaredNpk: val(fd, 'newFertilizerRecipeNpk') || null,
      applicationMethod: val(fd, 'newFertilizerRecipeApplicationMethod') || 'OTHER',
      dilutionInstructions: val(fd, 'newFertilizerRecipeDilution') || null,
      strengthLabel: val(fd, 'newFertilizerRecipeStrength') || null,
      frequencyNotes: val(fd, 'newFertilizerRecipeFrequency') || null,
      seasonalNotes: val(fd, 'newFertilizerRecipeSeasonalNotes') || null,
      safetyNotes: val(fd, 'newFertilizerRecipeCautionNotes') || null,
      notes: val(fd, 'newFertilizerRecipeProductSuggestions') ? `Product suggestions: ${val(fd, 'newFertilizerRecipeProductSuggestions')}` : null,
      draft: true,
      active: true,
    },
    create: {
      collectionId,
      name,
      description: val(fd, 'newFertilizerRecipeDescription') || 'Magic Fill suggested fertilizer recipe draft.',
      declaredNpk: val(fd, 'newFertilizerRecipeNpk') || null,
      applicationMethod: val(fd, 'newFertilizerRecipeApplicationMethod') || 'OTHER',
      dilutionInstructions: val(fd, 'newFertilizerRecipeDilution') || null,
      strengthLabel: val(fd, 'newFertilizerRecipeStrength') || null,
      frequencyNotes: val(fd, 'newFertilizerRecipeFrequency') || null,
      seasonalNotes: val(fd, 'newFertilizerRecipeSeasonalNotes') || null,
      safetyNotes: val(fd, 'newFertilizerRecipeCautionNotes') || null,
      notes: val(fd, 'newFertilizerRecipeProductSuggestions') ? `Product suggestions: ${val(fd, 'newFertilizerRecipeProductSuggestions')}` : null,
      draft: true,
      active: true,
    },
  })
  return recipe.id
}

async function structuredHusbandryMutationData(fd: FormData, collectionId: string) {
  const draftRecipeId = await maybeCreateMagicFertilizerRecipe(collectionId, fd)
  return {
    fertilizerRecipeId: draftRecipeId || await verifiedFertilizerRecipeId(collectionId, val(fd, 'fertilizerRecipeId') || null),
    fertilizationCadenceDays: clearableInt(fd, 'fertilizationCadenceDays'),
    fertilizationPaused: checkedValue(fd, 'fertilizationPaused', false),
  }
}

function recipeProductRows(fd: FormData) {
  const productIds = fd.getAll('recipeProductId').map((value) => String(value || '').trim())
  const amounts = fd.getAll('recipeProductAmount').map((value) => String(value || '').trim())
  const units = fd.getAll('recipeProductUnit').map((value) => String(value || '').trim())
  const notes = fd.getAll('recipeProductNotes').map((value) => String(value || '').trim())
  return productIds
    .map((productId, index) => ({
      productId,
      amount: amounts[index] || null,
      unit: units[index] || null,
      notes: notes[index] || null,
      sortOrder: index,
    }))
    .filter((row) => row.productId)
}

const fertilizerNutrientFields = [
  'nitrogen',
  'phosphorus',
  'potassium',
  'calcium',
  'magnesium',
  'sulfur',
  'iron',
  'manganese',
  'zinc',
  'copper',
  'boron',
  'molybdenum',
  'chlorine',
  'nickel',
  'silicon',
] as const

function fertilizerProductMutationData(fd: FormData, fallbackName?: string) {
  const nutrientData = Object.fromEntries(fertilizerNutrientFields.map((field) => [field, clearableDec(fd, field) as any]))
  return {
    name: val(fd, 'name') || fallbackName,
    brand: val(fd, 'brand') || null,
    productType: val(fd, 'productType') || 'OTHER',
    ...nutrientData,
    guaranteedAnalysisNotes: val(fd, 'guaranteedAnalysisNotes') || null,
    concentrationNotes: val(fd, 'usageNotes') || val(fd, 'concentrationNotes') || null,
    defaultDilution: val(fd, 'manufacturerRecommendedDilution') || val(fd, 'defaultDilution') || null,
    manufacturerFeedAmount: val(fd, 'manufacturerFeedAmount') || null,
    manufacturerFeedUnit: val(fd, 'manufacturerFeedUnit') || null,
    manufacturerFeedWaterVolume: val(fd, 'manufacturerFeedWaterVolume') || null,
    manufacturerFeedWaterUnit: val(fd, 'manufacturerFeedWaterUnit') || null,
    manufacturerFeedNotes: val(fd, 'manufacturerFeedNotes') || null,
    sourceUrl: val(fd, 'sourceUrl') || null,
    sourceName: val(fd, 'sourceName') || null,
    dataConfidence: ['USER_ENTERED', 'AI_DRAFT', 'VERIFIED', 'UNCERTAIN'].includes(val(fd, 'dataConfidence') || '')
      ? val(fd, 'dataConfidence')
      : 'USER_ENTERED',
    aiModel: val(fd, 'aiModel') || null,
    aiFilledAt: val(fd, 'aiFilledAt') ? new Date(val(fd, 'aiFilledAt')!) : null,
    notes: val(fd, 'notes') || null,
    active: checkedValue(fd, 'active', true),
  }
}

async function cleanupPlantInstanceDependents(collectionId: string, id: string) {
  const blooms = await prisma.bloomEvent.findMany({
    where: { collectionId, plantInstanceId: id },
    select: { id: true },
  })

  const bloomIds = blooms.map((b) => b.id)

  if (bloomIds.length > 0) {
    const bloomPhotos = await prisma.photo.findMany({
      where: { collectionId, entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
      select: { id: true },
    })
    await prisma.sunshine.deleteMany({
      where: {
        collectionId,
        OR: [
          { targetType: 'BLOOM_EVENT', targetId: { in: bloomIds } },
          ...(bloomPhotos.length ? [{ targetType: 'PHOTO', targetId: { in: bloomPhotos.map((photo) => photo.id) } }] : []),
        ],
      },
    })

    await prisma.photo.deleteMany({
      where: { collectionId, entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
    })

    await prisma.note.deleteMany({
      where: { collectionId, entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
    })
  }

  await cleanupGenericEntity(collectionId, 'PLANT_INSTANCE', id)
  await prisma.plantCareAdjustment.deleteMany({ where: { collectionId, plantInstanceId: id } })
  await prisma.plantCondition.deleteMany({ where: { collectionId, plantInstanceId: id } })
  await prisma.plantCareEvent.deleteMany({ where: { collectionId, plantInstanceId: id } })
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
  if (context.membership?.status !== 'ACTIVE') {
    redirect(`/collection-access?slug=${encodeURIComponent(context.collection.slug)}`)
  }

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

export async function toggleSunshine(fd: FormData) {
  const user = await requireUser()
  const context = await requireCollectionViewer(await collectionSlug(fd))
  const targetType = val(fd, 'targetType')
  const targetId = val(fd, 'targetId')
  const destination = back(fd)
  if (targetType !== 'PLANT_INSTANCE' || !targetId) throw new Error('Sunshine is only available for plant instances.')

  const target = await validateSunshineTarget(prisma, context.collection.id, context.collection.slug, targetType, targetId)
  const existing = await prisma.sunshine.findUnique({
    where: {
      collectionId_userId_targetType_targetId: {
        collectionId: context.collection.id,
        userId: user.id,
        targetType,
        targetId,
      },
    },
  })

  if (existing) {
    await prisma.sunshine.delete({ where: { id: existing.id } })
    await audit(null, 'DELETE', 'SUNSHINE', existing.id, `Removed sunshine from ${target.label}`, { targetType, targetId }, context.collection.id)
  } else {
    const sunshine = await prisma.sunshine.create({
      data: {
        collectionId: context.collection.id,
        userId: user.id,
        targetType,
        targetId,
      },
    })
    await audit(null, 'CREATE', 'SUNSHINE', sunshine.id, `Gave sunshine to ${target.label}`, { targetType, targetId }, context.collection.id)
    await notifySunshineManagers(prisma, {
      actorUserId: user.id,
      collectionId: context.collection.id,
      collectionName: context.collection.name,
      target,
    })
  }

  revalidateDestination(destination)
  redirect(destination)
}

export async function toggleSunshineInline(input: { collectionSlug: string; targetId: string }) {
  const user = await requireUser()
  const context = await requireCollectionViewer(input.collectionSlug)
  const target = await validateSunshineTarget(prisma, context.collection.id, context.collection.slug, 'PLANT_INSTANCE', input.targetId)
  const existing = await prisma.sunshine.findUnique({
    where: {
      collectionId_userId_targetType_targetId: {
        collectionId: context.collection.id,
        userId: user.id,
        targetType: 'PLANT_INSTANCE',
        targetId: input.targetId,
      },
    },
  })

  let active = false
  if (existing) {
    await prisma.sunshine.delete({ where: { id: existing.id } })
    await audit(null, 'DELETE', 'SUNSHINE', existing.id, `Removed sunshine from ${target.label}`, { targetType: 'PLANT_INSTANCE', targetId: input.targetId }, context.collection.id)
  } else {
    const sunshine = await prisma.sunshine.create({
      data: {
        collectionId: context.collection.id,
        userId: user.id,
        targetType: 'PLANT_INSTANCE',
        targetId: input.targetId,
      },
    })
    active = true
    await audit(null, 'CREATE', 'SUNSHINE', sunshine.id, `Gave sunshine to ${target.label}`, { targetType: 'PLANT_INSTANCE', targetId: input.targetId }, context.collection.id)
    await notifySunshineManagers(prisma, {
      actorUserId: user.id,
      collectionId: context.collection.id,
      collectionName: context.collection.name,
      target,
    })
  }

  const count = await prisma.sunshine.count({
    where: {
      collectionId: context.collection.id,
      targetType: 'PLANT_INSTANCE',
      targetId: input.targetId,
    },
  })
  revalidatePath(collectionPath(context.collection.slug, '/'))
  revalidatePath(collectionPath(context.collection.slug, '/instances'))
  revalidatePath(collectionPath(context.collection.slug, `/instances/${input.targetId}`))
  return { active, count }
}

const sortPreferenceSections: Record<string, string[]> = {
  instances: ['plantIdAsc', 'plantIdDesc', 'updatedDesc', 'updatedAsc', 'acquiredDesc', 'acquiredAsc', 'sunshineDesc', 'sunshineAsc'],
  plants: ['nameAsc', 'nameDesc', 'updatedDesc', 'updatedAsc', 'createdDesc', 'createdAsc'],
  propagations: ['dateDesc', 'dateAsc', 'methodAsc', 'statusAsc', 'updatedDesc'],
  blooms: ['startDesc', 'startAsc', 'updatedDesc', 'statusAsc', 'plantIdAsc'],
  gallery: ['newest', 'oldest', 'plantIdAsc', 'typeAsc'],
  sports: ['updatedDesc', 'plantIdAsc', 'statusAsc'],
  archived: ['archiveDesc', 'archiveAsc', 'plantIdAsc'],
}

export async function saveSortPreference(fd: FormData) {
  const user = await requireUser()
  const destination = back(fd)
  const section = val(fd, 'section')!
  const sortKey = val(fd, 'sortKey')!
  const allowed = sortPreferenceSections[section]
  if (!allowed?.includes(sortKey)) throw new Error('Unsupported sort option.')

  await prisma.userSortPreference.upsert({
    where: { userId_section: { userId: user.id, section } },
    update: { sortKey },
    create: { userId: user.id, section, sortKey },
  })

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
      abbreviation: clearableVal(fd, 'abbreviation'),
      website: clearableVal(fd, 'website'),
      notes: clearableVal(fd, 'notes'),
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

export async function createLocationType(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const type = await prisma.locationType.create({
    data: {
      collectionId: collection.id,
      name: val(fd, 'name')!,
      abbreviation: val(fd, 'abbreviation')!,
      description: clearableVal(fd, 'description'),
      sortOrder: boundedInt(val(fd, 'sortOrder'), 0, 0, 9999),
    },
  })
  await audit(user, 'CREATE', 'LOCATION_TYPE', type.id, `Created location type ${type.name}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, '/locations'))
}

export async function updateLocationType(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const type = await prisma.locationType.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const status = val(fd, 'status') || 'ACTIVE'
  if (status === 'ARCHIVED') {
    const activeLocationCount = await prisma.location.count({ where: { collectionId: collection.id, locationTypeId: id, status: 'ACTIVE' } })
    if (activeLocationCount > 0) throw new Error('Archive or move active locations before archiving this location type.')
  }
  const updated = await prisma.locationType.update({
    where: { id },
    data: {
      name: val(fd, 'name')!,
      abbreviation: val(fd, 'abbreviation')!,
      description: clearableVal(fd, 'description'),
      sortOrder: boundedInt(val(fd, 'sortOrder'), type.sortOrder, 0, 9999),
      status,
    },
  })
  await audit(user, 'UPDATE', 'LOCATION_TYPE', id, `Updated location type ${updated.name}`, undefined, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, '/locations'))
}

export async function createLocation(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const locationTypeId = val(fd, 'locationTypeId')!
  const parentLocationId = clearableVal(fd, 'parentLocationId')
  const [type, parent] = await Promise.all([
    prisma.locationType.findFirstOrThrow({ where: { id: locationTypeId, collectionId: collection.id, status: 'ACTIVE' } }),
    parentLocationId ? prisma.location.findFirstOrThrow({ where: { id: parentLocationId, collectionId: collection.id, status: 'ACTIVE' } }) : null,
  ])
  const location = await prisma.$transaction(async (tx) => {
    const created = await tx.location.create({ data: {
      collectionId: collection.id,
      locationTypeId: type.id,
      parentLocationId: parent?.id || null,
      name: val(fd, 'name')!,
      code: await nextLocationCode(prisma, collection.id, type.abbreviation),
      description: clearableVal(fd, 'description'),
      sortOrder: boundedInt(val(fd, 'sortOrder'), 0, 0, 9999),
    } })
    await emitDomainEvent(tx, {
      eventType: 'location.created', collectionId: collection.id, aggregateId: created.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `location:${created.id}:created`,
      payload: { subjectId: created.id, displayName: created.name, code: created.code, parentLocationId: created.parentLocationId },
    })
    return created
  })
  await audit(user, 'CREATE', 'LOCATION', location.id, `Created location ${location.code} ${location.name}`, undefined, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, `/locations/${location.id}`))
}

export async function updateLocation(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const parentLocationId = clearableVal(fd, 'parentLocationId')
  const location = await prisma.location.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const locationTypeId = val(fd, 'locationTypeId')!
  const status = val(fd, 'status') || 'ACTIVE'
  await Promise.all([
    prisma.locationType.findFirstOrThrow({ where: { id: locationTypeId, collectionId: collection.id } }),
    parentLocationId ? prisma.location.findFirstOrThrow({ where: { id: parentLocationId, collectionId: collection.id, status: 'ACTIVE' } }) : null,
  ])
  await assertLocationParentAllowed(prisma, collection.id, id, parentLocationId)
  if (status === 'ARCHIVED') {
    const [plantCount, childCount] = await Promise.all([
      prisma.plantInstance.count({ where: { collectionId: collection.id, currentLocationId: id, status: 'ACTIVE' } }),
      prisma.location.count({ where: { collectionId: collection.id, parentLocationId: id, status: 'ACTIVE' } }),
    ])
    if (plantCount > 0 || childCount > 0) throw new Error('Move plants and child locations before archiving this location.')
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.location.update({ where: { id }, data: {
      locationTypeId,
      parentLocationId,
      name: val(fd, 'name')!,
      description: clearableVal(fd, 'description'),
      sortOrder: boundedInt(val(fd, 'sortOrder'), location.sortOrder, 0, 9999),
      status,
    } })
    const eventType = status === 'ARCHIVED' && location.status !== 'ARCHIVED'
      ? 'location.archived' as const
      : parentLocationId !== location.parentLocationId ? 'location.reparented' as const : 'location.updated' as const
    await emitDomainEvent(tx, {
      eventType, collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      idempotencyKey: `location:${id}:${eventType}:${result.updatedAt.toISOString()}`,
      payload: { subjectId: id, displayName: result.name, code: result.code, fromParentLocationId: location.parentLocationId, toParentLocationId: result.parentLocationId },
    })
    return result
  })
  await audit(user, 'UPDATE', 'LOCATION', id, `Updated location ${updated.code} ${updated.name}`, undefined, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, `/locations/${id}`))
}

export async function regenerateLocationCode(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const proposedCode = val(fd, 'proposedCode')!
  const location = await prisma.location.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: { locationType: true },
  })
  const expectedPrefix = `LOC-${location.locationType.abbreviation.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'LOC'}-`
  if (location.code.startsWith(expectedPrefix)) redirect(collectionPath(collection.slug, `/locations/${id}`))
  const nextCode = await nextLocationCode(prisma, collection.id, location.locationType.abbreviation)
  if (nextCode !== proposedCode) throw new Error('The proposed location code is no longer current. Refresh and try again.')
  await prisma.location.update({ where: { id }, data: { code: nextCode } })
  await audit(
    user,
    'UPDATE',
    'LOCATION',
    id,
    `Regenerated location code from ${location.code} to ${nextCode}`,
    { previousCode: location.code, code: nextCode },
    collection.id,
  )
  redirect(collectionPath(collection.slug, `/locations/${id}`))
}

export async function archiveLocation(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const [location, plantCount, childCount] = await Promise.all([
    prisma.location.findFirstOrThrow({ where: { id, collectionId: collection.id } }),
    prisma.plantInstance.count({ where: { collectionId: collection.id, currentLocationId: id, status: 'ACTIVE' } }),
    prisma.location.count({ where: { collectionId: collection.id, parentLocationId: id, status: 'ACTIVE' } }),
  ])
  if (plantCount > 0 || childCount > 0) throw new Error('Move plants and child locations before archiving this location.')
  await prisma.$transaction(async (tx) => {
    await tx.location.update({ where: { id }, data: { status: 'ARCHIVED' } })
    await emitDomainEvent(tx, {
      eventType: 'location.archived', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      payload: { subjectId: id, displayName: location.name, code: location.code }, idempotencyKey: `location:${id}:archived`,
    })
  })
  await audit(user, 'ARCHIVE', 'LOCATION', id, `Archived location ${location.code} ${location.name}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, '/locations'))
}

export async function movePlantInstanceLocation(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const toLocationId = clearableVal(fd, 'toLocationId')
  const notes = clearableVal(fd, 'notes')
  const [instance, target] = await Promise.all([
    prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id, status: 'ACTIVE' } }),
    toLocationId ? prisma.location.findFirstOrThrow({ where: { id: toLocationId, collectionId: collection.id, status: 'ACTIVE' } }) : null,
  ])
  const fromLocationId = instance.currentLocationId
  if (fromLocationId === (target?.id || null)) redirect(back(fd))
  await prisma.$transaction(async (tx) => {
    await tx.plantInstance.update({
      where: { id: plantInstanceId },
      data: {
        currentLocationId: target?.id || null,
        location: target?.name || null,
        legacyLocationText: instance.legacyLocationText || instance.location,
      },
    })
    const move = await tx.plantLocationMove.create({
      data: {
        collectionId: collection.id,
        plantInstanceId,
        fromLocationId,
        toLocationId: target?.id || null,
        movedByUserId: user.id,
        notes,
      },
    })
    const from = fromLocationId ? await tx.location.findUnique({ where: { id: fromLocationId } }) : null
    await emitDomainEvent(tx, {
      eventType: 'plant.location_moved', collectionId: collection.id, aggregateId: plantInstanceId,
      actor: { id: user.id, role: user.role }, idempotencyKey: `location-move:${move.id}`,
      payload: { subjectId: move.id, recordType: 'PlantLocationMove', recordId: move.id, plantInstanceId, plantId: instance.plantId, displayName: instance.plantId, fromLocation: from ? { id: from.id, name: from.name, code: from.code } : null, toLocation: target ? { id: target.id, name: target.name, code: target.code } : null, summary: notes || undefined },
    })
  })
  await audit(user, 'MOVE', 'PLANT_INSTANCE_LOCATION', plantInstanceId, `Moved ${instance.plantId} to ${target?.code || 'no location'}`, { fromLocationId, toLocationId: target?.id || null, notes }, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function batchMovePlantLocations(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const sourceLocationId = val(fd, 'sourceLocationId')!
  const toLocationId = val(fd, 'toLocationId')!
  const scope = val(fd, 'scope') === 'nested' ? 'nested' : 'direct'
  const selectedPlantIds = fd.getAll('plantInstanceId').map((value) => String(value)).filter(Boolean)
  const notes = clearableVal(fd, 'notes')
  if (val(fd, 'confirm') !== 'yes') throw new Error('Confirm the batch move before applying it.')
  if (!selectedPlantIds.length) throw new Error('Select at least one plant to move.')
  const [source, target, locations] = await Promise.all([
    prisma.location.findFirstOrThrow({ where: { id: sourceLocationId, collectionId: collection.id, status: 'ACTIVE' } }),
    prisma.location.findFirstOrThrow({ where: { id: toLocationId, collectionId: collection.id, status: 'ACTIVE' } }),
    prisma.location.findMany({ where: { collectionId: collection.id }, select: { id: true, parentLocationId: true } }),
  ])
  if (source.id === target.id) throw new Error('Choose a different destination location.')
  const sourceIds = scope === 'nested'
    ? [source.id, ...Array.from(descendantLocationIds(source.id, locations))]
    : [source.id]
  const plants = await prisma.plantInstance.findMany({
    where: {
      collectionId: collection.id,
      status: 'ACTIVE',
      id: { in: selectedPlantIds },
      currentLocationId: { in: sourceIds },
      NOT: { currentLocationId: target.id },
    },
    select: { id: true, plantId: true, currentLocationId: true, legacyLocationText: true, location: true },
    orderBy: { plantId: 'asc' },
  })
  if (!plants.length) throw new Error('No eligible active plants remain for this batch move.')
  const targetEnvironment = await getEffectiveLocationEnvironment(prisma, collection.id, target.id)
  const compatibilityResults = await Promise.all(plants.map(async (plant) => ({
    plant,
    result: evaluatePlantLocationCompatibility({
      plantRequirements: await getEffectivePlantEnvironmentRequirements(prisma, collection.id, { plantInstanceId: plant.id }),
      locationEnvironment: targetEnvironment,
    }),
  })))
  const compatibilityWarnings = compatibilityResults.filter((item) => item.result.overallStatus === 'CAUTION' || item.result.overallStatus === 'POOR_MATCH')
  if (compatibilityWarnings.length && val(fd, 'compatibilityConfirm') !== 'yes') throw new Error('Review and confirm the location compatibility warnings before moving these plants.')
  const compatibilityByPlantId = new Map(compatibilityResults.map((item) => [item.plant.id, item.result]))
  const correlationId = randomUUID()
  await prisma.$transaction(async (tx) => {
    for (const plant of plants) {
      await tx.plantInstance.update({
      where: { id: plant.id },
      data: {
        currentLocationId: target.id,
        location: target.name,
        legacyLocationText: plant.legacyLocationText || plant.location,
      },
      })
      const move = await tx.plantLocationMove.create({
      data: {
        collectionId: collection.id,
        plantInstanceId: plant.id,
        fromLocationId: plant.currentLocationId,
        toLocationId: target.id,
        movedByUserId: user.id,
        notes: notes ? `Batch move: ${notes}` : `Batch move from ${source.name} to ${target.name}.`,
        compatibilityStatus: compatibilityByPlantId.get(plant.id)?.overallStatus || null,
        compatibilityAcknowledgedAt: compatibilityWarnings.some((entry) => entry.plant.id === plant.id) ? new Date() : null,
        compatibilityNote: compatibilityWarnings.some((entry) => entry.plant.id === plant.id) ? notes || 'Compatibility warning acknowledged during batch move.' : null,
      } })
      await emitDomainEvent(tx, {
        eventType: 'plant.location_moved', collectionId: collection.id, aggregateId: plant.id, actor: { id: user.id, role: user.role }, correlationId,
        idempotencyKey: `location-move:${move.id}`, payload: { subjectId: move.id, recordId: move.id, recordType: 'PlantLocationMove', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, fromLocation: { id: plant.currentLocationId, name: source.name, code: source.code }, toLocation: { id: target.id, name: target.name, code: target.code }, summary: notes || undefined },
      })
      if (compatibilityWarnings.some((entry) => entry.plant.id === plant.id)) await emitDomainEvent(tx, {
        eventType: 'plant.location_compatibility_warning_acknowledged', collectionId: collection.id, aggregateId: plant.id,
        actor: { id: user.id, role: user.role }, correlationId, causationId: move.id, idempotencyKey: `location-compatibility:${move.id}`,
        payload: { subjectId: move.id, recordId: move.id, recordType: 'PlantLocationMove', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, compatibilityStatus: compatibilityByPlantId.get(plant.id)?.overallStatus, toLocationId: target.id, summary: notes || undefined },
      })
    }
    await emitDomainEvent(tx, {
      eventType: 'location.batch_move_completed', collectionId: collection.id, aggregateId: target.id, actor: { id: user.id, role: user.role }, correlationId,
      idempotencyKey: `location-batch:${correlationId}`, payload: { subjectId: target.id, displayName: target.name, plantInstanceIds: plants.map((plant) => plant.id), count: plants.length, fromLocationId: source.id, toLocationId: target.id },
    })
  })
  await audit(
    user,
    'MOVE',
    'PLANT_INSTANCE_LOCATION_BATCH',
    source.id,
    `Batch moved ${plants.length} plant${plants.length === 1 ? '' : 's'} from ${source.code} to ${target.code}`,
    { sourceLocationId: source.id, toLocationId: target.id, scope, plantInstanceIds: plants.map((plant) => plant.id), compatibilityWarningsAcknowledged: compatibilityWarnings.length, notes },
    collection.id,
  )
  redirect(back(fd) || collectionPath(collection.slug, '/locations'))
}

async function normalizeLocationSiblingSort(collectionId: string, parentLocationId: string | null) {
  const siblings = await prisma.location.findMany({
    where: { collectionId, parentLocationId, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true },
  })
  await prisma.$transaction(siblings.map((sibling, index) => prisma.location.update({
    where: { id: sibling.id },
    data: { sortOrder: (index + 1) * 10 },
  })))
}

export async function moveLocation(input: {
  collectionSlug: string
  locationId: string
  newParentLocationId?: string | null
  newSortOrder?: number
  confirmContained?: boolean
}) {
  const { user, collection } = await requireCollectionManager(input.collectionSlug)
  const newParentLocationId = input.newParentLocationId || null
  const location = await prisma.location.findFirstOrThrow({ where: { id: input.locationId, collectionId: collection.id } })
  const [parent, plantCount, childCount] = await Promise.all([
    newParentLocationId ? prisma.location.findFirstOrThrow({ where: { id: newParentLocationId, collectionId: collection.id, status: 'ACTIVE' } }) : null,
    prisma.plantInstance.count({ where: { collectionId: collection.id, currentLocationId: location.id, status: 'ACTIVE' } }),
    prisma.location.count({ where: { collectionId: collection.id, parentLocationId: location.id, status: 'ACTIVE' } }),
  ])
  await assertLocationParentAllowed(prisma, collection.id, location.id, parent?.id || null)
  if ((plantCount > 0 || childCount > 0) && !input.confirmContained) {
    throw new Error('Confirm moving this location because it contains plants or child locations.')
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.location.update({ where: { id: location.id }, data: {
      parentLocationId: parent?.id || null,
      sortOrder: Number.isFinite(input.newSortOrder) ? Math.max(0, Math.floor(input.newSortOrder || 0)) : location.sortOrder,
    } })
    await emitDomainEvent(tx, {
      eventType: 'location.reparented', collectionId: collection.id, aggregateId: location.id, actor: { id: user.id, role: user.role },
      idempotencyKey: `location:${location.id}:reparented:${updated.updatedAt.toISOString()}`,
      payload: { subjectId: location.id, displayName: location.name, code: location.code, fromParentLocationId: location.parentLocationId, toParentLocationId: parent?.id || null },
    })
  })
  await Promise.all([
    normalizeLocationSiblingSort(collection.id, location.parentLocationId),
    normalizeLocationSiblingSort(collection.id, parent?.id || null),
  ])
  await audit(user, 'MOVE', 'LOCATION', location.id, `Moved location ${location.code} ${location.name}`, { fromParentLocationId: location.parentLocationId, toParentLocationId: parent?.id || null }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/locations'))
  revalidatePath(collectionPath(collection.slug, `/locations/${location.id}`))
  return { ok: true }
}

export async function reorderLocations(input: {
  collectionSlug: string
  parentLocationId?: string | null
  orderedLocationIds: string[]
}) {
  const { user, collection } = await requireCollectionManager(input.collectionSlug)
  const parentLocationId = input.parentLocationId || null
  const orderedIds = Array.from(new Set(input.orderedLocationIds.filter(Boolean)))
  if (!orderedIds.length) throw new Error('No locations were provided for reordering.')
  if (parentLocationId) await prisma.location.findFirstOrThrow({ where: { id: parentLocationId, collectionId: collection.id, status: 'ACTIVE' } })
  const siblings = await prisma.location.findMany({
    where: { collectionId: collection.id, parentLocationId, status: 'ACTIVE' },
    select: { id: true },
  })
  const siblingIds = new Set(siblings.map((sibling) => sibling.id))
  if (orderedIds.some((id) => !siblingIds.has(id))) throw new Error('Locations must be active siblings in this collection.')
  await prisma.$transaction(orderedIds.map((id, index) => prisma.location.update({
    where: { id },
    data: { sortOrder: (index + 1) * 10 },
  })))
  await audit(user, 'UPDATE', 'LOCATION_ORDER', parentLocationId || collection.id, `Reordered ${orderedIds.length} location${orderedIds.length === 1 ? '' : 's'}`, { parentLocationId, orderedLocationIds: orderedIds }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/locations'))
  return { ok: true }
}

export async function movePlantToLocation(input: {
  collectionSlug: string
  plantInstanceId: string
  destinationLocationId?: string | null
  note?: string | null
  compatibilityAcknowledged?: boolean
  compatibilityNote?: string | null
}) {
  return batchMovePlantsToLocation({
    collectionSlug: input.collectionSlug,
    plantInstanceIds: [input.plantInstanceId],
    destinationLocationId: input.destinationLocationId || null,
    note: input.note || null,
    compatibilityAcknowledged: input.compatibilityAcknowledged,
    compatibilityNote: input.compatibilityNote,
  })
}

export async function batchMovePlantsToLocation(input: {
  collectionSlug: string
  plantInstanceIds: string[]
  destinationLocationId?: string | null
  note?: string | null
  startQuarantine?: boolean
  quarantineReason?: string | null
  quarantineRiskLevel?: string | null
  quarantineTargetReleaseDate?: string | null
  compatibilityAcknowledged?: boolean
  compatibilityNote?: string | null
}) {
  const { user, collection } = await requireCollectionGardener(input.collectionSlug)
  const plantIds = Array.from(new Set(input.plantInstanceIds.filter(Boolean)))
  if (!plantIds.length) throw new Error('Select at least one plant to move.')
  const target = input.destinationLocationId
    ? await prisma.location.findFirstOrThrow({
        where: { id: input.destinationLocationId, collectionId: collection.id, status: 'ACTIVE' },
        include: { locationType: true },
      })
    : null
  if (input.startQuarantine && !isQuarantineLocation(target)) {
    throw new Error('Quarantine records can only be started from a quarantine-type destination.')
  }
  const plants = await prisma.plantInstance.findMany({
    where: {
      collectionId: collection.id,
      status: 'ACTIVE',
      id: { in: plantIds },
      NOT: { currentLocationId: target?.id || null },
    },
    select: { id: true, plantId: true, currentLocationId: true, legacyLocationText: true, location: true },
    orderBy: { plantId: 'asc' },
  })
  if (!plants.length) throw new Error('No eligible active plants remain for this move.')
  const targetEnvironment = target && !input.startQuarantine ? await getEffectiveLocationEnvironment(prisma, collection.id, target.id) : null
  const compatibilityResults = targetEnvironment
    ? await Promise.all(plants.map(async (plant) => {
        const requirements = await getEffectivePlantEnvironmentRequirements(prisma, collection.id, { plantInstanceId: plant.id })
        return { plant, result: evaluatePlantLocationCompatibility({ plantRequirements: requirements, locationEnvironment: targetEnvironment }) }
      }))
    : []
  const warningResults = compatibilityResults.filter(({ result }) => result.overallStatus === 'CAUTION' || result.overallStatus === 'POOR_MATCH')
  if (warningResults.length && !input.compatibilityAcknowledged) {
    throw new Error(`${warningResults.length} plant${warningResults.length === 1 ? '' : 's'} need a location compatibility review before this move.`)
  }
  const compatibilityByPlantId = new Map(compatibilityResults.map(({ plant, result }) => [plant.id, result]))
  const existingQuarantines = input.startQuarantine
    ? await prisma.plantQuarantine.findMany({
        where: { collectionId: collection.id, plantInstanceId: { in: plants.map((plant) => plant.id) }, status: 'ACTIVE' },
        select: { plantInstanceId: true },
      })
    : []
  const alreadyQuarantined = new Set(existingQuarantines.map((entry) => entry.plantInstanceId))
  const targetReleaseDate = date(input.quarantineTargetReleaseDate || undefined) || addCalendarDays(new Date(), 14)
  const correlationId = randomUUID()
  await prisma.$transaction(async (tx) => {
    for (const plant of plants) {
      await tx.plantInstance.update({ where: { id: plant.id }, data: {
        currentLocationId: target?.id || null,
        location: target?.name || null,
        legacyLocationText: plant.legacyLocationText || plant.location,
      } })
      const move = await tx.plantLocationMove.create({ data: {
        collectionId: collection.id,
        plantInstanceId: plant.id,
        fromLocationId: plant.currentLocationId,
        toLocationId: target?.id || null,
        movedByUserId: user.id,
        notes: input.note || null,
        compatibilityStatus: compatibilityByPlantId.get(plant.id)?.overallStatus || (input.startQuarantine ? 'TEMPORARY_QUARANTINE' : null),
        compatibilityAcknowledgedAt: warningResults.some((entry) => entry.plant.id === plant.id) ? new Date() : null,
        compatibilityNote: warningResults.some((entry) => entry.plant.id === plant.id) ? input.compatibilityNote || input.note || null : null,
      } })
      if (warningResults.some((entry) => entry.plant.id === plant.id)) {
        await emitDomainEvent(tx, {
          eventType: 'plant.location_compatibility_warning_acknowledged', collectionId: collection.id, aggregateId: plant.id,
          actor: { id: user.id, role: user.role }, correlationId, causationId: move.id,
          idempotencyKey: `location-compatibility:${move.id}`,
          payload: { subjectId: move.id, recordId: move.id, recordType: 'PlantLocationMove', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, compatibilityStatus: compatibilityByPlantId.get(plant.id)?.overallStatus, toLocationId: target?.id, summary: input.compatibilityNote || input.note || undefined },
        })
      }
      const from = plant.currentLocationId ? await tx.location.findUnique({ where: { id: plant.currentLocationId } }) : null
      await emitDomainEvent(tx, {
        eventType: 'plant.location_moved', collectionId: collection.id, aggregateId: plant.id, actor: { id: user.id, role: user.role }, correlationId,
        idempotencyKey: `location-move:${move.id}`, payload: { subjectId: move.id, recordId: move.id, recordType: 'PlantLocationMove', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, fromLocation: from ? { id: from.id, name: from.name, code: from.code } : null, toLocation: target ? { id: target.id, name: target.name, code: target.code } : null, summary: input.note || undefined },
      })
      if (input.startQuarantine && target && !alreadyQuarantined.has(plant.id)) {
        const quarantine = await tx.plantQuarantine.create({ data: {
          collectionId: collection.id, plantInstanceId: plant.id, quarantineLocationId: target.id,
          reason: input.quarantineReason || 'Quarantine after location move', riskLevel: normalizeQuarantineRiskLevel(input.quarantineRiskLevel),
          startDate: new Date(), targetReleaseDate, notes: input.note || null,
          checklistJson: quarantineChecklistItems.map((label) => ({ label, done: false })) as any, createdByUserId: user.id,
        } })
        await emitDomainEvent(tx, {
          eventType: 'quarantine.started', collectionId: collection.id, aggregateId: quarantine.id, occurredAt: quarantine.startDate,
          actor: { id: user.id, role: user.role }, correlationId, causationId: move.id, idempotencyKey: `quarantine:${quarantine.id}:started`,
          payload: { subjectId: quarantine.id, recordId: quarantine.id, recordType: 'PlantQuarantine', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, riskLevel: quarantine.riskLevel, location: { id: target.id, name: target.name, code: target.code }, summary: quarantine.reason },
        })
      }
    }
    if (plants.length > 1) await emitDomainEvent(tx, {
      eventType: 'location.batch_move_completed', collectionId: collection.id, aggregateId: target?.id || collection.id, actor: { id: user.id, role: user.role }, correlationId,
      idempotencyKey: `location-batch:${correlationId}`, payload: { subjectId: correlationId, displayName: target?.name || 'No location', plantInstanceIds: plants.map((plant) => plant.id), count: plants.length, toLocationId: target?.id || null },
    })
  })
  await audit(
    user,
    'MOVE',
    plants.length === 1 ? 'PLANT_INSTANCE_LOCATION' : 'PLANT_INSTANCE_LOCATION_BATCH',
    plants.length === 1 ? plants[0].id : target?.id || collection.id,
    `Moved ${plants.length} plant${plants.length === 1 ? '' : 's'} to ${target?.code || 'no location'}`,
    { plantInstanceIds: plants.map((plant) => plant.id), toLocationId: target?.id || null, startQuarantine: Boolean(input.startQuarantine), compatibilityWarningsAcknowledged: warningResults.length, compatibilityNote: input.compatibilityNote || null, note: input.note || null },
    collection.id,
  )
  revalidatePath(collectionPath(collection.slug, '/locations'))
  for (const plant of plants) revalidatePath(collectionPath(collection.slug, `/instances/${plant.id}`))
  return { ok: true, movedCount: plants.length, quarantineStartedCount: input.startQuarantine ? plants.filter((plant) => !alreadyQuarantined.has(plant.id)).length : 0 }
}

function quarantineChecklistFromForm(fd: FormData) {
  const completed = new Set(fd.getAll('checklistItem').map((value) => String(value)))
  return quarantineChecklistItems.map((label) => ({ label, done: completed.has(label) }))
}

export async function startPlantQuarantine(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const quarantineLocationId = clearableVal(fd, 'quarantineLocationId')
  const [plant, location, existing] = await Promise.all([
    prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id, status: 'ACTIVE' } }),
    quarantineLocationId ? prisma.location.findFirstOrThrow({ where: { id: quarantineLocationId, collectionId: collection.id } }) : null,
    prisma.plantQuarantine.findFirst({ where: { collectionId: collection.id, plantInstanceId, status: 'ACTIVE' } }),
  ])
  if (existing) throw new Error('This plant already has an active quarantine record.')
  const quarantine = await prisma.$transaction(async (tx) => {
    const created = await tx.plantQuarantine.create({ data: {
      collectionId: collection.id,
      plantInstanceId,
      quarantineLocationId: location?.id || null,
      reason: val(fd, 'reason') || 'Quarantine review',
      riskLevel: normalizeQuarantineRiskLevel(val(fd, 'riskLevel')),
      startDate: date(val(fd, 'startDate')) || new Date(),
      targetReleaseDate: date(val(fd, 'targetReleaseDate')) || addCalendarDays(new Date(), 14),
      notes: clearableVal(fd, 'notes'),
      checklistJson: quarantineChecklistFromForm(fd) as any,
      createdByUserId: user.id,
    } })
    await emitDomainEvent(tx, {
      eventType: 'quarantine.started', collectionId: collection.id, aggregateId: created.id, occurredAt: created.startDate,
      actor: { id: user.id, role: user.role }, idempotencyKey: `quarantine:${created.id}:started`,
      payload: { subjectId: created.id, recordId: created.id, recordType: 'PlantQuarantine', plantInstanceId, plantId: plant.plantId, displayName: plant.plantId, riskLevel: created.riskLevel, location: location ? { id: location.id, name: location.name, code: location.code } : null, summary: created.reason },
    })
    return created
  })
  await audit(user, 'CREATE', 'PLANT_QUARANTINE', quarantine.id, `Started quarantine for ${plant.plantId}`, undefined, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, `/instances/${plantInstanceId}`))
}

export async function updatePlantQuarantine(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const quarantine = await prisma.plantQuarantine.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'ACTIVE' } })
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.plantQuarantine.update({ where: { id }, data: {
      reason: val(fd, 'reason') || quarantine.reason,
      riskLevel: normalizeQuarantineRiskLevel(val(fd, 'riskLevel') || quarantine.riskLevel),
      targetReleaseDate: date(val(fd, 'targetReleaseDate')) || quarantine.targetReleaseDate,
      notes: clearableVal(fd, 'notes'),
      checklistJson: quarantineChecklistFromForm(fd) as any,
    } })
    await emitDomainEvent(tx, {
      eventType: 'quarantine.updated', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      idempotencyKey: `quarantine:${id}:updated:${result.updatedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'PlantQuarantine', plantInstanceId: quarantine.plantInstanceId, displayName: quarantine.plantInstanceId, riskLevel: result.riskLevel, targetReleaseDate: result.targetReleaseDate.toISOString(), summary: result.reason },
    })
    return result
  })
  await audit(user, 'UPDATE', 'PLANT_QUARANTINE', id, `Updated quarantine target for ${quarantine.plantInstanceId}`, { targetReleaseDate: updated.targetReleaseDate }, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, `/instances/${quarantine.plantInstanceId}`))
}

export async function releasePlantQuarantine(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const quarantine = await prisma.plantQuarantine.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'ACTIVE' } })
  const releasedAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.plantQuarantine.update({ where: { id }, data: {
      status: 'RELEASED',
      releasedAt,
      releasedByUserId: user.id,
      notes: clearableVal(fd, 'notes') || quarantine.notes,
      checklistJson: quarantineChecklistFromForm(fd) as any,
    } })
    await emitDomainEvent(tx, {
      eventType: 'quarantine.released', collectionId: collection.id, aggregateId: id, occurredAt: releasedAt,
      actor: { id: user.id, role: user.role }, idempotencyKey: `quarantine:${id}:released:${releasedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'PlantQuarantine', plantInstanceId: quarantine.plantInstanceId, displayName: quarantine.plantInstanceId, summary: clearableVal(fd, 'notes') || quarantine.notes || undefined },
    })
  })
  await audit(user, 'UPDATE', 'PLANT_QUARANTINE', id, `Released quarantine for ${quarantine.plantInstanceId}`, undefined, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, `/instances/${quarantine.plantInstanceId}`))
}

export async function cancelPlantQuarantine(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const quarantine = await prisma.plantQuarantine.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'ACTIVE' } })
  const cancelledAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.plantQuarantine.update({ where: { id }, data: {
      status: 'CANCELLED',
      cancelledAt,
      cancelledByUserId: user.id,
      notes: clearableVal(fd, 'notes') || quarantine.notes,
      checklistJson: quarantineChecklistFromForm(fd) as any,
    } })
    await emitDomainEvent(tx, {
      eventType: 'quarantine.cancelled', collectionId: collection.id, aggregateId: id, occurredAt: cancelledAt,
      actor: { id: user.id, role: user.role }, idempotencyKey: `quarantine:${id}:cancelled:${cancelledAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'PlantQuarantine', plantInstanceId: quarantine.plantInstanceId, displayName: quarantine.plantInstanceId, summary: clearableVal(fd, 'notes') || quarantine.notes || undefined },
    })
  })
  await audit(user, 'UPDATE', 'PLANT_QUARANTINE', id, `Cancelled quarantine for ${quarantine.plantInstanceId}`, undefined, collection.id)
  redirect(back(fd) || collectionPath(collection.slug, `/instances/${quarantine.plantInstanceId}`))
}

export async function createPlantDefinition(fd: FormData) {
  const { user, collection, membership } = await requireCollectionLogger(await collectionSlug(fd))
  const identificationLogId = clearableVal(fd, 'plantIdentificationLogId')
  const identificationLog = identificationLogId
    ? await prisma.plantIdentificationLog.findFirst({
        where: { id: identificationLogId, collectionId: collection.id },
        include: { uploadedPhoto: true },
      })
    : null
  if (identificationLogId && !identificationLog) throw new Error('ID My Plant history item was not found in this collection.')
  if (
    identificationLog &&
    identificationLog.userId !== user.id &&
    !isServerAdminRole(user.role) &&
    !collectionRoleAtLeast(membership?.role, 'MANAGER')
  ) {
    throw new Error('Only collection managers can create definitions from another user’s ID My Plant history.')
  }

  const definition = await prisma.$transaction(async (tx) => {
    const created = await tx.plantDefinition.create({
      data: {
        collectionId: collection.id,
        genus: val(fd, 'genus')!,
        species: speciesVal(fd)!,
        hybridNotation: clearableVal(fd, 'hybridNotation'),
        cultivarName: clearableVal(fd, 'cultivarName'),
        authority: clearableVal(fd, 'authority'),
        cultivarRegistrationNumber: clearableVal(fd, 'cultivarRegistrationNumber'),
        governingBodyId: clearableVal(fd, 'governingBodyId'),
        confidence: val(fd, 'confidence') || 'UNCERTAIN',
        acquisitionLabel: clearableVal(fd, 'acquisitionLabel'),
        provisionalTaxon: clearableVal(fd, 'provisionalTaxon'),
        wikipediaUrl: clearableVal(fd, 'wikipediaUrl'),
        inaturalistUrl: clearableVal(fd, 'inaturalistUrl'),
        powoUrl: clearableVal(fd, 'powoUrl'),
        gbifUrl: clearableVal(fd, 'gbifUrl'),
        description: clearableVal(fd, 'description'),
        notes: clearableVal(fd, 'notes'),
        acquisitionStatus: acquisitionStatusValue(fd) as any,
        acquisitionPriority: acquisitionPriorityValue(fd),
        acquisitionInterestNotes: clearableVal(fd, 'acquisitionInterestNotes'),
        desiredSpecimenSize: clearableVal(fd, 'desiredSpecimenSize'),
        idealPurchasePrice: clearableDec(fd, 'idealPurchasePrice') as any,
        maximumPurchasePrice: clearableDec(fd, 'maximumPurchasePrice') as any,
        desiredLocationId: clearableVal(fd, 'desiredLocationId'),
        preferredVendorsJson: jsonListValue(fd, 'preferredVendors') as any,
        acquisitionResearchSummary: clearableVal(fd, 'acquisitionResearchSummary'),
        aliases: { create: aliasRows(fd).map((alias) => ({ ...alias, collectionId: collection.id })) },
      },
    })

    if (identificationLog) {
      await tx.plantIdentificationLog.update({
        where: { id: identificationLog.id },
        data: {
          status: 'CREATED_DEFINITION',
          createdPlantDefinitionId: created.id,
          appliedPlantDefinitionId: created.id,
        },
      })
      if (fd.get('attachIdentificationImage') === 'on' && identificationLog.uploadedPhoto) {
        await tx.photo.updateMany({ where: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId: created.id }, data: { isType: false } })
        await tx.photo.create({
          data: {
            collectionId: collection.id,
            uploadedByUserId: user.id,
            entityType: 'PLANT_DEFINITION',
            entityId: created.id,
            filename: identificationLog.uploadedPhoto.filename,
            path: identificationLog.uploadedPhoto.path,
            caption: identificationLog.uploadedPhoto.caption || 'Reused from ID My Plant history',
            source: identificationLog.uploadedPhoto.source || 'USER_ID_IMAGE',
            sourceUrl: identificationLog.uploadedPhoto.sourceUrl,
            cropX: identificationLog.uploadedPhoto.cropX,
            cropY: identificationLog.uploadedPhoto.cropY,
            cropWidth: identificationLog.uploadedPhoto.cropWidth,
            cropHeight: identificationLog.uploadedPhoto.cropHeight,
            focalX: identificationLog.uploadedPhoto.focalX,
            focalY: identificationLog.uploadedPhoto.focalY,
            isType: true,
          },
        })
      }
    }
    await emitDomainEvent(tx, {
      eventType: 'definition.created', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role },
      idempotencyKey: `definition:${created.id}:created`, payload: { subjectId: created.id, recordId: created.id, recordType: 'PlantDefinition', displayName: plantName(created), genus: created.genus, species: created.species, cultivarName: created.cultivarName, confidence: created.confidence },
    })
    return created
  })
  await audit(user, 'CREATE', 'PLANT_DEFINITION', definition.id, `Created plant definition ${definition.genus} ${definition.species}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, '/plants'))
}

export async function copyPlantDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const source = await prisma.plantDefinition.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: { aliases: true },
  })
  const definition = await prisma.plantDefinition.create({
    data: {
      collectionId: collection.id,
      genus: source.genus,
      species: source.species,
      authority: source.authority,
      governingBodyId: source.governingBodyId,
      wikipediaUrl: source.wikipediaUrl,
      inaturalistUrl: source.inaturalistUrl,
      powoUrl: source.powoUrl,
      gbifUrl: source.gbifUrl,
      description: source.description,
      aliases: {
        create: source.aliases.map((alias) => ({
          collectionId: collection.id,
          name: alias.name,
          aliasType: alias.aliasType,
          source: alias.source,
          confidence: alias.confidence,
          notes: alias.notes,
        })),
      },
    },
  })
  await audit(
    user,
    'CREATE',
    'PLANT_DEFINITION',
    definition.id,
    `Copied plant definition ${source.genus} ${source.species}`,
    { sourcePlantDefinitionId: source.id },
    collection.id,
  )

  redirect(collectionPath(collection.slug, `/plants/${definition.id}/edit`))
}

export async function nominatePlantDefinitionForValidation(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const notes = clearableVal(fd, 'notes')
  const definition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: { validationCandidates: { where: { status: 'PENDING' }, take: 1 } },
  })
  if (definition.isValidated || definition.validatedPlantDefinitionId) throw new Error('This definition is already connected to a validated definition.')
  if (definition.validationCandidates.length) throw new Error('This definition already has a pending validation nomination.')

  const match = await findMatchingValidatedDefinition(prisma, definition)
  if (match) throw new Error(`A matching validated definition already exists: ${plantName(match)}.`)

  const candidate = await prisma.plantDefinitionValidationCandidate.create({
    data: {
      collectionId: collection.id,
      plantDefinitionId: definition.id,
      nominatedByUserId: user.id,
      notes,
    },
  })
  await audit(user, 'NOMINATE', 'PLANT_DEFINITION_VALIDATION_CANDIDATE', candidate.id, `Nominated ${plantName(definition)} for validation`, { plantDefinitionId: id }, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${id}/edit#validation`))
}

export async function reviewPlantDefinitionValidationCandidate(fd: FormData) {
  const user = await requireServerAdmin()
  const candidateId = val(fd, 'candidateId')!
  const action = validationReviewAction(fd)
  const reviewNotes = clearableVal(fd, 'reviewNotes')

  const result = await prisma.$transaction(async (tx) => {
    const candidate = await tx.plantDefinitionValidationCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: {
        collection: true,
        plantDefinition: {
          include: {
            aliases: true,
            husbandryGuide: true,
            governingBody: true,
          },
        },
      },
    })
    if (candidate.status !== 'PENDING') throw new Error('This validation nomination has already been reviewed.')
    const source = candidate.plantDefinition
    if (!source) throw new Error('The nominated plant definition no longer exists.')
    if (source.isValidated) throw new Error('This nomination source is already validated.')

    if (action !== 'APPROVE') {
      const status = action === 'REQUEST_REVISIONS' ? 'REVISION_REQUESTED' : 'REJECTED'
      const updated = await tx.plantDefinitionValidationCandidate.update({
        where: { id: candidate.id },
        data: { status, reviewedByUserId: user.id, reviewedAt: new Date(), reviewNotes },
      })
      return { candidate: updated, source, validated: null as any, collection: candidate.collection, status }
    }

    const existing = await findMatchingValidatedDefinition(tx, source)
    if (existing) throw new Error(`A matching validated definition already exists: ${plantName(existing)}.`)

    const governingBodyId = await globalGoverningBodyId(tx, source.governingBodyId)
    const validated = await tx.plantDefinition.create({
      data: definitionData(source, {
        collectionId: null,
        governingBodyId,
        isValidated: true,
        validatedAt: new Date(),
        validatedByUserId: user.id,
        validatedSourceCollectionId: candidate.collectionId,
        validatedSourceDefinitionId: source.id,
        validationNotes: reviewNotes,
        aliases: {
          create: source.aliases.map((alias) => ({
            collectionId: null,
            name: alias.name,
            aliasType: alias.aliasType,
            source: alias.source,
            confidence: alias.confidence,
            notes: alias.notes,
          })),
        },
      }),
    })

    if (source.husbandryGuide) {
      await tx.plantHusbandryGuide.create({
        data: husbandryData(source.husbandryGuide, {
          collectionId: null,
          plantDefinitionId: validated.id,
          sourcePlantDefinitionId: null,
        }) as any,
      })
    }

    const sourcePhotos = await tx.photo.findMany({ where: { collectionId: candidate.collectionId, entityType: 'PLANT_DEFINITION', entityId: source.id } })
    for (const photo of sourcePhotos) {
      await tx.photo.create({
        data: {
          collectionId: null,
          entityType: 'PLANT_DEFINITION',
          entityId: validated.id,
          filename: photo.filename,
          path: photo.path,
          caption: photo.caption,
          source: photo.source,
          sourceUrl: photo.sourceUrl,
          cropX: photo.cropX,
          cropY: photo.cropY,
          cropWidth: photo.cropWidth,
          cropHeight: photo.cropHeight,
          focalX: photo.focalX,
          focalY: photo.focalY,
          isCover: photo.isCover,
          isType: photo.isType,
        },
      })
    }

    await tx.plantInstance.updateMany({ where: { collectionId: candidate.collectionId, plantDefinitionId: source.id }, data: { plantDefinitionId: validated.id } })
    await tx.photo.updateMany({ where: { collectionId: candidate.collectionId, entityType: 'PLANT_DEFINITION', entityId: source.id }, data: { entityId: validated.id } })
    await tx.note.updateMany({ where: { collectionId: candidate.collectionId, entityType: 'PLANT_DEFINITION', entityId: source.id }, data: { entityId: validated.id } })
    await tx.reminder.updateMany({ where: { collectionId: candidate.collectionId, entityType: 'PLANT_DEFINITION', entityId: source.id }, data: { entityId: validated.id } })
    await tx.follow.updateMany({ where: { collectionId: candidate.collectionId, scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: source.id }, data: { entityId: validated.id, label: plantName(validated) } })
    await tx.plantHusbandryGuide.updateMany({ where: { collectionId: candidate.collectionId, sourcePlantDefinitionId: source.id }, data: { sourcePlantDefinitionId: validated.id } })

    await tx.plantDefinitionValidationCandidate.update({
      where: { id: candidate.id },
      data: { status: 'APPROVED', reviewedByUserId: user.id, reviewedAt: new Date(), reviewNotes, approvedPlantDefinitionId: validated.id },
    })
    await tx.plantDefinition.delete({ where: { id: source.id } })
    return { candidate, source, validated, collection: candidate.collection, status: 'APPROVED' }
  })

  await audit(user, result.status, 'PLANT_DEFINITION_VALIDATION_CANDIDATE', candidateId, `${result.status.toLowerCase().replace('_', ' ')} validation nomination for ${plantName(result.source)}`, {
    sourcePlantDefinitionId: result.source.id,
    validatedPlantDefinitionId: result.validated?.id,
  }, result.collection.id)
  redirect('/server/validated-definitions')
}

export async function disputeValidatedPlantDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const reason = val(fd, 'reason')!
  const notes = clearableVal(fd, 'notes')
  const definition = await prisma.plantDefinition.findFirstOrThrow({ where: { id, isValidated: true, collectionId: null } })
  const dispute = await prisma.plantDefinitionDispute.create({
    data: {
      collectionId: collection.id,
      validatedPlantDefinitionId: definition.id,
      submittedByUserId: user.id,
      reason,
      notes,
    },
  })
  await audit(user, 'DISPUTE', 'PLANT_DEFINITION_DISPUTE', dispute.id, `Disputed validated definition ${plantName(definition)}`, { reason, validatedPlantDefinitionId: id }, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${id}/edit#validation`))
}

export async function reviewPlantDefinitionDispute(fd: FormData) {
  const user = await requireServerAdmin()
  const id = val(fd, 'disputeId')!
  const status = disputeReviewStatus(fd)
  const resolutionNotes = clearableVal(fd, 'resolutionNotes')
  const dispute = await prisma.plantDefinitionDispute.update({
    where: { id },
    data: { status, reviewedByUserId: user.id, reviewedAt: new Date(), resolutionNotes },
    include: { validatedPlantDefinition: true, collection: true },
  })
  await audit(user, status, 'PLANT_DEFINITION_DISPUTE', dispute.id, `${status.toLowerCase()} dispute for ${plantName(dispute.validatedPlantDefinition)}`, {
    validatedPlantDefinitionId: dispute.validatedPlantDefinitionId,
    reason: dispute.reason,
  }, dispute.collectionId)
  redirect('/server/validated-definitions')
}

export async function updateValidatedPlantDefinition(fd: FormData) {
  const user = await requireServerAdmin()
  const id = val(fd, 'id')!

  const beforeDefinition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id, collectionId: null, isValidated: true },
    include: validatedDefinitionInclude(),
  })
  const beforePhotos = await prisma.photo.findMany({
    where: { collectionId: null, entityType: 'PLANT_DEFINITION', entityId: id },
    orderBy: [{ isType: 'desc' }, { createdAt: 'desc' }],
  })
  const before = snapshotValidatedDefinition({ ...beforeDefinition, photos: beforePhotos })

  await prisma.plantDefinition.update({
    where: { id },
    data: {
      genus: val(fd, 'genus')!,
      species: speciesVal(fd)!,
      hybridNotation: clearableVal(fd, 'hybridNotation'),
      cultivarName: clearableVal(fd, 'cultivarName'),
      authority: clearableVal(fd, 'authority'),
      cultivarRegistrationNumber: clearableVal(fd, 'cultivarRegistrationNumber'),
      confidence: val(fd, 'confidence') || 'VERIFIED',
      acquisitionLabel: clearableVal(fd, 'acquisitionLabel'),
      provisionalTaxon: clearableVal(fd, 'provisionalTaxon'),
      wikipediaUrl: clearableVal(fd, 'wikipediaUrl'),
      inaturalistUrl: clearableVal(fd, 'inaturalistUrl'),
      powoUrl: clearableVal(fd, 'powoUrl'),
      gbifUrl: clearableVal(fd, 'gbifUrl'),
      description: clearableVal(fd, 'description'),
      notes: clearableVal(fd, 'notes'),
      validationNotes: clearableVal(fd, 'validationNotes'),
    },
  })

  const afterDefinition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id, collectionId: null, isValidated: true },
    include: validatedDefinitionInclude(),
  })
  const afterPhotos = await prisma.photo.findMany({
    where: { collectionId: null, entityType: 'PLANT_DEFINITION', entityId: id },
    orderBy: [{ isType: 'desc' }, { createdAt: 'desc' }],
  })
  const after = snapshotValidatedDefinition({ ...afterDefinition, photos: afterPhotos })
  const change = await recordValidatedDefinitionChange(prisma, {
    validatedDefinitionId: id,
    changedByUserId: user.id,
    previous: before,
    next: after,
  })

  await audit(user, 'UPDATE', 'PLANT_DEFINITION', id, `Updated validated definition ${plantName(afterDefinition)}`, {
    validatedDefinitionChangeId: change?.id,
  }, null)
  redirect(`/server/validated-definitions/${id}`)
}

export async function createLocalCopyFromValidatedDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const selected = fd.getAll('plantInstanceId').map((value) => String(value || '').trim()).filter(Boolean)
  const validated = await prisma.plantDefinition.findFirstOrThrow({
    where: { id, isValidated: true, collectionId: null },
    include: { aliases: true, husbandryGuide: true },
  })

  const local = await prisma.$transaction(async (tx) => {
    const definition = await tx.plantDefinition.create({
      data: definitionData(validated, {
        collectionId: collection.id,
        isValidated: false,
        validatedPlantDefinitionId: null,
        validationNotes: null,
        aliases: {
          create: validated.aliases.map((alias) => ({
            collectionId: collection.id,
            name: alias.name,
            aliasType: alias.aliasType,
            source: alias.source,
            confidence: alias.confidence,
            notes: alias.notes,
          })),
        },
      }),
    })
    if (validated.husbandryGuide) {
      await tx.plantHusbandryGuide.create({
        data: husbandryData(validated.husbandryGuide, {
          collectionId: collection.id,
          plantDefinitionId: definition.id,
          sourcePlantDefinitionId: null,
        }) as any,
      })
    }
    const photos = await tx.photo.findMany({ where: { collectionId: null, entityType: 'PLANT_DEFINITION', entityId: validated.id } })
    for (const photo of photos) {
      await tx.photo.create({
        data: {
          collectionId: collection.id,
          entityType: 'PLANT_DEFINITION',
          entityId: definition.id,
          filename: photo.filename,
          path: photo.path,
          caption: photo.caption,
          source: photo.source,
          sourceUrl: photo.sourceUrl,
          cropX: photo.cropX,
          cropY: photo.cropY,
          cropWidth: photo.cropWidth,
          cropHeight: photo.cropHeight,
          focalX: photo.focalX,
          focalY: photo.focalY,
          isCover: photo.isCover,
          isType: photo.isType,
        },
      })
    }
    if (selected.length) {
      await tx.plantInstance.updateMany({ where: { collectionId: collection.id, plantDefinitionId: validated.id, id: { in: selected } }, data: { plantDefinitionId: definition.id } })
    }
    return definition
  })

  await audit(user, 'DETACH', 'PLANT_DEFINITION', local.id, `Created local copy of validated definition ${plantName(validated)}`, {
    validatedPlantDefinitionId: validated.id,
    movedPlantInstanceIds: selected,
  }, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${local.id}/edit#validation`))
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
      hybridNotation: clearableVal(fd, 'hybridNotation'),
      cultivarName: clearableVal(fd, 'cultivarName'),
      authority: clearableVal(fd, 'authority'),
      cultivarRegistrationNumber: clearableVal(fd, 'cultivarRegistrationNumber'),
      governingBodyId: clearableVal(fd, 'governingBodyId'),
      confidence: val(fd, 'confidence') || 'UNCERTAIN',
      acquisitionLabel: clearableVal(fd, 'acquisitionLabel'),
      provisionalTaxon: clearableVal(fd, 'provisionalTaxon'),
      wikipediaUrl: clearableVal(fd, 'wikipediaUrl'),
      inaturalistUrl: clearableVal(fd, 'inaturalistUrl'),
      powoUrl: clearableVal(fd, 'powoUrl'),
      gbifUrl: clearableVal(fd, 'gbifUrl'),
      description: clearableVal(fd, 'description'),
      notes: clearableVal(fd, 'notes'),
      acquisitionStatus: acquisitionStatusValue(fd) as any,
      acquisitionPriority: acquisitionPriorityValue(fd),
      acquisitionInterestNotes: clearableVal(fd, 'acquisitionInterestNotes'),
      desiredSpecimenSize: clearableVal(fd, 'desiredSpecimenSize'),
      idealPurchasePrice: clearableDec(fd, 'idealPurchasePrice') as any,
      maximumPurchasePrice: clearableDec(fd, 'maximumPurchasePrice') as any,
      desiredLocationId: clearableVal(fd, 'desiredLocationId'),
      preferredVendorsJson: jsonListValue(fd, 'preferredVendors') as any,
      acquisitionResearchSummary: clearableVal(fd, 'acquisitionResearchSummary'),
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

export async function mergePlantDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const sourceId = val(fd, 'sourcePlantDefinitionId')!
  const targetId = val(fd, 'targetPlantDefinitionId')!
  if (sourceId === targetId) throw new Error('Choose a different target definition for the merge.')

  const result = await prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.plantDefinition.findFirstOrThrow({
        where: { id: sourceId, collectionId: collection.id },
        include: { husbandryGuide: true },
      }),
      tx.plantDefinition.findFirstOrThrow({
        where: { id: targetId, collectionId: collection.id },
        include: { husbandryGuide: true },
      }),
    ])

    const sourceFollows = await tx.follow.findMany({
      where: { collectionId: collection.id, scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: source.id },
      select: { id: true, userId: true },
    })
    const targetFollows = await tx.follow.findMany({
      where: { collectionId: collection.id, scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: target.id },
      select: { userId: true },
    })
    const targetFollowUserIds = new Set(targetFollows.map((follow) => follow.userId))
    for (const follow of sourceFollows) {
      if (targetFollowUserIds.has(follow.userId)) {
        await tx.follow.delete({ where: { id: follow.id } })
      } else {
        await tx.follow.update({
          where: { id: follow.id },
          data: { entityId: target.id, label: plantName(target) },
        })
      }
    }

    await tx.plantInstance.updateMany({ where: { collectionId: collection.id, plantDefinitionId: source.id }, data: { plantDefinitionId: target.id } })
    await tx.plantAlias.updateMany({ where: { collectionId: collection.id, plantDefinitionId: source.id }, data: { plantDefinitionId: target.id } })
    await tx.photo.updateMany({ where: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId: source.id }, data: { entityId: target.id } })
    await tx.note.updateMany({ where: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId: source.id }, data: { entityId: target.id } })
    await tx.reminder.updateMany({ where: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId: source.id }, data: { entityId: target.id } })
    await tx.plantDefinitionShareRequest.updateMany({
      where: { sourceCollectionId: collection.id, sourcePlantDefinitionId: source.id },
      data: { sourcePlantDefinitionId: target.id },
    })
    await tx.plantDefinitionShareRequest.updateMany({
      where: { targetCollectionId: collection.id, targetPlantDefinitionId: source.id },
      data: { targetPlantDefinitionId: target.id },
    })

    const sourceGuide = source.husbandryGuide
    const targetGuide = target.husbandryGuide
    if (targetGuide?.sourcePlantDefinitionId === source.id && sourceGuide) {
      await tx.plantHusbandryGuide.update({
        where: { id: targetGuide.id },
        data: {
          ...Object.fromEntries([...husbandryFieldNames, ...environmentalHusbandryFields].map((field) => [field, (sourceGuide as any)[field] ?? null])),
          sourcePlantDefinitionId: sourceGuide.sourcePlantDefinitionId === target.id ? null : sourceGuide.sourcePlantDefinitionId,
          aiGeneratedAt: sourceGuide.aiGeneratedAt,
          aiModel: sourceGuide.aiModel,
          reviewStatus: sourceGuide.reviewStatus,
          reviewNotes: sourceGuide.reviewNotes,
        },
      })
    }

    await tx.plantHusbandryGuide.updateMany({
      where: { collectionId: collection.id, sourcePlantDefinitionId: source.id, NOT: { plantDefinitionId: target.id } },
      data: { sourcePlantDefinitionId: target.id },
    })

    if (sourceGuide && !targetGuide) {
      await tx.plantHusbandryGuide.update({
        where: { id: sourceGuide.id },
        data: {
          plantDefinitionId: target.id,
          sourcePlantDefinitionId: sourceGuide.sourcePlantDefinitionId === target.id ? null : sourceGuide.sourcePlantDefinitionId,
        },
      })
    } else if (sourceGuide && targetGuide) {
      await tx.plantHusbandryGuide.delete({ where: { id: sourceGuide.id } })
    }

    await tx.plantDefinition.delete({ where: { id: source.id } })

    return { source, target }
  })

  await audit(user, 'MERGE', 'PLANT_DEFINITION', result.target.id, `Merged ${plantName(result.source)} into ${plantName(result.target)}`, {
    sourcePlantDefinitionId: result.source.id,
    targetPlantDefinitionId: result.target.id,
  }, collection.id)

  revalidatePath(collectionPath(collection.slug, '/plants'))
  redirect(collectionPath(collection.slug, `/plants/${targetId}/edit`))
}

export async function savePlantHusbandryGuide(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId: collection.id }, select: { id: true } })
  const structuredData = await structuredHusbandryMutationData(fd, collection.id)

  const guide = await prisma.plantHusbandryGuide.upsert({
    where: { plantDefinitionId },
    update: {
      ...husbandryMutationData(fd),
      ...structuredData,
      sourcePlantDefinitionId: null,
    } as any,
    create: {
      collectionId: collection.id,
      plantDefinitionId,
      ...husbandryMutationData(fd),
      ...structuredData,
    } as any,
  })

  await audit(user, 'UPDATE', 'PLANT_HUSBANDRY_GUIDE', guide.id, `Saved plant husbandry guide`, undefined, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#husbandry`))
}

export async function savePlantHusbandryGuideField(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const fieldName = val(fd, 'fieldName')!
  if (!husbandryFieldNames.includes(fieldName as any)) throw new Error('Unknown husbandry field.')
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId: collection.id }, select: { id: true } })

  const fieldValue = val(fd, 'fieldValue') || null
  const existing = await prisma.plantHusbandryGuide.findFirst({ where: { collectionId: collection.id, plantDefinitionId } })
  if (existing?.sourcePlantDefinitionId) throw new Error('Fork the linked husbandry guide before editing local fields.')

  const guide = existing
    ? await prisma.plantHusbandryGuide.update({
        where: { id: existing.id },
        data: { [fieldName]: fieldValue } as any,
      })
    : await prisma.plantHusbandryGuide.create({
        data: {
          collectionId: collection.id,
          plantDefinitionId,
          reviewStatus: 'DRAFT',
          [fieldName]: fieldValue,
        } as any,
      })

  await audit(user, 'UPDATE', 'PLANT_HUSBANDRY_GUIDE', guide.id, `Saved plant husbandry guide field`, { fieldName }, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#husbandry`))
}

export async function createFertilizerProduct(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const name = val(fd, 'name')
  if (!name) throw new Error('Product name is required.')
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.fertilizerProduct.create({ data: {
      collectionId: collection.id,
      ...fertilizerProductMutationData(fd, name),
    } as any })
    await emitDomainEvent(tx, {
      eventType: 'fertilizer.product_created', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role },
      idempotencyKey: `fertilizer-product:${created.id}:created`, payload: { subjectId: created.id, recordId: created.id, recordType: 'FertilizerProduct', displayName: created.name, brand: created.brand, guaranteedAnalysis: { nitrogen: created.nitrogen?.toString(), phosphorus: created.phosphorus?.toString(), potassium: created.potassium?.toString() } },
    })
    return created
  })
  await audit(user, 'CREATE', 'FERTILIZER_PRODUCT', product.id, `Created fertilizer product ${product.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/fertilizers'))
  redirect(collectionPath(collection.slug, '/fertilizers?product=created'))
}

export async function updateFertilizerProduct(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'fertilizerProductId')!
  const product = await prisma.fertilizerProduct.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.fertilizerProduct.update({ where: { id }, data: fertilizerProductMutationData(fd, product.name) as any })
    await emitDomainEvent(tx, {
      eventType: 'fertilizer.product_updated', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      idempotencyKey: `fertilizer-product:${id}:updated:${result.updatedAt.toISOString()}`, payload: { subjectId: id, recordId: id, recordType: 'FertilizerProduct', displayName: result.name, brand: result.brand, guaranteedAnalysis: { nitrogen: result.nitrogen?.toString(), phosphorus: result.phosphorus?.toString(), potassium: result.potassium?.toString() } },
    })
    return result
  })
  await audit(user, 'UPDATE', 'FERTILIZER_PRODUCT', id, `Updated fertilizer product ${updated.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/fertilizers'))
  redirect(collectionPath(collection.slug, '/fertilizers?product=updated'))
}

export async function archiveFertilizerProduct(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'fertilizerProductId')!
  const product = await prisma.fertilizerProduct.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const active = fd.get('active') === 'on'
  await prisma.fertilizerProduct.update({ where: { id }, data: { active } })
  await audit(user, 'UPDATE', 'FERTILIZER_PRODUCT', id, `${active ? 'Restored' : 'Archived'} fertilizer product ${product.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/fertilizers'))
  redirect(collectionPath(collection.slug, `/fertilizers?product=${active ? 'restored' : 'archived'}`))
}

export async function markFertilizerProductReviewed(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'fertilizerProductId')!
  const product = await prisma.fertilizerProduct.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  await prisma.fertilizerProduct.update({
    where: { id },
    data: {
      dataConfidence: 'VERIFIED',
      dataReviewedAt: new Date(),
      dataReviewedByUserId: user.id,
    },
  })
  await audit(user, 'UPDATE', 'FERTILIZER_PRODUCT', id, `Marked fertilizer product ${product.name} reviewed`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/fertilizers'))
  redirect(collectionPath(collection.slug, '/fertilizers?product=reviewed'))
}

export async function createFertilizerRecipe(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const name = val(fd, 'name')
  if (!name) throw new Error('Recipe name is required.')
  const productRows = recipeProductRows(fd)
  const validProductCount = productRows.length
    ? await prisma.fertilizerProduct.count({ where: { collectionId: collection.id, id: { in: productRows.map((row) => row.productId) } } })
    : 0
  if (validProductCount !== productRows.length) throw new Error('One or more fertilizer products are not in this collection.')
  const recipe = await prisma.$transaction(async (tx) => {
    const created = await tx.fertilizerRecipe.create({ data: {
      collectionId: collection.id,
      name,
      description: val(fd, 'description') || null,
      declaredNpk: val(fd, 'declaredNpk') || null,
      calculatedNpk: val(fd, 'calculatedNpk') || null,
      applicationMethod: val(fd, 'applicationMethod') || 'ROOT_DRENCH',
      dilutionInstructions: val(fd, 'dilutionInstructions') || null,
      doseAmount: val(fd, 'doseAmount') || null,
      doseUnit: val(fd, 'doseUnit') || null,
      waterVolume: val(fd, 'waterVolume') || null,
      waterVolumeUnit: val(fd, 'waterVolumeUnit') || null,
      strengthLabel: val(fd, 'strengthLabel') || null,
      frequencyDays: clearableInt(fd, 'frequencyDays'),
      frequencyNotes: val(fd, 'frequencyNotes') || null,
      seasonalNotes: val(fd, 'seasonalNotes') || null,
      safetyNotes: val(fd, 'safetyNotes') || null,
      notes: val(fd, 'notes') || null,
      active: checkedValue(fd, 'active', true),
      draft: checkedValue(fd, 'draft', false),
      products: { create: productRows },
    } as any })
    await emitDomainEvent(tx, {
      eventType: 'fertilizer.recipe_created', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role },
      idempotencyKey: `fertilizer-recipe:${created.id}:created`, payload: { subjectId: created.id, recordId: created.id, recordType: 'FertilizerRecipe', displayName: created.name, applicationMethod: created.applicationMethod, strengthLabel: created.strengthLabel },
    })
    return created
  })
  await audit(user, 'CREATE', 'FERTILIZER_RECIPE', recipe.id, `Created fertilizer recipe ${recipe.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/fertilizers'))
  redirect(collectionPath(collection.slug, '/fertilizers?recipe=created'))
}

export async function updateFertilizerRecipe(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'fertilizerRecipeId')!
  const recipe = await prisma.fertilizerRecipe.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const productRows = recipeProductRows(fd)
  const validProductCount = productRows.length
    ? await prisma.fertilizerProduct.count({ where: { collectionId: collection.id, id: { in: productRows.map((row) => row.productId) } } })
    : 0
  if (validProductCount !== productRows.length) throw new Error('One or more fertilizer products are not in this collection.')
  const updated = await prisma.$transaction(async (tx) => {
    await tx.fertilizerRecipeProduct.deleteMany({ where: { recipeId: id } })
    const result = await tx.fertilizerRecipe.update({
      where: { id },
      data: {
        name: val(fd, 'name') || recipe.name,
        description: val(fd, 'description') || null,
        declaredNpk: val(fd, 'declaredNpk') || null,
        calculatedNpk: val(fd, 'calculatedNpk') || null,
        applicationMethod: val(fd, 'applicationMethod') || 'ROOT_DRENCH',
        dilutionInstructions: val(fd, 'dilutionInstructions') || null,
        doseAmount: val(fd, 'doseAmount') || null,
        doseUnit: val(fd, 'doseUnit') || null,
        waterVolume: val(fd, 'waterVolume') || null,
        waterVolumeUnit: val(fd, 'waterVolumeUnit') || null,
        strengthLabel: val(fd, 'strengthLabel') || null,
        frequencyDays: clearableInt(fd, 'frequencyDays'),
        frequencyNotes: val(fd, 'frequencyNotes') || null,
        seasonalNotes: val(fd, 'seasonalNotes') || null,
        safetyNotes: val(fd, 'safetyNotes') || null,
        notes: val(fd, 'notes') || null,
        active: checkedValue(fd, 'active', true),
        draft: checkedValue(fd, 'draft', false),
        products: { create: productRows },
      } as any,
    })
    await emitDomainEvent(tx, {
      eventType: 'fertilizer.recipe_updated', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      idempotencyKey: `fertilizer-recipe:${id}:updated:${result.updatedAt.toISOString()}`, payload: { subjectId: id, recordId: id, recordType: 'FertilizerRecipe', displayName: result.name, applicationMethod: result.applicationMethod, strengthLabel: result.strengthLabel },
    })
    return result
  })
  await audit(user, 'UPDATE', 'FERTILIZER_RECIPE', id, `Updated fertilizer recipe ${updated.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/fertilizers'))
  redirect(collectionPath(collection.slug, '/fertilizers?recipe=updated'))
}

export async function archiveFertilizerRecipe(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(await collectionSlug(fd))
  const id = val(fd, 'fertilizerRecipeId')!
  const recipe = await prisma.fertilizerRecipe.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const active = fd.get('active') === 'on'
  await prisma.fertilizerRecipe.update({ where: { id }, data: { active } })
  await audit(user, 'UPDATE', 'FERTILIZER_RECIPE', id, `${active ? 'Restored' : 'Archived'} fertilizer recipe ${recipe.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/fertilizers'))
  redirect(collectionPath(collection.slug, `/fertilizers?recipe=${active ? 'restored' : 'archived'}`))
}

export async function linkPlantHusbandryGuide(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const sourcePlantDefinitionId = val(fd, 'sourcePlantDefinitionId')!
  await assertHusbandryLinkAllowed(collection.id, plantDefinitionId, sourcePlantDefinitionId)

  const guide = await prisma.plantHusbandryGuide.upsert({
    where: { plantDefinitionId },
    update: {
      sourcePlantDefinitionId,
      ...Object.fromEntries([...husbandryFieldNames, ...environmentalHusbandryFields].map((field) => [field, null])),
      reviewStatus: 'LINKED',
      reviewNotes: val(fd, 'reviewNotes') || 'Uses live-linked husbandry from another plant definition.',
      aiGeneratedAt: null,
      aiModel: null,
    } as any,
    create: {
      collectionId: collection.id,
      plantDefinitionId,
      sourcePlantDefinitionId,
      reviewStatus: 'LINKED',
      reviewNotes: val(fd, 'reviewNotes') || 'Uses live-linked husbandry from another plant definition.',
    },
  })

  await audit(user, 'LINK', 'PLANT_HUSBANDRY_GUIDE', guide.id, `Linked plant husbandry guide`, { sourcePlantDefinitionId }, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#husbandry`))
}

export async function forkPlantHusbandryGuide(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const guide = await prisma.plantHusbandryGuide.findFirstOrThrow({ where: { collectionId: collection.id, plantDefinitionId } })
  if (!guide.sourcePlantDefinitionId) redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#husbandry`))
  const source = await prisma.plantHusbandryGuide.findFirstOrThrow({
    where: { collectionId: collection.id, plantDefinitionId: guide.sourcePlantDefinitionId },
  })

  const data = Object.fromEntries([...husbandryFieldNames, ...environmentalHusbandryFields].map((field) => [field, (source as any)[field] ?? null]))
  const updated = await prisma.plantHusbandryGuide.update({
    where: { id: guide.id },
    data: {
      ...data,
      sourcePlantDefinitionId: null,
      reviewStatus: 'DRAFT',
      reviewNotes: `Forked from linked guide on ${formatDate(new Date())}. Review local care before relying on it.`,
      aiGeneratedAt: source.aiGeneratedAt,
      aiModel: source.aiModel,
    } as any,
  })

  await audit(user, 'FORK', 'PLANT_HUSBANDRY_GUIDE', updated.id, `Forked linked plant husbandry guide`, { sourcePlantDefinitionId: source.plantDefinitionId }, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#husbandry`))
}

export async function deletePlantHusbandryGuide(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const guide = await prisma.plantHusbandryGuide.findFirst({ where: { collectionId: collection.id, plantDefinitionId } })
  if (guide) {
    await prisma.plantHusbandryGuide.delete({ where: { id: guide.id } })
    await audit(user, 'DELETE', 'PLANT_HUSBANDRY_GUIDE', guide.id, `Deleted plant husbandry guide`, undefined, collection.id)
  }
  redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#husbandry`))
}

export async function createPlantInstance(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  const definition = await prisma.plantDefinition.findFirstOrThrow({
    where: {
      id: plantDefinitionId,
      OR: [{ collectionId: collection.id }, { collectionId: null, isValidated: true }],
    },
    select: { id: true, genus: true, species: true, cultivarName: true },
  })
  const instanceType = val(fd, 'instanceType')!
  const acquisitionDate = date(val(fd, 'acquisitionDate'))
  const propagationDate = date(val(fd, 'propagationDate'))
  const currentLocationId = clearableVal(fd, 'currentLocationId')
  const currentLocation = currentLocationId
    ? await prisma.location.findFirstOrThrow({ where: { id: currentLocationId, collectionId: collection.id, status: 'ACTIVE' } })
    : null
  const plantId = await generatePlantId(prisma, {
    collectionId: collection.id,
    plantDefinitionId,
    instanceType,
    date: propagationDate || acquisitionDate,
  })

  const instance = await prisma.$transaction(async (tx) => {
    const created = await tx.plantInstance.create({ data: {
      collectionId: collection.id,
      plantDefinitionId,
      plantId,
      instanceType,
      location: currentLocation?.name || val(fd, 'location'),
      legacyLocationText: val(fd, 'location'),
      currentLocationId: currentLocation?.id || null,
      acquisitionDate,
      propagationDate,
      source: val(fd, 'source'),
      distributor: val(fd, 'distributor'),
      stockNumber: val(fd, 'stockNumber'),
      purchasePrice: dec(val(fd, 'purchasePrice')) as any,
    } })
    const note = val(fd, 'note')
    if (note) await tx.note.create({
      data: { collectionId: collection.id, entityType: 'PLANT_INSTANCE', entityId: created.id, note },
    })
    await emitDomainEvent(tx, {
      eventType: 'plant.created', collectionId: collection.id, aggregateId: created.id,
      actor: { id: user.id, role: user.role }, occurredAt: created.acquisitionDate || created.createdAt,
      idempotencyKey: `plant:${created.id}:created`, payload: { subjectId: created.id, plantInstanceId: created.id, plantId: created.plantId, displayName: plantName(definition), instanceType: created.instanceType, source: created.source, distributor: created.distributor, location: currentLocation ? { id: currentLocation.id, name: currentLocation.name, code: currentLocation.code } : null, summary: note || undefined },
    })
    return created
  })

  await audit(user, 'CREATE', 'PLANT_INSTANCE', instance.id, `Created plant instance ${instance.plantId}`, undefined, collection.id)
  await notifyFollowers(prisma, {
    actorUserId: user.id,
    eventType: 'NEW_PLANT',
    subject: `New ${instance.instanceType.toLowerCase()} plant: ${instance.plantId}`,
    body: `${instance.plantId} was added to ${plantName(definition)}.`,
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
  const before = await prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id }, select: { id: true, plantId: true, currentLocationId: true } })
  const plantDefinitionId = val(fd, 'plantDefinitionId')!
  await prisma.plantDefinition.findFirstOrThrow({
    where: {
      id: plantDefinitionId,
      OR: [{ collectionId: collection.id }, { collectionId: null, isValidated: true }],
    },
    select: { id: true },
  })

  const currentLocationId = clearableVal(fd, 'currentLocationId')
  const currentLocation = currentLocationId
    ? await prisma.location.findFirstOrThrow({ where: { id: currentLocationId, collectionId: collection.id, status: 'ACTIVE' } })
    : null
  const instance = await prisma.$transaction(async (tx) => {
    const updated = await tx.plantInstance.update({ where: { id }, data: {
      plantDefinitionId,
      instanceType: val(fd, 'instanceType')!,
      status: val(fd, 'status') || 'ACTIVE',
      location: currentLocation?.name || clearableVal(fd, 'location'),
      legacyLocationText: clearableVal(fd, 'location'),
      currentLocationId: currentLocation?.id || null,
      acquisitionDate: clearableDate(fd, 'acquisitionDate'),
      propagationDate: clearableDate(fd, 'propagationDate'),
      source: clearableVal(fd, 'source'),
      distributor: clearableVal(fd, 'distributor'),
      stockNumber: clearableVal(fd, 'stockNumber'),
      purchasePrice: clearableDec(fd, 'purchasePrice') as any,
      archiveReason: clearableVal(fd, 'archiveReason'),
      archiveNotes: clearableVal(fd, 'archiveNotes'),
    } })
    await emitDomainEvent(tx, {
      eventType: 'plant.updated', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      idempotencyKey: `plant:${id}:updated:${updated.updatedAt.toISOString()}`,
      payload: { subjectId: id, plantInstanceId: id, plantId: updated.plantId, displayName: updated.plantId, status: updated.status },
    })
    if (before.currentLocationId !== (currentLocation?.id || null)) {
      const move = await tx.plantLocationMove.create({
      data: {
        collectionId: collection.id,
        plantInstanceId: id,
        fromLocationId: before.currentLocationId,
        toLocationId: currentLocation?.id || null,
        movedByUserId: user.id,
        notes: 'Updated from plant edit form.',
      } })
      const from = before.currentLocationId ? await tx.location.findUnique({ where: { id: before.currentLocationId } }) : null
      await emitDomainEvent(tx, {
        eventType: 'plant.location_moved', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role }, idempotencyKey: `location-move:${move.id}`,
        payload: { subjectId: move.id, recordId: move.id, recordType: 'PlantLocationMove', plantInstanceId: id, plantId: updated.plantId, displayName: updated.plantId, fromLocation: from ? { id: from.id, name: from.name, code: from.code } : null, toLocation: currentLocation ? { id: currentLocation.id, name: currentLocation.name, code: currentLocation.code } : null, summary: 'Updated from plant edit form.' },
      })
    }
    return updated
  })
  await audit(user, 'UPDATE', 'PLANT_INSTANCE', id, `Updated plant instance ${instance.plantId}`, undefined, collection.id)

  redirect(collectionPath(collection.slug, `/instances/${id}`))
}

export async function regeneratePlantInstanceId(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const proposedPlantId = val(fd, 'proposedPlantId')!
  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    select: { id: true, plantId: true },
  })

  const expectedPlantId = await expectedPlantIdForInstance(prisma, {
    collectionId: collection.id,
    plantInstanceId: id,
  })

  if (expectedPlantId === instance.plantId) redirect(collectionPath(collection.slug, `/instances/${id}`))
  if (expectedPlantId !== proposedPlantId) throw new Error('The proposed plant ID is no longer current. Refresh and try again.')

  await prisma.plantInstance.update({
    where: { id },
    data: { plantId: expectedPlantId },
  })
  await prisma.note.create({
    data: {
      collectionId: collection.id,
      entityType: 'PLANT_INSTANCE',
      entityId: id,
      note: `Plant ID regenerated from ${instance.plantId} to ${expectedPlantId}.`,
    },
  })
  await audit(
    user,
    'UPDATE',
    'PLANT_INSTANCE',
    id,
    `Regenerated plant ID from ${instance.plantId} to ${expectedPlantId}`,
    { previousPlantId: instance.plantId, plantId: expectedPlantId },
    collection.id,
  )

  redirect(collectionPath(collection.slug, `/instances/${id}`))
}

export async function savePlantHusbandryOverride(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id }, select: { id: true } })
  const values = husbandryFormValues(fd)
  const structuredData = await structuredHusbandryMutationData(fd, collection.id)
  const overrideNotes = val(fd, 'overrideNotes') || null
  const hasStructuredData = Boolean(structuredData.fertilizerRecipeId || structuredData.fertilizationCadenceDays || structuredData.fertilizationPaused)
  const hasData = Object.values(values).some(Boolean) || Boolean(overrideNotes) || hasStructuredData

  if (!hasData) {
    await prisma.plantHusbandryOverride.deleteMany({ where: { collectionId: collection.id, plantInstanceId } })
    await audit(user, 'DELETE', 'PLANT_HUSBANDRY_OVERRIDE', plantInstanceId, `Cleared local plant husbandry adjustments`, undefined, collection.id)
    redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}#husbandry`))
  }

  const override = await prisma.plantHusbandryOverride.upsert({
    where: { plantInstanceId },
    update: { ...values, ...structuredData, overrideNotes } as any,
    create: { collectionId: collection.id, plantInstanceId, ...values, ...structuredData, overrideNotes } as any,
  })

  await audit(user, 'UPDATE', 'PLANT_HUSBANDRY_OVERRIDE', override.id, `Saved local plant husbandry adjustments`, undefined, collection.id)
  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}#husbandry`))
}

export async function savePlantHusbandryOverrideField(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const fieldName = val(fd, 'fieldName')!
  if (!husbandryFieldNames.includes(fieldName as any)) throw new Error('Unknown husbandry field.')
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id }, select: { id: true } })

  const fieldValue = val(fd, 'fieldValue') || null
  const existing = await prisma.plantHusbandryOverride.findFirst({ where: { collectionId: collection.id, plantInstanceId } })
  const override = existing
    ? await prisma.plantHusbandryOverride.update({
        where: { id: existing.id },
        data: { [fieldName]: fieldValue } as any,
      })
    : await prisma.plantHusbandryOverride.create({
        data: { collectionId: collection.id, plantInstanceId, [fieldName]: fieldValue } as any,
      })

  const refreshed = await prisma.plantHusbandryOverride.findUnique({ where: { id: override.id } })
  const hasData = husbandryFieldNames.some((field) => Boolean((refreshed as any)?.[field])) || Boolean(refreshed?.overrideNotes)
  if (!hasData) await prisma.plantHusbandryOverride.delete({ where: { id: override.id } })

  await audit(user, 'UPDATE', 'PLANT_HUSBANDRY_OVERRIDE', override.id, `Saved local husbandry field adjustment`, { fieldName }, collection.id)
  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}#husbandry`))
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

  const archivedAt = new Date()
  const instance = await prisma.$transaction(async (tx) => {
    const updated = await tx.plantInstance.update({ where: { id }, data: {
      status: 'ARCHIVED',
      archiveDate: archivedAt,
      archiveReason: clearableVal(fd, 'archiveReason'),
      archiveNotes: clearableVal(fd, 'archiveNotes'),
    } })
    await emitDomainEvent(tx, {
      eventType: 'plant.archived', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role }, occurredAt: archivedAt,
      idempotencyKey: `plant:${id}:archived:${archivedAt.toISOString()}`,
      payload: { subjectId: id, plantInstanceId: id, plantId: updated.plantId, displayName: updated.plantId, summary: updated.archiveReason || updated.archiveNotes || undefined },
    })
    return updated
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

  const restoredAt = new Date()
  const instance = await prisma.$transaction(async (tx) => {
    const updated = await tx.plantInstance.update({ where: { id }, data: { status: 'ACTIVE', archiveDate: null, archiveReason: null, archiveNotes: null } })
    await emitDomainEvent(tx, {
      eventType: 'plant.restored', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role }, occurredAt: restoredAt,
      idempotencyKey: `plant:${id}:restored:${restoredAt.toISOString()}`,
      payload: { subjectId: id, plantInstanceId: id, plantId: updated.plantId, displayName: updated.plantId },
    })
    return updated
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
    include: {
      collection: { select: { slug: true } },
      user: { include: { emailPreference: true } },
    },
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
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: user.id } })
  const timezone = timeZoneForPreference(preferences)
  const dueAt = parseDateTimeLocal(val(fd, 'dueAt'), timezone)
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
  const completedAt = new Date()
  const timezone = timeZoneForPreference(reminder.user.emailPreference)
  const nextSendAt = nextOccurrence(completedAt, reminder.rrule, timezone)

  await prisma.reminder.update({
    where: { id },
    data: nextSendAt
      ? { dueAt: nextSendAt, nextSendAt, completedAt: null }
      : { completedAt, nextSendAt: null },
  })

  await audit(user, 'COMPLETE', 'REMINDER', id, nextSendAt ? `Completed reminder ${reminder.title}; next due ${formatDate(nextSendAt, timezone)}` : `Completed reminder ${reminder.title}`, undefined, reminder.collectionId)
  revalidateDestination(destination)
  redirect(destination)
}

export async function createCareSheet(fd: FormData) {
  const slug = await collectionSlug(fd)
  const mode = normalizeCareSheetMode(val(fd, 'mode'))
  const context = mode === 'SITTER_SESSION'
    ? await requireCollectionGardener(slug)
    : await requireCollectionLogger(slug)
  const destination = val(fd, 'destination')
  const title = val(fd, 'title') || (mode === 'WEEKLY_CHECKLIST' ? 'Weekly greenhouse checklist' : mode === 'SITTER_SESSION' ? 'Plant sitter plan' : 'Care sheet')
  const plantIds = Array.from(new Set(fd.getAll('plantInstanceId').map((value) => String(value)).filter(Boolean)))
  const sections = selectedCareSheetSections(fd)
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const startsAt = dateFromForm(fd, 'startsAt', timezone)
  const expiresAt = dateFromForm(fd, 'expiresAt', timezone) || (mode === 'SITTER_SESSION' ? addCalendarDays(new Date(), 14, timezone) : null)
  const shouldTokenize = mode === 'SITTER_SESSION' || fd.get('shareable') === 'on'
  const token = shouldTokenize ? generateCareSheetToken() : null
  const settings = careSheetSettingsFromForm(fd)

  const plants = await prisma.plantInstance.findMany({
    where: {
      collectionId: context.collection.id,
      ...(plantIds.length ? { id: { in: plantIds } } : { status: 'ACTIVE' }),
    },
    select: { id: true, location: true },
    orderBy: [{ location: 'asc' }, { plantId: 'asc' }],
  })
  if (plants.length === 0) throw new Error('Select at least one plant for this care sheet.')

  const sheet = await prisma.careSheet.create({
    data: {
      collectionId: context.collection.id,
      createdById: context.user.id,
      title,
      mode,
      status: shouldTokenize || mode !== 'CARE_SHEET' ? 'ACTIVE' : 'DRAFT',
      startsAt,
      expiresAt,
      publicTokenHash: token ? hashCareSheetToken(token) : null,
      sections,
      settings,
      plants: {
        create: plants.map((plant, index) => ({
          collectionId: context.collection.id,
          plantInstanceId: plant.id,
          displayOrder: index,
          notes: val(fd, `plantNote:${plant.id}`),
        })),
      },
    },
  })

  if (mode === 'WEEKLY_CHECKLIST' || mode === 'SITTER_SESSION') {
    const rangeEnd = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const selectedTaskTypes = new Set(settings.taskTypes.length ? settings.taskTypes : ['WATER', 'PROPAGATION_CHECK', 'PEST_CHECK', 'HEALTH_CHECK', 'BLOOM_CHECK', 'REMINDER'])
    const selectedPlantSet = new Set(plants.map((plant) => plant.id))
    const queue = await getCareQueue(prisma, {
      collectionId: context.collection.id,
      collectionSlug: context.collection.slug,
      userId: context.user.id,
    })
    const tasks = queue
      .filter((item) => item.plantInstanceId && selectedPlantSet.has(item.plantInstanceId))
      .filter((item) => selectedTaskTypes.has(item.taskType))
      .filter((item) => item.dueAt <= rangeEnd)
      .map(taskSnapshotFromQueueItem)

    if (tasks.length > 0) {
      await prisma.careSheetTask.createMany({
        data: tasks.map((task) => ({
          ...task,
          careSheetId: sheet.id,
          collectionId: context.collection.id,
        })),
      })
    }
  }

  await audit(context.user, 'CREATE', 'CARE_SHEET', sheet.id, `Created ${mode.toLowerCase().replaceAll('_', ' ')} ${title}`, { tokenized: Boolean(token) }, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/care-sheets'))
  if (destination) redirect(destination)
  redirect(collectionPath(context.collection.slug, `/care-sheets/${sheet.id}${token ? `?token=${encodeURIComponent(token)}` : ''}`))
}

export async function revokeCareSheet(fd: FormData) {
  const context = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const sheet = await prisma.careSheet.findFirstOrThrow({ where: { id, collectionId: context.collection.id } })
  await prisma.careSheet.update({ where: { id }, data: { status: 'REVOKED' } })
  await audit(context.user, 'REVOKE', 'CARE_SHEET', id, `Revoked ${sheet.title}`, undefined, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/care-sheets'))
  redirect(back(fd))
}

export async function deleteCareSheet(fd: FormData) {
  const context = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const destination = back(fd) || collectionPath(context.collection.slug, '/care-sheets')
  const sheet = await prisma.careSheet.findFirstOrThrow({
    where: { id, collectionId: context.collection.id },
    select: { id: true, title: true, mode: true },
  })
  await prisma.careSheet.delete({ where: { id: sheet.id } })
  await audit(context.user, 'DELETE', 'CARE_SHEET', id, `Deleted ${sheet.title}`, { mode: sheet.mode }, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/care-sheets'))
  redirect(destination)
}

async function requirePublicCareSheetTask(fd: FormData) {
  const token = val(fd, 'token')
  if (!token) throw new Error('Care sheet token is required.')
  const sheet = await prisma.careSheet.findUnique({
    where: { publicTokenHash: hashCareSheetToken(token) },
    include: { tasks: true },
  })
  if (!sheet || sheet.status !== 'ACTIVE') throw new Error('This care sheet is not available.')
  const now = new Date()
  if (sheet.startsAt && sheet.startsAt > now) throw new Error('This care sheet is not active yet.')
  if (sheet.expiresAt && sheet.expiresAt < now) throw new Error('This care sheet has expired.')
  const taskId = val(fd, 'taskId')!
  const task = sheet.tasks.find((candidate) => candidate.id === taskId)
  if (!task) throw new Error('Task not found.')
  return { sheet, task, token }
}

export async function completeCareSheetTask(fd: FormData) {
  const destination = back(fd)
  const { sheet, task } = await requirePublicCareSheetTask(fd)
  const completedAt = new Date()
  const completedByName = val(fd, 'completedByName')
  const notes = val(fd, 'notes')

  await prisma.careSheetTask.update({
    where: { id: task.id },
    data: { status: 'COMPLETED', completedAt, completedByName, notes },
  })

  if (task.plantInstanceId) {
    await prisma.plantCareEvent.create({
      data: {
        collectionId: sheet.collectionId,
        plantInstanceId: task.plantInstanceId,
        eventType: careEventForTask(task.taskType),
        performedAt: completedAt,
        notes: [notes, completedByName ? `Completed by ${completedByName}` : 'Completed from sitter plan'].filter(Boolean).join('\n'),
        metadata: { careSheetId: sheet.id, careSheetTaskId: task.id, source: 'CARE_SHEET_TOKEN' },
      },
    })
  }

  revalidateDestination(destination)
  redirect(destination)
}

export async function skipCareSheetTask(fd: FormData) {
  const destination = back(fd)
  const { task } = await requirePublicCareSheetTask(fd)
  await prisma.careSheetTask.update({
    where: { id: task.id },
    data: { status: 'SKIPPED', notes: val(fd, 'notes'), completedByName: val(fd, 'completedByName'), completedAt: new Date() },
  })
  revalidateDestination(destination)
  redirect(destination)
}

export async function completeCareTask(fd: FormData) {
  const destination = back(fd)
  const slug = await collectionSlug(fd)
  const context = await requireCollectionLogger(slug)
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const taskType = val(fd, 'taskType') || 'OTHER'
  const reminderId = val(fd, 'reminderId')

  if (reminderId) {
    const { reminder } = await requireReminderAccess(reminderId, slug)
    const completedAt = new Date()
    const reminderTimezone = timeZoneForPreference(reminder.user.emailPreference)
    const nextSendAt = nextOccurrence(completedAt, reminder.rrule, reminderTimezone)
    await prisma.reminder.update({
      where: { id: reminderId },
      data: nextSendAt
        ? { dueAt: nextSendAt, nextSendAt, completedAt: null }
        : { completedAt, nextSendAt: null },
    })
    if (reminder.entityType === 'PLANT_INSTANCE' && reminder.entityId) {
      await prisma.plantCareAdjustment.updateMany({
        where: { collectionId: context.collection.id, plantInstanceId: reminder.entityId, taskType: 'REMINDER' },
        data: { snoozedUntil: null, nextDueAt: null },
      })
    }
    await audit(context.user, 'COMPLETE', 'REMINDER', reminderId, `Completed care reminder ${reminder.title}`, undefined, context.collection.id)
    revalidateDestination(destination)
    redirect(destination)
  }

  const plantInstanceId = val(fd, 'plantInstanceId')!
  const plant = await prisma.plantInstance.findFirstOrThrow({
    where: { id: plantInstanceId, collectionId: context.collection.id },
    select: { id: true, plantId: true },
  })
  const fertilizerRecipeId = taskType === 'FERTILIZE'
    ? await verifiedFertilizerRecipeId(context.collection.id, val(fd, 'fertilizerRecipeId') || null)
    : null

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.plantCareEvent.create({ data: {
      collectionId: context.collection.id,
      plantInstanceId,
      userId: context.user.id,
      eventType: careEventForTask(taskType),
      performedAt: parseDateLocal(val(fd, 'performedAt'), timezone) || new Date(),
      notes: val(fd, 'notes'),
      fertilizerRecipeId,
      metadata: {
        taskType,
        conditionId: val(fd, 'conditionId') || null,
        bloomEventId: val(fd, 'bloomEventId') || null,
        fertilizerRecipeId,
        fertilizerStrength: val(fd, 'fertilizerStrength') || null,
        fertilizerDose: val(fd, 'fertilizerDose') || null,
        fertilizerWaterVolume: val(fd, 'fertilizerWaterVolume') || null,
      },
    } })
    await tx.plantCareAdjustment.updateMany({
    where: { collectionId: context.collection.id, plantInstanceId, taskType },
    data: { snoozedUntil: null, nextDueAt: null },
    })
    await emitDomainEvent(tx, {
      eventType: domainEventForCare(created.eventType), collectionId: context.collection.id, aggregateId: created.id,
      actor: { id: context.user.id, role: context.user.role }, occurredAt: created.performedAt,
      idempotencyKey: `care:${created.id}:created`, payload: { subjectId: created.id, recordId: created.id, recordType: 'PlantCareEvent', plantInstanceId, plantId: plant.plantId, displayName: plant.plantId, taskType, summary: created.notes || undefined, fertilizerRecipeId },
    })
    return created
  })
  await audit(context.user, 'CREATE', 'PLANT_CARE_EVENT', event.id, `Completed ${taskType.toLowerCase().replaceAll('_', ' ')} for ${plant.plantId}`, undefined, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function completeBulkCare(fd: FormData) {
  const slug = await collectionSlug(fd)
  const context = await requireCollectionLogger(slug)
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const locationId = val(fd, 'locationId')!
  const includeNested = fd.get('includeNested') === 'on'
  const includeArchived = fd.get('includeArchived') === 'on'
  const careType = val(fd, 'careType') || 'OTHER'
  const sharedNote = val(fd, 'sharedNote') || ''
  const sharedResult = val(fd, 'sharedResult') || ''
  const fertilizerRecipeId = careType === 'FERTILIZING'
    ? await verifiedFertilizerRecipeId(context.collection.id, val(fd, 'fertilizerRecipeId') || null)
    : null
  const performedAt = parseDateLocal(val(fd, 'performedAt'), timezone) || new Date()
  const selectedIds = fd.getAll('plantInstanceId').map((item) => String(item)).filter(Boolean)
  const batchId = val(fd, 'bulkCareBatchId') || randomUUID()

  if (!selectedIds.length) {
    redirect(collectionPath(context.collection.slug, `/care/bulk?locationId=${encodeURIComponent(locationId)}&error=none-selected`))
  }

  const [location, allLocations] = await Promise.all([
    prisma.location.findFirstOrThrow({ where: { id: locationId, collectionId: context.collection.id }, select: { id: true, name: true, code: true } }),
    prisma.location.findMany({ where: { collectionId: context.collection.id }, select: { id: true, parentLocationId: true } }),
  ])
  const allowedLocationIds = includeNested
    ? [location.id, ...Array.from(descendantLocationIds(location.id, allLocations))]
    : [location.id]
  const plants = await prisma.plantInstance.findMany({
    where: {
      id: { in: selectedIds },
      collectionId: context.collection.id,
      currentLocationId: { in: allowedLocationIds },
      ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
    },
    select: { id: true, plantId: true },
  })
  const validIds = new Set(plants.map((plant) => plant.id))
  const skipped = selectedIds.filter((id) => fd.get(`skip:${id}`) === 'on' || !validIds.has(id))
  const skippedDetails = skipped.map((id) => ({
    plantInstanceId: id,
    reason: val(fd, `skipReason:${id}`) || (validIds.has(id) ? 'Skipped by user' : 'Plant not eligible for this location scope'),
  }))
  const eventPlants = plants.filter((plant) => !skipped.includes(plant.id))

  if (!eventPlants.length) {
    redirect(collectionPath(context.collection.slug, `/care/bulk?locationId=${encodeURIComponent(locationId)}&includeNested=${includeNested ? '1' : '0'}&error=all-skipped`))
  }

  const existingBatch = await prisma.plantCareEvent.findFirst({
    where: {
      collectionId: context.collection.id,
      metadata: { path: ['bulkCareBatchId'], equals: batchId },
    },
    select: { id: true },
  })
  if (existingBatch) {
    redirect(collectionPath(context.collection.slug, `/care/bulk?locationId=${encodeURIComponent(locationId)}&includeNested=${includeNested ? '1' : '0'}&bulk=duplicate`))
  }

  const queueTaskType = queueTaskForBulkCare(careType)
  const queueItems = queueTaskType
    ? await getCareQueue(prisma, {
        collectionId: context.collection.id,
        collectionSlug: context.collection.slug,
        userId: context.user.id,
        timezone,
      })
    : []
  const matchingQueueItems = queueItems.filter((item) =>
    !item.completedAt
    && item.plantInstanceId
    && validIds.has(item.plantInstanceId)
    && !skipped.includes(item.plantInstanceId)
    && item.taskType === queueTaskType
    && item.dueAt <= new Date()
  )
  const matchingReminderIds = [...new Set(matchingQueueItems.map((item) => item.reminderId).filter(Boolean) as string[])]

  const events = await prisma.$transaction(async (tx) => {
    const created = []
    for (const plant of eventPlants) {
      const noteOverride = val(fd, `note:${plant.id}`) || ''
      const resultOverride = val(fd, `result:${plant.id}`) || ''
      const notes = [
        sharedNote,
        sharedResult ? `Result: ${sharedResult}` : '',
        noteOverride ? `Plant note: ${noteOverride}` : '',
        resultOverride ? `Plant result: ${resultOverride}` : '',
      ].filter(Boolean).join('\n')
      const event = await tx.plantCareEvent.create({
        data: {
          collectionId: context.collection.id,
          plantInstanceId: plant.id,
          userId: context.user.id,
          eventType: careEventForBulkCare(careType),
          performedAt,
          notes,
          fertilizerRecipeId,
          metadata: {
            source: 'BULK_CARE',
            bulkCareBatchId: batchId,
            locationId,
            includeNested,
            careType,
            fertilizerRecipeId,
            fertilizerStrength: val(fd, 'fertilizerStrength') || null,
            fertilizerDose: val(fd, 'fertilizerDose') || null,
            fertilizerWaterVolume: val(fd, 'fertilizerWaterVolume') || null,
            sharedResult: sharedResult || null,
            noteOverride: noteOverride || null,
            resultOverride: resultOverride || null,
          },
        },
      })
      await emitDomainEvent(tx, {
        eventType: domainEventForCare(event.eventType), collectionId: context.collection.id, aggregateId: event.id,
        actor: { id: context.user.id, role: context.user.role }, occurredAt: event.performedAt, correlationId: batchId,
        idempotencyKey: `care:${event.id}:created`, payload: { subjectId: event.id, recordId: event.id, recordType: 'PlantCareEvent', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, careType, summary: notes || undefined, bulkCareBatchId: batchId, fertilizerRecipeId },
      })
      created.push(event)
    }

    if (queueTaskType) {
      await tx.plantCareAdjustment.updateMany({
        where: { collectionId: context.collection.id, plantInstanceId: { in: eventPlants.map((plant) => plant.id) }, taskType: queueTaskType },
        data: { snoozedUntil: null },
      })
    }

    for (const reminderId of matchingReminderIds) {
      const reminder = await tx.reminder.findFirst({
        where: { id: reminderId, collectionId: context.collection.id, userId: context.user.id },
        include: { user: { include: { emailPreference: true } } },
      })
      if (!reminder) continue
      const reminderTimezone = timeZoneForPreference(reminder.user.emailPreference)
      const nextSendAt = nextOccurrence(performedAt, reminder.rrule, reminderTimezone)
      await tx.reminder.update({
        where: { id: reminder.id },
        data: nextSendAt ? { dueAt: nextSendAt, nextSendAt, completedAt: null } : { completedAt: performedAt, nextSendAt: null },
      })
    }

    await emitDomainEvent(tx, {
      eventType: 'care.bulk_batch_completed', collectionId: context.collection.id, aggregateId: batchId,
      actor: { id: context.user.id, role: context.user.role }, occurredAt: performedAt, correlationId: batchId,
      idempotencyKey: `care-batch:${batchId}:completed`, payload: { subjectId: batchId, displayName: `${location.code} ${location.name}`, careType, count: created.length, plantInstanceIds: eventPlants.map((plant) => plant.id), skipped: skippedDetails },
    })
    return created
  })

  await audit(context.user, 'CREATE', 'BULK_CARE_BATCH', batchId, `Recorded ${careType.toLowerCase().replaceAll('_', ' ')} for ${events.length} plant(s) in ${location.code} ${location.name}`, {
    locationId,
    includeNested,
    includeArchived,
    careType,
    selected: selectedIds.length,
    eventsCreated: events.length,
    skipped: skipped.length,
    skippedDetails,
    queueItemsCompleted: matchingQueueItems.length,
    reminderIds: matchingReminderIds,
  }, context.collection.id)

  revalidatePath(collectionPath(context.collection.slug, '/care'))
  revalidatePath(collectionPath(context.collection.slug, `/locations/${locationId}`))
  for (const plant of eventPlants) revalidatePath(collectionPath(context.collection.slug, `/instances/${plant.id}`))
  const params = new URLSearchParams({
    locationId,
    includeNested: includeNested ? '1' : '0',
    bulk: 'success',
    events: String(events.length),
    completed: String(matchingQueueItems.length),
    skipped: String(skipped.length),
  })
  redirect(collectionPath(context.collection.slug, `/care/bulk?${params.toString()}`))
}

export async function snoozeCareTask(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionLogger(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const taskType = val(fd, 'taskType')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: context.collection.id }, select: { id: true } })
  const days = boundedInt(val(fd, 'days'), 1, 1, 30)
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const snoozedUntil = addCalendarDays(new Date(), days, timeZoneForPreference(preferences))

  await prisma.plantCareAdjustment.upsert({
    where: { collectionId_plantInstanceId_taskType: { collectionId: context.collection.id, plantInstanceId, taskType } },
    create: {
      collectionId: context.collection.id,
      plantInstanceId,
      userId: context.user.id,
      taskType,
      snoozedUntil,
    },
    update: { snoozedUntil, disabled: false, userId: context.user.id },
  })
  await audit(context.user, 'SNOOZE', 'PLANT_CARE_ADJUSTMENT', plantInstanceId, `Snoozed ${taskType.toLowerCase().replaceAll('_', ' ')} for ${days} day${days === 1 ? '' : 's'}`, undefined, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function resolveConditionFromCareQueue(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionLogger(await collectionSlug(fd))
  const conditionId = val(fd, 'conditionId')!
  const condition = await prisma.plantCondition.findFirstOrThrow({
    where: { id: conditionId, collectionId: context.collection.id, status: { in: ['OPEN', 'IMPROVING'] } },
    include: { plantInstance: { select: { id: true, plantId: true } } },
  })
  const taskType = conditionQueueTaskType(condition.category, val(fd, 'taskType'))
  const performedAt = new Date()
  const note = val(fd, 'resolutionNote') || val(fd, 'notes')

  await prisma.$transaction(async (tx) => {
    await tx.plantCondition.update({
      where: { id: condition.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: performedAt,
        followUpAt: null,
        notes: appendConditionNote(condition.notes, note, 'Resolved from care queue'),
      },
    })
    await tx.plantCareEvent.create({
      data: {
        collectionId: context.collection.id,
        plantInstanceId: condition.plantInstanceId,
        userId: context.user.id,
        eventType: careEventForTask(taskType),
        performedAt,
        notes: note || `Resolved ${condition.category.toLowerCase().replaceAll('_', ' ')} condition.`,
        metadata: {
          source: 'CARE_QUEUE_CONDITION_RESOLVE',
          taskType,
          conditionId: condition.id,
        },
      },
    })
    await tx.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId: condition.plantInstanceId, taskType },
      data: { snoozedUntil: null, nextDueAt: null },
    })
  })

  await audit(context.user, 'RESOLVE', 'PLANT_CONDITION', condition.id, `Resolved ${condition.category.toLowerCase().replaceAll('_', ' ')} for ${condition.plantInstance.plantId}`, { source: 'CARE_QUEUE' }, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function updateConditionFromCareQueue(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionLogger(await collectionSlug(fd))
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const conditionId = val(fd, 'conditionId')!
  const condition = await prisma.plantCondition.findFirstOrThrow({
    where: { id: conditionId, collectionId: context.collection.id, status: { in: ['OPEN', 'IMPROVING'] } },
    include: { plantInstance: { select: { id: true, plantId: true } } },
  })
  const taskType = conditionQueueTaskType(condition.category, val(fd, 'taskType'))
  const status = conditionStatusValue(val(fd, 'status'))
  const followUpAt = parseDateLocal(val(fd, 'followUpAt'), timezone) || null
  const note = val(fd, 'updateNote') || val(fd, 'notes')
  const performedAt = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.plantCondition.update({
      where: { id: condition.id },
      data: {
        severity: conditionSeverityValue(val(fd, 'severity') || condition.severity),
        status,
        followUpAt: status === 'RESOLVED' ? null : followUpAt,
        resolvedAt: status === 'RESOLVED' ? (condition.resolvedAt || performedAt) : null,
        notes: appendConditionNote(condition.notes, note, 'Updated from care queue'),
      },
    })
    await tx.plantCareEvent.create({
      data: {
        collectionId: context.collection.id,
        plantInstanceId: condition.plantInstanceId,
        userId: context.user.id,
        eventType: careEventForTask(taskType),
        performedAt,
        notes: [
          `Condition updated to ${status.toLowerCase()} / ${conditionSeverityValue(val(fd, 'severity') || condition.severity).toLowerCase()}.`,
          followUpAt && status !== 'RESOLVED' ? `Follow up ${formatDate(followUpAt, timezone)}.` : '',
          note || '',
        ].filter(Boolean).join('\n'),
        metadata: {
          source: 'CARE_QUEUE_CONDITION_UPDATE',
          taskType,
          conditionId: condition.id,
          conditionStatus: status,
        },
      },
    })
    await tx.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId: condition.plantInstanceId, taskType },
      data: { snoozedUntil: null, nextDueAt: null },
    })
  })

  await audit(context.user, 'UPDATE', 'PLANT_CONDITION', condition.id, `Updated ${condition.category.toLowerCase().replaceAll('_', ' ')} from care queue for ${condition.plantInstance.plantId}`, { source: 'CARE_QUEUE', status, followUpAt }, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function conditionStillNeedsAttentionFromCareQueue(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionLogger(await collectionSlug(fd))
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const conditionId = val(fd, 'conditionId')!
  const condition = await prisma.plantCondition.findFirstOrThrow({
    where: { id: conditionId, collectionId: context.collection.id, status: { in: ['OPEN', 'IMPROVING'] } },
    include: { plantInstance: { select: { id: true, plantId: true } } },
  })
  const taskType = conditionQueueTaskType(condition.category, val(fd, 'taskType'))
  const followUpAt = parseDateLocal(val(fd, 'followUpAt'), timezone) || null
  const note = val(fd, 'attentionNote') || val(fd, 'notes')
  const performedAt = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.plantCondition.update({
      where: { id: condition.id },
      data: {
        status: condition.status === 'IMPROVING' ? 'IMPROVING' : 'OPEN',
        followUpAt,
        resolvedAt: null,
        notes: appendConditionNote(condition.notes, note, 'Still needs attention from care queue'),
      },
    })
    await tx.plantCareEvent.create({
      data: {
        collectionId: context.collection.id,
        plantInstanceId: condition.plantInstanceId,
        userId: context.user.id,
        eventType: careEventForTask(taskType),
        performedAt,
        notes: [
          `Condition still needs attention.`,
          followUpAt ? `Follow up ${formatDate(followUpAt, timezone)}.` : '',
          note || '',
        ].filter(Boolean).join('\n'),
        metadata: {
          source: 'CARE_QUEUE_CONDITION_STILL_NEEDS_ATTENTION',
          taskType,
          conditionId: condition.id,
        },
      },
    })
    await tx.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId: condition.plantInstanceId, taskType },
      data: { snoozedUntil: null, nextDueAt: null },
    })
  })

  await audit(context.user, 'UPDATE', 'PLANT_CONDITION', condition.id, `Kept ${condition.category.toLowerCase().replaceAll('_', ' ')} open from care queue for ${condition.plantInstance.plantId}`, { source: 'CARE_QUEUE', followUpAt }, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function markPropagationEstablished(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionLogger(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const plant = await prisma.plantInstance.findFirstOrThrow({
    where: {
      id: plantInstanceId,
      collectionId: context.collection.id,
      status: 'ACTIVE',
      instanceType: { in: ['PROPAGATION', 'ACQUIRED_PROPAGATION'] },
    },
    select: {
      id: true,
      plantId: true,
      propagationDate: true,
      acquisitionDate: true,
      createdAt: true,
      propagationEstablishedAt: true,
    },
  })
  const start = plant.propagationDate || plant.acquisitionDate || plant.createdAt
  const ageDays = Math.max(0, calendarDayIndexInTimeZone(new Date(), timezone) - calendarDayIndexInTimeZone(start, timezone))
  if (ageDays < 14) throw new Error('Propagation can be marked established starting on day 14.')

  if (!plant.propagationEstablishedAt) {
    await prisma.plantInstance.update({
      where: { id: plantInstanceId },
      data: { propagationEstablishedAt: new Date() },
    })
    await prisma.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId, taskType: 'PROPAGATION_CHECK' },
      data: { snoozedUntil: null, disabled: true },
    })
    await audit(context.user, 'UPDATE', 'PLANT_INSTANCE', plantInstanceId, `Marked propagation established for ${plant.plantId}`, { ageDays }, context.collection.id)
  }

  revalidateDestination(destination)
  redirect(destination)
}

export async function createPlantCondition(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionLogger(await collectionSlug(fd))
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const plant = await prisma.plantInstance.findFirstOrThrow({
    where: { id: plantInstanceId, collectionId: context.collection.id },
    select: { id: true, plantId: true },
  })

  const condition = await prisma.$transaction(async (tx) => {
    const created = await tx.plantCondition.create({ data: {
      collectionId: context.collection.id,
      plantInstanceId,
      userId: context.user.id,
      category: val(fd, 'category') || 'OTHER',
      severity: val(fd, 'severity') || 'MODERATE',
      status: val(fd, 'status') || 'OPEN',
      observedAt: date(val(fd, 'observedAt')) || new Date(),
      followUpAt: parseDateLocal(val(fd, 'followUpAt'), timezone),
      notes: val(fd, 'notes'),
    } })
    await emitDomainEvent(tx, {
      eventType: 'condition.opened', collectionId: context.collection.id, aggregateId: created.id, occurredAt: created.observedAt,
      actor: { id: context.user.id, role: context.user.role }, idempotencyKey: `condition:${created.id}:opened`,
      payload: { subjectId: created.id, recordId: created.id, recordType: 'PlantCondition', plantInstanceId, plantId: plant.plantId, displayName: plant.plantId, category: created.category, severity: created.severity, status: created.status, summary: created.notes || undefined },
    })
    return created
  })

  await audit(context.user, 'CREATE', 'PLANT_CONDITION', condition.id, `Logged ${condition.category.toLowerCase().replaceAll('_', ' ')} for ${plant.plantId}`, undefined, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function updatePlantCondition(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionLogger(await collectionSlug(fd))
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const id = val(fd, 'id')!
  const existing = await prisma.plantCondition.findFirstOrThrow({
    where: { id, collectionId: context.collection.id },
    include: { plantInstance: { select: { plantId: true } } },
  })
  const status = val(fd, 'status') || 'OPEN'
  const changedAt = new Date()
  await prisma.$transaction(async (tx) => {
    const updated = await tx.plantCondition.update({ where: { id }, data: {
      severity: val(fd, 'severity') || 'MODERATE',
      status,
      followUpAt: status === 'RESOLVED' ? null : parseDateLocal(val(fd, 'followUpAt'), timezone),
      resolvedAt: status === 'RESOLVED' ? changedAt : null,
      notes: clearableVal(fd, 'notes'),
    } })
    const eventType = status === 'RESOLVED' && existing.status !== 'RESOLVED'
      ? 'condition.resolved' as const
      : existing.status === 'RESOLVED' && status !== 'RESOLVED' ? 'condition.reopened' as const : 'condition.updated' as const
    await emitDomainEvent(tx, {
      eventType, collectionId: context.collection.id, aggregateId: id, actor: { id: context.user.id, role: context.user.role }, occurredAt: changedAt,
      idempotencyKey: `condition:${id}:${eventType}:${changedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'PlantCondition', plantInstanceId: updated.plantInstanceId, plantId: existing.plantInstance.plantId, displayName: existing.plantInstance.plantId, category: updated.category, severity: updated.severity, status: updated.status, summary: updated.notes || undefined },
    })
  })
  await audit(context.user, 'UPDATE', 'PLANT_CONDITION', id, `Updated condition ${existing.category.toLowerCase().replaceAll('_', ' ')}`, undefined, context.collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function deleteGreenThumbCareNote(fd: FormData) {
  const destination = back(fd)
  const context = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const event = await prisma.plantCareEvent.findFirstOrThrow({
    where: { id, collectionId: context.collection.id },
    select: { id: true, eventType: true, plantInstance: { select: { plantId: true } } },
  })

  if (event.eventType !== 'GREEN_THUMB_NOTE') {
    throw new Error('Only Green Thumb care notes can be deleted here.')
  }

  await prisma.plantCareEvent.delete({ where: { id } })
  await audit(context.user, 'DELETE', 'PLANT_CARE_EVENT', id, `Deleted Green Thumb care note for ${event.plantInstance.plantId}`, undefined, context.collection.id)
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
      sportDescription: observation || null,
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
      sportDescription: observation || null,
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
  revalidateDestination(back(fd))
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
  revalidateDestination(back(fd))
  redirect(back(fd))
}

export async function deletePhoto(fd: FormData) {
  const { user, collection } = await requireCollectionManager(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const destination = back(fd)
  const photo = await prisma.photo.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const samePathCount = await prisma.photo.count({ where: { path: photo.path } })

  await prisma.sunshine.deleteMany({ where: { collectionId: collection.id, targetType: 'PHOTO', targetId: id } })
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
  revalidateDestination(destination)
  redirect(destination)
}

export async function resolveImageModerationReview(fd: FormData) {
  const user = await requireUser()
  const reviewId = val(fd, 'reviewId')!
  const action = val(fd, 'action')!
  const destination = back(fd)
  const review = await prisma.imageModerationReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: { photo: true },
  })

  if (review.reviewType === 'NSFW') {
    const admin = await requireServerAdmin()

    if (action === 'OVERRIDE_FALSE_ALARM') {
      await prisma.$transaction([
        prisma.photo.update({
          where: { id: review.photoId },
          data: {
            moderationStatus: 'APPROVED',
            nsfwFlagged: false,
            moderationReason: 'Server admin marked moderation as a false alarm.',
          },
        }),
        prisma.imageModerationReview.update({
          where: { id: review.id },
          data: { status: 'OVERRIDDEN_FALSE_ALARM', resolvedAt: new Date(), resolvedByUserId: admin.id },
        }),
      ])
      await audit(admin, 'OVERRIDE_FALSE_ALARM', 'IMAGE_MODERATION_REVIEW', review.id, `Marked photo ${review.photoId} moderation as a false alarm`, undefined, review.collectionId)
    } else if (action === 'REMOVE' || action === 'REMOVE_AND_BLOCK_USER') {
      await prisma.$transaction([
        prisma.photo.update({
          where: { id: review.photoId },
          data: {
            moderationStatus: 'REMOVED',
            nsfwFlagged: true,
            moderationReason: action === 'REMOVE_AND_BLOCK_USER' ? 'Removed by server admin and uploader disabled.' : 'Removed by server admin.',
          },
        }),
        prisma.imageModerationReview.update({
          where: { id: review.id },
          data: { status: 'REMOVED', resolvedAt: new Date(), resolvedByUserId: admin.id },
        }),
        ...(action === 'REMOVE_AND_BLOCK_USER' && review.uploaderUserId
          ? [prisma.user.update({
              where: { id: review.uploaderUserId },
              data: { disabledAt: new Date(), disabledReason: `Blocked after image moderation review ${review.id}` },
            })]
          : []),
      ])
      await audit(
        admin,
        action,
        'IMAGE_MODERATION_REVIEW',
        review.id,
        `${action === 'REMOVE_AND_BLOCK_USER' ? 'Removed image and blocked uploader' : 'Removed image'} ${review.photoId}`,
        { uploaderUserId: review.uploaderUserId },
        review.collectionId,
      )
    } else {
      throw new Error('Unsupported moderation action.')
    }

    revalidateDestination(destination)
    redirect(destination || '/server/image-moderation')
  }

  if (!['NO_PLANT_DETECTED', 'UNCERTAIN_PLANT_CONTENT'].includes(review.reviewType)) throw new Error('Unsupported review type.')
  if (review.uploaderUserId !== user.id) throw new Error('You can only resolve your own image review items.')
  const uncertainPlantContent = review.reviewType === 'UNCERTAIN_PLANT_CONTENT'

  if (action === 'USER_CONFIRMED') {
    await prisma.$transaction([
      prisma.photo.update({
        where: { id: review.photoId },
        data: { moderationStatus: 'APPROVED', moderationReason: uncertainPlantContent ? 'Uploader confirmed uncertain plant-content image is correct.' : 'Uploader confirmed image is correct.' },
      }),
      prisma.imageModerationReview.update({
        where: { id: review.id },
        data: { status: 'USER_CONFIRMED', resolvedAt: new Date(), resolvedByUserId: user.id },
      }),
    ])
    await audit(user, 'USER_CONFIRMED', 'IMAGE_MODERATION_REVIEW', review.id, `Confirmed ${uncertainPlantContent ? 'uncertain plant-content' : 'no-plant'} image review for photo ${review.photoId}`, undefined, review.collectionId)
  } else if (action === 'REMOVE') {
    await prisma.$transaction([
      prisma.photo.update({
        where: { id: review.photoId },
        data: { moderationStatus: 'REMOVED', moderationReason: uncertainPlantContent ? 'Removed by uploader after uncertain plant-content review.' : 'Removed by uploader after no-plant review.' },
      }),
      prisma.imageModerationReview.update({
        where: { id: review.id },
        data: { status: 'REMOVED', resolvedAt: new Date(), resolvedByUserId: user.id },
      }),
    ])
    await audit(user, 'REMOVE', 'IMAGE_MODERATION_REVIEW', review.id, `Removed photo ${review.photoId} after ${uncertainPlantContent ? 'uncertain plant-content' : 'no-plant'} review`, undefined, review.collectionId)
  } else {
    throw new Error('Unsupported moderation action.')
  }

  revalidateDestination(destination)
  redirect(destination || '/account')
}

export async function updatePhotoFraming(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const destination = back(fd)
  const photo = await prisma.photo.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const framing = photoFramingData(fd)

  await prisma.photo.update({
    where: { id },
    data: framing,
  })

  await audit(user, 'UPDATE', 'PHOTO', id, `Updated photo framing for ${photo.entityType} ${photo.entityId}`, framing, collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function updatePhotoCaption(fd: FormData) {
  const { user, collection } = await requireCollectionAdmin(await collectionSlug(fd))
  const id = val(fd, 'id')!
  const destination = back(fd)
  const rawCaption = String(fd.get('caption') || '')
  const caption = rawCaption.trim() ? rawCaption : null
  const photo = await prisma.photo.findFirstOrThrow({ where: { id, collectionId: collection.id } })

  await prisma.photo.update({
    where: { id },
    data: { caption },
  })

  await audit(user, 'UPDATE', 'PHOTO', id, `Updated photo caption for ${photo.entityType} ${photo.entityId}`, { previousCaption: photo.caption, caption, captionSource: 'USER' }, collection.id)
  revalidateDestination(destination)
  redirect(destination)
}

export async function openBloomEvent(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(await collectionSlug(fd))
  const plantInstanceId = val(fd, 'plantInstanceId')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id }, select: { id: true } })

  const plant = await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id } })
  const bloom = await prisma.$transaction(async (tx) => {
    const created = await tx.bloomEvent.create({ data: {
      collectionId: collection.id,
      plantInstanceId,
      bloomStartDate: date(val(fd, 'bloomStartDate'))!,
      firstBloom: !!fd.get('firstBloom'),
      notes: val(fd, 'notes'),
    } })
    await emitDomainEvent(tx, {
      eventType: 'bloom.started', collectionId: collection.id, aggregateId: created.id, occurredAt: created.bloomStartDate,
      actor: { id: user.id, role: user.role }, visibility: 'PUBLIC', idempotencyKey: `bloom:${created.id}:started`,
      payload: { subjectId: created.id, recordId: created.id, recordType: 'BloomEvent', plantInstanceId, plantId: plant.plantId, displayName: plant.plantId, firstBloom: created.firstBloom, flowerCount: created.flowerCount, summary: created.notes || undefined },
    })
    return created
  })
  await audit(user, 'CREATE', 'BLOOM_EVENT', bloom.id, `Opened bloom event for plant instance ${plantInstanceId}`, undefined, collection.id)
  const instance = plant
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

  const plant = await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id } })
  const peakAt = date(val(fd, 'peakBloomDate')) ?? null
  await prisma.$transaction(async (tx) => {
    const updated = await tx.bloomEvent.update({ where: { id }, data: {
      peakBloomDate: peakAt,
      flowerCount: val(fd, 'flowerCount') ? Number(val(fd, 'flowerCount')) : null,
      notes: clearableVal(fd, 'notes'),
    } })
    if (peakAt) await emitDomainEvent(tx, {
      eventType: 'bloom.peaked', collectionId: collection.id, aggregateId: id, occurredAt: peakAt,
      actor: { id: user.id, role: user.role }, visibility: 'PUBLIC', idempotencyKey: `bloom:${id}:peaked:${peakAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'BloomEvent', plantInstanceId, plantId: plant.plantId, displayName: plant.plantId, flowerCount: updated.flowerCount, summary: updated.notes || undefined },
    })
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

  const plant = await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id } })
  const closedAt = date(val(fd, 'bloomEndDate'))!
  await prisma.$transaction(async (tx) => {
    const updated = await tx.bloomEvent.update({ where: { id }, data: { bloomEndDate: closedAt, notes: clearableVal(fd, 'notes') } })
    await emitDomainEvent(tx, {
      eventType: 'bloom.closed', collectionId: collection.id, aggregateId: id, occurredAt: closedAt,
      actor: { id: user.id, role: user.role }, idempotencyKey: `bloom:${id}:closed:${closedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'BloomEvent', plantInstanceId, plantId: plant.plantId, displayName: plant.plantId, flowerCount: updated.flowerCount, summary: updated.notes || undefined },
    })
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
      notes: clearableVal(fd, 'notes'),
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

  const childCodes: string[] = []
  const childIds: string[] = []
  const correlationId = randomUUID()
  const event = await prisma.$transaction(async (tx) => {
    const createdEvent = await tx.propagationEvent.create({ data: {
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
    } })
    await emitDomainEvent(tx, {
      eventType: 'propagation.started', collectionId: collection.id, aggregateId: createdEvent.id, occurredAt: eventDate,
      actor: { id: user.id, role: user.role }, correlationId, idempotencyKey: `propagation:${createdEvent.id}:started`,
      payload: { subjectId: createdEvent.id, recordId: createdEvent.id, recordType: 'PropagationEvent', plantInstanceId: parent1, plantId: parentPlant.plantId, displayName: parentPlant.plantId, method, status: createdEvent.successStatus, summary: createdEvent.notes || undefined },
    })
    for (let index = 0; index < childCount; index += 1) {
      const plantId = await generatePlantId(tx, {
      collectionId: collection.id,
      plantDefinitionId: parentPlant.plantDefinitionId,
      date: eventDate,
      instanceType: 'PROPAGATION',
      method,
    })
      childCodes.push(plantId)

      const child = await tx.plantInstance.create({
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

      await tx.propagationChild.create({ data: { propagationEventId: createdEvent.id, childPlantInstanceId: child.id } })
      await emitDomainEvent(tx, {
        eventType: 'propagation.child_created', collectionId: collection.id, aggregateId: createdEvent.id, occurredAt: child.createdAt,
        actor: { id: user.id, role: user.role }, correlationId, causationId: createdEvent.id,
        idempotencyKey: `propagation:${createdEvent.id}:child:${child.id}`, payload: { subjectId: child.id, recordId: createdEvent.id, recordType: 'PropagationEvent', plantInstanceId: child.id, plantId: child.plantId, displayName: child.plantId, parentPlantInstanceId: parent1, parentPlantId: parentPlant.plantId, method },
      })
      await emitDomainEvent(tx, {
        eventType: 'plant.created', collectionId: collection.id, aggregateId: child.id, occurredAt: child.createdAt,
        actor: { id: user.id, role: user.role }, correlationId, causationId: createdEvent.id,
        idempotencyKey: `plant:${child.id}:created`, payload: { subjectId: child.id, plantInstanceId: child.id, plantId: child.plantId, displayName: child.plantId, instanceType: child.instanceType, propagationEventId: createdEvent.id },
      })
    }
    return createdEvent
  })
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
  const before = await prisma.propagationEvent.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const event = await prisma.$transaction(async (tx) => {
    const updated = await tx.propagationEvent.update({ where: { id }, data: {
      method: val(fd, 'method')!,
      date: date(val(fd, 'date'))!,
      successStatus: val(fd, 'successStatus') || 'PENDING',
      notes: clearableVal(fd, 'notes'),
    } })
    const eventType = updated.successStatus === 'FAILED' && before.successStatus !== 'FAILED'
      ? 'propagation.failed' as const
      : ['SUCCESS', 'SUCCEEDED'].includes(updated.successStatus) && !['SUCCESS', 'SUCCEEDED'].includes(before.successStatus)
        ? 'propagation.succeeded' as const : 'propagation.updated' as const
    await emitDomainEvent(tx, {
      eventType, collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role },
      idempotencyKey: `propagation:${id}:${eventType}:${updated.updatedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'PropagationEvent', displayName: updated.method, method: updated.method, status: updated.successStatus, summary: updated.notes || undefined },
    })
    return updated
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
