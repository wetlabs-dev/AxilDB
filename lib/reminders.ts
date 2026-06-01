import { addCalendarDays, addCalendarMonths, addCalendarYears, defaultTimeZone } from '@/lib/time'

export const reminderCategories = [
  ['GENERAL', 'General reminder'],
  ['PLANT_CHECK_IN', 'Plant check-in'],
  ['BLOOM_CYCLE', 'Bloom-cycle reminder'],
  ['PROPAGATION_FOLLOW_UP', 'Propagation follow-up'],
] as const

export const reminderRecurrences = [
  ['', 'One time'],
  ['FREQ=DAILY', 'Daily'],
  ['FREQ=WEEKLY', 'Weekly'],
  ['FREQ=MONTHLY', 'Monthly'],
  ['FREQ=YEARLY', 'Yearly'],
] as const

export function reminderCategoryLabel(category?: string | null) {
  return reminderCategories.find(([value]) => value === category)?.[1] || 'Reminder'
}

export function recurrenceLabel(rrule?: string | null) {
  if (!rrule) return 'One time'
  return reminderRecurrences.find(([value]) => value === rrule)?.[1] || rrule
}

export function nextOccurrence(from: Date, rrule?: string | null, timeZone = defaultTimeZone()) {
  if (!rrule) return null

  let next: Date | null = null
  if (rrule === 'FREQ=DAILY') next = addCalendarDays(from, 1, timeZone)
  else if (rrule === 'FREQ=WEEKLY') next = addCalendarDays(from, 7, timeZone)
  else if (rrule === 'FREQ=MONTHLY') next = addCalendarMonths(from, 1, timeZone)
  else if (rrule === 'FREQ=YEARLY') next = addCalendarYears(from, 1, timeZone)
  else return null

  return next
}

export function reminderPreferenceKey(category?: string | null) {
  if (category === 'PLANT_CHECK_IN') return 'plantCheckInReminders'
  if (category === 'BLOOM_CYCLE') return 'bloomCycleReminders'
  if (category === 'PROPAGATION_FOLLOW_UP') return 'propagationFollowUps'
  return 'generalReminders'
}

export function entityLabel(entityType?: string | null) {
  if (entityType === 'PLANT_INSTANCE') return 'Plant instance'
  if (entityType === 'BLOOM_EVENT') return 'Bloom event'
  if (entityType === 'PROPAGATION_EVENT') return 'Propagation event'
  return 'General'
}
