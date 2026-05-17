'use client'

import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { HelpTooltip } from '@/components/ui'
import { cn } from '@/lib/utils'

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

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
      <textarea
        ref={textareaRef}
        className={cn(control, 'min-h-20 min-w-0 max-w-full')}
        name="description"
        defaultValue={defaultValue ?? ''}
      />
      {status && <span className="text-xs font-normal text-stone-600">{status}</span>}
    </label>
  )
}
