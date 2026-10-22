'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collectionPath } from '@/lib/collection-path'
import { CareForecast } from '@/components/CareForecast'
import type { QuietDraft } from '@/lib/care-forecast-service'

type Rule = { active: boolean; description?: string | null; id: string; locationId?: string | null; name: string; quietType: string; dayOfWeek: number | null; date: string | null; startDate: string | null; endDate: string | null }
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const inputClass = 'min-w-0 max-w-full rounded border border-stone-300 bg-transparent p-2'
export function QuietDaysManager({ collectionSlug, locationId, readOnly = false }: { collectionSlug: string; locationId?: string; readOnly?: boolean }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [scope, setScope] = useState(locationId || '')
  const [selected, setSelected] = useState<number[]>([])
  const [draft, setDraft] = useState<QuietDraft>()
  const [editing, setEditing] = useState<Rule | null>(null)
  const [error, setError] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/care/forecast?collectionSlug=${encodeURIComponent(collectionSlug)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setRules(data.allQuietDays || data.quietDays); setLocations(data.locations); setTimezone(data.timezone)
      } catch (err) { setError(err instanceof Error ? err.message : 'Quiet Days unavailable.') }
    }
    void load(); window.addEventListener('axildb:care-saved', load)
    return () => window.removeEventListener('axildb:care-saved', load)
  }, [collectionSlug])
  useEffect(() => { setSelected(rules.filter(rule => rule.active && (rule.locationId || '') === scope && rule.quietType === 'WEEKLY_RECURRING').map(rule => rule.dayOfWeek!)) }, [rules, scope])
  const label = (id?: string | null) => id ? locations.find(location => location.id === id)?.name || 'Location' : 'Collection-wide · All locations'
  const format = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone }).format(new Date(value)) : ''
  const dateValue = (value: string | null) => value ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).format(new Date(value)) : ''
  const inherited = rules.filter(rule => rule.active && !rule.locationId)
  return <section className="space-y-4" aria-label="Quiet Days management">
    <h3 className="font-serif text-xl font-semibold">Quiet Days</h3>
    <p className="text-sm text-stone-600">Manage collection-wide and location-specific care-free days. Collection restrictions always apply. Location rules apply to directly assigned plants.</p>
    {error && <p role="alert">{error}</p>}
    {!locationId && <div className="flex flex-wrap gap-3 text-sm">{locations.map(location => <Link className="underline" key={location.id} href={collectionPath(collectionSlug, `/locations/${location.id}`)}>{location.name} · {rules.filter(rule => rule.active && rule.locationId === location.id && rule.quietType === 'WEEKLY_RECURRING').map(rule => weekdays[rule.dayOfWeek!].slice(0, 3)).join(', ') || 'Collection schedule'}{rules.some(rule => rule.locationId === location.id && rule.quietType !== 'WEEKLY_RECURRING') ? ' · Dates / ranges' : ''}</Link>)}</div>}
    <label className="flex flex-wrap items-center gap-2 text-sm">Scope <select aria-label="Scope" className={inputClass} value={scope} disabled={!!locationId} onChange={event => { setScope(event.target.value); setEditing(null) }}><option value="">Collection-wide · All locations</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
    {scope && <div className="rounded border border-stone-200 p-3 text-sm"><b>Inherited from collection</b><p>{inherited.length ? inherited.map(rule => rule.quietType === 'WEEKLY_RECURRING' ? `${weekdays[rule.dayOfWeek!]} · Every week` : `${rule.name} · ${format(rule.date || rule.startDate)}${rule.endDate ? ` – ${format(rule.endDate)}` : ''}`).join('; ') : 'No collection-wide restrictions.'}</p><p>Effective recurring days: {[1,2,3,4,5,6,0].filter(day => selected.includes(day) || inherited.some(rule => rule.quietType === 'WEEKLY_RECURRING' && rule.dayOfWeek === day)).map(day => weekdays[day]).join(', ') || 'None'}</p><Link className="underline" href={collectionPath(collectionSlug, '/collection-settings')}>Manage collection Quiet Days</Link></div>}
    <fieldset disabled={readOnly} className="space-y-2"><legend className="text-sm font-semibold">Recurring days</legend><div className="flex flex-wrap gap-2">{[1,2,3,4,5,6,0].map(day => <button key={day} type="button" aria-label={weekdays[day]} aria-pressed={selected.includes(day)} className={`${inputClass} ${selected.includes(day) ? 'bg-[#e8efdf] text-[#1f472f]' : ''}`} onClick={() => setSelected(old => old.includes(day) ? old.filter(value => value !== day) : [...old, day])}>{weekdays[day].slice(0,3)}</button>)}</div>{!readOnly && <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setDraft({ kind: 'weekly', locationId: scope || null, weekdays: selected })}>Preview recurring schedule</button>}</fieldset>
    {rules.some(rule => !rule.active && rule.quietType === 'WEEKLY_RECURRING') && <details className="text-sm"><summary>Inactive recurring rules</summary>{rules.filter(rule => !rule.active && rule.quietType === 'WEEKLY_RECURRING' && (!locationId || !rule.locationId || rule.locationId === locationId)).map(rule => <div key={rule.id} className="flex flex-wrap gap-3 py-2"><span>{label(rule.locationId)} · {rule.name} · {weekdays[rule.dayOfWeek!]}</span>{!readOnly && (!locationId || rule.locationId === locationId) && <><button type="button" className="underline" onClick={() => setDraft({ kind: 'create', id: rule.id, locationId: rule.locationId, name: rule.name, description: rule.description || '', quietType: 'WEEKLY_RECURRING', dayOfWeek: rule.dayOfWeek!, active: true })}>Enable</button><button type="button" className="underline" onClick={() => setDraft({ kind: 'remove', id: rule.id })}>Delete</button></>}</div>)}</details>}
    <div className="space-y-2"><h4 className="font-semibold">Upcoming dates and ranges</h4>{rules.filter(rule => rule.quietType !== 'WEEKLY_RECURRING' && (!locationId || !rule.locationId || rule.locationId === locationId)).sort((a,b) => (a.date || a.startDate || '').localeCompare(b.date || b.startDate || '')).map(rule => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"><div><b>{rule.name}</b>{!rule.active && ' · Inactive'}<p>{label(rule.locationId)} · {format(rule.date || rule.startDate)}{rule.endDate && ` – ${format(rule.endDate)}`}</p></div>{!readOnly && (!locationId || rule.locationId === locationId) && <div className="flex gap-3"><button type="button" className="underline" onClick={() => { setScope(rule.locationId || ''); setEditing(rule) }}>Edit</button><button type="button" className="underline" onClick={() => setDraft({ kind: 'remove', id: rule.id })}>Delete</button></div>}</div>)}</div>
    {!readOnly && <form key={editing?.id || 'new'} className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const fd = new FormData(event.currentTarget); setDraft({ kind: 'create', id: editing?.id, locationId: scope || null, name: String(fd.get('name') || ''), description: String(fd.get('description') || ''), active: fd.get('active') === 'on', quietType: fd.get('endDate') ? 'DATE_RANGE' : 'ONE_TIME', date: String(fd.get('date')), startDate: String(fd.get('date')), endDate: String(fd.get('endDate') || '') }) }}><h4 className="font-semibold sm:col-span-2">{editing ? 'Edit Quiet Day' : 'Add Quiet Day'}</h4><label className="grid gap-1 text-sm">Name (optional)<input className={inputClass} name="name" maxLength={100} defaultValue={editing?.name} /></label><label className="grid gap-1 text-sm">Date / range start<input className={inputClass} type="date" name="date" required defaultValue={dateValue(editing?.date || editing?.startDate || null)} /></label><label className="grid gap-1 text-sm">Range end (optional, inclusive)<input className={inputClass} type="date" name="endDate" defaultValue={dateValue(editing?.endDate || null)} /></label><label className="grid gap-1 text-sm">Notes (optional)<textarea className={inputClass} name="description" maxLength={2000} defaultValue={editing?.description || ""} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} />Active</label><div className="flex items-end gap-3"><button className="rounded border px-3 py-2 text-sm">Preview Quiet Day</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel edit</button>}</div></form>}
    {draft && <CareForecast key={JSON.stringify(draft)} collectionSlug={collectionSlug} initialDraft={draft} stayOnPage />}
  </section>
}
