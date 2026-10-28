'use client'
import { useState } from 'react'
import { PlantTagChip } from '@/components/PlantTagChip'
import { PlantTagFields } from '@/components/PlantTagFields'
import { plantTagConfiguration, plantTagSlug, tagCategoryLabel, type PlantTagConfiguration } from '@/lib/plant-tags'
import { cadenceActivities, cadenceLabel } from '@/lib/care-cadences'
import { createMagicFillPlantTags } from '@/app/plant-tag-actions'
import { approveMagicFillCadences } from '@/app/magic-fill-review-actions'

type Decision = { activity: string; status: string; interval: number | null; unit: string | null }
type Proposal = { id: string; activity: string; interval: number | null; unit: string | null; status: string; applicability: string; confidence: string; rationale: string; model?: string | null; researchedAt?: string; sourceReferences?: Array<{ title?: string; url?: string }>; jobId?: string | null; job?: { status: string } | null }
type CatalogTag = PlantTagConfiguration & { id: string; active?: boolean }
export type MagicFillReviewData = { fields: { suggestedTags?: any[]; newTagSuggestions?: any[] }; cadenceReview?: { definitionId?: string; proposals?: Proposal[]; current?: Decision[]; hasRecipe?: boolean; warning?: string }; tagCatalog?: CatalogTag[]; canApprove?: boolean }
const button = 'min-h-10 rounded-md bg-[#2f6b45] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50'
function decisionLabel(row?: Decision) {
  if (!row) return 'Not scheduled'
  if (row.status === 'NOT_APPLICABLE') return 'Not Applicable'
  return row.interval && row.unit ? cadenceLabel({ interval: row.interval, unit: row.unit }) : 'Not scheduled'
}
export function MagicFillReview({ data, form, onBusy }: { data: MagicFillReviewData; form: HTMLFormElement | null; onBusy: (value: boolean) => void }) {
  const collectionSlug = form ? String(new FormData(form).get('collectionSlug') || '') : ''
  const definitionId = data.cadenceReview?.definitionId || (form ? String(new FormData(form).get('id') || '') : '')
  return <div className="grid min-w-0 gap-3 text-left">
    {data.cadenceReview && <CadenceReview review={data.cadenceReview} collectionSlug={collectionSlug} definitionId={definitionId} canApprove={Boolean(data.canApprove)} onBusy={onBusy} />}
    <TagReview data={data} collectionSlug={collectionSlug} definitionId={definitionId} form={form} onBusy={onBusy} />
  </div>
}
function CadenceReview({ review, collectionSlug, definitionId, canApprove, onBusy }: { review: NonNullable<MagicFillReviewData['cadenceReview']>; collectionSlug: string; definitionId: string; canApprove: boolean; onBusy: (busy: boolean) => void }) {
  const proposals = review.proposals || []
  const [current, setCurrent] = useState(review.current || [])
  const [selected, setSelected] = useState(() => new Set(proposals.filter(p => p.status === 'PENDING' && p.confidence === 'HIGH' && ['RECOMMENDED', 'NOT_APPLICABLE'].includes(p.applicability) && !current.some(c => c.activity === p.activity) && (!p.jobId || p.job?.status === 'COMPLETED')).map(p => p.id)))
  const [applied, setApplied] = useState(new Set<string>()), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  async function apply() {
    if (busy) return
    setBusy(true); onBusy(true); setMessage('Applying selected care decisions…')
    try {
      const result = await approveMagicFillCadences({ collectionSlug, definitionId, selections: proposals.filter(p => selected.has(p.id)).map(p => ({ id: p.id, replace: current.some(c => c.activity === p.activity) })) })
      const saved = result.results.filter(row => row.result === 'APPROVED').map(row => row.id)
      setApplied(previous => new Set([...previous, ...saved])); setCurrent(result.current)
      setSelected(previous => new Set([...previous].filter(id => !saved.includes(id))))
      setMessage(result.results.map(row => `${cadenceActivities.find(a => a.activity === proposals.find(p => p.id === row.id)?.activity)?.label || 'Care decision'}: ${row.result === 'APPROVED' ? 'saved' : row.result}`).join('; '))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not confirm approval. Keep this review and retry to check the same recommendations.') }
    finally { setBusy(false); onBusy(false) }
  }
  return <section aria-label="Suggested care cadences" className="min-w-0 rounded-lg border border-[#c7d8bd] bg-[#f7f8ee] p-3 text-sm">
    <h3 className="font-semibold">Suggested care cadences</h3><p className="mt-1 text-xs text-stone-600">Review researched care intervals before applying them. Existing decisions stay unchanged unless you explicitly select a replacement.</p>
    {review.warning && <p role="alert" className="mt-2 text-amber-900">{review.warning}</p>}
    <div className="mt-2 grid gap-2 sm:grid-cols-2">{cadenceActivities.map(({ activity, label }) => {
      const p = proposals.find(row => row.activity === activity), existing = current.find(row => row.activity === activity)
      const actionable = p && ['RECOMMENDED', 'NOT_APPLICABLE'].includes(p.applicability) && p.status === 'PENDING' && (!p.jobId || p.job?.status === 'COMPLETED') && !(activity === 'FERTILIZING' && p.applicability === 'RECOMMENDED' && !review.hasRecipe)
      return <div key={activity} className="min-w-0 rounded border border-[#d6dfc9] bg-white/60 p-2">
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" aria-label={`${existing ? 'Replace existing' : 'Apply'} ${label.toLowerCase()} cadence`} disabled={!canApprove || !definitionId || busy || !actionable || applied.has(p?.id || '')} checked={Boolean(p && selected.has(p.id))} onChange={event => { if (!p) return; setSelected(previous => { const next = new Set(previous); event.target.checked ? next.add(p.id) : next.delete(p.id); return next }) }} /><span><strong>{label}</strong><span className="block text-xs text-stone-600">Current: {decisionLabel(existing)}</span><span className="block text-xs">{p ? p.applicability === 'NOT_APPLICABLE' ? 'Suggested: Not Applicable' : p.applicability === 'RECOMMENDED' && p.interval && p.unit ? `Suggested: ${cadenceLabel({ interval: p.interval, unit: p.unit })}` : 'Unresolved' : 'No recommendation — unchanged'}</span>{p && <span className="block text-xs">{p.confidence.toLowerCase()} confidence{applied.has(p.id) || p.status === 'APPROVED' ? ' · Saved' : existing && actionable ? ' · Explicit replacement' : ''}</span>}</span></label>
        {p && <p className="mt-1 text-xs text-stone-600">{p.rationale}</p>}
        {activity === 'FERTILIZING' && !review.hasRecipe && p?.applicability !== 'NOT_APPLICABLE' && <p className="mt-1 text-xs">Fertilizing cadence unavailable — assign an active fertilizer recipe first. <a className="underline" href="#husbandry">Manage husbandry recipe</a></p>}
        {p && <details className="mt-1 text-xs"><summary className="cursor-pointer">Research details</summary><p>{p.model || 'Research model not recorded'}{p.researchedAt ? ` · ${new Date(p.researchedAt).toLocaleDateString()}` : ''}</p>{Array.isArray(p.sourceReferences) && p.sourceReferences.filter(ref => ref.url && /^https?:\/\//i.test(ref.url)).map((ref, index) => <a key={index} className="mr-2 underline" href={ref.url} target="_blank" rel="noreferrer">{ref.title || 'Source'}</a>)}</details>}
      </div>
    })}</div>
    {!definitionId && <p className="mt-2 text-xs">Save this Plant Definition, then research again to review persistent cadence recommendations.</p>}
    {!canApprove && <p className="mt-2 text-xs">Editing care cadences requires collection gardener permission.</p>}
    <button type="button" className={`${button} mt-3`} disabled={busy || !canApprove || !definitionId || !selected.size} onClick={apply}>Apply selected care cadences ({selected.size})</button>
    <p role="status" className="mt-1 text-xs">{message}</p>
  </section>
}
function TagReview({ data, collectionSlug, definitionId, form, onBusy }: { data: MagicFillReviewData; collectionSlug: string; definitionId: string; form: HTMLFormElement | null; onBusy: (busy: boolean) => void }) {
  const catalog = data.tagCatalog || [], existing = data.fields.suggestedTags || []
  const [drafts, setDrafts] = useState(() => (data.fields.newTagSuggestions || []).map((row, index) => ({ key: `new-${index}`, config: plantTagConfiguration({ ...row, publicVisible: true }), confidence: Number(row.confidence || 0), reason: String(row.reason || '') })))
  const [selected, setSelected] = useState(new Set<string>()), [done, setDone] = useState(new Set<string>()), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const toggle = (key: string, checked: boolean) => setSelected(previous => { const next = new Set(previous); checked ? next.add(key) : next.delete(key); return next })
  if (!existing.length && !drafts.length) return null
  async function apply() {
    if (!form || busy) return
    const chosen = drafts.filter(row => selected.has(row.key)), chosenExisting = existing.filter(row => selected.has(row.tagId))
    if (!definitionId) {
      window.dispatchEvent(new CustomEvent('axildb:add-plant-tags', { detail: { form, tagIds: chosenExisting.map(row => row.tagId), source: 'MAGIC_FILL' } }))
      setMessage('Existing tags selected. Save the definition to assign them. Save before creating new tags.'); return
    }
    setBusy(true); onBusy(true); setMessage('Applying tag suggestions…')
    try {
      const fd = new FormData(); fd.set('collectionSlug', collectionSlug); fd.set('plantDefinitionId', definitionId); fd.set('suggestions', JSON.stringify(chosen.map(row => row.config))); fd.set('existingTagIds', JSON.stringify(chosenExisting.map(row => row.tagId)))
      const result = await createMagicFillPlantTags(fd)
      if (!Array.isArray(result)) throw new Error(result.error)
      const tags = result
      window.dispatchEvent(new CustomEvent('axildb:add-plant-tags', { detail: { form, tagIds: tags.map(tag => tag.id), tags, source: 'MAGIC_FILL' } }))
      setDrafts(previous => previous.map(row => { const persisted = selected.has(row.key) ? tags.find(tag => plantTagSlug(tag.name) === plantTagSlug(row.config.name)) : null; return persisted ? { ...row, config: plantTagConfiguration({ ...persisted }) } : row }))
      setDone(previous => new Set([...previous, ...selected])); setSelected(new Set()); setMessage(`${tags.length} tag${tags.length === 1 ? '' : 's'} saved and assigned.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not confirm tag approval. Your edits are preserved; retry safely.') }
    finally { setBusy(false); onBusy(false) }
  }
  return <section aria-label="Suggested plant tags" className="min-w-0 rounded-lg border border-[#c7d8bd] bg-[#f7f8ee] p-3 text-sm">
    <h3 className="font-semibold">Suggested plant tags</h3>
    {existing.length > 0 && <p className="mt-2 text-xs font-semibold">Existing tags — assign without changing their configuration</p>}
    {existing.map(row => { const tag = catalog.find(tag => tag.id === row.tagId) || { ...row, id: row.tagId, name: row.tagName, active: true }; return <label key={row.tagId} className="mt-2 flex items-start gap-2 rounded border border-[#d6dfc9] bg-white/60 p-2"><input type="checkbox" aria-label={`Assign ${tag.name}`} disabled={busy || !data.canApprove || done.has(row.tagId)} checked={selected.has(row.tagId)} onChange={event => toggle(row.tagId, event.target.checked)} /><span><PlantTagChip tag={tag} /> <span className="text-xs">{Math.round(Number(row.confidence || 0) * 100)}% · {row.reason}{done.has(row.tagId) ? ' · Saved' : ''}</span></span></label> })}
    {drafts.length > 0 && <p className="mt-2 text-xs font-semibold">New tags — configure before approval</p>}
    {drafts.map(row => {
      const match = catalog.find(tag => plantTagSlug(tag.name) === plantTagSlug(row.config.name))
      return <div key={row.key} className="mt-2 min-w-0 rounded border border-[#d6dfc9] bg-white/60 p-2">
        <label className="flex items-start gap-2"><input type="checkbox" aria-label={`Create or reuse ${row.config.name}`} disabled={busy || !data.canApprove || done.has(row.key) || !definitionId} checked={selected.has(row.key)} onChange={event => toggle(row.key, event.target.checked)} /><span><PlantTagChip tag={{ ...row.config, id: row.key, active: true }} /> <span className="text-xs">{Math.round(row.confidence * 100)}% · {tagCategoryLabel(row.config.category)} · {row.config.publicVisible ? 'Public' : 'Private'}{done.has(row.key) ? ' · Saved' : ''}</span><span className="block text-xs text-stone-600">{row.reason}</span></span></label>
        {match && <p className="mt-1 text-xs text-amber-900">Matches existing tag “{match.name}”. Approval reuses its saved appearance and visibility without modifying it.</p>}
        {!done.has(row.key) && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Configure {row.config.name}</summary><fieldset disabled={busy || done.has(row.key) || !data.canApprove} className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 md:grid-cols-4"><PlantTagFields compact tag={row.config} namePrefix={`magicTag.${row.key}.`} onChange={config => setDrafts(previous => previous.map(draft => draft.key === row.key ? { ...draft, config } : draft))} /></fieldset></details>}
      </div>
    })}
    {!definitionId && drafts.length > 0 && <p className="mt-2 text-xs">Save this Plant Definition before creating and assigning new tags.</p>}
    {!data.canApprove && <p className="mt-2 text-xs">Creating and assigning tags requires collection gardener permission.</p>}
    <a className="mt-2 block text-xs underline" href={`/c/${encodeURIComponent(collectionSlug)}/plant-tags`}>Manage Plant Tags</a>
    <button type="button" className={`${button} mt-2`} disabled={busy || !data.canApprove || !selected.size} onClick={apply}>Apply selected plant tags ({selected.size})</button>
    <p role="status" className="mt-1 text-xs">{message}</p>
  </section>
}
