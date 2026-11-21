import type { Prisma, PrismaClient } from '@prisma/client'
import { cadenceActivities, resolveCadence, resolveInitialCareSchedule, validateCadenceState } from '@/lib/care-cadences'
import { effectiveFertilizerAssignment } from '@/lib/fertilizers'
import { calendarSchedule } from '@/lib/care-calendar'
import { forecastConfiguration } from '@/lib/care-forecast-service'
import { startOfDayInTimeZone } from '@/lib/time'

export type CareIntegrityBatch = { auditedAt: Date; activeInstances: number; scheduledObligations: number; applied: number; discrepancies: Array<Record<string, unknown>>; nextCursor: string | null }

/** Bounded, explicitly invoked diagnostic; ordinary page requests never run this audit. */
export async function auditCareScheduleBatch(db: PrismaClient | Prisma.TransactionClient, options: {
  collectionId: string; collectionSlug: string; timezone: string; after?: string; batchSize?: number; apply?: boolean; now?: Date
}): Promise<CareIntegrityBatch> {
  if ('$transaction' in db) return db.$transaction(tx => auditCareScheduleBatch(tx, options), { maxWait: 15000, timeout: 30000 })
  const { collectionId, timezone } = options, now = options.now || new Date()
  // Calendar first: lifecycle completions can acquire cadence dependency locks later.
  if (options.apply) await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`care-calendar:${collectionId}`}, 0))`
  else await db.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`care-calendar:${collectionId}`}, 0))`
  if (options.apply) await db.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
  if (options.batchSize !== undefined && (!Number.isInteger(options.batchSize) || options.batchSize < 1)) throw new Error('Batch size must be a positive whole number.')
  const take = Math.min(250, options.batchSize || 100)
  const plants = await db.plantInstance.findMany({
    where: { collectionId, status: 'ACTIVE', ...(options.after ? { id: { gt: options.after } } : {}) }, orderBy: { id: 'asc' }, take,
    include: { careCadenceOverrides: true, careAdjustments: { where: { collectionId } }, currentLocation: { select: { name: true } },
      plantDefinition: { include: { careCadences: true, husbandryGuide: { include: { fertilizerRecipe: true } } } },
      husbandryOverride: { include: { fertilizerRecipe: true } } },
  })
  const events = plants.length ? await db.plantCareEvent.groupBy({ by: ['plantInstanceId', 'eventType'], where: { collectionId, plantInstanceId: { in: plants.map(p => p.id) }, eventType: { in: cadenceActivities.map(c => c.event) } }, _max: { performedAt: true } }) : []
  const last = new Map(events.map(e => [`${e.plantInstanceId}:${e.eventType}`, e._max.performedAt]))
  const config = await forecastConfiguration(db, { collectionId, collectionSlug: options.collectionSlug, timezone })
  const rows: Array<Record<string, unknown>> = []
  let obligations = 0, applied = 0
  for (const plant of plants) for (const { activity, task, event } of cadenceActivities) {
    const effective = resolveCadence(activity, plant.plantDefinition.careCadences, plant.careCadenceOverrides)
    const decision = plant.careCadenceOverrides.find(c => c.activity === activity) || plant.plantDefinition.careCadences.find(c => c.activity === activity)
    const adjustment = plant.careAdjustments.find(a => a.taskType === task)
    const lastCompleted = last.get(`${plant.id}:${event}`)
    const hasRecipe = Boolean(effectiveFertilizerAssignment(plant.plantDefinition.husbandryGuide, plant.husbandryOverride).recipe?.active)
    let discrepancy: string | undefined
    try { validateCadenceState(activity, effective.status, decision?.interval, decision?.unit) } catch { discrepancy = 'INVALID_CADENCE' }
    if (effective.status !== 'SCHEDULED' && !discrepancy) continue
    obligations++
    const schedule = resolveInitialCareSchedule({ ...effective, cadence: discrepancy ? null : effective.cadence, lastCompleted, lifecycleDate: plant.propagationDate || plant.acquisitionDate, createdAt: plant.createdAt, initialAnchorAt: adjustment?.initialAnchorAt, nextDueAt: adjustment?.nextDueAt, snoozedUntil: adjustment?.snoozedUntil, disabled: adjustment?.disabled, hasRecipe, timezone })
    if (!discrepancy && adjustment?.disabled) discrepancy = 'EXPLICITLY_SUPPRESSED'
    if (!discrepancy && activity === 'FERTILIZING' && !hasRecipe) discrepancy = 'MISSING_RECIPE'
    if (!discrepancy && !schedule.dueAt) discrepancy = 'UNRESOLVED_SCHEDULE'
    const recover = !discrepancy && !lastCompleted && !effective.activatedAt && !adjustment?.nextDueAt && !adjustment?.initialAnchorAt
    if (recover) discrepancy = 'LEGACY_INITIAL_ANCHOR'
    if (options.apply && recover && schedule.anchor) {
      // Pin only the inferred legacy anchor. Never change due dates, care events or user decisions.
      await db.plantCareAdjustment.upsert({ where: { collectionId_plantInstanceId_taskType: { collectionId, plantInstanceId: plant.id, taskType: task } },
        create: { collectionId, plantInstanceId: plant.id, taskType: task, initialAnchorAt: schedule.anchor }, update: { initialAnchorAt: schedule.anchor } })
      applied++
    }
    let quietException = false
    if (schedule.dueAt) {
      const item = { key: `${task}:${plant.id}`, taskType: task, source: 'derived' as const, title: '', reason: '', dueAt: startOfDayInTimeZone(schedule.dueAt, timezone), priority: 0, overdueDays: 0, href: '', locationId: plant.currentLocationId, manualSchedule: Boolean(adjustment?.nextDueAt || adjustment?.snoozedUntil), cadenceDays: Math.max(1, Math.round((schedule.dueAt.getTime() - schedule.anchor!.getTime()) / 86400000)) }
      quietException = Boolean(calendarSchedule([item], config, now)[0]?.schedulingConflict)
    }
    if (discrepancy || quietException) rows.push({ instanceId: plant.id, plantId: plant.plantId, definitionId: plant.plantDefinitionId, location: plant.currentLocation?.name || null, activity, cadence: effective.cadence, source: effective.source, lastCompleted, anchor: schedule.anchor, expectedBaseDueAt: schedule.dueAt, basis: schedule.basis, queueState: adjustment?.disabled ? 'Explicitly suppressed' : schedule.dueAt ? 'Derived on demand; one outstanding occurrence' : 'No calculable occurrence', discrepancy: discrepancy || 'QUIET_DAY_EXCEPTION', quietException,
      action: recover ? options.apply ? 'Pinned legacy anchor' : 'Pin lifecycle fallback; review inferred historical activation' : 'Review configuration; preserve user decisions', overdue: Boolean(schedule.dueAt && schedule.dueAt < startOfDayInTimeZone(now, timezone)) })
  }
  return { auditedAt: now, activeInstances: plants.length, scheduledObligations: obligations, applied, discrepancies: rows, nextCursor: plants.length === take ? plants[plants.length - 1].id : null }
}
