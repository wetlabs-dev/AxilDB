import type { PrismaClient } from '@prisma/client'
import type { PlantImageFrame } from '@/components/PlantImage'
import { resolveQuietDayShift } from '@/lib/care-scheduling'
import { collectionPath } from '@/lib/collections'
import { effectiveFertilizerAssignment, fertilizerRecipeSummary } from '@/lib/fertilizers'
import { nextOccurrence, reminderCategoryLabel } from '@/lib/reminders'
import { addCalendarDays, calendarDayIndexInTimeZone, endOfDayInTimeZone, startOfDayInTimeZone } from '@/lib/time'
import { plantName } from '@/lib/utils'
import { locationPathWithCodes, type LocationNode } from '@/lib/locations'

export const careTaskTypes = [
  'WATER',
  'FERTILIZE',
  'REPOT',
  'PROPAGATION_CHECK',
  'PEST_CHECK',
  'HEALTH_CHECK',
  'BLOOM_CHECK',
  'QUARANTINE_REVIEW',
  'TREATMENT',
  'REMINDER',
] as const

const latestCareEventTypes = [
  'WATERED',
  'FERTILIZED',
  'REPOTTED',
  'PEST_CHECK',
  'HEALTH_CHECK',
  'PROPAGATION_CHECK',
  'BLOOM_CHECK',
] as const

export type CareTaskType = (typeof careTaskTypes)[number]
export type CareQueueFilter = 'today' | 'overdue' | 'water' | 'fertilize' | 'repot' | 'treatment' | 'propagation' | 'health' | 'pest' | 'bloom' | 'custom' | 'completed'

export type CareQueueItem = {
  key: string
  taskType: CareTaskType
  source: 'derived' | 'reminder' | 'treatment-plan'
  title: string
  reason: string
  dueAt: Date
  priority: number
  overdueDays: number
  plantInstanceId?: string
  plantId?: string
  plantName?: string
  locationId?: string | null
  locationName?: string | null
  locationPath?: string | null
  image?: PlantImageFrame
  href: string
  reminderId?: string
  conditionId?: string
  condition?: {
    id: string
    category: string
    severity: string
    status: string
    observedAt: Date
    updatedAt: Date
    followUpAt?: Date | null
    resolvedAt?: Date | null
    notes?: string | null
  }
  bloomEventId?: string
  completedAt?: Date | null
  snoozedUntil?: Date | null
  originalDueAt?: Date | null
  quietDayName?: string | null
  quietDayReason?: string | null
  quietDayShiftDirection?: string | null
  propagationAgeDays?: number
  fertilizerRecipeId?: string | null
  fertilizerRecipeName?: string | null
  fertilizerRecipeSummary?: string | null
  fertilizerStrength?: string | null
  fertilizerSource?: 'definition' | 'override'
  currentSubstrate?: string | null
  recommendedSubstrateRecipeVersionId?: string | null
  recommendedSubstrate?: string | null
  recommendedSubstrateComposition?: Array<{ id: string; percentByVolume: number; component: any }>
  treatmentPlanId?: string
  treatmentPlanStepId?: string
  treatmentName?: string | null
  treatmentPlanTitle?: string | null
  treatmentProgress?: string | null
  treatmentSafetySummary?: string | null
}

function addDays(date: Date, days: number, timezone?: string) {
  return addCalendarDays(date, days, timezone)
}

function daysBetween(a: Date, b: Date, timezone?: string) {
  return calendarDayIndexInTimeZone(a, timezone) - calendarDayIndexInTimeZone(b, timezone)
}

function dayStart(date: Date, timezone?: string) {
  return startOfDayInTimeZone(date, timezone)
}

function clampPriority(value: number) {
  return Math.max(0, Math.min(999, Math.round(value)))
}

function normalized(value?: string | null) {
  return (value || '').toLowerCase()
}

export function waterCadenceDays(summaryWater?: string | null, cadenceOverride?: number | null) {
  if (cadenceOverride && cadenceOverride > 0) return cadenceOverride
  const value = normalized(summaryWater)
  if (value.includes('frequent') || value.includes('heavy')) return 3
  if (value.includes('evenly') || value.includes('moist')) return 5
  if (value.includes('moderate')) return 7
  if (value.includes('dry before') || value.includes('partly')) return 10
  if (value.includes('sparingly') || value.includes('drought')) return 18
  return 7
}

export function repotCadenceDays(interval?: string | null) {
  const value = normalized(interval)
  if (!value) return null
  const number = Number(value.match(/\d+(?:\.\d+)?/)?.[0])
  if (value.includes('week') && number > 0) return Math.round(number * 7)
  if (value.includes('month') && number > 0) return Math.round(number * 30.4375)
  if (value.includes('year') && number > 0) return Math.round(number * 365.25)
  if (value.includes('biennial') || value.includes('every other year')) return 730
  if (value.includes('annual') || value.includes('yearly')) return 365
  return null
}

function pestCadenceDays(guide: any, adjustment?: any) {
  if (adjustment?.cadenceOverrideDays && adjustment.cadenceOverrideDays > 0) return adjustment.cadenceOverrideDays
  const susceptibility = normalized(guide?.susceptibilityLevel)
  const pests = normalized(`${guide?.pestsCommon || ''} ${guide?.diseasesCommon || ''} ${guide?.preventativePractices || ''}`)
  if (susceptibility.includes('high') || susceptibility.includes('severe') || susceptibility.includes('susceptible')) return 14
  if (pests.includes('mite') || pests.includes('mealy') || pests.includes('thrip') || pests.includes('scale')) return 21
  return 30
}

function conditionPriority(severity?: string | null) {
  if (severity === 'CRITICAL') return 220
  if (severity === 'HIGH') return 180
  if (severity === 'MODERATE') return 130
  return 90
}

export function careTaskLabel(type: CareTaskType) {
  if (type === 'WATER') return 'Water'
  if (type === 'FERTILIZE') return 'Fertilize'
  if (type === 'REPOT') return 'Repot'
  if (type === 'PROPAGATION_CHECK') return 'Propagation check'
  if (type === 'PEST_CHECK') return 'Pest check'
  if (type === 'HEALTH_CHECK') return 'Health check'
  if (type === 'BLOOM_CHECK') return 'Bloom check'
  if (type === 'QUARANTINE_REVIEW') return 'Quarantine review'
  if (type === 'TREATMENT') return 'Treatment'
  return 'Reminder'
}

function taskPath(slug: string, instanceId?: string, bloomId?: string) {
  if (!instanceId) return collectionPath(slug, '/reminders')
  return collectionPath(slug, `/instances/${instanceId}${bloomId ? `#bloom-${bloomId}` : ''}`)
}

function latestBy<T extends { plantInstanceId: string; eventType?: string; performedAt: Date }>(events: T[], type: string) {
  const map = new Map<string, T>()
  for (const event of events) {
    if (event.eventType !== type) continue
    const existing = map.get(event.plantInstanceId)
    if (!existing || existing.performedAt < event.performedAt) map.set(event.plantInstanceId, event)
  }
  return map
}

async function latestCareEvents(prisma: PrismaClient, collectionId: string, plantInstanceIds: string[]) {
  if (plantInstanceIds.length === 0) return []

  const latest = await prisma.plantCareEvent.groupBy({
    by: ['plantInstanceId', 'eventType'],
    where: {
      collectionId,
      plantInstanceId: { in: plantInstanceIds },
      eventType: { in: [...latestCareEventTypes] },
    },
    _max: { performedAt: true },
  })

  const latestKeys = latest
    .map((event) => event._max.performedAt ? {
      plantInstanceId: event.plantInstanceId,
      eventType: event.eventType,
      performedAt: event._max.performedAt,
    } : null)
    .filter((event): event is { plantInstanceId: string; eventType: string; performedAt: Date } => Boolean(event))

  if (latestKeys.length === 0) return []

  return prisma.plantCareEvent.findMany({
    where: {
      collectionId,
      OR: latestKeys,
    },
    orderBy: { performedAt: 'desc' },
  })
}

async function latestInstancePhotos(prisma: PrismaClient, collectionId: string, plantInstanceIds: string[]) {
  if (plantInstanceIds.length === 0) return []

  const [latestCoverPhotos, latestPhotos] = await Promise.all([
    prisma.photo.groupBy({
      by: ['entityId'],
      where: {
        collectionId,
        entityType: 'PLANT_INSTANCE',
        entityId: { in: plantInstanceIds },
        isCover: true,
      },
      _max: { createdAt: true },
    }),
    prisma.photo.groupBy({
      by: ['entityId'],
      where: {
        collectionId,
        entityType: 'PLANT_INSTANCE',
        entityId: { in: plantInstanceIds },
      },
      _max: { createdAt: true },
    }),
  ])
  const latestKeys = [...latestCoverPhotos, ...latestPhotos]
    .map((photo) => photo._max.createdAt ? {
      entityType: 'PLANT_INSTANCE',
      entityId: photo.entityId,
      createdAt: photo._max.createdAt,
    } : null)
    .filter((photo): photo is { entityType: string; entityId: string; createdAt: Date } => Boolean(photo))

  if (latestKeys.length === 0) return []

  return prisma.photo.findMany({
    where: {
      collectionId,
      OR: latestKeys,
    },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    select: {
      entityId: true,
      path: true,
      cropX: true,
      cropY: true,
      cropWidth: true,
      cropHeight: true,
      focalX: true,
      focalY: true,
    },
  })
}

function imageLookup(photos: Array<{ entityId: string } & PlantImageFrame>) {
  return photos.reduce<Record<string, PlantImageFrame>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
}

function isSuppressed(adjustment: any, now: Date) {
  if (!adjustment) return false
  if (adjustment.disabled) return true
  if (adjustment.snoozedUntil && adjustment.snoozedUntil > now) return true
  return false
}

export async function getCareQueue(
  prisma: PrismaClient,
  {
    collectionId,
    collectionSlug,
    userId,
    now = new Date(),
    includeCompleted = false,
    timezone,
  }: {
    collectionId: string
    collectionSlug: string
    userId?: string
    now?: Date
    includeCompleted?: boolean
    timezone?: string
  },
) {
  const instances = await prisma.plantInstance.findMany({
    where: { collectionId, status: 'ACTIVE' },
    include: {
      plantDefinition: {
        include: {
          husbandryGuide: { include: { fertilizerRecipe: { include: { products: { include: { product: true }, orderBy: { sortOrder: 'asc' } } } } } },
          substrateRecommendations: {
            where: { collectionId },
            include: { recipeVersion: { include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } } },
            orderBy: { rank: 'asc' },
            take: 1,
          },
        },
      },
      husbandryOverride: { include: { fertilizerRecipe: { include: { products: { include: { product: true }, orderBy: { sortOrder: 'asc' } } } } } },
      currentSubstrate: { include: { recipeVersion: { include: { recipe: true } } } },
      currentLocation: { include: { locationType: true } },
    },
  })
  const activePlantInstanceIds = instances.map((instance) => instance.id)
  const [careEvents, conditions, adjustments, photos, openBlooms, activeQuarantines, reminders, quietDays, quietRules, treatmentSteps, locations] = await Promise.all([
    latestCareEvents(prisma, collectionId, activePlantInstanceIds),
    prisma.plantCondition.findMany({
      where: { collectionId, plantInstanceId: { in: activePlantInstanceIds }, status: { in: ['OPEN', 'IMPROVING'] } },
      orderBy: [{ severity: 'desc' }, { observedAt: 'desc' }],
    }),
    prisma.plantCareAdjustment.findMany({ where: { collectionId, plantInstanceId: { in: activePlantInstanceIds } } }),
    latestInstancePhotos(prisma, collectionId, activePlantInstanceIds),
    prisma.bloomEvent.findMany({
      where: { collectionId, bloomEndDate: null, plantInstance: { status: 'ACTIVE' } },
      include: { plantInstance: { include: { plantDefinition: true, currentLocation: { include: { locationType: true } } } } },
      orderBy: { bloomStartDate: 'desc' },
    }),
    prisma.plantQuarantine.findMany({
      where: { collectionId, status: 'ACTIVE', plantInstance: { status: 'ACTIVE' } },
      include: { plantInstance: { include: { plantDefinition: true, currentLocation: { include: { locationType: true } } } } },
      orderBy: { targetReleaseDate: 'asc' },
    }),
    userId
      ? prisma.reminder.findMany({
          where: {
            collectionId,
            userId,
            pausedAt: null,
            ...(includeCompleted ? {} : { completedAt: null }),
          },
          orderBy: [{ completedAt: 'desc' }, { nextSendAt: 'asc' }, { dueAt: 'asc' }],
        })
      : Promise.resolve([]),
    prisma.collectionQuietDay.findMany({
      where: { collectionId, active: true },
      orderBy: [{ quietType: 'asc' }, { date: 'asc' }, { dayOfWeek: 'asc' }],
    }),
    prisma.collectionQuietDayShiftRule.findMany({ where: { collectionId, active: true } }),
    prisma.treatmentPlanStep.findMany({
      where: { collectionId, status: 'PENDING', plan: { status: 'ACTIVE', plantInstance: { status: 'ACTIVE' } } },
      include: { treatment: true, plan: { include: { plantInstance: { include: { plantDefinition: true, currentLocation: { include: { locationType: true } } } }, steps: { select: { status: true } } } } },
      orderBy: [{ scheduledAt: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.location.findMany({
      where: { collectionId },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])

  const locationNodes = locations as LocationNode[]
  const itemLocation = (instance?: { currentLocationId?: string | null; currentLocation?: { name: string } | null } | null) => ({
    locationId: instance?.currentLocationId || null,
    locationName: instance?.currentLocation?.name || null,
    locationPath: instance?.currentLocationId ? locationPathWithCodes(instance.currentLocationId, locationNodes) : null,
  })

  const photosByInstance = imageLookup(photos)
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
  const openBloomById = new Map(openBlooms.map((bloom) => [bloom.id, bloom]))
  const latestWater = latestBy(careEvents as any, 'WATERED')
  const latestFertilized = latestBy(careEvents as any, 'FERTILIZED')
  const latestRepotted = latestBy(careEvents as any, 'REPOTTED')
  const latestPestCheck = latestBy(careEvents as any, 'PEST_CHECK')
  const latestHealthCheck = latestBy(careEvents as any, 'HEALTH_CHECK')
  const latestPropagationCheck = latestBy(careEvents as any, 'PROPAGATION_CHECK')
  const latestBloomCheck = latestBy(careEvents as any, 'BLOOM_CHECK')
  const openPestConditionPlantIds = new Set(
    conditions
      .filter((condition) => condition.category === 'PESTS')
      .map((condition) => condition.plantInstanceId),
  )
  const adjustmentMap = new Map<string, any>()
  for (const adjustment of adjustments) {
    adjustmentMap.set(`${adjustment.plantInstanceId}:${adjustment.taskType}`, adjustment)
  }
  const quietRuleMap = new Map(quietRules.map((rule) => [rule.careType, rule]))

  const quietAdjusted = (dueAt: Date, careType: string, plantInstanceId?: string) => {
    const shift = resolveQuietDayShift({
      dueAt,
      careType,
      quietDays,
      rule: quietRuleMap.get(careType),
      timezone: timezone || undefined || '',
      now,
    })
    if (!shift || shift.adjustedDueAt.getTime() === dueAt.getTime()) return { dueAt }
    return {
      dueAt: shift.adjustedDueAt,
      originalDueAt: dueAt,
      quietDayName: shift.quietDay.name,
      quietDayReason: shift.reason,
      quietDayShiftDirection: shift.shiftDirection,
    }
  }

  const items: CareQueueItem[] = []

  const pushDerived = (item: Omit<CareQueueItem, 'source' | 'href' | 'overdueDays' | 'priority'> & { basePriority: number }) => {
    const adjustment = item.plantInstanceId ? adjustmentMap.get(`${item.plantInstanceId}:${item.taskType}`) : null
    if (isSuppressed(adjustment, now)) return
    const rawDueAt = item.plantInstanceId && !item.conditionId ? adjustment?.nextDueAt || item.dueAt : item.dueAt
    const adjusted = quietAdjusted(dayStart(rawDueAt, timezone), item.taskType, item.plantInstanceId)
    const dueAt = adjusted.dueAt
    const overdueDays = Math.max(0, daysBetween(now, dueAt, timezone))
    items.push({
      ...item,
      source: 'derived',
      dueAt,
      href: taskPath(collectionSlug, item.plantInstanceId, item.bloomEventId),
      overdueDays,
      priority: clampPriority(item.basePriority + overdueDays * 9),
      snoozedUntil: adjustment?.snoozedUntil || null,
      originalDueAt: adjusted.originalDueAt || null,
      quietDayName: adjusted.quietDayName || null,
      quietDayReason: adjusted.quietDayReason || null,
      quietDayShiftDirection: adjusted.quietDayShiftDirection || null,
    })
  }

  for (const instance of instances) {
    const guide = { ...(instance.plantDefinition.husbandryGuide || {}), ...(instance.husbandryOverride || {}) } as any
    const plantDisplayName = plantName(instance.plantDefinition)
    const baseDate = instance.propagationDate || instance.acquisitionDate || instance.createdAt
    const image = photosByInstance[instance.id]

    const waterAdjustment = adjustmentMap.get(`${instance.id}:WATER`)
    const waterDays = waterCadenceDays(guide.summaryWater || guide.wateringCadence, waterAdjustment?.cadenceOverrideDays)
    const lastWatered = latestWater.get(instance.id)?.performedAt || baseDate
    const waterDue = addDays(lastWatered, waterDays, timezone)
    pushDerived({
      key: `WATER:${instance.id}`,
      taskType: 'WATER',
      title: `Water ${instance.plantId}`,
      reason: latestWater.has(instance.id)
        ? `Last watered ${daysBetween(now, lastWatered)} day${daysBetween(now, lastWatered) === 1 ? '' : 's'} ago; cadence is about ${waterDays} days.`
        : `No watering logged yet; inferred cadence is about ${waterDays} days.`,
      dueAt: waterDue,
      basePriority: 55,
      plantInstanceId: instance.id,
      plantId: instance.plantId,
      plantName: plantDisplayName,
      ...itemLocation(instance),
      image,
    })

    const fertilizerAdjustment = adjustmentMap.get(`${instance.id}:FERTILIZE`)
    const fertilizer = effectiveFertilizerAssignment(instance.plantDefinition.husbandryGuide, instance.husbandryOverride)
    if (!fertilizer.paused && fertilizer.cadenceDays && (fertilizer.recipe || guide.fertilizationType || guide.fertilizationFrequency)) {
      const lastFertilized = latestFertilized.get(instance.id)?.performedAt || baseDate
      const recipeName = fertilizer.recipe?.name || 'fertilizer'
      const cadence = fertilizerAdjustment?.cadenceOverrideDays && fertilizerAdjustment.cadenceOverrideDays > 0
        ? fertilizerAdjustment.cadenceOverrideDays
        : fertilizer.cadenceDays
      pushDerived({
        key: `FERTILIZE:${instance.id}`,
        taskType: 'FERTILIZE',
        title: `Fertilize ${instance.plantId}`,
        reason: latestFertilized.has(instance.id)
          ? `Last fertilized ${daysBetween(now, lastFertilized, timezone)} day${daysBetween(now, lastFertilized, timezone) === 1 ? '' : 's'} ago; cadence is about ${cadence} days.`
          : `No fertilizing logged yet; planned cadence is about ${cadence} days.`,
        dueAt: addDays(lastFertilized, cadence, timezone),
        basePriority: 42,
        plantInstanceId: instance.id,
        plantId: instance.plantId,
        plantName: plantDisplayName,
        ...itemLocation(instance),
        image,
        fertilizerRecipeId: fertilizer.recipe?.id || null,
        fertilizerRecipeName: recipeName,
        fertilizerRecipeSummary: fertilizer.recipe ? fertilizerRecipeSummary(fertilizer.recipe) : guide.fertilizationType || null,
        fertilizerStrength: guide.fertilizationStrength || fertilizer.recipe?.strengthLabel || null,
        fertilizerSource: fertilizer.source,
      })
    }

    const repotDays = repotCadenceDays(guide.repottingInterval)
    if (repotDays) {
      const lastRepotted = latestRepotted.get(instance.id)?.performedAt || instance.currentSubstrate?.startedAt || baseDate
      const recommendation = instance.plantDefinition.substrateRecommendations[0]
      pushDerived({
        key: `REPOT:${instance.id}`,
        taskType: 'REPOT',
        title: `Repot ${instance.plantId}`,
        reason: latestRepotted.has(instance.id) || instance.currentSubstrate
          ? `Substrate was last recorded ${daysBetween(now, lastRepotted, timezone)} day${daysBetween(now, lastRepotted, timezone) === 1 ? '' : 's'} ago; repotting interval is ${guide.repottingInterval}.`
          : `No substrate has been recorded; repotting interval is ${guide.repottingInterval}.`,
        dueAt: addDays(lastRepotted, repotDays, timezone),
        basePriority: 48,
        plantInstanceId: instance.id,
        plantId: instance.plantId,
        plantName: plantDisplayName,
        ...itemLocation(instance),
        image,
        currentSubstrate: instance.currentSubstrate?.substrateMode === 'RECIPE'
          ? `${instance.currentSubstrate.recipeVersion?.recipe.name || 'Substrate recipe'} v${instance.currentSubstrate.recipeVersion?.versionNumber || '?'}`
          : instance.currentSubstrate?.substrateMode === 'RECEIVED_SUBSTRATE'
            ? 'Received Substrate'
            : instance.currentSubstrate?.substrateMode?.toLowerCase().replaceAll('_', ' ') || 'Unknown substrate',
        recommendedSubstrateRecipeVersionId: recommendation?.substrateRecipeVersionId || null,
        recommendedSubstrate: recommendation
          ? `${recommendation.recipeVersion.recipe.name} v${recommendation.recipeVersion.versionNumber}`
          : null,
        recommendedSubstrateComposition: recommendation?.recipeVersion.components.map((row) => ({ id: row.id, percentByVolume: Number(row.percentByVolume), component: row.component })) || [],
      })
    }

    if (['PROPAGATION', 'ACQUIRED_PROPAGATION'].includes(instance.instanceType) && !instance.propagationEstablishedAt) {
      const start = instance.propagationDate || instance.acquisitionDate || instance.createdAt
      const ageDays = Math.max(0, daysBetween(now, start))
      const cadence = ageDays <= 30 ? 3 : ageDays <= 90 ? 7 : null
      if (cadence) {
        const lastCheck = latestPropagationCheck.get(instance.id)?.performedAt || start
        const dueAt = addDays(lastCheck, cadence, timezone)
        pushDerived({
          key: `PROPAGATION_CHECK:${instance.id}`,
          taskType: 'PROPAGATION_CHECK',
          title: `Check propagation ${instance.plantId}`,
          reason: `${instance.instanceType === 'ACQUIRED_PROPAGATION' ? 'Acquired propagation' : 'Propagation'} day ${ageDays}; check every ${cadence} days while establishing.`,
          dueAt,
          basePriority: ageDays <= 30 ? 105 : 75,
          plantInstanceId: instance.id,
          plantId: instance.plantId,
          plantName: plantDisplayName,
          ...itemLocation(instance),
          image,
          propagationAgeDays: ageDays,
        })
      }
    }

    if (!openPestConditionPlantIds.has(instance.id)) {
      const pestAdjustment = adjustmentMap.get(`${instance.id}:PEST_CHECK`)
      const pestDays = pestCadenceDays(guide, pestAdjustment)
      const pestBaseline = latestPestCheck.get(instance.id)?.performedAt || baseDate
      pushDerived({
        key: `PEST_CHECK:${instance.id}`,
        taskType: 'PEST_CHECK',
        title: `Pest check ${instance.plantId}`,
        reason: `Pest check cadence is about ${pestDays} days${guide.susceptibilityLevel ? ` based on ${guide.susceptibilityLevel.toLowerCase()} susceptibility` : ''}.`,
        dueAt: addDays(pestBaseline, pestDays, timezone),
        basePriority: pestDays <= 14 ? 80 : 45,
        plantInstanceId: instance.id,
        plantId: instance.plantId,
        plantName: plantDisplayName,
        ...itemLocation(instance),
        image,
      })
    }

    const instanceConditions = conditions.filter((condition) => condition.plantInstanceId === instance.id)
    for (const condition of instanceConditions) {
      const severityDays = condition.severity === 'CRITICAL' ? 1 : condition.severity === 'HIGH' ? 2 : condition.severity === 'MODERATE' ? 4 : 7
      const conditionTaskType = condition.category === 'PESTS' ? 'PEST_CHECK' : 'HEALTH_CHECK'
      const lastConditionCheck = conditionTaskType === 'PEST_CHECK'
        ? latestPestCheck.get(instance.id)?.performedAt
        : latestHealthCheck.get(instance.id)?.performedAt
      const baseline = lastConditionCheck && lastConditionCheck > condition.observedAt ? lastConditionCheck : condition.observedAt
      pushDerived({
        key: `${conditionTaskType}:${condition.id}`,
        taskType: conditionTaskType,
        title: `Follow up: ${condition.category.replaceAll('_', ' ').toLowerCase()}`,
        reason: `${condition.severity.toLowerCase()} ${condition.category.replaceAll('_', ' ').toLowerCase()} is ${condition.status.toLowerCase()}.`,
        dueAt: condition.followUpAt || addDays(baseline, severityDays, timezone),
        basePriority: conditionPriority(condition.severity),
        plantInstanceId: instance.id,
        plantId: instance.plantId,
        plantName: plantDisplayName,
        ...itemLocation(instance),
        image,
        conditionId: condition.id,
        condition: {
          id: condition.id,
          category: condition.category,
          severity: condition.severity,
          status: condition.status,
          observedAt: condition.observedAt,
          updatedAt: condition.updatedAt,
          followUpAt: condition.followUpAt,
          resolvedAt: condition.resolvedAt,
          notes: condition.notes,
        },
      })
    }
  }

  for (const bloom of openBlooms) {
    const lastCheck = latestBloomCheck.get(bloom.plantInstanceId)?.performedAt || bloom.peakBloomDate || bloom.bloomStartDate
    const cadence = bloom.peakBloomDate ? 7 : 4
    pushDerived({
      key: `BLOOM_CHECK:${bloom.id}`,
      taskType: 'BLOOM_CHECK',
      title: `Check bloom ${bloom.plantInstance.plantId}`,
      reason: bloom.peakBloomDate ? 'Bloom is past peak; check whether it should be closed.' : 'Bloom is open; check for peak timing and photos.',
      dueAt: addDays(lastCheck, cadence, timezone),
      basePriority: 70,
      plantInstanceId: bloom.plantInstanceId,
      plantId: bloom.plantInstance.plantId,
      plantName: plantName(bloom.plantInstance.plantDefinition),
      ...itemLocation(bloom.plantInstance),
      image: photosByInstance[bloom.plantInstanceId],
      bloomEventId: bloom.id,
    })
  }

  for (const quarantine of activeQuarantines) {
    const overdueDays = Math.max(0, daysBetween(now, quarantine.targetReleaseDate, timezone))
    pushDerived({
      key: `QUARANTINE_REVIEW:${quarantine.id}`,
      taskType: 'QUARANTINE_REVIEW',
      title: `Review quarantine ${quarantine.plantInstance.plantId}`,
      reason: `${quarantine.riskLevel.toLowerCase()} risk quarantine target release date${overdueDays > 0 ? ` is ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue` : ' is due soon'}.`,
      dueAt: quarantine.targetReleaseDate,
      basePriority: 160,
      plantInstanceId: quarantine.plantInstanceId,
      plantId: quarantine.plantInstance.plantId,
      plantName: plantName(quarantine.plantInstance.plantDefinition),
      ...itemLocation(quarantine.plantInstance),
      image: photosByInstance[quarantine.plantInstanceId],
    })
  }

  for (const step of treatmentSteps) {
    const instance = step.plan.plantInstance
    const completedSteps = step.plan.steps.filter((item) => item.status === 'COMPLETED').length
    const adjusted = quietAdjusted(dayStart(step.scheduledAt, timezone), 'TREATMENT', instance.id)
    const dueAt = adjusted.dueAt
    const overdueDays = Math.max(0, daysBetween(now, dueAt, timezone))
    const snapshot = step.treatmentSnapshotJson && typeof step.treatmentSnapshotJson === 'object' && !Array.isArray(step.treatmentSnapshotJson)
      ? step.treatmentSnapshotJson as Record<string, any>
      : null
    const safety = snapshot?.safety || null
    const safetySummary = [
      safety?.requiresQuarantine ? 'quarantine required' : null,
      safety?.ventilationRequired ? 'ventilation required' : null,
      safety?.reentryIntervalHours ? `${safety.reentryIntervalHours}h re-entry` : null,
    ].filter(Boolean).join(' · ')
    items.push({
      key: `TREATMENT:${step.id}`,
      taskType: 'TREATMENT',
      source: 'treatment-plan',
      title: step.title,
      reason: step.instructions || `Continue ${step.plan.title}.`,
      dueAt,
      priority: clampPriority(120 + overdueDays * 10),
      overdueDays,
      plantInstanceId: instance.id,
      plantId: instance.plantId,
      plantName: plantName(instance.plantDefinition),
      ...itemLocation(instance),
      image: photosByInstance[instance.id],
      href: collectionPath(collectionSlug, `/treatments/plans/${step.plan.id}#step-${step.id}`),
      treatmentPlanId: step.plan.id,
      treatmentPlanStepId: step.id,
      treatmentName: step.treatment?.name || snapshot?.name || null,
      treatmentPlanTitle: step.plan.title,
      treatmentProgress: `${completedSteps}/${step.plan.steps.length} steps complete`,
      treatmentSafetySummary: safetySummary || null,
      originalDueAt: adjusted.originalDueAt || null,
      quietDayName: adjusted.quietDayName || null,
      quietDayReason: adjusted.quietDayReason || null,
      quietDayShiftDirection: adjusted.quietDayShiftDirection || null,
    })
  }

  for (const reminder of reminders) {
    const reminderAdjustment = reminder.entityType === 'PLANT_INSTANCE' && reminder.entityId
      ? adjustmentMap.get(`${reminder.entityId}:REMINDER`)
      : null
    if (isSuppressed(reminderAdjustment, now)) continue
    const reminderDueAt = reminderAdjustment?.nextDueAt || reminder.nextSendAt || reminder.dueAt
    const adjusted = quietAdjusted(reminderDueAt, 'REMINDER', reminder.entityType === 'PLANT_INSTANCE' ? reminder.entityId || undefined : undefined)
    const adjustedDueAt = adjusted.dueAt
    const overdueDays = Math.max(0, daysBetween(now, adjustedDueAt, timezone))
    const reminderInstance = reminder.entityType === 'PLANT_INSTANCE' && reminder.entityId
      ? instanceById.get(reminder.entityId)
      : reminder.entityType === 'BLOOM_EVENT' && reminder.entityId
        ? openBloomById.get(reminder.entityId)?.plantInstance
        : null
    const path = reminder.entityType === 'PLANT_INSTANCE' && reminder.entityId
      ? taskPath(collectionSlug, reminder.entityId)
      : reminder.entityType === 'BLOOM_EVENT' && reminder.entityId
        ? collectionPath(collectionSlug, `/reminders`)
        : collectionPath(collectionSlug, '/reminders')
    items.push({
      key: `REMINDER:${reminder.id}`,
      taskType: 'REMINDER',
      source: 'reminder',
      title: reminder.title,
      reason: `${reminderCategoryLabel(reminder.category)}${reminder.body ? `: ${reminder.body}` : ''}`,
      dueAt: adjustedDueAt,
      priority: reminder.completedAt ? 0 : clampPriority(60 + overdueDays * 8),
      overdueDays,
      href: path,
      reminderId: reminder.id,
      plantInstanceId: reminderInstance?.id || (reminder.entityType === 'PLANT_INSTANCE' ? reminder.entityId || undefined : undefined),
      plantId: reminderInstance?.plantId,
      plantName: reminderInstance ? plantName(reminderInstance.plantDefinition) : undefined,
      ...itemLocation(reminderInstance),
      image: reminderInstance ? photosByInstance[reminderInstance.id] : undefined,
      completedAt: reminder.completedAt,
      snoozedUntil: reminderAdjustment?.snoozedUntil || null,
      originalDueAt: adjusted.originalDueAt || null,
      quietDayName: adjusted.quietDayName || null,
      quietDayReason: adjusted.quietDayReason || null,
      quietDayShiftDirection: adjusted.quietDayShiftDirection || null,
    })
  }

  return items.sort((a, b) => {
    if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1
    return b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime()
  })
}

export function filterCareQueue(items: CareQueueItem[], filter?: string | null, now = new Date(), timezone?: string) {
  const end = endOfDayInTimeZone(now, timezone)
  if (!filter || filter === 'all') return items.filter((item) => !item.completedAt)
  if (filter === 'today') return items.filter((item) => !item.completedAt && item.dueAt <= end)
  if (filter === 'overdue') return items.filter((item) => !item.completedAt && item.dueAt < startOfDayInTimeZone(now, timezone))
  if (filter === 'completed') return items.filter((item) => item.completedAt)
  if (filter === 'water') return items.filter((item) => !item.completedAt && item.taskType === 'WATER')
  if (filter === 'fertilize') return items.filter((item) => !item.completedAt && item.taskType === 'FERTILIZE')
  if (filter === 'repot') return items.filter((item) => !item.completedAt && item.taskType === 'REPOT')
  if (filter === 'treatment') return items.filter((item) => !item.completedAt && item.taskType === 'TREATMENT')
  if (filter === 'propagation') return items.filter((item) => !item.completedAt && item.taskType === 'PROPAGATION_CHECK')
  if (filter === 'health') return items.filter((item) => !item.completedAt && ['HEALTH_CHECK', 'QUARANTINE_REVIEW'].includes(item.taskType))
  if (filter === 'pest') return items.filter((item) => !item.completedAt && item.taskType === 'PEST_CHECK')
  if (filter === 'bloom') return items.filter((item) => !item.completedAt && item.taskType === 'BLOOM_CHECK')
  if (filter === 'custom') return items.filter((item) => !item.completedAt && item.taskType === 'REMINDER')
  return items.filter((item) => !item.completedAt)
}

export function careQueueSummary(items: CareQueueItem[], now = new Date(), timezone?: string) {
  const active = items.filter((item) => !item.completedAt)
  return {
    today: active.filter((item) => item.dueAt <= endOfDayInTimeZone(now, timezone)).length,
    overdue: active.filter((item) => item.dueAt < startOfDayInTimeZone(now, timezone)).length,
    health: active.filter((item) => ['HEALTH_CHECK', 'QUARANTINE_REVIEW'].includes(item.taskType)).length,
    propagation: active.filter((item) => item.taskType === 'PROPAGATION_CHECK').length,
  }
}

export function nextReminderDate(reminder: { dueAt: Date; nextSendAt: Date | null; rrule: string | null }, timezone?: string) {
  const next = nextOccurrence(reminder.nextSendAt || reminder.dueAt, reminder.rrule, timezone)
  return next
}
