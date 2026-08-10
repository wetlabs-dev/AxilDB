'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { SOURCE_ROLES, provenanceLabel } from '@/lib/provenance'

type SourceOption = { id: string; name: string; sourceType: string }
type Row = { key: number; sourceId: string; role: string; notes: string; primary: boolean }

export function AcquisitionSourceChainFields({ sources, initialRows = [] }: { sources: SourceOption[]; initialRows?: Array<{ sourceId: string; role: string; notes?: string | null; isPrimary?: boolean }> }) {
  const seededRows = initialRows.map((row, index) => ({ key: index + 1, sourceId: row.sourceId, role: row.role, notes: row.notes || '', primary: Boolean(row.isPrimary) }))
  const [nextKey, setNextKey] = useState(seededRows.length + 1)
  const [rows, setRows] = useState<Row[]>(seededRows)
  const update = (key: number, changes: Partial<Row>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...changes } : row))
  const move = (index: number, direction: -1 | 1) => setRows((current) => {
    const target = index + direction
    if (target < 0 || target >= current.length) return current
    const next = [...current]
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })

  return (
    <fieldset className="grid gap-2 rounded-lg border border-stone-200 bg-white/45 p-3">
      <div>
        <legend className="font-semibold">Source chain</legend>
        <p className="text-xs text-stone-600">Who produced, propagated, bred, imported, or originally supplied this material? Leave empty when unknown.</p>
      </div>
      {rows.map((row, index) => (
        <div key={row.key} className="grid gap-2 rounded-md border border-stone-200 p-2 md:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)_auto] md:items-end">
          <label className="grid gap-1 text-sm font-medium">Source
            <select className="rounded-md border border-stone-300 bg-white px-3 py-2" name="sourceId" value={row.sourceId} onChange={(event) => update(row.key, { sourceId: event.target.value })} required>
              <option value="">Choose source</option>
              {sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {provenanceLabel(source.sourceType)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Role
            <select className="rounded-md border border-stone-300 bg-white px-3 py-2" name="sourceRole" value={row.role} onChange={(event) => update(row.key, { role: event.target.value })}>
              {SOURCE_ROLES.map((role) => <option key={role} value={role}>{provenanceLabel(role)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Relationship note
            <input className="rounded-md border border-stone-300 bg-white px-3 py-2" name="sourceNotes" value={row.notes} onChange={(event) => update(row.key, { notes: event.target.value })} />
          </label>
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-1 px-1 text-xs font-semibold"><input type="radio" name="primarySourceIndex" value={index} checked={row.primary} onChange={() => setRows((current) => current.map((item) => ({ ...item, primary: item.key === row.key })))} /> Primary</label>
            <button type="button" className="rounded border p-2" aria-label={`Move source ${index + 1} up`} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={15} /></button>
            <button type="button" className="rounded border p-2" aria-label={`Move source ${index + 1} down`} onClick={() => move(index, 1)} disabled={index === rows.length - 1}><ArrowDown size={15} /></button>
            <button type="button" className="rounded border p-2" aria-label={`Remove source ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><X size={15} /></button>
          </div>
        </div>
      ))}
      <button type="button" className="flex w-fit items-center gap-1 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold" onClick={() => { setRows((current) => [...current, { key: nextKey, sourceId: '', role: 'UNKNOWN', notes: '', primary: current.length === 0 }]); setNextKey((value) => value + 1) }}>
        <Plus size={15} /> Add source
      </button>
    </fieldset>
  )
}
