import type { CareQueueItem } from '@/lib/care-queue'
import { nextOccurrence } from '@/lib/reminders'
import { cadenceDueAt } from '@/lib/care-cadences'
import { isQuietDate, quietDayRuleDefaults } from '@/lib/care-scheduling'
import { addCalendarDays, calendarDayIndexInTimeZone, dateInputValue, normalizeTimeZone, startOfDayInTimeZone } from '@/lib/time'

export type QuietDate = { description?: string | null; id: string; name: string; quietType: string; date: Date | null; startDate: Date | null; endDate: Date | null; dayOfWeek: number | null; active: boolean }
export type ShiftRule = { careType: string; active: boolean; defaultShiftDirection: string; maxShiftDaysBefore: number; maxShiftDaysAfter: number }
export type CalendarConfig = { quietDays: QuietDate[]; rules: ShiftRule[]; timezone: string }
export type SavedShift = { adjustedDueAt: Date; originalDueAt: Date; reason: string; ruleUsed: string; shiftDirection: string; quietDayId: string | null }
// Cadence is a moisture-assessment heuristic, never a drought-tolerance claim.
export const calendarPolicy = { shortWateringDays: 7, longWateringDays: 14, wateringShiftDays: 1, maximumShiftDays: 14, coherentGroupLimit: 40 }
export function calendarSchedule(items: CareQueueItem[], config: CalendarConfig, now = new Date(), saved = new Map<string, SavedShift>(), revision = '') {
  const timezone = normalizeTimeZone(config.timezone)
  const today = startOfDayInTimeZone(now, timezone)
  const dates = new Map<string, number>()
  const result = new Map<string, CareQueueItem>()
  const count = (date: Date, delta: number) => { const key = dateInputValue(date, timezone); dates.set(key, (dates.get(key) || 0) + delta) }
  const waiting: CareQueueItem[] = []
  for (const original of items) {
    const item = { ...original, dueAt: startOfDayInTimeZone(original.dueAt, timezone) }
    const previous = saved.get(item.key)
    // Once an adjusted occurrence is actionable, do not make unfinished work vanish.
    if (previous && (!item.manualSchedule || item.dueAt.getTime() === previous.originalDueAt.getTime()) && (previous.ruleUsed === revision || previous.adjustedDueAt <= today)) {
      item.originalDueAt = previous.originalDueAt
      item.dueAt = previous.adjustedDueAt
      item.quietDayReason = isQuietDate(previous.adjustedDueAt, config.quietDays, timezone) ? `${previous.reason} Quiet Day exception: an already-started plan remains outstanding.` : previous.reason
      item.quietDayShiftDirection = previous.shiftDirection
      item.quietDayName = config.quietDays.find(day => day.id === previous.quietDayId)?.name || 'Quiet Day adjustment'
      result.set(item.key, item); if (!item.completedAt) count(item.dueAt, 1); continue
    }
    const quiet = isQuietDate(item.dueAt, config.quietDays, timezone)
    if (!quiet || item.completedAt || item.manualSchedule || item.dueAt < today) {
      if (quiet && !item.completedAt) item.quietDayReason = item.manualSchedule ? 'Required on Quiet Day: explicit schedule or time-sensitive care is preserved.' : 'Overdue care remains outstanding on Quiet Day.'
      result.set(item.key, item); if (!item.completedAt) count(item.dueAt, 1)
    } else waiting.push(item)
  }
  // Stable category/date groups; a completion does not reshuffle already saved groups.
  const groups = new Map<string, CareQueueItem[]>()
  for (const item of waiting.sort((a, b) => a.key.localeCompare(b.key))) {
    const waterClass = item.taskType === 'WATER' ? (item.cadenceDays || 0) <= calendarPolicy.shortWateringDays ? ':short' : (item.cadenceDays || 0) >= calendarPolicy.longWateringDays ? ':long' : ':middle' : ''
    const key = `${dateInputValue(item.dueAt, timezone)}:${item.taskType}${waterClass}${item.taskType === 'WATER' ? `:${item.key}` : ''}`
    groups.set(key, [...(groups.get(key) || []), item])
  }
  const coherentGroups = [...groups].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, group]) => {
    if (group.length <= calendarPolicy.coherentGroupLimit) return [group]
    return Array.from({ length: Math.ceil(group.length / calendarPolicy.coherentGroupLimit) }, (_, index) => group.slice(index * calendarPolicy.coherentGroupLimit, (index + 1) * calendarPolicy.coherentGroupLimit))
  })
  for (const group of coherentGroups) {
    const first = group[0]
    const type = first.taskType === 'REPOT' ? 'REPOTTING' : first.taskType
    const defaults = quietDayRuleDefaults[type as keyof typeof quietDayRuleDefaults] || { direction: 'SMART', before: 1, after: 1 }
    const rule = config.rules.find(rule => rule.careType === type && rule.active)
    const bound = first.taskType === 'WATER' ? calendarPolicy.wateringShiftDays : calendarPolicy.maximumShiftDays
    const before = Math.min(bound, rule?.maxShiftDaysBefore ?? defaults.before)
    const after = Math.min(bound, rule?.maxShiftDaysAfter ?? defaults.after)
    const direction = rule?.defaultShiftDirection || 'SMART'
    let preferred: string | null = direction === 'SMART' ? null : direction
    if (!preferred && first.taskType === 'WATER') {
      if ((first.cadenceDays || 0) <= calendarPolicy.shortWateringDays) preferred = 'EARLIER'
      else if ((first.cadenceDays || 0) >= calendarPolicy.longWateringDays) preferred = 'LATER'
    }
    const candidates: { date: Date; direction: string; score: number }[] = []
    for (const [sign, limit, label] of [[-1, before, 'EARLIER'], [1, after, 'LATER']] as const) {
      for (let offset = 1; offset <= limit; offset++) {
        const date = addCalendarDays(first.dueAt, sign * offset, timezone)
        if (date < today || isQuietDate(date, config.quietDays, timezone) || group.some(item => item.notBeforeDate && dateInputValue(date, timezone) < item.notBeforeDate)) continue
        if (first.taskType === 'WATER' && preferred === 'EARLIER' && label !== 'EARLIER') continue
        // Watering preference outranks load. Other categories stay together on the lighter day.
        const load = dates.get(dateInputValue(date, timezone)) || 0
        candidates.push({ date, direction: label, score: (preferred && label !== preferred ? 100000 : 0) + load + offset * 2 })
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.date.getTime() - b.date.getTime())
    const chosen = candidates[0]
    for (const item of group) {
      const quiet = isQuietDate(item.dueAt, config.quietDays, timezone)!
      if (chosen) {
        item.originalDueAt = item.dueAt
        item.dueAt = chosen.date
        item.quietDayName = quiet.name
        item.quietDayShiftDirection = chosen.direction
        item.quietDayReason = first.taskType === 'WATER' && preferred
          ? `Moved ${chosen.direction.toLowerCase()} around ${quiet.name}; ${preferred === 'EARLIER' ? 'shorter' : 'longer'} watering cadence. Check moisture before watering.`
          : `Moved with other ${type.toLowerCase().replaceAll('_', ' ')} tasks around ${quiet.name} to balance nearby workload.`
      } else item.quietDayReason = `Quiet Day exception: no safe non-quiet date within the configured shift bounds (${quiet.name}).`
      result.set(item.key, item); count(item.dueAt, 1)
    }
  }
  return [...result.values()].map(item => ({ ...item, overdueDays: Math.max(0, calendarDayIndexInTimeZone(now, timezone) - calendarDayIndexInTimeZone(item.dueAt, timezone)) }))
}

export function careForecast(items: CareQueueItem[], config: CalendarConfig, now = new Date()) {
  const today = startOfDayInTimeZone(now, config.timezone)
  // Include the full configured shift halo, including day-eight work advanced into day seven.
  const end = addCalendarDays(today, 7 + calendarPolicy.maximumShiftDays, config.timezone)
  let projected: CareQueueItem[] = items.filter(item => !item.completedAt)
  let frontier = projected.filter(item => item.recurrenceRule || item.recurrenceCadence && !item.manualSchedule)
  for (let iteration = 0; iteration < 32 && frontier.length; iteration++) {
    const nextItems: CareQueueItem[] = []
    for (const item of frontier) {
      const anchor = item.dueAt < today ? today : item.dueAt
      const next = item.recurrenceRule ? nextOccurrence(anchor, item.recurrenceRule, config.timezone) : cadenceDueAt(anchor, item.recurrenceCadence!, config.timezone)
      if (!next || next <= anchor || next >= end) continue
      nextItems.push({ ...item, key: `${item.key}:projection`, dueAt: next, originalDueAt: null, projected: true, notBeforeDate: dateInputValue(addCalendarDays(anchor, 1, config.timezone), config.timezone), quietDayReason: null, quietDayName: null, quietDayShiftDirection: null })
    }
    // Lock previous hypothetical decisions while calculating each next occurrence.
    const preserved = new Map(projected.map(item => [item.key, { originalDueAt: item.originalDueAt || item.dueAt, adjustedDueAt: item.dueAt, reason: item.quietDayReason || '', ruleUsed: 'forecast', shiftDirection: item.quietDayShiftDirection || 'NONE', quietDayId: null }]))
    const nextKeys = new Set(nextItems.map(item => item.key))
    projected = calendarSchedule([...projected, ...nextItems], config, now, preserved, 'forecast')
    frontier = projected.filter(item => nextKeys.has(item.key))
  }
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addCalendarDays(today, offset, config.timezone)
    const key = dateInputValue(date, config.timezone)
    const tasks = projected.filter(item => !item.completedAt && (dateInputValue(item.dueAt, config.timezone) === key || offset === 0 && item.dueAt < today))
    const categories: Record<string, number> = {}
    tasks.forEach(item => { categories[item.taskType] = (categories[item.taskType] || 0) + 1 })
    return { date: key, total: tasks.length, categories, overdue: tasks.filter(item => item.dueAt < today).length, quietDay: isQuietDate(date, config.quietDays, config.timezone), tasks: tasks.map(({ key, title, taskType, href, dueAt, originalDueAt, quietDayReason, projected, manualSchedule }) => ({ key, title, taskType, href, dueAt, originalDueAt, quietDayReason, projected, manualSchedule })) }
  })
}
