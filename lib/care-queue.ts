import type { PrismaClient } from '@prisma/client'
import type { PlantImageFrame } from '@/components/PlantImage'
import { collectionPath } from '@/lib/collections'
import { nextOccurrence, reminderCategoryLabel } from '@/lib/reminders'
import { addCalendarDays, calendarDayIndexInTimeZone, endOfDayInTimeZone, startOfDayInTimeZone } from '@/lib/time'
import { plantName } from '@/lib/utils'

export const careTaskTypes = [
  'WATER',
  'PROPAGATION_CHECK',
  'PEST_CHECK',
  'HEALTH_CHECK',
  'BLOOM_CHECK',
  'QUARANTINE_REVIEW',
  'REMINDER',
] as const

export type CareTaskType = (typeof careTaskTypes)[number]
export type CareQueueFilter = 'today' | 'overdue' | 'water' | 'propagation' | 'health' | 'pest' | 'bloom' | 'custom' | 'completed'

export type CareQueueItem = {
  key: string
  taskType: CareTaskType
  source: 'derived' | 'reminder'
  title: string
  reason: string
  dueAt: Date
  priority: number
  overdueDays: number
  plantInstanceId?: string
  plantId?: string
  plantName?: string
  location?: string | null
  image?: PlantImageFrame
  href: string
  reminderId?: string
  conditionId?: string
  bloomEventId?: string
  completedAt?: Date | null
  snoozedUntil?: Date | null
  propagationAgeDays?: number
}

function addDays(date: Date, days: number, timezone?: string) {
  return addCalendarDays(date, days, timezone)
}

function daysBetween(a: Date, b: Date, timezone?: string) {
  return calendarDayIndexInTimeZone(a, timezone) - calendarDayIndexInTimeZone(b, timezone)
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
  if (type === 'PROPAGATION_CHECK') return 'Propagation check'
  if (type === 'PEST_CHECK') return 'Pest check'
  if (type === 'HEALTH_CHECK') return 'Health check'
  if (type === 'BLOOM_CHECK') return 'Bloom check'
  if (type === 'QUARANTINE_REVIEW') return 'Quarantine review'
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
  const [instances, careEvents, conditions, adjustments, photos, openBlooms, activeQuarantines, reminders] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { collectionId, status: 'ACTIVE' },
      include: {
        plantDefinition: { include: { husbandryGuide: true } },
        husbandryOverride: true,
      },
    }),
    prisma.plantCareEvent.findMany({
      where: { collectionId, plantInstance: { status: 'ACTIVE' } },
      orderBy: { performedAt: 'desc' },
    }),
    prisma.plantCondition.findMany({
      where: { collectionId, plantInstance: { status: 'ACTIVE' }, status: { in: ['OPEN', 'IMPROVING'] } },
      orderBy: [{ severity: 'desc' }, { observedAt: 'desc' }],
    }),
    prisma.plantCareAdjustment.findMany({ where: { collectionId, plantInstance: { status: 'ACTIVE' } } }),
    prisma.photo.findMany({
      where: { collectionId, entityType: 'PLANT_INSTANCE' },
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
    }),
    prisma.bloomEvent.findMany({
      where: { collectionId, bloomEndDate: null, plantInstance: { status: 'ACTIVE' } },
      include: { plantInstance: { include: { plantDefinition: true } } },
      orderBy: { bloomStartDate: 'desc' },
    }),
    prisma.plantQuarantine.findMany({
      where: { collectionId, status: 'ACTIVE', plantInstance: { status: 'ACTIVE' } },
      include: { plantInstance: { include: { plantDefinition: true } } },
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
  ])

  const photosByInstance = imageLookup(photos)
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
  const openBloomById = new Map(openBlooms.map((bloom) => [bloom.id, bloom]))
  const latestWater = latestBy(careEvents as any, 'WATERED')
  const latestPestCheck = latestBy(careEvents as any, 'PEST_CHECK')
  const latestHealthCheck = latestBy(careEvents as any, 'HEALTH_CHECK')
  const latestPropagationCheck = latestBy(careEvents as any, 'PROPAGATION_CHECK')
  const latestBloomCheck = latestBy(careEvents as any, 'BLOOM_CHECK')
  const adjustmentMap = new Map<string, any>()
  for (const adjustment of adjustments) {
    adjustmentMap.set(`${adjustment.plantInstanceId}:${adjustment.taskType}`, adjustment)
  }

  const items: CareQueueItem[] = []

  const pushDerived = (item: Omit<CareQueueItem, 'source' | 'href' | 'overdueDays' | 'priority'> & { basePriority: number }) => {
    const adjustment = item.plantInstanceId ? adjustmentMap.get(`${item.plantInstanceId}:${item.taskType}`) : null
    if (isSuppressed(adjustment, now)) return
    const overdueDays = Math.max(0, daysBetween(now, item.dueAt, timezone))
    items.push({
      ...item,
      source: 'derived',
      href: taskPath(collectionSlug, item.plantInstanceId, item.bloomEventId),
      overdueDays,
      priority: clampPriority(item.basePriority + overdueDays * 9),
      snoozedUntil: adjustment?.snoozedUntil || null,
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
      location: instance.location,
      image,
    })

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
          location: instance.location,
          image,
          propagationAgeDays: ageDays,
        })
      }
    }

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
      location: instance.location,
      image,
    })

    const instanceConditions = conditions.filter((condition) => condition.plantInstanceId === instance.id)
    const lastHealth = latestHealthCheck.get(instance.id)?.performedAt
    for (const condition of instanceConditions) {
      const severityDays = condition.severity === 'CRITICAL' ? 1 : condition.severity === 'HIGH' ? 2 : condition.severity === 'MODERATE' ? 4 : 7
      const baseline = lastHealth && lastHealth > condition.observedAt ? lastHealth : condition.observedAt
      pushDerived({
        key: `HEALTH_CHECK:${condition.id}`,
        taskType: 'HEALTH_CHECK',
        title: `Follow up: ${condition.category.replaceAll('_', ' ').toLowerCase()}`,
        reason: `${condition.severity.toLowerCase()} ${condition.category.replaceAll('_', ' ').toLowerCase()} is ${condition.status.toLowerCase()}.`,
        dueAt: addDays(baseline, severityDays, timezone),
        basePriority: conditionPriority(condition.severity),
        plantInstanceId: instance.id,
        plantId: instance.plantId,
        plantName: plantDisplayName,
        location: instance.location,
        image,
        conditionId: condition.id,
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
      location: bloom.plantInstance.location,
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
      location: quarantine.plantInstance.location,
      image: photosByInstance[quarantine.plantInstanceId],
    })
  }

  for (const reminder of reminders) {
    const dueAt = reminder.nextSendAt || reminder.dueAt
    const overdueDays = Math.max(0, daysBetween(now, dueAt, timezone))
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
      dueAt,
      priority: reminder.completedAt ? 0 : clampPriority(60 + overdueDays * 8),
      overdueDays,
      href: path,
      reminderId: reminder.id,
      plantInstanceId: reminderInstance?.id || (reminder.entityType === 'PLANT_INSTANCE' ? reminder.entityId || undefined : undefined),
      plantId: reminderInstance?.plantId,
      plantName: reminderInstance ? plantName(reminderInstance.plantDefinition) : undefined,
      location: reminderInstance?.location,
      image: reminderInstance ? photosByInstance[reminderInstance.id] : undefined,
      completedAt: reminder.completedAt,
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
