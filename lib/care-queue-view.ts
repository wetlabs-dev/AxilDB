import type { CareQueueItem, CareTaskType } from '@/lib/care-queue'
import { startOfDayInTimeZone, endOfDayInTimeZone } from '@/lib/time'

export function filterCareQueue(items: CareQueueItem[], filter?: string | null, now = new Date(), timezone?: string) {
  const end = endOfDayInTimeZone(now, timezone)
  if (!filter || filter === 'all') return items.filter((item) => !item.completedAt)
  if (filter === 'today') return items.filter((item) => !item.completedAt && item.dueAt <= end)
  if (filter === 'overdue') return items.filter((item) => !item.completedAt && item.dueAt < startOfDayInTimeZone(now, timezone))
  if (filter === 'completed') return items.filter((item) => item.completedAt)
  if (filter === 'water') return items.filter((item) => !item.completedAt && item.taskType === 'WATER')
  if (filter === 'fertilize') return items.filter((item) => !item.completedAt && item.taskType === 'FERTILIZE')
  if (filter === 'repot') return items.filter((item) => !item.completedAt && item.taskType === 'REPOT')
  if (filter === 'treatment') return items.filter((item) => !item.completedAt && item.taskType === 'TREATMENT')
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


export function careTaskLabel(type: CareTaskType) {
  if (type === 'PRUNE') return 'Prune'
  if (type === 'WATER') return 'Water'
  if (type === 'FERTILIZE') return 'Fertilize'
  if (type === 'REPOT') return 'Repot'
  if (type === 'PROPAGATION_CHECK') return 'Propagation check'
  if (type === 'PEST_CHECK') return 'Pest check'
  if (type === 'HEALTH_CHECK') return 'Health check'
  if (type === 'BLOOM_CHECK') return 'Bloom check'
  if (type === 'QUARANTINE_REVIEW') return 'Quarantine review'
  if (type === 'TREATMENT') return 'Treatment'
  return 'Reminder'
}


export function conditionPriority(severity?: string | null) {
  if (severity === 'CRITICAL') return 220
  if (severity === 'HIGH') return 180
  if (severity === 'MODERATE') return 130
  return 90
}
export function conditionFollowUpDays(severity?: string | null) {
  return severity === 'CRITICAL' ? 1 : severity === 'HIGH' ? 2 : severity === 'MODERATE' ? 4 : 7
}
