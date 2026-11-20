'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Droplets, Loader2, Sprout } from 'lucide-react'
import { CareQueuePhoto } from '@/components/CareQueuePhoto'
import { addCalendarDays, formatDate, startOfDayInTimeZone } from '@/lib/time'
import type { QuickCareState } from '@/lib/quick-care'
import type { CareQueueItem } from '@/lib/care-queue'

type Task = 'WATER' | 'FERTILIZE'
type Receipt = { operationId: string; issuedAt: number; fields: [string, string][] }
export function PlantInstanceQuickCare({ collectionSlug, plantInstanceId, initial, photo }: {
  collectionSlug: string; plantInstanceId: string; initial: QuickCareState
  photo: Pick<CareQueueItem, 'image' | 'plantName' | 'title' | 'plantInstanceId' | 'plantId' | 'locationPath'>
}) {
  const router = useRouter(), [state, setState] = useState(initial), [pending, setPending] = useState<Task | null>(null), [notice, setNotice] = useState(''), [error, setError] = useState(''), [repeat, setRepeat] = useState<Task | null>(null)
  const generation = useRef(0)
  const sending = useRef(false), receipt = useRef<Receipt | null>(null), dialog = useRef<HTMLDialogElement>(null), origin = useRef<HTMLButtonElement | null>(null)
  const base = `/api/care/quick?collectionSlug=${encodeURIComponent(collectionSlug)}&plantInstanceId=${encodeURIComponent(plantInstanceId)}`
  useEffect(() => setState(initial), [initial])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer) }, [notice])
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function sync() { if (sending.current) return; const version = generation.current; try { const r = await fetch(base, { cache: 'no-store', signal: controller.signal }); if (r.ok && !stopped && version === generation.current) setState(await r.json()) } catch { /* Mutation still checks canonical history when status refresh is unavailable. */ } }
    function rollover() { const next = addCalendarDays(startOfDayInTimeZone(new Date(), initial.timezone), 1, initial.timezone); timer = setTimeout(async () => { await sync(); if (!stopped) rollover() }, Math.max(1000, next.getTime() - Date.now() + 100)) }
    function visible() { if (document.visibilityState === 'visible') void sync() }
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible); rollover()
    return () => { stopped = true; controller.abort(); clearTimeout(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible) }
  }, [base, initial.timezone])
  useEffect(() => { if (repeat) dialog.current?.showModal(); else { dialog.current?.close(); origin.current?.focus({ preventScroll: true }) } }, [repeat])
  async function record(task: Task, intentional = false) {
    if (sending.current) return
    sending.current = true; generation.current++; setPending(task); setError(''); setNotice('')
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000)
    try {
      // Keep the receipt after ambiguous failures. Retry identical payload before any new action.
      if (!receipt.current) receipt.current = { operationId: crypto.randomUUID(), issuedAt: Date.now(), fields: [['collectionSlug', collectionSlug], ['plantInstanceId', plantInstanceId], ['taskType', task], ['quickCare', 'on'], ...(intentional ? [['intentionalRepeat', 'on'] as [string, string]] : [])] }
      const operation = receipt.current
      const response = await fetch('/api/care-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', ...operation }), signal: controller.signal })
      const result = await response.json()
      if (!response.ok) { if (response.status < 500) receipt.current = null; throw new Error(result.error || 'Care could not be recorded. Please try again.') }
      const actual = operation.fields.find(([key]) => key === 'taskType')![1] as Task
      setState(current => ({ ...current, [actual === 'WATER' ? 'watering' : 'fertilizing']: result.result.performedAt }))
      setNotice(result.result.skipped ? `${actual === 'WATER' ? 'Watering' : 'Fertilization'} was already recorded today.` : `${actual === 'WATER' ? 'Watering' : 'Fertilization'} recorded.`)
      receipt.current = null; setRepeat(null); router.refresh()
    } catch (reason) { setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : 'Could not confirm care. Retry to safely check the same action.') }
    finally { clearTimeout(timeout); sending.current = false; setPending(null) }
  }
  function button(task: Task) {
    const completed = task === 'WATER' ? state.watering : state.fertilizing, noun = task === 'WATER' ? 'watering' : 'fertilization', Icon = task === 'WATER' ? Droplets : Sprout
    const label = completed ? `${task === 'WATER' ? 'Watered' : 'Fertilized'} today at ${formatDate(completed, state.timezone, { month: undefined, day: undefined, year: undefined, hour: 'numeric', minute: '2-digit' })}` : `Record ${noun}`
    return <button type="button" disabled={Boolean(pending)} aria-label={label} title={label} aria-busy={pending === task} className={`ax-quick-care semantic-color-${task === 'WATER' ? 'ocean' : 'fern'}`} data-completed={Boolean(completed)} onClick={event => { if (receipt.current) { void record(task); return } if (completed) { origin.current = event.currentTarget; setRepeat(task) } else void record(task) }}>
      {pending === task ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
      {completed && <Check className="ax-quick-care-check" aria-hidden="true" />}
    </button>
  }
  return <div className="relative inline-flex items-center gap-1" role="group" aria-label="Plant care actions">
    {button('WATER')}{state.canFertilize && button('FERTILIZE')}
    <CareQueuePhoto compact item={photo} collectionSlug={collectionSlug} canUpload onSaved={() => { setNotice('Plant photograph added.'); router.refresh() }} />
    {(notice || error) && <div className="ax-quick-care-notice" role={error ? 'alert' : 'status'}>{error || notice}<button type="button" aria-label="Dismiss care message" onClick={() => { setError(''); setNotice('') }}>×</button>{error && receipt.current && <button type="button" disabled={Boolean(pending)} onClick={() => void record('WATER')}>Retry</button>}</div>}
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!pending) setRepeat(null) }} className="ax-quick-care-dialog m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border p-5 shadow-xl backdrop:bg-black/40" aria-label="Care already recorded">
      <p>This plant has already been {repeat === 'WATER' ? 'watered' : 'fertilized'} today.</p>
      <p className="mt-2 text-sm">Record another {repeat === 'WATER' ? 'watering' : 'fertilization'} only if you performed additional care.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button className="min-h-11 rounded border px-3" disabled={Boolean(pending)} onClick={() => repeat && void record(repeat, true)}>Record additional care</button><button className="min-h-11 rounded border px-3" disabled={Boolean(pending)} onClick={() => setRepeat(null)}>Cancel</button></div>
      {error && <p role="alert" className="mt-3">{error}</p>}
    </dialog>
  </div>
}
