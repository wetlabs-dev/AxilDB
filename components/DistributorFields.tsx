'use client'

import { useState } from 'react'
import { provenanceLabel } from '@/lib/provenance'

type Distributor = {
  id: string
  name: string
  distributorType: string
  outlets: Array<{ id: string; name: string; outletType: string }>
}
type Seller = {
  id: string
  name: string
  kind: string
  rating: number | null
  storefronts: Array<{ id: string; handleOrName: string; storefrontType: string; distributorId: string | null }>
}

const selectClass = 'rounded-md border border-stone-300 bg-white px-3 py-2'

export function DistributorFields({
  distributors,
  sellers = [],
  defaultDistributorId = '',
  defaultOutletId = '',
  defaultSellerId = '',
  defaultStorefrontId = '',
}: {
  distributors: Distributor[]
  sellers?: Seller[]
  defaultDistributorId?: string
  defaultOutletId?: string
  defaultSellerId?: string
  defaultStorefrontId?: string
}) {
  const [sellerId, setSellerId] = useState(defaultSellerId)
  const [distributorId, setDistributorId] = useState(defaultDistributorId)
  const seller = sellers.find((item) => item.id === sellerId)
  const distributor = distributors.find((item) => item.id === distributorId)
  const marketplace = distributor && ['MARKETPLACE', 'AUCTION_PLATFORM', 'PRIVATE_SALE_CHANNEL'].includes(distributor.distributorType)
  const storefronts = seller?.storefronts.filter((item) => !distributorId || !item.distributorId || item.distributorId === distributorId) || []

  return (
    <fieldset className="grid gap-3 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">Seller and sales channel</legend>
      <label className="grid gap-1 text-sm font-medium">
        Seller
        <select className={selectClass} name="sellerId" value={sellerId} onChange={(event) => setSellerId(event.target.value)}>
          <option value="">Seller unknown or distributor sold directly</option>
          {sellers.map((item) => <option key={item.id} value={item.id}>{item.name} · {provenanceLabel(item.kind)}{item.rating ? ` · ${item.rating}/5 private rating` : ''}</option>)}
        </select>
        <span className="text-xs font-normal text-stone-600">The person or organization that actually sold or transferred the plant.</span>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Sales channel / distributor
        <select className={selectClass} name="distributorId" value={distributorId} onChange={(event) => setDistributorId(event.target.value)}>
          <option value="">No separate sales channel</option>
          {distributors.map((item) => <option key={item.id} value={item.id}>{item.name} · {provenanceLabel(item.distributorType)}</option>)}
        </select>
        <span className="text-xs font-normal text-stone-600">The retailer, marketplace, nursery, or channel through which it was acquired.</span>
      </label>
      {seller && (marketplace || storefronts.length > 0) && (
        <label className="grid gap-1 text-sm font-medium">
          Seller storefront
          <select key={`${sellerId}:${distributorId}`} className={selectClass} name="sellerStorefrontId" defaultValue={storefronts.some((item) => item.id === defaultStorefrontId) ? defaultStorefrontId : ''}>
            <option value="">No storefront specified</option>
            {storefronts.map((item) => <option key={item.id} value={item.id}>{item.handleOrName} · {provenanceLabel(item.storefrontType)}</option>)}
          </select>
          <span className="text-xs font-normal text-stone-600">The seller's account, shop, or profile on this channel.</span>
        </label>
      )}
      {!seller && distributor && (
        <label className="grid gap-1 text-sm font-medium">
          Distributor outlet
          <select key={distributorId} className={selectClass} name="distributorOutletId" defaultValue={distributor.outlets.some((item) => item.id === defaultOutletId) ? defaultOutletId : ''}>
            <option value="">No specific outlet</option>
            {distributor.outlets.map((item) => <option key={item.id} value={item.id}>{item.name} · {provenanceLabel(item.outletType)}</option>)}
          </select>
          <span className="text-xs font-normal text-stone-600">A branch, direct online store, show booth, or other distributor-operated outlet.</span>
        </label>
      )}
      {(marketplace && !seller) && <p className="self-end rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">This is a marketplace. Select the independent seller when known; seller accounts should not be recorded as distributor outlets.</p>}
    </fieldset>
  )
}
