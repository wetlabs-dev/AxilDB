'use client'

import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { husbandryFieldNames } from '@/lib/husbandry'
import { cn } from '@/lib/utils'

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
}: {
  plant: any
  className?: string
  autoSubmit?: boolean
  label?: string
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [fertilizerRecommendation, setFertilizerRecommendation] = useState<any>(null)

  async function magicFill() {
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
        body: JSON.stringify({ collectionSlug, plant }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Husbandry fill failed.')

      const fields = result.fields || {}
      for (const field of husbandryFieldNames) setControlValue(form, field, fields[field])
      setControlValue(form, 'reviewStatus', fields.reviewStatus || 'DRAFT')
      setControlValue(form, 'reviewNotes', fields.reviewNotes || 'AI-generated draft. Review before relying on this care guide.')
      setControlValue(form, 'aiModel', fields.aiModel)
      setFertilizerRecommendation(result.fertilizerRecommendation || null)
      if (autoSubmit) {
        setStatus('Draft added. Saving...')
        form.requestSubmit()
      } else {
        setStatus('Draft added. Review before saving.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Husbandry fill failed.')
    } finally {
      setLoading(false)
    }
  }

  function applyExistingRecipe() {
    const form = buttonRef.current?.form
    if (!form || !fertilizerRecommendation?.recommendedRecipeId) return
    setControlValue(form, 'fertilizerRecipeId', fertilizerRecommendation.recommendedRecipeId)
    setControlValue(form, 'fertilizationFrequency', fertilizerRecommendation.suggestedFrequency)
    setControlValue(form, 'fertilizationStrength', fertilizerRecommendation.suggestedStrength)
    setControlValue(form, 'fertilizationSeasonalSchedule', fertilizerRecommendation.seasonalNotes)
    setControlValue(form, 'fertilizationCadenceDays', cadenceFromText(fertilizerRecommendation.suggestedFrequency))
    setStatus('Fertilizer recipe selected. Review and save to apply.')
  }

  function applyNewRecipeDraft() {
    const form = buttonRef.current?.form
    const draft = fertilizerRecommendation?.newRecipeDraft
    if (!form || !draft) return
    setControlValue(form, 'createFertilizerRecipeDraft', 'on')
    setControlValue(form, 'newFertilizerRecipeName', draft.name || fertilizerRecommendation.recommendedRecipeName || 'Fertilizer recipe draft')
    setControlValue(form, 'newFertilizerRecipeDescription', fertilizerRecommendation.reasoning)
    setControlValue(form, 'newFertilizerRecipeNpk', draft.targetNpkOrStyle)
    setControlValue(form, 'newFertilizerRecipeApplicationMethod', draft.applicationMethod)
    setControlValue(form, 'newFertilizerRecipeDilution', draft.dilutionOrStrength)
    setControlValue(form, 'newFertilizerRecipeStrength', fertilizerRecommendation.suggestedStrength || draft.dilutionOrStrength)
    setControlValue(form, 'newFertilizerRecipeFrequency', fertilizerRecommendation.suggestedFrequency || draft.suggestedFrequency)
    setControlValue(form, 'newFertilizerRecipeSeasonalNotes', fertilizerRecommendation.seasonalNotes)
    setControlValue(form, 'newFertilizerRecipeProductSuggestions', draft.productTypeSuggestions)
    setControlValue(form, 'newFertilizerRecipeCautionNotes', draft.cautionNotes)
    setControlValue(form, 'fertilizationFrequency', fertilizerRecommendation.suggestedFrequency || draft.suggestedFrequency)
    setControlValue(form, 'fertilizationStrength', fertilizerRecommendation.suggestedStrength || draft.dilutionOrStrength)
    setControlValue(form, 'fertilizationSeasonalSchedule', fertilizerRecommendation.seasonalNotes)
    setControlValue(form, 'fertilizationCadenceDays', cadenceFromText(fertilizerRecommendation.suggestedFrequency || draft.suggestedFrequency))
    setStatus('Fertilizer recipe draft queued. Save to create and link it.')
  }

  return (
    <div className={cn('grid min-w-0 justify-items-end gap-2', className)}>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {status && <span className="min-w-0 text-xs font-normal text-stone-600 md:text-right">{status}</span>}
        <button
          ref={buttonRef}
          type="button"
          onClick={magicFill}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#c4a86a]/60 bg-[#fff5d6] px-2.5 py-1.5 text-sm font-semibold text-[#6f541f] shadow-sm transition hover:bg-[#f7e6ae] disabled:cursor-wait disabled:opacity-70"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? 'Filling...' : label}
        </button>
      </div>
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
              <button type="button" onClick={applyExistingRecipe} className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#28593b]">Use this recipe</button>
            )}
            {fertilizerRecommendation.fertilizerRecommendationType === 'CREATE_NEW_RECIPE' && fertilizerRecommendation.newRecipeDraft && (
              <button type="button" onClick={applyNewRecipeDraft} className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#28593b]">Create fertilizer recipe draft</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
