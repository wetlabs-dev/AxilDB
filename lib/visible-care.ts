import type { CareQueueItem } from '@/lib/care-queue'
/** The logical filtered group, never DOM visibility or location membership alone. */
export const visibleCareLimit = 100
export function visibleCareUnavailable(item: CareQueueItem, endOfToday: Date): string | null {
  if(item.completedAt)return 'Already completed.'
  if(item.projected || new Date(item.dueAt)>endOfToday)return 'Future care is not included.'
  if(item.schedulingConflict)return 'Resolve the scheduling conflict first.'
  if(item.taskType==='TREATMENT')return 'Continue the treatment plan to record its required details.'
  if(item.taskType==='QUARANTINE_REVIEW')return 'Review quarantine and its release decision on the plant page.'
  if(item.conditionId)return 'Use the condition actions to record its assessment and follow-up decision.'
  if(!item.plantInstanceId&&!item.reminderId)return 'Open this task to complete it.'
  return null
}
export type VisibleCareEntry = { key: string; occurrence: string; fields?: Record<string,string> }
export type VisibleCareReview = { item: CareQueueItem; occurrence: string; unavailable: string|null }
