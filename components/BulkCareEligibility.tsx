'use client'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui'
import { useEffect, useState } from 'react'
import { useCareQueue } from '@/components/CareQueueOptimistic'
import { collectionPath } from '@/lib/collection-path'
import { formatDateTime } from '@/lib/time'

type Preview = { timezone: string; authorizedCount: number; alreadyCompleted: { plantInstanceId: string; plantId: string; name: string; performedAt: string; source: string | null }[] }
const labels: Record<string, string> = { WATERING: 'watered', FERTILIZING: 'fertilized with this recipe', REPOTTING: 'repotted', PRUNING: 'pruned', PEST_CHECK: 'checked for pests', HEALTH_CHECK: 'health checked', PROPAGATION_CHECK: 'propagation checked', BLOOM_CHECK: 'bloom checked', OTHER: 'given this care' }
export function BulkCareEligibility({ formId, collectionSlug, careType, scopeCount }: { formId: string; collectionSlug: string; careType: string; scopeCount: number }) {
  const { pending: saving } = useFormStatus()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [counts, setCounts] = useState({ total: 0, other: 0 })
  const [include, setInclude] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const { operations } = useCareQueue()
  const pending = operations.some(operation => operation.status === 'pending' || operation.status === 'uncertain')
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    const update = () => {
      clearTimeout(timer)
      controller?.abort()
      setPreview(null)
      timer = setTimeout(async () => {
        const fd = new FormData(form)
        const ids = [...new Set(fd.getAll('plantInstanceId').map(String))]
        const eligibleIds = ids.filter(id => fd.get(`skip:${id}`) !== 'on')
        setCounts({ total: ids.length, other: ids.length - eligibleIds.length })
        controller = new AbortController()
        const signal = controller.signal
        try {
          const response = await fetch('/api/care/bulk-preview', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            collectionSlug, locationId: fd.get('locationId'), careType, plantInstanceIds: eligibleIds,
            includeNested: fd.get('includeNested') === 'on', includeArchived: fd.get('includeArchived') === 'on',
            performedAt: fd.get('performedAt'), fertilizerRecipeId: fd.get('fertilizerRecipeId'),
          }) })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error)
          if (!signal.aborted) { setPreview(result); setError('') }
        } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to review eligibility.') }
      }, 250)
    }
    const onInput = (event: Event) => {
      const name = (event.target as HTMLInputElement).name
      if (['performedAt', 'fertilizerRecipeId', 'plantInstanceId', 'includeNested', 'includeArchived'].includes(name) || name.startsWith('skip:')) update()
    }
    update()
    form.addEventListener('input', onInput)
    window.addEventListener('focus', update)
    return () => { clearTimeout(timer); controller?.abort(); form.removeEventListener('input', onInput); window.removeEventListener('focus', update) }
  }, [formId, collectionSlug, careType, pending, refresh])
  const already = preview?.alreadyCompleted.length || 0
  const eligible = (preview?.authorizedCount || 0) - already
  const final = eligible + (include ? already : 0)
  return <div className="w-full space-y-3 rounded-lg border border-[#c7d8bd] bg-white/60 p-3 text-sm">
    <div role="status" aria-live="polite">
      {preview ? <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[["In scope", scopeCount], ["Selected", counts.total], ["Eligible", eligible], ["Already completed", already], ["Other exclusions", counts.total - preview.authorizedCount], ["Records to create", final]].map(([label, count]) => <div key={label}><dt className="text-stone-600">{label}</dt><dd className="text-lg font-semibold text-[#2f6b45]">{count}</dd></div>)}
      </dl> : <p>{error || 'Checking same-day care…'}</p>}
      {preview && counts.total - preview.authorizedCount > 0 && <p className="mt-2">{counts.total - preview.authorizedCount} excluded by selection or location eligibility.</p>}
      {preview && final === 0 && <p className="mt-2">No eligible plants. Enable repeat care below to include plants already completed on this date.</p>}
    </div>
    {error && <button type="button" className="underline" onClick={() => setRefresh(value => value + 1)}>Retry eligibility check</button>}
    {careType !== 'OTHER' && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" name="includeAlreadyCompleted" checked={include} onChange={event => setInclude(event.target.checked)} />Include plants already {labels[careType]} on the performed date</label>}
    {careType === 'OTHER' && <p>Other care is free-form; same-day events are not automatically treated as equivalent.</p>}
    {already > 0 && <details><summary className="cursor-pointer font-semibold">{already} already {labels[careType]} on this date</summary><ul className="mt-2 space-y-2">{preview!.alreadyCompleted.map(event => <li key={event.plantInstanceId}><Link className="underline" href={collectionPath(collectionSlug, `/instances/${event.plantInstanceId}`)}>{event.name} · {event.plantId}</Link><span className="block text-stone-600">{formatDateTime(event.performedAt, preview!.timezone)}{event.source ? ` · ${event.source.replaceAll('_', ' ').toLowerCase()}` : ''}</span></li>)}</ul></details>}
    <p className="text-xs text-stone-600">Existing records stay unchanged. Eligibility is checked again when saving.</p>
    <Button disabled={!preview || pending || saving || final === 0} className="disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Recording care…' : `Record care for ${final} plant${final === 1 ? '' : 's'}`}</Button>
  </div>
}
