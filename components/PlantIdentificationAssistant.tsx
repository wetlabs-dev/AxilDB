'use client'

import { useRef, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const control = 'rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-2.5 py-1.5 text-sm font-normal text-[var(--ax-text)] shadow-inner shadow-stone-200/30 outline-none transition placeholder:text-[var(--ax-muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--ax-surface-solid)] file:px-2 file:py-1 file:text-[var(--ax-text)] focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

type PlantIdSuggestion = {
  genus?: string | null
  species?: string | null
  hybridNotation?: string | null
  cultivarName?: string | null
  confidenceLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  confidenceExplanation?: string | null
  possibleAlternatives?: string[]
  suggestedAliases?: string[]
  suggestedDescription?: string | null
  warnings?: string[]
  suggestedReferences?: string[]
}

type ValidatedMatch = {
  id: string
  matchType?: 'LOCAL' | 'VALIDATED'
  genus: string
  species: string
  hybridNotation?: string | null
  cultivarName?: string | null
}

function setControlValue(form: HTMLFormElement, name: string, value?: string | null) {
  if (value === undefined || value === null) return
  const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!field) return
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function referenceField(url: string) {
  const normalized = url.toLowerCase()
  if (normalized.includes('wikipedia.org')) return 'wikipediaUrl'
  if (normalized.includes('inaturalist.org')) return 'inaturalistUrl'
  if (normalized.includes('powo.science.kew.org')) return 'powoUrl'
  if (normalized.includes('gbif.org')) return 'gbifUrl'
  return null
}

function capitalizeGenus(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return null
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function displayName(definition: ValidatedMatch) {
  return `${definition.genus} ${definition.hybridNotation ? `${definition.hybridNotation} ` : ''}${definition.species}${definition.cultivarName ? ` '${definition.cultivarName}'` : ''}`
}

function aliasesFromSuggestion(suggestion: PlantIdSuggestion) {
  return (suggestion.suggestedAliases || [])
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((name) => ({
      name,
      aliasType: 'COMMON_NAME',
      confidence: 'AI_DETERMINED',
      source: 'AxilDB ID My Plant',
      notes: suggestion.confidenceExplanation || 'AI-assisted identification draft.',
    }))
}

function confidenceBadge(level?: string) {
  if (level === 'HIGH') return 'border-[#b7caa9] bg-[#f4f8ed] text-[#2f6b45]'
  if (level === 'MEDIUM') return 'border-[#dfcc87] bg-[#fff8dc] text-[#6f541f]'
  return 'border-[#e3b8a9] bg-[#fff1ec] text-[#9a3f35]'
}

export function PlantIdentificationAssistant({
  collectionSlug,
  plantDefinitionId,
  className = '',
}: {
  collectionSlug: string
  plantDefinitionId?: string
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [suggestion, setSuggestion] = useState<PlantIdSuggestion | null>(null)
  const [matchedDefinition, setMatchedDefinition] = useState<ValidatedMatch | null>(null)
  const [logId, setLogId] = useState<string | null>(null)
  const [saveAsTypeImage, setSaveAsTypeImage] = useState(false)

  async function suggestId() {
    const root = rootRef.current
    if (!root) return
    const description = (root.querySelector('[name="plantIdDescription"]') as HTMLTextAreaElement | null)?.value.trim() || ''
    const knownNames = (root.querySelector('[name="plantIdKnownNames"]') as HTMLInputElement | null)?.value.trim() || ''
    const image = fileRef.current?.files?.[0]
    if (!description && !knownNames && !image) {
      setStatus('Add a description, a known name, or a clear plant photo first.')
      return
    }

    const body = new FormData()
    body.set('collectionSlug', collectionSlug)
    body.set('description', description)
    body.set('knownNames', knownNames)
    if (image) body.set('image', image)

    setLoading(true)
    setStatus('Asking AxilDB to suggest a likely ID...')
    setSuggestion(null)
    setMatchedDefinition(null)
    setLogId(null)
    try {
      const response = await fetch('/api/ai/plant-identification', { method: 'POST', body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Plant identification failed.')
      setSuggestion(result.suggestion)
      setMatchedDefinition(result.matchedDefinition || result.validatedMatch || null)
      setLogId(result.logId || null)
      setStatus(result.logId ? 'Suggestion ready and saved to ID history. Review before applying.' : 'Suggestion ready. Review before applying.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Plant identification failed.')
    } finally {
      setLoading(false)
    }
  }

  async function uploadTypeImage(form: HTMLFormElement) {
    const image = fileRef.current?.files?.[0]
    if (!plantDefinitionId || !image || !saveAsTypeImage) return

    const photoForm = new FormData()
    photoForm.set('photo', image)
    photoForm.set('entityType', 'PLANT_DEFINITION')
    photoForm.set('entityId', plantDefinitionId)
    photoForm.set('collectionSlug', collectionSlug)
    photoForm.set('caption', 'Uploaded for AI identification')
    photoForm.set('source', 'USER_ID_IMAGE')
    photoForm.set('back', window.location.pathname + window.location.search)
    await fetch('/api/photos', { method: 'POST', body: photoForm })
    setStatus('Suggestion applied. Type image uploaded; refresh if it does not appear immediately.')
  }

  async function applySuggestion() {
    const form = rootRef.current?.closest('form')
    if (!form || !suggestion) return
    setControlValue(form, 'genus', capitalizeGenus(suggestion.genus))
    setControlValue(form, 'species', suggestion.species?.toLowerCase())
    setControlValue(form, 'hybridNotation', suggestion.hybridNotation)
    setControlValue(form, 'cultivarName', suggestion.cultivarName)
    setControlValue(form, 'confidence', 'AI_DETERMINED')
    setControlValue(form, 'description', suggestion.suggestedDescription)
    for (const reference of suggestion.suggestedReferences || []) {
      const field = referenceField(reference)
      if (field) setControlValue(form, field, reference)
    }
    const aliases = aliasesFromSuggestion(suggestion)
    if (aliases.length) window.dispatchEvent(new CustomEvent('axildb:replace-aliases', { detail: { form, aliases } }))
    setStatus(`Suggestion applied${aliases.length ? ` with ${aliases.length} alias${aliases.length === 1 ? '' : 'es'}` : ''}. Review before saving.`)
    if (logId) {
      await fetch(`/api/ai/plant-identification/logs/${encodeURIComponent(logId)}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionSlug, plantDefinitionId }),
      }).catch(() => null)
    }
    await uploadTypeImage(form)
  }

  return (
    <div ref={rootRef} className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#8fa58f]/50 bg-[#edf3e6] px-2.5 py-1.5 text-sm font-semibold text-[#2f6b45] shadow-sm transition hover:bg-[#d6dfc9]/80"
      >
        <Search className="h-4 w-4" />
        ID My Plant
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-solid)] p-3 text-sm text-[var(--ax-text)] shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <h4 className="font-semibold text-[var(--ax-heading)]">ID My Plant</h4>
              <p className="mt-1 text-[var(--ax-text)]">
                Not sure what the scientific name is? Add a short description, any common names you know, and optionally a clear photo. AxilDB will suggest likely taxonomy for you to review.
              </p>
              <p className="mt-1 text-xs font-medium text-[var(--ax-muted-strong)]">
                This sends only your description, known names, and selected image to the configured OpenAI model. It saves the ID result to your private collection history, but does not save a plant definition automatically.
              </p>
            </div>
            {status && (
              <p
                className={cn(
                  'max-w-md rounded-md border px-3 py-2 text-xs font-semibold',
                  loading
                    ? 'border-[#8fa58f]/70 bg-[#edf3e6] text-[#255537]'
                    : 'border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] text-[var(--ax-text)]',
                )}
              >
                {status}
              </p>
            )}
          </div>

          {loading && (
            <div
              className="mt-3 flex items-center gap-3 rounded-lg border border-[#8fa58f]/60 bg-[#edf3e6] px-3 py-3 text-sm font-semibold text-[#255537]"
              role="status"
              aria-live="polite"
            >
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#8fa58f] border-t-[#2f6b45]" aria-hidden="true" />
              <span>Thinking through the plant details. This can take a few moments, especially with a photo.</span>
            </div>
          )}

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="grid gap-1 font-medium text-[var(--ax-text)] md:col-span-2">
              Description
              <textarea name="plantIdDescription" className={cn(control, 'min-h-20')} placeholder="Leaf shape, flower color, growth habit, where it came from..." />
            </label>
            <label className="grid gap-1 font-medium text-[var(--ax-text)]">
              Common or trade names
              <input name="plantIdKnownNames" className={control} placeholder="Snake plant, whale fin, seller label..." />
            </label>
            <label className="grid gap-1 font-medium text-[var(--ax-text)]">
              Optional photo
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={control} />
            </label>
            <label className={cn('flex items-start gap-2 text-sm text-[var(--ax-muted-strong)] md:col-span-2', !plantDefinitionId && 'opacity-70')}>
              <input
                type="checkbox"
                checked={saveAsTypeImage}
                disabled={!plantDefinitionId}
                onChange={(event) => setSaveAsTypeImage(event.target.checked)}
              />
              <span>
                Save uploaded image as type image if I use this suggestion.
                {!plantDefinitionId && ' Available after the plant definition exists.'}
              </span>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={suggestId}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#255537] disabled:cursor-wait disabled:opacity-70"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? 'Suggesting...' : 'Suggest ID'}
            </button>
            {suggestion && (
              <button
                type="button"
                onClick={applySuggestion}
                className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-solid)] px-3 py-2 text-sm font-semibold text-[var(--ax-text)] transition hover:bg-[var(--ax-primary-wash)]"
              >
                Apply to form
              </button>
            )}
          </div>

          {suggestion && (
            <div className="mt-4 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-solid)] p-3">
              {matchedDefinition && (
                <div className="mb-3 rounded-lg border border-[#b7caa9] bg-[#edf3e6] p-3 text-sm text-[#255537]">
                  <p className="font-semibold">
                    This plant matches an existing {matchedDefinition.matchType === 'LOCAL' ? 'Plant Definition' : 'Validated Plant Definition'}.
                  </p>
                  <p className="mt-1">
                    {displayName(matchedDefinition)}
                    {matchedDefinition.matchType === 'VALIDATED'
                      ? ' is curated site-wide. Use the validated definition when creating a plant instance, or apply this draft only if you need an independent local definition.'
                      : ' already exists in this collection. Use the existing definition unless you need a separate local record.'}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--ax-heading)]">
                    {suggestion.genus || 'Unknown genus'} {suggestion.hybridNotation ? `${suggestion.hybridNotation} ` : ''}{suggestion.species || 'sp.'}
                    {suggestion.cultivarName ? ` '${suggestion.cultivarName}'` : ''}
                  </p>
                  <p className="mt-1 text-sm text-[var(--ax-muted)]">{suggestion.confidenceExplanation}</p>
                </div>
                <span className={cn('rounded-full border px-2 py-1 text-xs font-bold', confidenceBadge(suggestion.confidenceLevel))}>
                  {suggestion.confidenceLevel || 'LOW'} confidence
                </span>
              </div>
              {suggestion.suggestedDescription && <p className="mt-2 text-sm">{suggestion.suggestedDescription}</p>}
              {suggestion.suggestedAliases?.length ? (
                <p className="mt-2 text-sm text-[var(--ax-muted-strong)]">Aliases: {suggestion.suggestedAliases.join(', ')}</p>
              ) : null}
              {suggestion.possibleAlternatives?.length ? (
                <p className="mt-2 text-sm text-[var(--ax-muted-strong)]">Possible alternatives: {suggestion.possibleAlternatives.join(', ')}</p>
              ) : null}
              {suggestion.suggestedReferences?.length ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {suggestion.suggestedReferences.map((reference) => (
                    <a key={reference} href={reference} className="rounded-md border border-[color:var(--ax-border)] px-2 py-1 underline">
                      Reference
                    </a>
                  ))}
                </div>
              ) : null}
              {(suggestion.warnings || []).map((warning) => (
                <p key={warning} className="mt-2 text-xs text-[var(--ax-warning)]">{warning}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
