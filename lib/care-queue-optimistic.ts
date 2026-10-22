import type { CareQueueItem } from '@/lib/care-queue'

export const careQueueActions = ['planRepotting', 'complete', 'snooze', 'resolve', 'update', 'attention', 'establish', 'bulk'] as const
export type CareQueueAction = typeof careQueueActions[number]
export type CareOperation = {
  operationId: string
  issuedAt: number
  action: CareQueueAction
  fields: Array<[string, string]>
  keys: string[]
  locks: string[]
  patch?: Partial<CareQueueItem>
  status: 'pending' | 'confirmed' | 'failed' | 'uncertain'
  message?: string
}
export type QueueSnapshot = { items: CareQueueItem[]; snapshotAt: number; forecast?: unknown }
export function hydrateCareItems(items: CareQueueItem[]): CareQueueItem[] {
  return items.map(item => ({ ...item, dueAt: new Date(item.dueAt), completedAt: item.completedAt ? new Date(item.completedAt) : null, snoozedUntil: item.snoozedUntil ? new Date(item.snoozedUntil) : null,
    originalDueAt: item.originalDueAt ? new Date(item.originalDueAt) : null,
    condition: item.condition ? { ...item.condition, observedAt: new Date(item.condition.observedAt), updatedAt: new Date(item.condition.updatedAt), followUpAt: item.condition.followUpAt ? new Date(item.condition.followUpAt) : null, resolvedAt: item.condition.resolvedAt ? new Date(item.condition.resolvedAt) : null } : undefined,
  }))
}
export function overlayCareItems(items: CareQueueItem[], operations: CareOperation[]) {
  const byKey = new Map<string, CareOperation>()
  for (const op of operations) if (op.status === 'pending' || op.status === 'confirmed') for (const key of op.keys) if (!byKey.has(key)) byKey.set(key, op)
  return items.flatMap(item => {
    const operation = byKey.get(item.key)
    if (!operation) return [item]
    return operation.patch ? [{ ...item, ...operation.patch }] : []
  })
}
export function careOperationLocks(action: CareQueueAction, fields: FormData) {
  const reminder = String(fields.get('reminderId') || '')
  if (reminder) return [`reminder:${reminder}`, ...(fields.get('plantInstanceId') ? [`plant:${fields.get('plantInstanceId')}:REMINDER`] : [])]
  const task = action === 'establish' ? 'PROPAGATION_CHECK' : action === 'bulk' ? ({ WATERING: 'WATER', FERTILIZING: 'FERTILIZE', REPOTTING: 'REPOT', OTHER: 'REMINDER' }[String(fields.get('careType'))] || String(fields.get('careType'))) : String(fields.get('taskType'))
  return [...new Set(fields.getAll('plantInstanceId').map(String).filter(id => fields.get(`skip:${id}`) !== 'on').map(id => `plant:${id}:${task}`))]
}
