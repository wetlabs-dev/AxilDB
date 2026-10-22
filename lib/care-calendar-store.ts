import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { CareQueueItem } from '@/lib/care-queue'
import { calendarSchedule, effectiveQuietRules, quietDateReasons, type CalendarConfig, type SavedShift } from '@/lib/care-calendar'
import { startOfDayInTimeZone } from '@/lib/time'
export const scheduleDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function scheduleRevision(config: CalendarConfig) {
  return scheduleDigest({ timezone: config.timezone, quietDays: config.quietDays.filter(day => day.active).map(({ id, name, quietType, date, startDate, endDate, dayOfWeek, locationId, active }) => ({ id, name, quietType, date, startDate, endDate, dayOfWeek, locationId, active })).sort((a, b) => a.id.localeCompare(b.id)), rules: config.rules.map(({ careType, active, defaultShiftDirection, maxShiftDaysBefore, maxShiftDaysAfter }) => ({ careType, active, defaultShiftDirection, maxShiftDaysBefore, maxShiftDaysAfter })).sort((a, b) => a.careType.localeCompare(b.careType)) })
}
export function occurrenceKey(collectionId: string, item: CareQueueItem, timezone: string) {
  return scheduleDigest([collectionId, timezone, item.key, item.scheduleAnchor || item.dueAt.toISOString(), item.dueAt.toISOString(), item.manualSchedule || false])
}
export async function resolveCalendarPlan(db: PrismaClient | Prisma.TransactionClient, collectionId: string, items: CareQueueItem[], config: CalendarConfig, now: Date, persist = true, _reviseFuture = false) {
  const locationRevisions = new Map<string, string>()
  const revisionFor = (item: CareQueueItem) => {
    const location = item.locationId || ''
    if (!locationRevisions.has(location)) locationRevisions.set(location, scheduleDigest([location, scheduleRevision({ ...config, quietDays: effectiveQuietRules(config.quietDays, location) })]))
    return locationRevisions.get(location)!
  }
  const revisions = new Map(items.map(item => [item.key, revisionFor(item)]))
  const keys = new Map(items.map(item => [item.key, occurrenceKey(collectionId, item, config.timezone)]))
  const rows = keys.size ? await db.careQuietDayAdjustment.findMany({ where: { collectionId, scheduleKey: { in: [...keys.values()] } } }) : []
  const saved = new Map<string, SavedShift>()
  const byKey = new Map(rows.map(row => [row.scheduleKey, row]))
  const today = startOfDayInTimeZone(now, config.timezone)
  for (const item of items) {
    const row = byKey.get(keys.get(item.key)!)
    if (row && (row.ruleUsed === revisionFor(item) || row.adjustedDueAt <= today)) saved.set(item.key, row)
  }
  const plan = calendarSchedule(items, config, now, saved, revisions)
  if (!persist) return plan
  const changes = plan.filter(item => item.originalDueAt && item.originalDueAt.getTime() !== item.dueAt.getTime() && !byKey.has(keys.get(item.key)!))
  if (changes.length) {
    await db.careQuietDayAdjustment.createMany({ data: changes.map(item => ({
      collectionId, scheduleKey: keys.get(item.key)!, taskKey: item.key, timezone: config.timezone,
      plantInstanceId: item.plantInstanceId || null,
      quietDayId: quietDateReasons(item.originalDueAt!, config, item.locationId)[0]?.id || null,
      careType: item.taskType, originalDueAt: item.originalDueAt!, adjustedDueAt: item.dueAt,
      shiftDirection: item.quietDayShiftDirection!, ruleUsed: revisionFor(item), reason: item.quietDayReason!,
    })), skipDuplicates: true })
  }
  // Existing future decisions change only when their explicit Quiet Day configuration changes.
  for (const item of plan) {
    const row = byKey.get(keys.get(item.key)!)
    if (!row || row.ruleUsed === revisionFor(item) || row.adjustedDueAt <= today) continue
    await db.careQuietDayAdjustment.updateMany({ where: { id: row.id, ruleUsed: row.ruleUsed }, data: {
      adjustedDueAt: item.dueAt, originalDueAt: item.originalDueAt || item.dueAt,
      quietDayId: quietDateReasons(item.originalDueAt || item.dueAt, config, item.locationId)[0]?.id || null,
      reason: item.quietDayReason || 'Quiet Day removed; original calendar date restored.',
      shiftDirection: item.quietDayShiftDirection || 'NONE', ruleUsed: revisionFor(item),
    } })
  }
  // Read after insert-on-conflict so simultaneous readers return the winning durable decision.
  if (changes.length) return resolveCalendarPlan(db, collectionId, items, config, now, false)
  return plan
}
