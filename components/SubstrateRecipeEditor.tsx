'use client'

import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, X } from 'lucide-react'
import { createSubstrateRecipe, saveSubstrateRecipeDraft } from '@/app/substrate-actions'
import { SubstrateCompositionBar, SubstrateSwatch } from '@/components/SubstrateCompositionBar'
import type { SubstrateVisualSource } from '@/lib/substrate-visuals'

type ComponentOption = SubstrateVisualSource & { id: string; category: string; waterRetention?: string | null; aeration?: string | null }
type RecipeRow = { key: string; substrateComponentId: string; percentByVolume: string; notes: string }

const control = 'min-w-0 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] px-3 py-2 text-sm text-[var(--ax-text)]'

function SortableRow({ row, components, onChange, onRemove }: {
  row: RecipeRow
  components: ComponentOption[]
  onChange: (next: RecipeRow) => void
  onRemove: () => void
}) {
  const sortable = useSortable({ id: row.key })
  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className="grid gap-2 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 sm:grid-cols-[auto_minmax(11rem,1fr)_8rem_auto]"
    >
      <button type="button" className="inline-flex h-10 w-10 touch-none items-center justify-center rounded-md border border-[color:var(--ax-border)]" aria-label="Drag recipe component" {...sortable.attributes} {...sortable.listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <label className="grid min-w-0 gap-1 text-xs font-semibold">Component
        <select className={control} name="substrateComponentId" value={row.substrateComponentId} onChange={(event) => onChange({ ...row, substrateComponentId: event.target.value })} required>
          <option value="">Choose component</option>
          {components.map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold">Percent by volume
        <span className="flex items-center gap-1"><input className={`${control} w-full`} name="percentByVolume" type="number" min="0.001" max="100" step="0.001" value={row.percentByVolume} onChange={(event) => onChange({ ...row, percentByVolume: event.target.value })} required /><span>%</span></span>
      </label>
      <button type="button" onClick={onRemove} className="inline-flex h-10 w-10 items-center justify-center self-end rounded-md border border-[color:var(--ax-border)] text-[#9a3f35]" aria-label="Remove recipe component"><X className="h-4 w-4" /></button>
      <label className="grid gap-1 text-xs font-semibold sm:col-start-2 sm:col-span-2">Component notes
        <input className={control} name="componentNotes" value={row.notes} onChange={(event) => onChange({ ...row, notes: event.target.value })} placeholder="Optional role or preparation note" />
      </label>
    </div>
  )
}

export function SubstrateRecipeEditor({ collectionSlug, components, recipe, version }: {
  collectionSlug: string
  components: ComponentOption[]
  recipe?: { id: string; name: string; description?: string | null; intendedUse?: string | null }
  version?: { id: string; versionNumber: number; changeSummary?: string | null; notes?: string | null; components: Array<{ id: string; substrateComponentId: string; percentByVolume: unknown; notes?: string | null }> }
}) {
  const [rows, setRows] = useState<RecipeRow[]>(() => version?.components.map((row) => ({ key: row.id, substrateComponentId: row.substrateComponentId, percentByVolume: String(row.percentByVolume), notes: row.notes || '' })) || [newRow('initial')])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const total = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.percentByVolume) || 0), 0), [rows])
  const delta = Math.abs(total - 100)
  const valid = delta <= 0.001
  const duplicate = rows.some((row, index) => row.substrateComponentId && rows.findIndex((candidate) => candidate.substrateComponentId === row.substrateComponentId) !== index)
  const previewItems = useMemo(() => rows.flatMap((row) => {
    const component = components.find((candidate) => candidate.id === row.substrateComponentId)
    return component && Number(row.percentByVolume) > 0 ? [{ id: row.key, percentByVolume: Number(row.percentByVolume), component }] : []
  }), [components, rows])

  function update(index: number, next: RecipeRow) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? next : row))
  }

  function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    setRows((current) => arrayMove(current, current.findIndex((row) => row.key === event.active.id), current.findIndex((row) => row.key === event.over?.id)))
  }

  const action = version ? saveSubstrateRecipeDraft : createSubstrateRecipe
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      {version && <input type="hidden" name="substrateRecipeVersionId" value={version.id} />}
      {!version && <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Recipe name<input className={control} name="name" defaultValue={recipe?.name || ''} required /></label>
        <label className="grid gap-1 text-sm font-semibold">Intended use<input className={control} name="intendedUse" defaultValue={recipe?.intendedUse || ''} /></label>
        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Description<textarea className={`${control} min-h-20`} name="description" defaultValue={recipe?.description || ''} /></label>
      </div>}
      <div className="grid gap-2">
        <div className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--ax-muted)]">Live composition</p>
          <SubstrateCompositionBar items={previewItems} mode="full" allocation />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
            {rows.map((row, index) => <SortableRow key={row.key} row={row} components={components} onChange={(next) => update(index, next)} onRemove={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} />)}
          </SortableContext>
        </DndContext>
        <button type="button" onClick={() => setRows((current) => [...current, newRow()])} className="inline-flex w-fit items-center gap-1 rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Add component</button>
      </div>
      <div className={`rounded-md border px-3 py-2 text-sm font-semibold ${valid ? 'border-[#78a875] bg-[#edf5e9] text-[#255537]' : 'border-amber-300 bg-amber-50 text-amber-900'}`} aria-live="polite">
        Total: {total.toFixed(3).replace(/\.000$/, '')}% · {valid ? 'Ready to activate' : total < 100 ? `${(100 - total).toFixed(3).replace(/\.000$/, '')}% remaining` : `${(total - 100).toFixed(3).replace(/\.000$/, '')}% over`}
      </div>
      {duplicate && <p className="text-sm font-semibold text-[#9a3f35]">A component appears more than once. Remove the duplicate before saving.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Change summary<input className={control} name="changeSummary" defaultValue={version?.changeSummary || ''} /></label>
        <label className="grid gap-1 text-sm font-semibold">Version notes<input className={control} name="notes" defaultValue={version?.notes || ''} /></label>
      </div>
      {!version && <label className="grid max-w-xs gap-1 text-sm font-semibold">Initial status<select className={control} name="status" defaultValue="DRAFT"><option value="DRAFT">Draft</option><option value="ACTIVE" disabled={!valid || duplicate}>Active (requires 100%)</option></select></label>}
      <button disabled={duplicate || rows.length === 0} className="w-fit rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{version ? `Save v${version.versionNumber} draft` : 'Create substrate recipe'}</button>
    </form>
  )
}

function newRow(key = crypto.randomUUID()): RecipeRow {
  return { key: `new-${key}`, substrateComponentId: '', percentByVolume: '', notes: '' }
}

export function SubstrateBatchCalculator({ components }: { components: Array<{ name: string; percentByVolume: unknown; component: ComponentOption }> }) {
  const [volume, setVolume] = useState('1')
  const [unit, setUnit] = useState('L')
  const amount = Number(volume) || 0
  return (
    <div className="grid gap-3 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-semibold">Batch volume<input className={`${control} w-28`} type="number" min="0" step="any" value={volume} onChange={(event) => setVolume(event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Unit<select className={control} value={unit} onChange={(event) => setUnit(event.target.value)}><option>mL</option><option>L</option><option>cups</option><option>quarts</option><option>gallons</option></select></label>
      </div>
      <div className="grid gap-1 text-sm">
        {components.map((row) => <p key={row.name} className="flex justify-between gap-3"><span className="inline-flex items-center gap-2"><SubstrateSwatch component={row.component} />{row.name}</span><strong>{(amount * Number(row.percentByVolume) / 100).toFixed(3).replace(/\.?0+$/, '')} {unit}</strong></p>)}
      </div>
      <p className="text-xs text-[var(--ax-muted)]">Calculator only; no component inventory is tracked.</p>
    </div>
  )
}
