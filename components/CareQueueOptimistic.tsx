'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormHTMLAttributes, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { CareQueueItem } from '@/lib/care-queue'
import { careOperationLocks, overlayCareItems, type CareOperation, type CareQueueAction } from '@/lib/care-queue-optimistic'
import { getCareQueueStore, type CareQueueStore } from '@/lib/care-queue-store'
import { conditionPriority, conditionFollowUpDays } from '@/lib/care-queue-view'
import { addCalendarDays, calendarDayIndexInTimeZone, parseDateLocal } from '@/lib/time'

type QueueContext = { store: CareQueueStore; items: CareQueueItem[]; authoritativeItems: CareQueueItem[]; operations: CareOperation[]; timezone?: string | null }
const Context = createContext<QueueContext | null>(null)
export function useCareQueue() {
  const context = useContext(Context)
  if (!context) throw new Error('Care actions require the queue provider.')
  return context
}
export function CareQueueProvider({ collectionSlug, userId, initialItems, snapshotAt, timezone, children }: { collectionSlug: string; userId: string; initialItems: CareQueueItem[]; snapshotAt: number; timezone?: string | null; children: ReactNode }) {
  const store = useMemo(() => getCareQueueStore(collectionSlug, userId), [collectionSlug, userId])
  const serverSnapshot = useMemo(() => ({ items: initialItems, operations: [] as CareOperation[], reconciliation: 0, notice: '' }), [initialItems])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot)
  const router = useRouter()
  useEffect(() => { store.seed(initialItems, snapshotAt) }, [store, initialItems, snapshotAt])
  useEffect(() => {
    const refresh = () => { void store.reconcile() }
    // Other pages also receive current counters and care history when the user returns.
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh) }
  }, [store, router])
  useEffect(() => {
    if (state.reconciliation > 0) router.refresh()
  }, [state.reconciliation, router])
  const authoritativeItems = state.items || initialItems
  const items = overlayCareItems(authoritativeItems, state.operations)
  return <Context.Provider value={{ store, items, authoritativeItems, operations: state.operations, timezone }}>
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{state.notice}</div>
    {state.operations.filter(op => op.message).map(op => <div key={op.operationId} role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><span>{op.message}</span><button type="button" className="min-h-10 px-2 font-semibold underline" onClick={() => store.retry(op.operationId)}>{op.status === 'uncertain' ? 'Check again' : 'Retry'}</button></div>)}
    {state.notice.includes('refresh is unavailable') && <p className="mb-3 rounded-md border border-stone-300 bg-white/70 p-3 text-sm">{state.notice} <button className="min-h-10 font-semibold underline" onClick={() => void store.reconcile()}>Refresh queue</button></p>}
    {children}
  </Context.Provider>
}

export function CareActionForm({ actionName, item, optimistic = true, children, ...props }: Omit<FormHTMLAttributes<HTMLFormElement>, 'action'> & { action?: string | ((fd: FormData) => void | Promise<void>); actionName: CareQueueAction; item?: CareQueueItem; optimistic?: boolean; children: ReactNode }) {
  const { store, authoritativeItems, operations, timezone } = useCareQueue()
  const formRef = useRef<HTMLFormElement>(null)
  const [submitted, setSubmitted] = useState<string>()
  const operation = operations.find(op => op.operationId === submitted)
  const hiddenBulk = actionName === 'bulk' && submitted && operation?.status !== 'failed' && operation?.status !== 'uncertain'
  const busy = item && operations.some(op => op.status !== 'failed' && op.locks.some(lock => careOperationLocks(actionName, fieldsForItem(item)).includes(lock)))
  return <form {...props} ref={formRef} aria-busy={Boolean(busy || operation?.status === 'pending')} onSubmit={event => {
    if (!optimistic) return
    event.preventDefault()
    if (hiddenBulk || item && store.locked(careOperationLocks(actionName, fieldsForItem(item)))) return
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const fd = new FormData(form)
    if (item?.plantInstanceId && !fd.has('plantInstanceId')) fd.set('plantInstanceId', item.plantInstanceId)
    const locks = careOperationLocks(actionName, fd)
    const keys = authoritativeItems.filter(candidate => {
      if (actionName === 'bulk') return locks.includes(`plant:${candidate.plantInstanceId}:${candidate.taskType}`) && candidate.dueAt <= new Date() && !candidate.completedAt
      if (actionName === 'snooze') return locks.includes(`plant:${candidate.plantInstanceId}:${candidate.taskType}`)
      return candidate.key === item?.key
    }).map(candidate => candidate.key)
    let patch: Partial<CareQueueItem> | undefined
    if ((actionName === 'update' || actionName === 'attention') && String(fd.get('status') || '') !== 'RESOLVED' && item?.condition) {
      const followUpAt = parseDateLocal(String(fd.get('followUpAt') || ''), timezone || undefined) || null
      const now = new Date()
      const severity = String(fd.get('severity') || item.condition.severity)
      const status = String(fd.get('status') || item.condition.status)
      const dueAt = followUpAt || addCalendarDays(item.condition.observedAt > now ? item.condition.observedAt : now, conditionFollowUpDays(severity), timezone || undefined)
      const overdueDays = Math.max(0, calendarDayIndexInTimeZone(now, timezone || undefined) - calendarDayIndexInTimeZone(dueAt, timezone || undefined))
      patch = { condition: { ...item.condition, status, severity, followUpAt, updatedAt: now }, dueAt, overdueDays, priority: Math.min(999, conditionPriority(severity) + overdueDays * 9), reason: `${severity.toLowerCase()} ${item.condition.category.replaceAll('_', ' ').toLowerCase()} is ${status.toLowerCase()}.` }
    }
    const op: CareOperation = { operationId: actionName === 'bulk' ? String(fd.get('bulkCareBatchId') || crypto.randomUUID()) : crypto.randomUUID(), issuedAt: Date.now(), action: actionName, fields: Array.from(fd.entries()).filter((entry): entry is [string, string] => typeof entry[1] === 'string'), keys, locks, patch, status: 'pending' }
    const hadFocus = form.contains(document.activeElement)
    const current = form.closest<HTMLElement>('[data-care-key]')
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-care-key]')).filter(row => row.getClientRects().length && !keys.includes(row.dataset.careKey || ''))
    const next = rows.find(row => current && !!(current.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) || rows.at(-1)
    if (!store.start(op)) return
    setSubmitted(op.operationId)
    if (!patch && hadFocus) requestAnimationFrame(() => {
      const fallback = document.querySelector<HTMLElement>('[data-care-empty-focus]')
      ;(next?.getClientRects().length ? next : fallback)?.focus({ preventScroll: true })
    })
  }}>
    {hiddenBulk && <p className="rounded-md border border-stone-200 bg-white/70 p-4 text-sm">{!operation || operation.status === 'confirmed' ? 'Selected care recorded.' : 'Recording selected care… You can continue using the queue.'}</p>}
    <fieldset disabled={Boolean(busy || hiddenBulk)} hidden={Boolean(hiddenBulk)} style={{ display: hiddenBulk ? 'none' : undefined }} className="contents disabled:opacity-60">{item && actionName === 'complete' && <input type="hidden" name="queueCompletion" value="on" />}{children}</fieldset>
  </form>
}
function fieldsForItem(item: CareQueueItem) {
  const fd = new FormData()
  fd.set('taskType', item.taskType)
  if (item.plantInstanceId) fd.set('plantInstanceId', item.plantInstanceId)
  if (item.reminderId) fd.set('reminderId', item.reminderId)
  return fd
}
