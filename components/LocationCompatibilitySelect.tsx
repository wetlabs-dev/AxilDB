'use client'

import { useState, useTransition } from 'react'
import { previewDefinitionLocationCompatibility, previewPlantLocationCompatibility } from '@/app/location-environment-actions'

type Preview = Awaited<ReturnType<typeof previewDefinitionLocationCompatibility>>

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export function LocationCompatibilitySelect({
  collectionSlug,
  name,
  label = 'Location',
  defaultValue = '',
  locations,
  plantInstanceId,
  plantDefinitionId,
  definitionSelectName,
}: {
  collectionSlug: string
  name: string
  label?: string
  defaultValue?: string | null
  locations: Array<{ id: string; label: string }>
  plantInstanceId?: string
  plantDefinitionId?: string
  definitionSelectName?: string
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pending, startTransition] = useTransition()

  function check(event: React.ChangeEvent<HTMLSelectElement>) {
    const locationId = event.target.value
    setPreview(null)
    if (!locationId) return
    const form = event.currentTarget.form
    const selectedDefinitionId = plantDefinitionId || (definitionSelectName && form ? String(new FormData(form).get(definitionSelectName) || '') : '')
    startTransition(async () => {
      const result = plantInstanceId
        ? (await previewPlantLocationCompatibility({ collectionSlug, locationId, plantInstanceIds: [plantInstanceId] })).results[0]
        : selectedDefinitionId ? await previewDefinitionLocationCompatibility({ collectionSlug, locationId, plantDefinitionId: selectedDefinitionId }) : null
      setPreview(result || null)
    })
  }

  const warning = preview?.overallStatus === 'CAUTION' || preview?.overallStatus === 'POOR_MATCH'
  return (
    <div className="grid gap-1 text-sm font-medium text-stone-800">
      <label className="grid gap-1">
        {label}
        <select className={selectClass} name={name} defaultValue={defaultValue || ''} onChange={check}>
          <option value="">No location</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
        </select>
      </label>
      {pending && <span className="text-xs text-stone-600" role="status">Checking environmental compatibility...</span>}
      {preview && (
        <div className={`rounded-md border px-2.5 py-2 text-xs ${warning ? 'border-[#d8bb72] bg-[#fff7dc] text-[#71551b]' : preview.overallStatus === 'GOOD_MATCH' ? 'border-[#a8c49a] bg-[#edf3e6] text-[#285d3b]' : 'border-stone-300 bg-stone-100 text-stone-700'}`}>
          <strong>{preview.overallStatus.replaceAll('_', ' ').toLowerCase()}.</strong> {preview.summary}
          {preview.checks.length > 0 && <span className="block mt-1">Review: {preview.checks.map((check) => check.category).join(', ')}.</span>}
          {warning && (
            <label className="mt-2 flex items-start gap-2 font-medium">
              <input type="checkbox" name={`${name}CompatibilityAcknowledged`} value="yes" required />
              I reviewed this advisory and want to continue.
            </label>
          )}
        </div>
      )}
      {locations.length === 0 && <span className="text-xs text-stone-600">Create your first Location before assigning this plant.</span>}
    </div>
  )
}
