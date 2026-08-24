'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { movePlantToLocation } from '@/app/actions'
import { previewPlantLocationCompatibility } from '@/app/location-environment-actions'

const selectClass = 'min-w-0 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export function CompatibilityMoveForm({ collectionSlug, plantInstanceId, currentLocationId, locations }: {
  collectionSlug: string
  plantInstanceId: string
  currentLocationId?: string | null
  locations: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const [destination, setDestination] = useState(currentLocationId || '')
  const [status, setStatus] = useState('')
  const [pending, startTransition] = useTransition()

  function move() {
    if ((currentLocationId || '') === destination) return
    startTransition(async () => {
      try {
        let compatibilityAcknowledged = false
        let compatibilityNote: string | null = null
        if (destination) {
          setStatus('Checking location compatibility...')
          const preview = await previewPlantLocationCompatibility({ collectionSlug, locationId: destination, plantInstanceIds: [plantInstanceId] })
          const result = preview.results[0]
          if (result && (result.overallStatus === 'CAUTION' || result.overallStatus === 'POOR_MATCH')) {
            const details = result.checks.map((check) => `${check.category}: ${check.explanation}`).join('\n')
            if (!window.confirm(`${result.summary}\n\n${details}\n\nCompatibility guidance is advisory. Move anyway?`)) {
              setStatus('Move cancelled.')
              return
            }
            compatibilityAcknowledged = true
            compatibilityNote = 'Compatibility warning acknowledged during individual move.'
          }
        }
        setStatus('Moving...')
        await movePlantToLocation({ collectionSlug, plantInstanceId, destinationLocationId: destination || null, compatibilityAcknowledged, compatibilityNote })
        setStatus('Moved.')
        router.refresh()
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Move failed.')
      }
    })
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select className={selectClass} value={destination} onChange={(event) => setDestination(event.target.value)} aria-label="Destination location">
        <option value="">No location</option>
        {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
      </select>
      <button type="button" onClick={move} disabled={pending || destination === (currentLocationId || '')} className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? 'Checking...' : 'Move'}
      </button>
      {status && <span className="basis-full text-xs text-stone-600" role="status">{status}</span>}
    </div>
  )
}
