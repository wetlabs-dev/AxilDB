'use client'

import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { husbandryFieldNames } from '@/lib/husbandry'
import { cn } from '@/lib/utils'

function setControlValue(form: HTMLFormElement, name: string, value?: string | null) {
  if (value === undefined || value === null) return
  const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!field) return
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

export function HusbandryMagicFillButton({ plant, className = '' }: { plant: any; className?: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function magicFill() {
    const form = buttonRef.current?.form
    if (!form) return

    setLoading(true)
    setStatus('Drafting husbandry...')
    try {
      const response = await fetch('/api/ai/plant-husbandry-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plant }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Husbandry fill failed.')

      const fields = result.fields || {}
      for (const field of husbandryFieldNames) setControlValue(form, field, fields[field])
      setControlValue(form, 'reviewStatus', fields.reviewStatus || 'DRAFT')
      setControlValue(form, 'reviewNotes', fields.reviewNotes || 'AI-generated draft. Review before relying on this care guide.')
      setControlValue(form, 'aiModel', fields.aiModel)
      setStatus('Draft added. Review before saving.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Husbandry fill failed.')
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
        onClick={magicFill}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#c4a86a]/60 bg-[#fff5d6] px-2.5 py-1.5 text-sm font-semibold text-[#6f541f] shadow-sm transition hover:bg-[#f7e6ae] disabled:cursor-wait disabled:opacity-70"
      >
        <Sparkles className="h-4 w-4" />
        {loading ? 'Filling...' : 'Magic Fill husbandry'}
      </button>
    </div>
  )
}
