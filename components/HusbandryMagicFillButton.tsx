'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { MagicFillConflictDialog } from '@/components/MagicFillConflictDialog'
import { husbandryFieldNames } from '@/lib/husbandry'
import { applyMagicFillDraftToForm, getMagicFillConflictState, readMagicFillFormValues, type MagicFillApplyMode } from '@/lib/magic-fill'
import { cn } from '@/lib/utils'
import { applyMagicSubstrateRecommendations, createSubstrateRecipe } from '@/app/substrate-actions'

const husbandryMagicFillFields = [...husbandryFieldNames, 'reviewNotes', 'aiModel'] as const
const fertilizerAssignmentFields = ['fertilizerRecipeId', 'fertilizationFrequency', 'fertilizationStrength', 'fertilizationSeasonalSchedule', 'fertilizationCadenceDays'] as const
const fertilizerDraftFields = [
  'createFertilizerRecipeDraft', 'newFertilizerRecipeName', 'newFertilizerRecipeDescription',
  'newFertilizerRecipeNpk', 'newFertilizerRecipeApplicationMethod', 'newFertilizerRecipeDilution',
  'newFertilizerRecipeStrength', 'newFertilizerRecipeFrequency', 'newFertilizerRecipeSeasonalNotes',
  'newFertilizerRecipeProductSuggestions', 'newFertilizerRecipeCautionNotes', ...fertilizerAssignmentFields,
] as const
const substrateRecommendationFields = ['existingSubstrateRecommendations', 'magicSubstrateRecommendationsJson', 'magicSubstrateApplyMode'] as const

function setControlValue(form: HTMLFormElement, name: string, value?: string | null) {
  if (value === undefined || value === null) return
  let field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!field) {
    field = document.createElement('input')
    field.type = 'hidden'
    field.name = name
    form.appendChild(field)
  }
  if (!field) return
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function cadenceFromText(value?: string | null) {
  const text = String(value || '').toLowerCase()
  const day = text.match(/(?:every|each|q)\s*(\d{1,3})\s*(?:day|d)\b/)
  if (day) return day[1]
  const week = text.match(/(?:every|each|q)\s*(\d{1,2})\s*(?:week|wk|w)\b/)
  if (week) return String(Number(week[1]) * 7)
  if (text.includes('weekly')) return '7'
  if (text.includes('biweekly') || text.includes('every other week')) return '14'
  if (text.includes('monthly')) return '30'
  return ''
}

export function HusbandryMagicFillButton({
  plant,
  className = '',
  autoSubmit = false,
  label = 'Magic Fill husbandry',
  substrateRecommendationCount = 0,
  collectionSlug,
}: {
  plant: any
  className?: string
  autoSubmit?: boolean
  label?: string
  substrateRecommendationCount?: number
  collectionSlug: string
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [fertilizerRecommendation, setFertilizerRecommendation] = useState<any>(null)
  const [substrateRecommendation, setSubstrateRecommendation] = useState<any>(null)
  const [draft, setDraft] = useState<any>(null)
  const [readyToSave, setReadyToSave] = useState(false)
  const [savingSubstrates, startSubstrateTransition] = useTransition()
  const router = useRouter()
  const [conflict, setConflict] = useState<(ReturnType<typeof getMagicFillConflictState> & { continueWith: (mode: MagicFillApplyMode) => void }) | null>(null)

  function ensureControls(form: HTMLFormElement, fields: readonly string[]) {
    for (const name of fields) {
      if (form.elements.namedItem(name)) continue
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      form.appendChild(input)
    }
  }

  function requestMode(fields: readonly string[], continueWith: (mode: MagicFillApplyMode) => void) {
    const form = buttonRef.current?.form
    if (!form) return
    ensureControls(form, fields)
    const state = getMagicFillConflictState(readMagicFillFormValues(form, fields), fields)
    if (state.hasConflict) setConflict({ ...state, continueWith })
    else continueWith('FILL_MISSING')
  }

  function requestMagicFill() {
    requestMode(husbandryMagicFillFields, magicFill)
  }

  async function magicFill(mode: MagicFillApplyMode) {
    setConflict(null)
    const form = buttonRef.current?.form
    if (!form) return
    const formData = new FormData(form)
    const collectionSlug = String(formData.get('collectionSlug') || '').trim()

    setLoading(true)
    setStatus('Drafting husbandry...')
    try {
      const response = await fetch('/api/ai/plant-husbandry-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionSlug, plant, applyMode: mode }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Husbandry fill failed.')

      const fields = result.fields || {}
      const fillDraft = {
        ...fields,
        reviewNotes: fields.reviewNotes || 'AI-generated draft. Review before relying on this care guide.',
      }
      const outcome = applyMagicFillDraftToForm(form, fillDraft, husbandryMagicFillFields, mode)
      setControlValue(form, 'reviewStatus', 'DRAFT')
      setDraft(fillDraft)
      setFertilizerRecommendation(result.fertilizerRecommendation || null)
      setSubstrateRecommendation(result.substrateRecommendation || null)
      if (autoSubmit) {
        setReadyToSave(true)
        setStatus(`${outcome.appliedCount} husbandry field${outcome.appliedCount === 1 ? '' : 's'} drafted. Review the preview, then save.`)
      } else {
        setStatus(`${outcome.appliedCount} husbandry field${outcome.appliedCount === 1 ? '' : 's'} drafted. Review before saving.`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Husbandry fill failed.')
    } finally {
      setLoading(false)
    }
  }

  function requestExistingRecipe() {
    requestMode(fertilizerAssignmentFields, applyExistingRecipe)
  }

  function applyExistingRecipe(mode: MagicFillApplyMode) {
    setConflict(null)
    const form = buttonRef.current?.form
    if (!form || !fertilizerRecommendation?.recommendedRecipeId) return
    ensureControls(form, fertilizerAssignmentFields)
    applyMagicFillDraftToForm(form, {
      fertilizerRecipeId: fertilizerRecommendation.recommendedRecipeId,
      fertilizationFrequency: fertilizerRecommendation.suggestedFrequency,
      fertilizationStrength: fertilizerRecommendation.suggestedStrength,
      fertilizationSeasonalSchedule: fertilizerRecommendation.seasonalNotes,
      fertilizationCadenceDays: cadenceFromText(fertilizerRecommendation.suggestedFrequency),
    }, fertilizerAssignmentFields, mode)
    setStatus('Fertilizer recipe selected. Review and save to apply.')
  }

  function requestNewRecipeDraft() {
    requestMode(fertilizerDraftFields, applyNewRecipeDraft)
  }

  function requestSubstrateRecommendations() {
    const form = buttonRef.current?.form
    if (!form || !substrateRecommendation?.substrateRecommendations?.length) return
    ensureControls(form, substrateRecommendationFields)
    setControlValue(form, 'existingSubstrateRecommendations', substrateRecommendationCount ? String(substrateRecommendationCount) : '')
    requestMode(substrateRecommendationFields, (mode) => {
      setConflict(null)
      const data = new FormData()
      data.set('collectionSlug', collectionSlug)
      data.set('plantDefinitionId', String(plant.id || ''))
      data.set('recommendationsJson', JSON.stringify(substrateRecommendation.substrateRecommendations))
      data.set('applyMode', mode)
      startSubstrateTransition(async () => {
        try {
          const result = await applyMagicSubstrateRecommendations(data)
          setStatus(`${result.saved} substrate recommendation${result.saved === 1 ? '' : 's'} saved.`)
          router.refresh()
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Substrate recommendations could not be saved.')
        }
      })
    })
  }

  function applyNewRecipeDraft(mode: MagicFillApplyMode) {
    setConflict(null)
    const form = buttonRef.current?.form
    const draft = fertilizerRecommendation?.newRecipeDraft
    if (!form || !draft) return
    ensureControls(form, fertilizerDraftFields)
    applyMagicFillDraftToForm(form, {
      createFertilizerRecipeDraft: 'on',
      newFertilizerRecipeName: draft.name || fertilizerRecommendation.recommendedRecipeName || 'Fertilizer recipe draft',
      newFertilizerRecipeDescription: fertilizerRecommendation.reasoning,
      newFertilizerRecipeNpk: draft.targetNpkOrStyle,
      newFertilizerRecipeApplicationMethod: draft.applicationMethod,
      newFertilizerRecipeDilution: draft.dilutionOrStrength,
      newFertilizerRecipeStrength: fertilizerRecommendation.suggestedStrength || draft.dilutionOrStrength,
      newFertilizerRecipeFrequency: fertilizerRecommendation.suggestedFrequency || draft.suggestedFrequency,
      newFertilizerRecipeSeasonalNotes: fertilizerRecommendation.seasonalNotes,
      newFertilizerRecipeProductSuggestions: draft.productTypeSuggestions,
      newFertilizerRecipeCautionNotes: draft.cautionNotes,
      fertilizationFrequency: fertilizerRecommendation.suggestedFrequency || draft.suggestedFrequency,
      fertilizationStrength: fertilizerRecommendation.suggestedStrength || draft.dilutionOrStrength,
      fertilizationSeasonalSchedule: fertilizerRecommendation.seasonalNotes,
      fertilizationCadenceDays: cadenceFromText(fertilizerRecommendation.suggestedFrequency || draft.suggestedFrequency),
    }, fertilizerDraftFields, mode)
    setStatus('Fertilizer recipe draft queued. Save to create and link it.')
  }

  return (
    <div className={cn('grid min-w-0 justify-items-end gap-2', className)}>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {status && <span className="min-w-0 text-xs font-normal text-stone-600 md:text-right">{status}</span>}
        <button
          ref={buttonRef}
          type="button"
          onClick={requestMagicFill}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#c4a86a]/60 bg-[#fff5d6] px-2.5 py-1.5 text-sm font-semibold text-[#6f541f] shadow-sm transition hover:bg-[#f7e6ae] disabled:cursor-wait disabled:opacity-70"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? 'Filling...' : label}
        </button>
      </div>
      {autoSubmit && draft && (
        <details className="w-full max-w-xl rounded-lg border border-[#d6dfc9] bg-[#f7f4e8] p-3 text-left text-sm text-stone-700">
          <summary className="cursor-pointer font-semibold text-[#2f6b45]">Review Magic Fill draft</summary>
          <dl className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {husbandryFieldNames.filter((field) => draft[field]).map((field) => (
              <div key={field} className="rounded-md border border-stone-200 bg-white/65 p-2">
                <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-stone-500">{field.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="mt-1 text-xs leading-5">{draft[field]}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {autoSubmit && readyToSave && (
        <button type="submit" className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#28593b]">Save Magic Fill draft</button>
      )}
      {substrateRecommendation && (
        <div className="w-full max-w-xl rounded-lg border border-[#d6dfc9] bg-[#f7f4e8] p-3 text-left text-sm text-stone-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2f6b45]">Substrate recommendation</p>
          {substrateRecommendation.substrateRecommendations?.length > 0 ? <div className="mt-2 grid gap-2">{substrateRecommendation.substrateRecommendations.map((item: any) => <div key={item.recipeVersionId} className="rounded-md border border-stone-200 bg-white/65 p-2"><p className="font-semibold text-stone-900">{item.rank}. {item.displayName} · {String(item.suitability).toLowerCase().replaceAll('_', ' ')}</p>{item.reason && <p className="mt-1 text-xs">{item.reason}</p>}</div>)}</div> : <p className="mt-1">No existing collection recipe was confidently recommended.</p>}
          {substrateRecommendation.substrateRecommendations?.length > 0 && <button type="button" onClick={requestSubstrateRecommendations} disabled={savingSubstrates} className="mt-3 rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-65">{savingSubstrates ? 'Saving recommendations...' : 'Use these recommendations'}</button>}
          {substrateRecommendation.newRecipeSuggestion && <div className="mt-3 rounded-md border border-stone-200 bg-white/65 p-2"><p className="font-semibold text-stone-900">Suggested draft: {substrateRecommendation.newRecipeSuggestion.name}</p>{substrateRecommendation.newRecipeSuggestion.reason && <p className="mt-1 text-xs">{substrateRecommendation.newRecipeSuggestion.reason}</p>}<p className="mt-2 text-xs">{substrateRecommendation.newRecipeSuggestion.components.map((item: any) => `${item.percentByVolume}% ${item.componentName}`).join(' · ')}</p><div className="mt-2"><input type="hidden" name="collectionSlug" value={collectionSlug} /><input type="hidden" name="name" value={substrateRecommendation.newRecipeSuggestion.name} /><input type="hidden" name="description" value={substrateRecommendation.newRecipeSuggestion.reason || ''} /><input type="hidden" name="status" value="DRAFT" />{substrateRecommendation.newRecipeSuggestion.components.map((item: any) => <span key={item.componentId}><input type="hidden" name="substrateComponentId" value={item.componentId} /><input type="hidden" name="percentByVolume" value={item.percentByVolume} /><input type="hidden" name="componentNotes" value="" /></span>)}<button type="submit" formAction={createSubstrateRecipe} className="rounded-md border border-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-[#2f6b45]">Create recipe draft</button></div></div>}
        </div>
      )}
      {fertilizerRecommendation && !autoSubmit && (
        <div className="max-w-xl rounded-lg border border-[#d6dfc9] bg-[#f7f4e8] p-3 text-left text-sm text-stone-700 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2f6b45]">Fertilizer recommendation</p>
          <p className="mt-1 font-semibold text-stone-900">
            {fertilizerRecommendation.fertilizerRecommendationType === 'USE_EXISTING_RECIPE' && `Use ${fertilizerRecommendation.recommendedRecipeName || 'an existing recipe'}`}
            {fertilizerRecommendation.fertilizerRecommendationType === 'CREATE_NEW_RECIPE' && `Create ${fertilizerRecommendation.newRecipeDraft?.name || 'a fertilizer recipe draft'}`}
            {fertilizerRecommendation.fertilizerRecommendationType === 'NO_FERTILIZER_RECOMMENDED' && 'No fertilizer recommended'}
            {fertilizerRecommendation.fertilizerRecommendationType === 'UNCERTAIN' && 'Fertilizer guidance is uncertain'}
          </p>
          {fertilizerRecommendation.reasoning && <p className="mt-1">{fertilizerRecommendation.reasoning}</p>}
          {(fertilizerRecommendation.suggestedFrequency || fertilizerRecommendation.suggestedStrength || fertilizerRecommendation.seasonalNotes) && (
            <p className="mt-2 text-xs text-stone-600">
              {[fertilizerRecommendation.suggestedFrequency, fertilizerRecommendation.suggestedStrength, fertilizerRecommendation.seasonalNotes].filter(Boolean).join(' · ')}
            </p>
          )}
          {fertilizerRecommendation.newRecipeDraft && (
            <div className="mt-2 rounded-md border border-stone-200 bg-white/65 p-2 text-xs">
              {fertilizerRecommendation.newRecipeDraft.targetNpkOrStyle && <p><strong>Target:</strong> {fertilizerRecommendation.newRecipeDraft.targetNpkOrStyle}</p>}
              {fertilizerRecommendation.newRecipeDraft.productTypeSuggestions && <p><strong>Products:</strong> {fertilizerRecommendation.newRecipeDraft.productTypeSuggestions}</p>}
              {fertilizerRecommendation.newRecipeDraft.cautionNotes && <p><strong>Caution:</strong> {fertilizerRecommendation.newRecipeDraft.cautionNotes}</p>}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {fertilizerRecommendation.fertilizerRecommendationType === 'USE_EXISTING_RECIPE' && fertilizerRecommendation.recommendedRecipeId && (
              <button type="button" onClick={requestExistingRecipe} className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#28593b]">Use this recipe</button>
            )}
            {fertilizerRecommendation.fertilizerRecommendationType === 'CREATE_NEW_RECIPE' && fertilizerRecommendation.newRecipeDraft && (
              <button type="button" onClick={requestNewRecipeDraft} className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#28593b]">Create fertilizer recipe draft</button>
            )}
          </div>
        </div>
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
