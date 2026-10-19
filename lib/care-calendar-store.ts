import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { CareQueueItem } from '@/lib/care-queue'
import { calendarSchedule, type CalendarConfig, type SavedShift } from '@/lib/care-calendar'
import { startOfDayInTimeZone } from '@/lib/time'
export const scheduleDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function scheduleRevision(config: CalendarConfig) {
  return scheduleDigest({ timezone: config.timezone, quietDays: config.quietDays.map(({ id, name, quietType, date, startDate, endDate, dayOfWeek, active }) => ({ id, name, quietType, date, startDate, endDate, dayOfWeek, active })).sort((a, b) => a.id.localeCompare(b.id)), rules: config.rules.map(({ careType, active, defaultShiftDirection, maxShiftDaysBefore, maxShiftDaysAfter }) => ({ careType, active, defaultShiftDirection, maxShiftDaysBefore, maxShiftDaysAfter })).sort((a, b) => a.careType.localeCompare(b.careType)) })
}
export function occurrenceKey(collectionId: string, item: CareQueueItem, timezone: string) {
  return scheduleDigest([collectionId, timezone, item.key, item.scheduleAnchor || item.dueAt.toISOString(), item.dueAt.toISOString(), item.manualSchedule || false])
}
export async function resolveCalendarPlan(db: PrismaClient | Prisma.TransactionClient, collectionId: string, items: CareQueueItem[], config: CalendarConfig, now: Date, persist = true, reviseFuture = false) {
  const revision = scheduleRevision(config)
  const keys = new Map(items.map(item => [item.key, occurrenceKey(collectionId, item, config.timezone)]))
  const rows = keys.size ? await db.careQuietDayAdjustment.findMany({ where: { collectionId, scheduleKey: { in: [...keys.values()] } } }) : []
  const saved = new Map<string, SavedShift>()
  const byKey = new Map(rows.map(row => [row.scheduleKey, row]))
  const today = startOfDayInTimeZone(now, config.timezone)
  for (const item of items) {
    const row = byKey.get(keys.get(item.key)!)
    if (row && (!reviseFuture || row.adjustedDueAt <= today)) saved.set(item.key, row)
  }
  const plan = calendarSchedule(items, config, now, saved, revision)
  if (!persist) return plan
  const changes = plan.filter(item => item.originalDueAt && item.originalDueAt.getTime() !== item.dueAt.getTime() && !byKey.has(keys.get(item.key)!))
  if (changes.length) {
    await db.careQuietDayAdjustment.createMany({ data: changes.map(item => ({
      collectionId, scheduleKey: keys.get(item.key)!, taskKey: item.key, timezone: config.timezone,
      plantInstanceId: item.plantInstanceId || null,
      quietDayId: config.quietDays.find(day => day.name === item.quietDayName)?.id || null,
      careType: item.taskType, originalDueAt: item.originalDueAt!, adjustedDueAt: item.dueAt,
      shiftDirection: item.quietDayShiftDirection!, ruleUsed: revision, reason: item.quietDayReason!,
    })), skipDuplicates: true })
  }
  // Existing future decisions change only when their explicit Quiet Day configuration changes.
  for (const item of plan) {
    const row = byKey.get(keys.get(item.key)!)
    if (!row || row.ruleUsed === revision || row.adjustedDueAt <= today) continue
    await db.careQuietDayAdjustment.updateMany({ where: { id: row.id, ruleUsed: row.ruleUsed }, data: {
      adjustedDueAt: item.dueAt, originalDueAt: item.originalDueAt || item.dueAt,
      reason: item.quietDayReason || 'Quiet Day removed; original calendar date restored.',
      shiftDirection: item.quietDayShiftDirection || 'NONE', ruleUsed: revision,
    } })
  }
  // Read after insert-on-conflict so simultaneous readers return the winning durable decision.
  if (changes.length) return resolveCalendarPlan(db, collectionId, items, config, now, false)
  return plan
}
