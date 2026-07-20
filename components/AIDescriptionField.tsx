'use client'

import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { HelpTooltip } from '@/components/ui'
import { MagicFillConflictDialog } from '@/components/MagicFillConflictDialog'
import {
  applyMagicFillDraftToForm,
  getMagicFillConflictState,
  isMagicFillValueEmpty,
  readMagicFillFormValues,
  type MagicFillApplyMode,
} from '@/lib/magic-fill'
import { cn } from '@/lib/utils'
import { createMagicFillPlantTags } from '@/app/plant-tag-actions'

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

type GoverningBodyOption = {
  id: string
  name: string
  abbreviation?: string | null
}

type ConflictRequest = ReturnType<typeof getMagicFillConflictState> & {
  continueWith: (mode: MagicFillApplyMode) => void
}

const descriptionMagicFillFields = ['description'] as const
const definitionMagicFillFields = [
  'genus', 'species', 'hybridNotation', 'cultivarName', 'authority', 'cultivarRegistrationNumber',
  'governingBodyId', 'wikipediaUrl', 'inaturalistUrl', 'powoUrl', 'gbifUrl', 'description', 'aliasName',
] as const

function governingBodyId(bodies: GoverningBodyOption[], value?: string | null) {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  return bodies.find((body) =>
    body.id.toLowerCase() === normalized ||
    body.name.toLowerCase() === normalized ||
    body.abbreviation?.toLowerCase() === normalized
  )?.id
}

function normalizeAlias(alias: any) {
  return {
    name: String(alias?.name || '').trim(),
    aliasType: String(alias?.aliasType || 'SYNONYM').trim().toUpperCase(),
    confidence: String(alias?.confidence || 'UNCERTAIN').trim().toUpperCase(),
    source: String(alias?.source || '').trim(),
    notes: String(alias?.notes || '').trim(),
  }
}

export function AIDescriptionField({
  defaultValue,
  wrapperClassName = '',
}: {
  defaultValue?: string | null
  wrapperClassName?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [conflict, setConflict] = useState<ConflictRequest | null>(null)

  function requestDescription() {
    const textarea = textareaRef.current
    const form = textarea?.form
    if (!textarea || !form) return
    const state = getMagicFillConflictState(readMagicFillFormValues(form, descriptionMagicFillFields), descriptionMagicFillFields)
    if (state.hasConflict) {
      setConflict({ ...state, continueWith: generateDescription })
      return
    }
    void generateDescription('FILL_MISSING')
  }

  async function generateDescription(mode: MagicFillApplyMode) {
    setConflict(null)
    const textarea = textareaRef.current
    const form = textarea?.form
    if (!textarea || !form) return

    const formData = new FormData(form)
    const genus = String(formData.get('genus') || '').trim()
    const species = String(formData.get('species') || '').trim()
    const cultivarName = String(formData.get('cultivarName') || '').trim()
    const collectionSlug = String(formData.get('collectionSlug') || '').trim()

    if (!genus || !species) {
      setStatus('Enter genus and species first.')
      return
    }

    setLoading(true)
    setStatus('Generating description...')
    try {
      const response = await fetch('/api/ai/plant-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionSlug, genus, species, cultivarName, applyMode: mode }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Description generation failed.')

      const outcome = applyMagicFillDraftToForm(form, { description: result.description }, descriptionMagicFillFields, mode)
      setStatus(outcome.appliedCount ? 'Description draft added. Review before saving.' : 'Existing description preserved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Description generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <label className={cn('grid min-w-0 gap-1 text-sm font-medium text-stone-800', wrapperClassName)}>
      <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span>Description</span>
          <HelpTooltip>A short botanical summary for the plant definition. You can write this yourself or generate a draft from the genus, species, and cultivar.</HelpTooltip>
        </span>
        <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {status && <span className="min-w-0 text-xs font-normal text-stone-600 md:text-right">{status}</span>}
          <button
            ref={buttonRef}
            type="button"
            onClick={requestDescription}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#8fa58f]/50 bg-[#edf3e6] px-2 py-1 text-xs font-semibold text-[#2f6b45] shadow-sm transition hover:bg-[#d6dfc9]/80 disabled:cursor-wait disabled:opacity-70"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {loading ? 'Writing...' : 'AI draft'}
          </button>
        </span>
      </span>
      <textarea
        ref={textareaRef}
        className={cn(control, 'min-h-20 min-w-0 max-w-full')}
        name="description"
        defaultValue={defaultValue ?? ''}
      />
      <MagicFillConflictDialog
        open={Boolean(conflict)}
        populatedCount={conflict?.populatedCount || 0}
        emptyCount={conflict?.emptyCount || 0}
        onChoose={(mode) => conflict?.continueWith(mode)}
        onCancel={() => setConflict(null)}
        returnFocusRef={buttonRef}
      />
    </label>
  )
}

export function AIMagicFillButton({
  governingBodies = [],
  className = '',
}: {
  governingBodies?: GoverningBodyOption[]
  className?: string
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [acquisitionDraft, setAcquisitionDraft] = useState<any>(null)
  const [tagDraft, setTagDraft] = useState<any>(null)
  const [selectedProposedTags, setSelectedProposedTags] = useState<Set<string>>(new Set())
  const [confirmProposedTags, setConfirmProposedTags] = useState(false)
  const [selectedAcquisitionFields, setSelectedAcquisitionFields] = useState<Record<string, boolean>>({
    desiredSpecimenSize: true, acquisitionResearchSummary: true, desiredLocationId: false,
  })
  const [conflict, setConflict] = useState<ConflictRequest | null>(null)

  function requestMode(fields: readonly string[], continueWith: (mode: MagicFillApplyMode) => void) {
    const form = buttonRef.current?.form
    if (!form) return
    const state = getMagicFillConflictState(readMagicFillFormValues(form, fields), fields)
    if (state.hasConflict) setConflict({ ...state, continueWith })
    else continueWith('FILL_MISSING')
  }

  function requestMagicFillDefinition() {
    requestMode(definitionMagicFillFields, magicFillDefinition)
  }

  async function magicFillDefinition(mode: MagicFillApplyMode) {
    setConflict(null)
    const form = buttonRef.current?.form
    if (!form) return

    const formData = new FormData(form)
    const genus = String(formData.get('genus') || '').trim()
    const species = String(formData.get('species') || '').trim()
    const hybridNotation = String(formData.get('hybridNotation') || '').trim()
    const cultivarName = String(formData.get('cultivarName') || '').trim()
    const collectionSlug = String(formData.get('collectionSlug') || '').trim()

    if (!genus || !species) {
      setStatus('Enter genus and species first.')
      return
    }

    setLoading(true)
    setStatus('Researching plant definition...')
    try {
      const response = await fetch('/api/ai/plant-definition-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionSlug, genus, species, hybridNotation, cultivarName, governingBodies, applyMode: mode }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Magic fill failed.')

      const fields = result.fields || {}
      const aliases = Array.isArray(fields.aliases) ? fields.aliases.map(normalizeAlias).filter((alias: any) => alias.name) : []
      const draft = {
        genus: fields.genus,
        species: fields.species?.toLowerCase(),
        hybridNotation: fields.hybridNotation,
        cultivarName: fields.cultivarName,
        authority: fields.authority,
        cultivarRegistrationNumber: fields.cultivarRegistrationNumber,
        governingBodyId: governingBodyId(governingBodies, fields.governingBody),
        wikipediaUrl: fields.wikipediaUrl,
        inaturalistUrl: fields.inaturalistUrl,
        powoUrl: fields.powoUrl,
        gbifUrl: fields.gbifUrl,
        description: fields.description,
      }
      const outcome = applyMagicFillDraftToForm(form, draft, definitionMagicFillFields, mode)
      const currentAliases = readMagicFillFormValues(form, ['aliasName']).aliasName
      const shouldApplyAliases = mode === 'REPLACE_ALL' || isMagicFillValueEmpty(currentAliases)
      if (shouldApplyAliases && Array.isArray(fields.aliases)) window.dispatchEvent(new CustomEvent('axildb:replace-aliases', { detail: { form, aliases } }))
      setAcquisitionDraft(fields.acquisitionPlan || null)
      setTagDraft({ existing: fields.suggestedTags || [], proposed: fields.newTagSuggestions || [] })
      setSelectedProposedTags(new Set())
      setConfirmProposedTags(false)
      const aliasStatus = shouldApplyAliases && aliases.length ? ` and ${aliases.length} alias${aliases.length === 1 ? '' : 'es'}` : ''
      setStatus(`Magic fill applied ${outcome.appliedCount} field${outcome.appliedCount === 1 ? '' : 's'}${aliasStatus}. Review before saving.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Magic fill failed.')
    } finally {
      setLoading(false)
    }
  }

  function requestAcquisitionDraft() {
    const selectedFields = Object.entries(selectedAcquisitionFields).filter(([, selected]) => selected).map(([field]) => field)
    requestMode(selectedFields, applyAcquisitionDraft)
  }

  function applySuggestedTags() {
    const form = buttonRef.current?.form
    if (!form || !tagDraft?.existing?.length) return
    window.dispatchEvent(new CustomEvent('axildb:add-plant-tags', { detail: { form, tagIds: tagDraft.existing.map((item: any) => item.tagId), source: 'MAGIC_FILL' } }))
    setStatus(`${tagDraft.existing.length} suggested tag${tagDraft.existing.length === 1 ? '' : 's'} selected. Review before saving.`)
  }

  async function createProposedTags() {
    const form = buttonRef.current?.form
    if (!form) return
    const selected = tagDraft.proposed.filter((item: any) => selectedProposedTags.has(item.name))
    if (!selected.length) return
    setLoading(true)
    setStatus('Creating private tag drafts...')
    try {
      const fd = new FormData()
      fd.set('collectionSlug', String(new FormData(form).get('collectionSlug') || ''))
      fd.set('suggestions', JSON.stringify(selected))
      const created = await createMagicFillPlantTags(fd)
      window.dispatchEvent(new CustomEvent('axildb:add-plant-tags', { detail: { form, tagIds: created.map((tag) => tag.id), tags: created, source: 'MAGIC_FILL' } }))
      setTagDraft((current: any) => ({ ...current, proposed: current.proposed.filter((item: any) => !selectedProposedTags.has(item.name)) }))
      setSelectedProposedTags(new Set())
      setConfirmProposedTags(false)
      setStatus(`${created.length} private tag draft${created.length === 1 ? '' : 's'} created and selected. Review the definition before saving.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The proposed tags could not be created.')
    } finally {
      setLoading(false)
    }
  }

  function applyAcquisitionDraft(mode: MagicFillApplyMode) {
    setConflict(null)
    const form = buttonRef.current?.form
    if (!form || !acquisitionDraft) return
    const selectedFields = Object.entries(selectedAcquisitionFields).filter(([, selected]) => selected).map(([field]) => field)
    const outcome = applyMagicFillDraftToForm(form, {
      desiredSpecimenSize: acquisitionDraft.desiredSpecimenSize,
      acquisitionResearchSummary: acquisitionDraft.researchSummary,
      desiredLocationId: acquisitionDraft.suggestedLocationId,
    }, selectedFields, mode)
    setStatus(`${outcome.appliedCount} acquisition suggestion${outcome.appliedCount === 1 ? '' : 's'} applied. Review before saving.`)
  }

  return (
    <div className={cn('grid min-w-0 gap-2', className)}>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {status && <span className="min-w-0 text-xs font-normal text-stone-600 md:text-right">{status}</span>}
        <button
        ref={buttonRef}
        type="button"
        onClick={requestMagicFillDefinition}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#c4a86a]/60 bg-[#fff5d6] px-2.5 py-1.5 text-sm font-semibold text-[#6f541f] shadow-sm transition hover:bg-[#f7e6ae] disabled:cursor-wait disabled:opacity-70"
      >
        <Sparkles className="h-4 w-4" />
        {loading ? 'Filling...' : 'Magic fill'}
        </button>
      </div>
      {tagDraft && (tagDraft.existing.length > 0 || tagDraft.proposed.length > 0) && <div className="mt-2 rounded-md border border-[#b7caa9] bg-[#f5f8ef] p-3 text-xs text-stone-700">
        <p className="font-bold text-[#2f6b45]">Suggested tags</p>
        {tagDraft.existing.map((item: any) => <p key={item.tagId} className="mt-1"><strong>{item.tagName}</strong> · {Math.round(item.confidence * 100)}% · {item.reason}</p>)}
        {tagDraft.proposed.map((item: any) => <label key={item.name} className="mt-2 flex items-start gap-2 rounded border border-[#c7d8bd] bg-white/60 p-2">
          <input type="checkbox" className="mt-0.5" checked={selectedProposedTags.has(item.name)} onChange={(event) => setSelectedProposedTags((current) => { const next = new Set(current); event.target.checked ? next.add(item.name) : next.delete(item.name); return next })} />
          <span><strong>Proposed: {item.name}</strong> · {Math.round(item.confidence * 100)}% · {item.reason}<span className="mt-0.5 block text-stone-500">Creates a private collection tag; it will not be public unless you enable that later.</span></span>
        </label>)}
        {tagDraft.existing.length > 0 && <button type="button" onClick={applySuggestedTags} className="mt-2 rounded-md bg-[#2f6b45] px-3 py-1.5 font-semibold text-white">Apply existing tag suggestions</button>}
        {selectedProposedTags.size > 0 && !confirmProposedTags && <button type="button" onClick={() => setConfirmProposedTags(true)} className="ml-2 mt-2 rounded-md border border-[#2f6b45] px-3 py-1.5 font-semibold text-[#2f6b45]">Review new tag creation</button>}
        {confirmProposedTags && <div className="mt-2 rounded-md border border-[#c4a86a] bg-[#fff9e8] p-2"><p className="font-semibold">Create {selectedProposedTags.size} private collection tag{selectedProposedTags.size === 1 ? '' : 's'} and select them for this definition?</p><div className="mt-2 flex gap-2"><button type="button" disabled={loading} onClick={createProposedTags} className="rounded-md bg-[#2f6b45] px-3 py-1.5 font-semibold text-white">Confirm create and select</button><button type="button" onClick={() => setConfirmProposedTags(false)} className="rounded-md border border-stone-300 px-3 py-1.5 font-semibold">Cancel</button></div></div>}
      </div>}
      {acquisitionDraft && (
        <section className="rounded-lg border border-[#c7d8bd] bg-[#f7f8ee] p-3 text-left text-sm text-stone-700">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2f6b45]">Acquisition planning draft</p><p className="mt-1 text-xs text-stone-600">{acquisitionDraft.confidence || 'Uncertain'} · review only · wishlist status and priority are never changed</p></div></div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {[['Cat safety', acquisitionDraft.catSafety], ['Difficulty', acquisitionDraft.difficulty], ['Suggested size', acquisitionDraft.desiredSpecimenSize], ['Approximate market range', acquisitionDraft.approximatePriceRange], ['Environment fit', acquisitionDraft.environmentSuitability], ['Sensitivities', acquisitionDraft.sensitivities], ['Location needs', acquisitionDraft.locationCharacteristics], ['Location compatibility', acquisitionDraft.locationCompatibility], ['Warnings', acquisitionDraft.warnings], ['Research summary', acquisitionDraft.researchSummary]].filter(([, value]) => value).map(([label, value]) => <div key={label} className="rounded-md border border-stone-200 bg-white/60 p-2"><dt className="text-[0.65rem] font-bold uppercase tracking-wide text-stone-500">{label}</dt><dd className="mt-1 leading-5">{value}</dd></div>)}
          </dl>
          {Array.isArray(acquisitionDraft.sources) && acquisitionDraft.sources.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{acquisitionDraft.sources.map((source: string) => <a key={source} href={source} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#2f6b45] underline">Source</a>)}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {[['desiredSpecimenSize', 'Desired size'], ['acquisitionResearchSummary', 'Research summary'], ['desiredLocationId', 'Suggested location']].map(([key, label]) => <label key={key} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={Boolean(selectedAcquisitionFields[key])} onChange={(event) => setSelectedAcquisitionFields((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
            <button type="button" onClick={requestAcquisitionDraft} className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white">Apply selected acquisition fields</button>
          </div>
        </section>
      )}
      <MagicFillConflictDialog
        open={Boolean(conflict)}
        populatedCount={conflict?.populatedCount || 0}
        emptyCount={conflict?.emptyCount || 0}
        onChoose={(mode) => conflict?.continueWith(mode)}
        onCancel={() => setConflict(null)}
        returnFocusRef={buttonRef}
      />
    </div>
  )
}
