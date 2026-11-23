import type { CareQueueItem } from '@/lib/care-queue'
import { dateInputValue } from '@/lib/time'
export const manualDeconflictionRule = 'MANUAL_DECONFLICTION'
export function manualCareKey(item: CareQueueItem, timezone: string) {
  return 'deconflict:' + JSON.stringify([item.key.replace(/(:projection)+$/, ''), dateInputValue(item.originalDueAt || item.dueAt, timezone), item.recurrenceCadence || null, item.recurrenceRule || null, item.locationId || null, timezone])
}
