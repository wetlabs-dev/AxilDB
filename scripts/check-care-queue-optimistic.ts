import assert from 'node:assert/strict'
import { CareQueueStore, CareRequestError } from '../lib/care-queue-store'
import { careQueueSummary } from '../lib/care-queue-view'
import type { CareOperation, QueueSnapshot } from '../lib/care-queue-optimistic'
import type { CareQueueItem } from '../lib/care-queue'
const defer = <T>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const tick = async () => { await new Promise(resolve => setImmediate(resolve)) }
const item = (key: string): CareQueueItem => ({ key, taskType: 'WATER', source: 'derived', title: key, reason: 'original metadata', dueAt: new Date('2026-01-01'), priority: 100, overdueDays: 2, href: '/test', plantInstanceId: key })
const operation = (key: string): CareOperation => ({ operationId: key, issuedAt: Date.now(), action: 'complete', fields: [], keys: [key], locks: [key], status: 'pending' })
async function main() {
  const mutations = new Map<string, ReturnType<typeof defer<void>>>()
  const snapshots: Array<ReturnType<typeof defer<QueueSnapshot>>> = []
  const store = new CareQueueStore({ mutate: op => { const pending = defer<void>(); mutations.set(op.operationId, pending); return pending.promise }, snapshot: () => { const pending = defer<QueueSnapshot>(); snapshots.push(pending); return pending.promise }, committed: async () => false })
  const originals = ['A', 'B', 'C', 'D', 'E'].map(item)
  store.seed(originals, 1)
  for (const key of ['A', 'B', 'C', 'D']) assert.equal(store.start(operation(key)), true)
  assert.deepEqual(store.visible(originals).map(row => row.key), ['E'], 'Removal occurs before any promise resolves.')
  assert.equal(careQueueSummary(store.visible(originals), new Date('2026-01-03')).today, 1)
  assert.equal(store.start(operation('A')), false, 'Same-item locking is synchronous.')
  store.seed(originals, 10)
  assert.deepEqual(store.visible(originals).map(row => row.key), ['E'], 'A stale server render cannot resurrect pending items.')
  mutations.get('C')!.resolve(); mutations.get('B')!.reject(new CareRequestError('Validation failed.', true)); await tick()
  assert.deepEqual(store.visible(originals).map(row => row.key), ['B', 'E'])
  assert.equal(store.visible(originals)[0].reason, 'original metadata')
  assert.equal(snapshots.length, 0, 'Revalidation waits for all in-flight operations.')
  mutations.get('A')!.resolve(); mutations.get('D')!.reject(new CareRequestError('Validation failed.', true)); await tick()
  assert.equal(snapshots.length, 1)
  assert.deepEqual(store.visible(originals).map(row => row.key), ['B', 'D', 'E'], 'Only failed operations restore, in original order.')
  assert.equal(store.start(operation('E')), true)
  snapshots[0].resolve({ items: originals, snapshotAt: 20 }); await tick()
  assert.deepEqual(store.visible(originals).map(row => row.key), ['B', 'D'], 'An overlapping stale snapshot is ignored.')
  mutations.get('E')!.resolve(); await tick()
  snapshots[1].resolve({ items: [item('B'), item('D')], snapshotAt: 30 }); await tick()
  assert.deepEqual(store.visible(originals).map(row => row.key), ['B', 'D'])
  assert.equal(store.getSnapshot().operations.filter(op => op.status === 'confirmed').length, 0)
  store.retry('B'); assert.deepEqual(store.visible(originals).map(row => row.key), ['D']); mutations.get('B')!.resolve(); await tick()
  snapshots[2].resolve({ items: [item('D')], snapshotAt: 40 }); await tick()
  void store.reconcile()
  store.seed([item('D'), item('NEW')], 100)
  snapshots[3].resolve({ items: [item('D')], snapshotAt: 50 }); await tick()
  assert.deepEqual(store.visible(originals).map(row => row.key), ['D', 'NEW'], 'An older background GET cannot overwrite newer server-rendered data.')
  snapshots[4].resolve({ items: [item('D'), item('NEW')], snapshotAt: 110 }); await tick()
  let attempts = 0
  const uncertain = new CareQueueStore({ mutate: async op => { assert.equal(op.operationId, 'U'); if (++attempts === 1) throw new TypeError('Response lost') }, committed: async () => false, snapshot: async () => ({ items: attempts === 1 ? [item('U')] : [], snapshotAt: Date.now() }) })
  uncertain.seed([item('U')], 1); uncertain.start(operation('U')); await tick()
  assert.equal(uncertain.getSnapshot().operations[0].status, 'uncertain')
  assert.equal(uncertain.locked(['U']), true)
  assert.equal(uncertain.visible([item('U')]).length, 1)
  uncertain.retry('U'); await tick(); assert.equal(attempts, 2); assert.equal(uncertain.visible([item('U')]).length, 0)
  const committed = new CareQueueStore({ mutate: async () => { throw new TypeError('Response lost after commit') }, committed: async () => true, snapshot: async () => ({ items: [], snapshotAt: Date.now() }) })
  committed.seed([item('Z')], 1); committed.start(operation('Z')); await tick()
  assert.equal(committed.visible([item('Z')]).length, 0, 'Lost success reconciles without restoring a completed occurrence.')
  console.log('Optimistic queue immediate removal, counters, rollback, concurrency, stale refresh, locking, and ambiguous retry checks passed.')
}
main()
