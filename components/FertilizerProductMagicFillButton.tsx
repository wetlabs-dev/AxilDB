'use client'

import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { MagicFillConflictDialog } from '@/components/MagicFillConflictDialog'
import { applyMagicFillDraftToForm, getMagicFillConflictState, readMagicFillFormValues, type MagicFillApplyMode } from '@/lib/magic-fill'
import { cn } from '@/lib/utils'

const draftFields = [
  'name',
  'brand',
  'productType',
  'nitrogen',
  'phosphorus',
  'potassium',
  'calcium',
  'magnesium',
  'sulfur',
  'iron',
  'manganese',
  'zinc',
  'copper',
  'boron',
  'molybdenum',
  'chlorine',
  'nickel',
  'silicon',
  'guaranteedAnalysisNotes',
  'manufacturerRecommendedDilution',
  'manufacturerFeedAmount',
  'manufacturerFeedUnit',
  'manufacturerFeedWaterVolume',
  'manufacturerFeedWaterUnit',
  'manufacturerFeedNotes',
  'usageNotes',
  'sourceUrl',
  'sourceName',
  'dataConfidence',
  'aiModel',
  'aiFilledAt',
] as const

export function FertilizerProductMagicFillButton({ className = '' }: { className?: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<any>(null)
  const [applyMode, setApplyMode] = useState<MagicFillApplyMode>('FILL_MISSING')
  const [conflict, setConflict] = useState<ReturnType<typeof getMagicFillConflictState> | null>(null)

  function requestMagicFill() {
    const form = buttonRef.current?.form
    if (!form) return
    const state = getMagicFillConflictState(readMagicFillFormValues(form, draftFields), draftFields)
    if (state.hasConflict) setConflict(state)
    else void magicFill('FILL_MISSING')
  }

  async function magicFill(mode: MagicFillApplyMode) {
    setConflict(null)
    setApplyMode(mode)
    const form = buttonRef.current?.form
    if (!form) return
    const formData = new FormData(form)
    const collectionSlug = String(formData.get('collectionSlug') || '').trim()
    setLoading(true)
    setStatus('Searching product label data...')
    try {
      const response = await fetch('/api/ai/fertilizer-product-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionSlug,
          name: String(formData.get('name') || ''),
          brand: String(formData.get('brand') || ''),
          productType: String(formData.get('productType') || ''),
          applyMode: mode,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Fertilizer Magic Fill failed.')
      setDraft(result.draft || null)
      setStatus('Draft ready. Review before applying.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Fertilizer Magic Fill failed.')
    } finally {
      setLoading(false)
    }
  }

  function applyDraft() {
    const form = buttonRef.current?.form
    if (!form || !draft) return
    const outcome = applyMagicFillDraftToForm(form, draft, draftFields, applyMode)
    setStatus(`${outcome.appliedCount} field${outcome.appliedCount === 1 ? '' : 's'} applied${outcome.preservedCount ? `; ${outcome.preservedCount} preserved` : ''}. Review and save to keep it.`)
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={buttonRef}
          type="button"
          onClick={requestMagicFill}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#c4a86a]/60 bg-[#fff5d6] px-2.5 py-1.5 text-sm font-semibold text-[#6f541f] shadow-sm transition hover:bg-[#f7e6ae] disabled:cursor-wait disabled:opacity-70"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? 'Filling...' : 'Magic fill product'}
        </button>
        {status && <span className="text-xs text-stone-600">{status}</span>}
      </div>
      {draft && (
        <div className="rounded-lg border border-[#d6dfc9] bg-[#f7f4e8] p-3 text-sm text-stone-700">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2f6b45]">AI product draft</p>
          <p className="mt-1 font-semibold text-stone-900">{[draft.brand, draft.name].filter(Boolean).join(' ') || 'Fertilizer product'}</p>
          <p className="mt-1 text-xs text-stone-600">
            {[draft.dataConfidence, draft.sourceName, draft.sourceUrl].filter(Boolean).join(' · ')}
          </p>
          {draft.warnings && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">{draft.warnings}</p>}
          <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            <p>NPK: {[draft.nitrogen, draft.phosphorus, draft.potassium].map((value) => value ?? '-').join('-')}</p>
            {draft.manufacturerRecommendedDilution && <p>Label dilution: {draft.manufacturerRecommendedDilution}</p>}
            {draft.manufacturerFeedAmount && <p>Feed rate: {[draft.manufacturerFeedAmount, draft.manufacturerFeedUnit, 'per', draft.manufacturerFeedWaterVolume, draft.manufacturerFeedWaterUnit].filter(Boolean).join(' ')}</p>}
            {draft.guaranteedAnalysisNotes && <p className="sm:col-span-2">Notes: {draft.guaranteedAnalysisNotes}</p>}
          </div>
          <button type="button" onClick={applyDraft} className="mt-3 rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#28593b]">
            Apply draft to form
          </button>
        </div>
      )}
      <MagicFillConflictDialog
        open={Boolean(conflict)}
        populatedCount={conflict?.populatedCount || 0}
        emptyCount={conflict?.emptyCount || 0}
        onChoose={(mode) => void magicFill(mode)}
        onCancel={() => setConflict(null)}
        returnFocusRef={buttonRef}
      />
    </div>
  )
}
