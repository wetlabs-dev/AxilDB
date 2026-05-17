'use client'

import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { HelpTooltip } from '@/components/ui'
import { cn } from '@/lib/utils'

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

type GoverningBodyOption = {
  id: string
  name: string
  abbreviation?: string | null
}

function setControlValue(form: HTMLFormElement, name: string, value?: string | null) {
  if (value === undefined || value === null) return
  const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!field) return
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function chooseGoverningBody(form: HTMLFormElement, bodies: GoverningBodyOption[], value?: string | null) {
  if (!value) return
  const select = form.elements.namedItem('governingBodyId') as HTMLSelectElement | null
  if (!select) return
  const normalized = value.trim().toLowerCase()
  const match = bodies.find((body) =>
    body.id.toLowerCase() === normalized ||
    body.name.toLowerCase() === normalized ||
    body.abbreviation?.toLowerCase() === normalized
  )
  if (match) setControlValue(form, 'governingBodyId', match.id)
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
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function generateDescription() {
    const textarea = textareaRef.current
    const form = textarea?.form
    if (!textarea || !form) return

    const formData = new FormData(form)
    const genus = String(formData.get('genus') || '').trim()
    const species = String(formData.get('species') || '').trim()
    const cultivarName = String(formData.get('cultivarName') || '').trim()

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
        body: JSON.stringify({ genus, species, cultivarName }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Description generation failed.')

      textarea.value = result.description
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
      setStatus('Description added.')
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
            type="button"
            onClick={generateDescription}
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

  async function magicFillDefinition() {
    const form = buttonRef.current?.form
    if (!form) return

    const formData = new FormData(form)
    const genus = String(formData.get('genus') || '').trim()
    const species = String(formData.get('species') || '').trim()
    const hybridNotation = String(formData.get('hybridNotation') || '').trim()
    const cultivarName = String(formData.get('cultivarName') || '').trim()

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
        body: JSON.stringify({ genus, species, hybridNotation, cultivarName, governingBodies }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Magic fill failed.')

      const fields = result.fields || {}
      setControlValue(form, 'genus', fields.genus)
      setControlValue(form, 'species', fields.species?.toLowerCase())
      setControlValue(form, 'hybridNotation', fields.hybridNotation)
      setControlValue(form, 'cultivarName', fields.cultivarName)
      setControlValue(form, 'authority', fields.authority)
      setControlValue(form, 'cultivarRegistrationNumber', fields.cultivarRegistrationNumber)
      chooseGoverningBody(form, governingBodies, fields.governingBody)
      setControlValue(form, 'wikipediaUrl', fields.wikipediaUrl)
      setControlValue(form, 'inaturalistUrl', fields.inaturalistUrl)
      setControlValue(form, 'powoUrl', fields.powoUrl)
      setControlValue(form, 'gbifUrl', fields.gbifUrl)
      setControlValue(form, 'description', fields.description)

      const aliases = Array.isArray(fields.aliases) ? fields.aliases.map(normalizeAlias).filter((alias: any) => alias.name) : []
      window.dispatchEvent(new CustomEvent('axildb:replace-aliases', { detail: { form, aliases } }))
      setStatus(`Magic fill added${aliases.length ? ` with ${aliases.length} alias${aliases.length === 1 ? '' : 'es'}` : ''}. Review before saving.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Magic fill failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center justify-end gap-2', className)}>
      {status && <span className="min-w-0 text-xs font-normal text-stone-600 md:text-right">{status}</span>}
      <button
        ref={buttonRef}
        type="button"
        onClick={magicFillDefinition}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#c4a86a]/60 bg-[#fff5d6] px-2.5 py-1.5 text-sm font-semibold text-[#6f541f] shadow-sm transition hover:bg-[#f7e6ae] disabled:cursor-wait disabled:opacity-70"
      >
        <Sparkles className="h-4 w-4" />
        {loading ? 'Filling...' : 'Magic fill'}
      </button>
    </div>
  )
}
