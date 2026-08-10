'use client'

import { useState } from 'react'

type Distributor = { id: string; name: string; distributorType: string; outlets: Array<{ id: string; name: string; outletType: string }> }
type Seller = {
  id: string
  name: string
  kind: string
  rating: number | null
  storefronts: Array<{
    id: string
    handleOrName: string
    storefrontType: string
    distributorId: string | null
    salesChannelType?: { name: string } | null
  }>
}

const selectClass = 'rounded-md border border-stone-300 bg-white px-3 py-2'

export function DistributorFields({
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
  const [channelId, setChannelId] = useState(defaultStorefrontId)
  const seller = sellers.find((item) => item.id === sellerId)
  const channels = seller?.storefronts || []
  const channel = channels.find((item) => item.id === channelId)

  return (
    <fieldset className="grid gap-3 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">Acquisition provenance</legend>
      <label className="grid gap-1 text-sm font-medium">
        Who did you get this from?
        <select className={selectClass} name="sellerId" value={sellerId} onChange={(event) => { setSellerId(event.target.value); setChannelId('') }}>
          <option value="">Seller unknown</option>
          {sellers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.rating ? ` · ${item.rating}/5 private rating` : ''}</option>)}
        </select>
        <span className="text-xs font-normal text-stone-600">The person or organization that sold, donated, or transferred the plant.</span>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        How did you buy or receive it?
        <select className={selectClass} name="sellerStorefrontId" value={channelId} onChange={(event) => setChannelId(event.target.value)} disabled={!seller}>
          <option value="">No sales channel specified</option>
          {channels.map((item) => <option key={item.id} value={item.id}>{item.handleOrName}{item.salesChannelType?.name ? ` · ${item.salesChannelType.name}` : ''}</option>)}
        </select>
        <span className="text-xs font-normal text-stone-600">A website, marketplace profile, shop, nursery, show, or physical store associated with the seller.</span>
      </label>
      <input type="hidden" name="distributorId" value={channel?.distributorId || defaultDistributorId} />
      <input type="hidden" name="distributorOutletId" value={defaultOutletId} />
    </fieldset>
  )
}
