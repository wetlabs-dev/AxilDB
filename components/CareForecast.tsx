'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { collectionPath } from '@/lib/collection-path'
import { Button, Card } from '@/components/ui'
import { careTaskLabel } from '@/lib/care-queue-view'
import type { CareTaskType } from '@/lib/care-queue'
import type { QuietDraft } from '@/lib/care-forecast-service'
import { addCalendarDays, dateInputValue, parseDateLocal, startOfDayInTimeZone } from '@/lib/time'
type Task = { key: string; title: string; taskType: string; href: string; dueAt: string; originalDueAt?: string; quietDayReason?: string; projected?: boolean; locationId?: string | null; locationName?: string | null }
type Day = { date: string; total: number; overdue: number; categories: Record<string, number>; quietDay: { id: string; name: string; quietType: string } | null; restrictions?: { id: string; name: string; locationId?: string | null }[]; tasks: Task[] }
type Forecast = { timezone: string; days: Day[]; canManage: boolean; quietDays: { id: string; name: string; quietType: string; locationId?: string | null }[]; locations: { id: string; name: string }[] }
type Preview = { careRisks?: { key: string; title: string; taskType: string; locationName?: string | null; date: string; reason: string }[]; hash: string; draft: QuietDraft; earlier: number; later: number; todayCount: number; wateringToday: number; tomorrow: boolean; days: Day[]; exceptions: { key: string; title: string; date: string; reason: string }[]; changes: { key: string; title: string; from: string; to: string; reason: string }[] }
export function CareForecast({ collectionSlug, initialDraft, stayOnPage = false }: { collectionSlug: string; initialDraft?: QuietDraft; stayOnPage?: boolean }) {
  const router = useRouter()
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [selected, setSelected] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/care/forecast?collectionSlug=${encodeURIComponent(collectionSlug)}`, { cache: 'no-store', signal })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    if (!signal?.aborted) { setForecast(result); setSelected(old => result.days.some((day: Day) => day.date === old) ? old : result.days[0].date) }
    return result as Forecast
  }, [collectionSlug])
  const propose = useCallback(async (draft: QuietDraft) => {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/care/forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'preview', collectionSlug, draft }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setPreview(result)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview Quiet Day.') }
    finally { setBusy(false) }
  }, [collectionSlug])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let refreshTimer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => { void load(controller.signal).catch(error => { if (!controller.signal.aborted) setMessage(error.message) }) }, 200)
    }
    const rollover = async () => {
      try {
        const result = await load(controller.signal)
        const midnight = addCalendarDays(startOfDayInTimeZone(new Date(), result.timezone), 1, result.timezone)
        timer = setTimeout(() => void rollover(), Math.min(2147483647, Math.max(1000, midnight.getTime() - Date.now() + 100)))
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Forecast unavailable.') }
    }
    void rollover()
    window.addEventListener('focus', refresh)
    window.addEventListener('axildb:care-saved', refresh)
    return () => { controller.abort(); clearTimeout(timer); clearTimeout(refreshTimer); window.removeEventListener('focus', refresh); window.removeEventListener('axildb:care-saved', refresh) }
  }, [load])
  useEffect(() => { if (initialDraft) void propose(initialDraft) }, [initialDraft, propose])
  async function confirm() {
    if (!preview) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/care/forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'commit', collectionSlug, draft: preview.draft, hash: preview.hash }) })
      const result = await response.json()
      if (!response.ok) {
        if (result.preview) setPreview(result.preview)
        throw new Error(result.error)
      }
      setPreview(null); setMessage(result.notice)
      await load(); if (initialDraft && !stayOnPage) router.replace(collectionPath(collectionSlug, '/care')); else router.refresh(); window.dispatchEvent(new Event('axildb:care-saved'))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to confirm Quiet Day.') }
    finally { setBusy(false) }
  }
  const visibleDays = forecast?.days.map(day => {
    if (!locationFilter) return day
    if (locationFilter === '__collection') return { ...day, restrictions: day.restrictions?.filter(rule => !rule.locationId) }
    const tasks = day.tasks.filter(task => task.locationId === locationFilter)
    const restrictions = day.restrictions?.filter(rule => !rule.locationId || rule.locationId === locationFilter) || []
    const categories: Record<string, number> = {}
    tasks.forEach(task => { categories[task.taskType] = (categories[task.taskType] || 0) + 1 })
    return { ...day, tasks, total: tasks.length, categories, overdue: tasks.filter(task => dateInputValue(task.dueAt, forecast!.timezone) < day.date).length, restrictions, quietDay: restrictions.length ? { ...restrictions[0], quietType: forecast!.quietDays.find(rule => rule.id === restrictions[0].id)?.quietType || '' } : null }
  })
  const day = visibleDays?.find(day => day.date === selected)
  const today = forecast?.days[0].date
  return <Card className="space-y-3" data-care-forecast>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-serif text-xl font-semibold">Care forecast</h3><span className="text-xs text-stone-600">Today + 6 days · {forecast?.timezone || 'Loading…'}</span></div>
    <p className="text-xs text-stone-600">Projected assessments assuming care is completed on its scheduled day. Check moisture before watering; actual care changes future projections.</p>
    {message && <p role="status" className="rounded border border-[#c7d8bd] p-2 text-sm">{message}</p>}
    {!forecast && <button type="button" className="text-sm underline" onClick={() => void load().catch(error => setMessage(error.message))}>Refresh forecast</button>}
    <label className="flex flex-wrap gap-2 text-sm">Location <select className="max-w-full rounded border bg-transparent p-1" value={locationFilter} onChange={event => setLocationFilter(event.target.value)}><option value="">All locations</option><option value="__collection">Collection-wide Quiet Days only</option>{forecast?.locations?.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
    <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Seven-day care forecast">
      {visibleDays?.map((day, index) => <button key={day.date} type="button" aria-pressed={selected === day.date} onClick={() => setSelected(day.date)} className={`min-w-[6.5rem] flex-1 rounded-lg border p-2 text-left ${selected === day.date ? 'border-[#2f6b45] bg-[#e8efdf] text-[#1f472f]' : 'border-stone-200 bg-white/50'}`}>
        <span className="block text-xs font-semibold">{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: forecast!.timezone }).format(parseDateLocal(day.date, forecast!.timezone))}</span>
        <b className="block text-2xl">{day.total}</b><span className="block text-xs">{index === 0 ? 'Today' : 'Projected'}</span>
        {day.quietDay && <span className="block text-xs font-semibold">Quiet Day{day.total ? ` · ${day.total} task(s)` : ''}</span>}
        {!day.quietDay && !!day.restrictions?.length && <span className="block text-xs">{new Set(day.restrictions.map(rule => rule.locationId)).size} location(s) quiet</span>}
        {day.overdue > 0 && <span className="block text-xs">{day.overdue} overdue</span>}
      </button>)}
    </div>
    {day && <details key={day.date} open className="rounded border border-stone-200 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">{day.date === today ? "Today's care" : `Projected care · ${day.date}`} · {day.total} item(s)</summary>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{Object.entries(day.categories).map(([type, count]) => <span key={type}>{careTaskLabel(type as CareTaskType)}: <b>{count}</b></span>)}{day.total === 0 && <span>No projected care.</span>}</div>
      {day.quietDay && <p className="mt-2 text-[#2f6b45]">{day.quietDay.name}{day.total ? ' · Outstanding work or required exceptions are never hidden.' : ''}</p>}
      {!!day.restrictions?.length && <ul className="mt-2 text-xs">{day.restrictions.map(rule => <li key={rule.id}>{rule.locationId ? forecast?.locations?.find(location => location.id === rule.locationId)?.name : 'Collection-wide'} · {rule.name}</li>)}</ul>}
      {forecast?.canManage && !locationFilter && <div className="my-3 flex flex-wrap gap-2">
        {!day.quietDay && <button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={() => void propose({ kind: 'set', date: day.date })}>Set as Quiet Day</button>}
        {day.quietDay && <button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={() => void propose({ kind: 'remove', id: day.quietDay!.id })}>Remove {day.quietDay.quietType === 'ONE_TIME' ? 'Quiet Day' : 'entire recurring/range rule'}</button>}
        {!day.quietDay && forecast.quietDays.some(quiet => quiet.quietType === 'ONE_TIME' && !quiet.locationId) && <label className="text-xs">Move a one-time Quiet Day here <select disabled={busy} value="" className="ml-1 max-w-full rounded border p-1" onChange={event => { if (event.target.value) void propose({ kind: 'set', date: day.date, moveId: event.target.value }) }}><option value="">Choose…</option>{forecast.quietDays.filter(quiet => quiet.quietType === 'ONE_TIME' && !quiet.locationId).map(quiet => <option key={quiet.id} value={quiet.id}>{quiet.name}</option>)}</select></label>}
      </div>}
      <ul className="mt-2 max-h-64 space-y-2 overflow-auto">{day.tasks.slice(0, 100).map(task => <li key={task.key} className="border-t border-stone-200 pt-2"><Link href={task.href} className="font-medium underline">{task.title}</Link><span className="ml-2 text-xs text-stone-600">{task.locationName && `${task.locationName} · `}{day.date === today && !task.projected ? 'Actionable today' : task.projected ? 'Conditional projection' : 'Scheduled future care'}</span>{task.originalDueAt && <span className="block text-xs">Originally {dateInputValue(task.originalDueAt, forecast!.timezone)}</span>}{task.quietDayReason && <p className="text-xs text-stone-600">{task.quietDayReason}</p>}</li>)}</ul>
      {day.tasks.length > 100 && <p className="mt-2 text-xs">Showing 100 of {day.total} projected tasks.</p>}
    </details>}
    {preview && <section role="dialog" aria-labelledby="quiet-preview-heading" className="space-y-3 rounded-lg border border-[#c7d8bd] bg-[#f5fbf0] p-3 text-sm">
      <h4 id="quiet-preview-heading" className="text-lg font-semibold">Review Quiet Day change</h4>
      {preview.tomorrow && <p className="font-semibold">Quiet Day tomorrow: some care may need to be completed today. {preview.wateringToday} watering assessment(s) move into today.</p>}
      <p>{preview.changes.length} affected · {preview.earlier} earlier · {preview.later} later · {preview.todayCount} needing attention today · {preview.exceptions.length} required exceptions.</p>
      <div className="flex flex-wrap gap-3">{preview.days.map(day => <span key={day.date}>{day.date}: <b>{day.total}</b>{day.quietDay ? ' · Quiet' : ''}</span>)}</div>
      <ul className="max-h-56 space-y-2 overflow-auto">{preview.changes.slice(0, 100).map(change => <li key={change.key}><b>{change.title}</b> · {change.from} → {change.to}<p className="text-xs text-stone-600">{change.reason}</p></li>)}</ul>
      {!!preview.careRisks?.length && <div role="alert" className="rounded border border-amber-300 p-3"><h5 className="font-semibold">Extended care interruption</h5><p>{new Set(preview.careRisks.map(item => item.title)).size} plant(s) may require attention during this closure. Arrange necessary care before confirming.</p><ul>{preview.careRisks.map(item => <li key={item.key}>{item.title} · {item.locationName} · {careTaskLabel(item.taskType as CareTaskType)} · proposed {item.date}</li>)}</ul></div>}
      {preview.exceptions.length > 0 && <p className="font-semibold">Extended care interruption or scheduling conflict: review the plants below and arrange necessary care. Tasks without a safe destination remain outstanding.</p>}
      {preview.exceptions.length > 0 && <details><summary>Required tasks that stay scheduled</summary>{preview.exceptions.slice(0, 100).map(item => <p key={item.key}>{item.title} · {item.date} · {item.reason}</p>)}</details>}
      <div className="flex gap-2"><Button disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving…' : 'Confirm Quiet Day change'}</Button><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={() => setPreview(null)}>Cancel</button></div>
    </section>}
  </Card>
}
