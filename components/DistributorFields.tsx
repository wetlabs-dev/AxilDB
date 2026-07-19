'use client'

import { useState } from 'react'
import { provenanceLabel } from '@/lib/provenance'

type Distributor = { id: string; name: string; distributorType: string; locations: Array<{ id: string; name: string; locationType: string | null }> }

export function DistributorFields({ distributors, defaultDistributorId = '', defaultLocationId = '' }: { distributors: Distributor[]; defaultDistributorId?: string; defaultLocationId?: string }) {
  const [distributorId, setDistributorId] = useState(defaultDistributorId)
  const selected = distributors.find((item) => item.id === distributorId)
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm font-medium">Purchased/received from
      <select className="rounded-md border border-stone-300 bg-white px-3 py-2" name="distributorId" value={distributorId} onChange={(event) => setDistributorId(event.target.value)}>
        <option value="">Distributor unknown</option>
        {distributors.map((item) => <option key={item.id} value={item.id}>{item.name} · {provenanceLabel(item.distributorType)}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Branch/location
      <select key={distributorId} className="rounded-md border border-stone-300 bg-white px-3 py-2" name="distributorLocationId" defaultValue={selected?.locations.some((item) => item.id === defaultLocationId) ? defaultLocationId : ''} disabled={!selected}>
        <option value="">No specific location</option>
        {selected?.locations.map((item) => <option key={item.id} value={item.id}>{item.name}{item.locationType ? ` · ${item.locationType}` : ''}</option>)}
      </select>
    </label>
  </div>
}
