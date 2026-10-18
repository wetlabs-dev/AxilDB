import { hydrateCareItems, overlayCareItems, type CareOperation, type QueueSnapshot } from '@/lib/care-queue-optimistic'
import type { CareQueueItem } from '@/lib/care-queue'

type Transport = { mutate: (operation: CareOperation) => Promise<void>; snapshot: () => Promise<QueueSnapshot>; committed: (operation: CareOperation) => Promise<boolean> }
export class CareRequestError extends Error {
  constructor(message: string, readonly definite = false) { super(message) }
}
export class CareQueueStore {
  private listeners = new Set<() => void>()
  private generation = 0
  private reconciling = false
  private reconciledAt = 0
  private state: { items?: CareQueueItem[]; operations: CareOperation[]; notice: string; reconciliation: number } = { operations: [], reconciliation: 0, notice: '' }
  constructor(private transport: Transport) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.state
  private publish() { this.state = { ...this.state, operations: [...this.state.operations] }; this.listeners.forEach(listener => listener()) }
  seed(items: CareQueueItem[], snapshotAt: number) {
    if (snapshotAt <= this.reconciledAt) return
    this.reconciledAt = snapshotAt
    this.generation++
    this.state.items = items
    this.publish()
  }
  visible(items: CareQueueItem[]) { return overlayCareItems(this.state.items || items, this.state.operations) }
  locked(locks: string[]) { return this.state.operations.some(op => op.status !== 'failed' && op.locks.some(lock => locks.includes(lock))) }
  start(operation: CareOperation) {
    if (this.locked(operation.locks)) return false
    this.state.operations = this.state.operations.filter(op => !op.locks.some(lock => operation.locks.includes(lock)))
    this.state.operations.push(operation)
    this.generation++
    this.state.notice = operation.action === 'bulk' ? 'Recording selected care…' : operation.action === 'snooze' ? 'Care snoozed.' : operation.action === 'update' || operation.action === 'attention' ? 'Care updated.' : 'Care marked complete.'
    this.publish()
    void this.perform(operation)
    return true
  }
  retry(operationId: string) {
    const op = this.state.operations.find(op => op.operationId === operationId)
    if (!op || op.status === 'pending' || op.status === 'confirmed') return
    op.status = 'pending'; op.message = undefined; this.generation++; this.publish()
    void this.perform(op)
  }
  private async perform(operation: CareOperation) {
    try {
      await this.transport.mutate(operation)
      operation.status = 'confirmed'
      this.state.notice = operation.action === 'bulk' ? 'Selected care recorded.' : 'Care action saved.'
    } catch (error) {
      if (error instanceof CareRequestError && error.definite) {
        operation.status = 'failed'
        operation.message = `${error.message} The item has been restored.`
      } else {
        // The response may have been lost after commit. Never retry with a new identity.
        let committed = false
        try { committed = await this.transport.committed(operation) } catch { /* Stay uncertain until a safe retry or later reconciliation. */ }
        operation.status = committed ? 'confirmed' : 'uncertain'
        operation.message = committed ? undefined : "Couldn't confirm this action. Check again to safely retry the same request."
      }
      console.warn('care_queue_recovery', { action: operation.action, operationId: operation.operationId, itemKeys: operation.keys, category: operation.status, durationMs: Date.now() - operation.issuedAt })
    }
    this.generation++; this.publish()
    void this.reconcile()
  }
  async reconcile() {
    if (this.reconciling || this.state.operations.some(op => op.status === 'pending')) return
    const generation = this.generation
    this.reconciling = true
    try {
      const snapshot = await this.transport.snapshot()
      if (generation !== this.generation || snapshot.snapshotAt < this.reconciledAt) return
      this.state.items = hydrateCareItems(snapshot.items)
      this.reconciledAt = snapshot.snapshotAt
      this.state.reconciliation++
      this.state.operations = this.state.operations.filter(op => op.status !== 'confirmed')
      this.publish()
    } catch {
      this.state.notice = 'Queue refresh is unavailable. Saved actions stay hidden until the next refresh.'
      this.publish()
    } finally {
      this.reconciling = false
      if (generation !== this.generation && !this.state.operations.some(op => op.status === 'pending')) void this.reconcile()
    }
  }
}

const stores = new Map<string, CareQueueStore>()
export function getCareQueueStore(collectionSlug: string, userId: string) {
  const key = `${userId}:${collectionSlug}`
  let store = stores.get(key)
  if (!store) {
    const query = new URLSearchParams({ collectionSlug })
    const read = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', redirect: 'error' })
      if (!response.ok) throw new Error('Queue refresh unavailable.')
      return response.json()
    }
    store = new CareQueueStore({
      mutate: async operation => {
        if (!navigator.onLine) throw new CareRequestError('You are offline. Reconnect before recording care.', true)
        const response = await fetch('/api/care-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: operation.operationId, issuedAt: operation.issuedAt, action: operation.action, fields: operation.fields }), redirect: 'error' })
        const result = await response.json()
        if (!response.ok) throw new CareRequestError(result.error || 'Unable to record care.', response.status >= 400 && response.status < 500)
      },
      snapshot: () => read(`/api/care-queue?${query}`),
      committed: async operation => (await read(`/api/care-queue?${query}&operationId=${encodeURIComponent(operation.operationId)}`)).committed,
    })
    stores.set(key, store)
  }
  return store
}
