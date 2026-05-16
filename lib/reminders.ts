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

export function nextOccurrence(from: Date, rrule?: string | null) {
  if (!rrule) return null

  const next = new Date(from)
  if (rrule === 'FREQ=DAILY') next.setDate(next.getDate() + 1)
  else if (rrule === 'FREQ=WEEKLY') next.setDate(next.getDate() + 7)
  else if (rrule === 'FREQ=MONTHLY') next.setMonth(next.getMonth() + 1)
  else if (rrule === 'FREQ=YEARLY') next.setFullYear(next.getFullYear() + 1)
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
