import type { PrismaClient } from '@prisma/client'
import { addCalendarDays, calendarDayIndexInTimeZone, dateInputValue, formatDate, normalizeTimeZone, parseDateTimeLocal } from '@/lib/time'

export const schedulableCareTypes = [
  'WATER',
  'FERTILIZE',
  'PEST_CHECK',
  'HEALTH_CHECK',
  'PROPAGATION_CHECK',
  'BLOOM_CHECK',
  'REPOTTING',
  'REMINDER',
] as const

export type SchedulableCareType = (typeof schedulableCareTypes)[number]
export type ShiftDirection = 'EARLIER' | 'LATER' | 'SMART'
type QuietDayLike = {
  id?: string
  name?: string
  quietType: string
  date: Date | null
  startDate: Date | null
  endDate: Date | null
  dayOfWeek: number | null
  active: boolean
}

export const quietDayRuleDefaults: Record<SchedulableCareType, { direction: ShiftDirection; before: number; after: number }> = {
  WATER: { direction: 'SMART', before: 1, after: 1 },
  FERTILIZE: { direction: 'LATER', before: 1, after: 3 },
  PEST_CHECK: { direction: 'SMART', before: 2, after: 1 },
  HEALTH_CHECK: { direction: 'SMART', before: 2, after: 1 },
  PROPAGATION_CHECK: { direction: 'EARLIER', before: 2, after: 1 },
  BLOOM_CHECK: { direction: 'EARLIER', before: 2, after: 1 },
  REPOTTING: { direction: 'LATER', before: 1, after: 7 },
  REMINDER: { direction: 'LATER', before: 1, after: 7 },
}

export function careScheduleLabel(type: string) {
  if (type === 'WATER') return 'Watering'
  if (type === 'FERTILIZE') return 'Fertilizing'
  if (type === 'PEST_CHECK') return 'Pest check'
  if (type === 'HEALTH_CHECK') return 'Health check'
  if (type === 'PROPAGATION_CHECK') return 'Propagation check'
  if (type === 'BLOOM_CHECK') return 'Bloom check'
  if (type === 'REPOTTING') return 'Repotting'
  if (type === 'REMINDER') return 'Manual reminders'
  return type.toLowerCase().replaceAll('_', ' ')
}

export function normalizeCareTypes(values: unknown[]) {
  const allowed = new Set<string>(schedulableCareTypes)
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter((value) => allowed.has(value)))) as SchedulableCareType[]
}

export function smartDirection(careType: string, dueAt: Date, now = new Date(), timezone?: string | null): 'EARLIER' | 'LATER' {
  if (['PROPAGATION_CHECK', 'BLOOM_CHECK', 'HEALTH_CHECK', 'PEST_CHECK'].includes(careType)) return 'EARLIER'
  if (['FERTILIZE', 'REPOTTING', 'REMINDER'].includes(careType)) return 'LATER'
  if (careType === 'WATER') {
    const overdue = calendarDayIndexInTimeZone(now, timezone || undefined) >= calendarDayIndexInTimeZone(dueAt, timezone || undefined)
    return overdue ? 'EARLIER' : 'LATER'
  }
  return 'LATER'
}

export function isQuietDate<TQuietDay extends QuietDayLike>(date: Date, quietDays: TQuietDay[], timezone: string): TQuietDay | null {
  timezone = normalizeTimeZone(timezone)
  const localDate = dateInputValue(date, timezone)
  const localDay = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(localDay)
  return quietDays.find((quietDay) => {
    if (!quietDay.active) return false
    if (quietDay.quietType === 'ONE_TIME' && quietDay.date) return dateInputValue(quietDay.date, timezone) === localDate
    if (quietDay.quietType === 'WEEKLY_RECURRING') return quietDay.dayOfWeek === dayIndex
    if (quietDay.quietType === 'DATE_RANGE' && quietDay.startDate && quietDay.endDate) {
      return localDate >= dateInputValue(quietDay.startDate, timezone) && localDate <= dateInputValue(quietDay.endDate, timezone)
    }
    return false
  }) || null
}

export function resolveQuietDayShift({
  dueAt,
  careType,
  quietDays,
  rule,
  timezone,
  now = new Date(),
}: {
  dueAt: Date
  careType: string
  quietDays: Array<QuietDayLike & { name: string }>
  rule?: { defaultShiftDirection: string; maxShiftDaysBefore: number; maxShiftDaysAfter: number; active: boolean } | null
  timezone: string
  now?: Date
}) {
  timezone = normalizeTimeZone(timezone)
  const quietDay = isQuietDate(dueAt, quietDays, timezone)
  if (!quietDay) return null
  const defaults = quietDayRuleDefaults[(careType as SchedulableCareType)] || quietDayRuleDefaults.REMINDER
  const configured = rule?.active ? rule : null
  const directionSetting = (configured?.defaultShiftDirection || defaults.direction) as ShiftDirection
  const direction = directionSetting === 'SMART' ? smartDirection(careType, dueAt, now, timezone) : directionSetting
  const before = configured?.maxShiftDaysBefore ?? defaults.before
  const after = configured?.maxShiftDaysAfter ?? defaults.after
  const primaryLimit = direction === 'EARLIER' ? before : after
  const fallbackLimit = direction === 'EARLIER' ? after : before
  const tryDirections: Array<'EARLIER' | 'LATER'> = [direction, direction === 'EARLIER' ? 'LATER' : 'EARLIER']

  for (const candidateDirection of tryDirections) {
    const limit = candidateDirection === direction ? primaryLimit : fallbackLimit
    for (let offset = 1; offset <= Math.max(0, limit); offset += 1) {
      const candidate = addCalendarDays(dueAt, candidateDirection === 'EARLIER' ? -offset : offset, timezone)
      if (!isQuietDate(candidate, quietDays, timezone)) {
        return {
          quietDay,
          originalDueAt: dueAt,
          adjustedDueAt: candidate,
          shiftDirection: candidateDirection,
          ruleUsed: directionSetting,
          reason: `Shifted from ${formatDate(dueAt, timezone)} because of Quiet Day: ${quietDay.name}`,
        }
      }
    }
  }

  return {
    quietDay,
    originalDueAt: dueAt,
    adjustedDueAt: dueAt,
    shiftDirection: 'NONE',
    ruleUsed: directionSetting,
    reason: `Quiet Day ${quietDay.name} matched, but no non-quiet day was available within shift limits.`,
  }
}

export async function ensureQuietDayShiftRules(prisma: PrismaClient, collectionId: string) {
  const existing = await prisma.collectionQuietDayShiftRule.findMany({ where: { collectionId }, select: { careType: true } })
  const existingTypes = new Set(existing.map((rule) => rule.careType))
  for (const careType of schedulableCareTypes) {
    if (existingTypes.has(careType)) continue
    const defaults = quietDayRuleDefaults[careType]
    await prisma.collectionQuietDayShiftRule.create({
      data: {
        collectionId,
        careType,
        defaultShiftDirection: defaults.direction,
        maxShiftDaysBefore: defaults.before,
        maxShiftDaysAfter: defaults.after,
      },
    })
  }
}

export function parseTargetDueAt(dateValue: string, timeValue: string | null | undefined, timezone: string) {
  return parseDateTimeLocal(dateValue ? `${dateValue}T${timeValue || '09:00'}` : '', timezone) || new Date()
}

export function adjustedReasonSuffix(reason?: string | null) {
  return reason ? ` ${reason}` : ''
}
