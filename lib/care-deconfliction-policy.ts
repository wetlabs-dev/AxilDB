import type { CareQueueItem } from '@/lib/care-queue'
import { calendarDayIndexInTimeZone, dateInputValue, addCalendarDays, startOfDayInTimeZone } from '@/lib/time'
import { effectiveQuietRules, type CalendarConfig } from '@/lib/care-calendar'
import { calendarShiftPolicy } from '@/lib/care-calendar-policy'
import { isQuietDate } from '@/lib/care-scheduling'
export { manualCareKey, manualDeconflictionRule } from '@/lib/care-occurrence-key'
export function deconflictionSuggestions(item: CareQueueItem, config: CalendarConfig, now = new Date()) {
  const original = startOfDayInTimeZone(item.originalDueAt || item.dueAt, config.timezone), today = startOfDayInTimeZone(now, config.timezone)
  // Time-sensitive and seasonal workflows retain their dedicated scheduling controls.
  const supported = ['WATER','FERTILIZE','PEST_CHECK','HEALTH_CHECK','PRUNE','REPOT'].includes(item.taskType) && item.source === 'derived' && !item.conditionId && !item.manualSchedule
  const { before, after, preferred } = calendarShiftPolicy(item,config.rules)
  const find = (sign: number, limit: number) => {
    if (!supported) return null
    const first = sign > 0 ? Math.max(1, calendarDayIndexInTimeZone(today,config.timezone)-calendarDayIndexInTimeZone(original,config.timezone)) : 1
    for (let step=first;step<first+366;step++) {
      const candidate = addCalendarDays(original, sign*step, config.timezone)
      if (sign < 0 && candidate < today) break
      if (candidate < today || item.notBeforeDate && dateInputValue(candidate,config.timezone)<item.notBeforeDate || isQuietDate(candidate,effectiveQuietRules(config.quietDays,item.locationId),config.timezone)) continue
      return { date: dateInputValue(candidate,config.timezone), exception: step > limit || item.taskType === 'WATER' && preferred === 'EARLIER' && sign > 0, distance: Math.abs(calendarDayIndexInTimeZone(candidate,config.timezone)-calendarDayIndexInTimeZone(original,config.timezone)) }
    }
    return null
  }
  const previous = find(-1,before), next = find(1,after)
  return { previous, next, recommended: !previous ? next ? 'LATER' : null : !next ? 'EARLIER' : preferred || (previous.distance <= next.distance ? 'EARLIER' : 'LATER'), supported }
}
