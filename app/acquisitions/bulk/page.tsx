import { randomUUID } from 'crypto'
import Link from 'next/link'
import { createAcquisitionBatch } from '@/app/acquisition-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionLogger } from '@/lib/collections'
import { locationPath } from '@/lib/locations'
import { prisma } from '@/lib/prisma'
import { formatDate, formatDateTime } from '@/lib/time'
import { plantName } from '@/lib/utils'
import { LocationCompatibilitySelect } from '@/components/LocationCompatibilitySelect'

export default async function BulkAcquisitionPage({ searchParams }: {
  searchParams: Promise<{ definition?: string | string[]; batch?: string }>
}) {
  const context = await requireCollectionLogger()
  const sp = await searchParams
  if (sp.batch) {
    const batch = await prisma.acquisitionBatch.findFirst({
      where: { id: sp.batch, collectionId: context.collection.id },
      include: { distributor: true, distributorLocation: true, items: { include: { plantDefinition: true, acquisitionRecord: { include: { plantInstances: true } } } } },
    })
    if (batch) return (
      <div className="space-y-5">
        <div><h1 className="font-serif text-3xl font-semibold">Acquisition batch complete</h1><p className="mt-1 text-sm text-stone-600">Recorded {formatDateTime(batch.createdAt)} with {batch.items.length} definition{batch.items.length === 1 ? '' : 's'}.</p></div>
        <Card className="grid gap-3">
          <p className="text-sm"><span className="font-semibold">Source:</span> {batch.distributor?.name || 'Not specified'}{batch.distributorLocation ? ` · ${batch.distributorLocation.name}` : ''}</p>
          {batch.orderNumber && <p className="text-sm"><span className="font-semibold">Order:</span> {batch.orderNumber}</p>}
          {batch.items.map((item) => <div key={item.id} className="rounded-md border border-stone-200 bg-white/55 p-3"><p className="font-serif text-lg font-semibold">{plantName(item.plantDefinition)}</p><p className="text-sm text-stone-600">{item.quantity} acquired · {item.acquisitionRecord?.plantInstances.length || 0} specimen records created · {item.fulfillmentChoice.toLowerCase().replaceAll('_', ' ')}</p></div>)}
          <Link className="font-semibold text-[#2f6b45] underline" href={collectionPath(context.collection.slug, '/acquisitions')}>Return to Acquisition Pipeline</Link>
        </Card>
      </div>
    )
  }

  const definitionIds = Array.from(new Set((Array.isArray(sp.definition) ? sp.definition : sp.definition ? [sp.definition] : []).filter(Boolean)))
  const [definitions, locations, distributors, recentBatches] = await Promise.all([
    prisma.plantDefinition.findMany({ where: { collectionId: context.collection.id, id: { in: definitionIds }, acquisitionStatus: { not: null } }, include: { desiredLocation: true }, orderBy: { genus: 'asc' } }),
    prisma.location.findMany({ where: { collectionId: context.collection.id, status: 'ACTIVE' }, include: { locationType: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.distributor.findMany({ where: { collectionId: context.collection.id, active: true }, include: { locations: { where: { active: true }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
    prisma.acquisitionBatch.findMany({ where: { collectionId: context.collection.id }, include: { _count: { select: { items: true } }, distributor: true }, orderBy: { acquisitionDate: 'desc' }, take: 12 }),
  ])
  const nodes = locations.map((item) => ({ id: item.id, parentLocationId: item.parentLocationId, name: item.name, code: item.code, status: item.status, sortOrder: item.sortOrder, locationType: item.locationType }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-serif text-3xl font-semibold">Bulk Acquisition</h1><p className="mt-1 text-sm text-stone-600">Review shared order details and each wishlist outcome before creating records.</p></div><Link className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold" href={collectionPath(context.collection.slug, '/wishlist')}>Select wishlist plants</Link></div>
      {definitions.length > 0 ? (
        <form action={createAcquisitionBatch} className="grid gap-5">
          <input type="hidden" name="collectionSlug" value={context.collection.slug} />
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <Card className="grid gap-3 md:grid-cols-4">
            <Field label="Acquisition date" name="acquisitionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            <Field label="Order / receipt number" name="orderNumber" />
            <Select label="Distributor" name="distributorId"><option value="">Not specified</option>{distributors.map((distributor) => <option key={distributor.id} value={distributor.id}>{distributor.name}</option>)}</Select>
            <Select label="Branch / outlet" name="distributorLocationId"><option value="">Not specified</option>{distributors.flatMap((distributor) => distributor.locations.map((location) => <option key={location.id} value={location.id}>{distributor.name} · {location.name}</option>))}</Select>
            <Field label="Currency" name="currency" defaultValue="USD" />
            <Field label="Subtotal" name="subtotal" type="number" step="0.01" />
            <Field label="Shipping" name="shippingCost" type="number" step="0.01" />
            <Field label="Tax" name="tax" type="number" step="0.01" />
            <Field label="Total" name="totalCost" type="number" step="0.01" />
            <TextArea label="Shared notes" name="sharedNotes" wrapperClassName="md:col-span-4" />
          </Card>
          <div className="grid gap-3">
            {definitions.map((definition) => (
              <Card key={definition.id} className="relative grid gap-3 md:grid-cols-4">
                <input type="hidden" name="definitionId" value={definition.id} />
                <div className="md:col-span-4"><p className="text-xs font-bold uppercase tracking-wide text-[#2f6b45]">Acquisition item</p><h2 className="font-serif text-xl font-semibold">{plantName(definition)}</h2></div>
                <Field label="Quantity" name={`quantity:${definition.id}`} type="number" min="1" max="50" defaultValue="1" />
                <Field label="Unit price" name={`unitPrice:${definition.id}`} type="number" step="0.01" />
                <Field label="Specimen size" name={`specimenSize:${definition.id}`} defaultValue={definition.desiredSpecimenSize} />
                <Field label="Pot size" name={`potSize:${definition.id}`} />
                <Field label="Acquisition label" help="The label supplied with these specimens. It is copied to each created instance for this item." name={`acquisitionLabel:${definition.id}`} wrapperClassName="md:col-span-2" />
                <LocationCompatibilitySelect collectionSlug={context.collection.slug} name={`initialLocationId:${definition.id}`} label="Initial location" defaultValue={definition.desiredLocationId || ''} plantDefinitionId={definition.id} locations={locations.map((location) => ({ id: location.id, label: `${location.code} · ${locationPath(location.id, nodes)}` }))} />
                <Select label="Wishlist outcome" name={`fulfillmentChoice:${definition.id}`} defaultValue="FULFILLED"><option value="FULFILLED">Mark fulfilled</option><option value="KEEP_ACTIVE">Keep current status</option><option value="REPEAT_PURCHASE">Keep actively seeking</option></Select>
                <label className="flex items-center gap-2 self-end rounded-md border border-stone-200 bg-white/55 px-3 py-2 text-sm"><input type="checkbox" name={`createInstances:${definition.id}`} defaultChecked /> Create specimen records</label>
                <TextArea label="Item notes" name={`notes:${definition.id}`} wrapperClassName="md:col-span-4" />
              </Card>
            ))}
          </div>
          <div className="sticky bottom-3 rounded-lg border border-[#8fa58f] bg-[#edf3e6]/95 p-3 shadow-lg backdrop-blur"><Button>Confirm and record {definitions.length} acquisition{definitions.length === 1 ? '' : 's'}</Button><p className="mt-2 text-xs text-stone-600">This creates permanent acquisition records. The idempotency guard prevents duplicate records from repeated submission.</p></div>
        </form>
      ) : <Card><p className="text-sm text-stone-600">Choose plants from the Wishlist, then use Acquire selected.</p></Card>}

      {recentBatches.length > 0 && <Card><h2 className="font-serif text-xl font-semibold">Recent acquisition batches</h2><div className="mt-3 grid gap-2">{recentBatches.map((batch) => <Link key={batch.id} href={collectionPath(context.collection.slug, `/acquisitions/bulk?batch=${batch.id}`)} className="rounded-md border border-stone-200 bg-white/55 p-3 text-sm"><span className="font-semibold">{formatDate(batch.acquisitionDate)}</span> · {batch._count.items} items · {batch.distributor?.name || 'source not specified'}</Link>)}</div></Card>}
    </div>
  )
}
