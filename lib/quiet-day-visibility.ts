import { dateInputValue } from '@/lib/time'

/** Presentation only: retain historical rules and durable care shifts in storage. */
export function isUpcomingQuietDay(rule: { quietType: string; date?: Date | string | null; endDate?: Date | string | null }, now: Date, timezone: string) {
  if (rule.quietType === 'WEEKLY_RECURRING') return true
  const end = rule.quietType === 'DATE_RANGE' ? rule.endDate : rule.date
  // Incomplete rules remain visible for correction rather than disappearing silently.
  if (!end) return true
  const date = new Date(end)
  if (!Number.isFinite(date.getTime())) return true
  return dateInputValue(date, timezone) >= dateInputValue(now, timezone)
}
