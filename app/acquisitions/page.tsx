import Link from 'next/link'
import {
  createAcquisitionResearchEntry,
  createAcquisitionTarget,
  createPlantAcquisitionRecord,
  createPlantObservation,
  updateAcquisitionIntent,
} from '@/app/acquisition-actions'
import { Button, Card, Field, Select, TextArea, AddPanel, LinkButton } from '@/components/ui'
import { PlantImage } from '@/components/PlantImage'
import { PlantLocationCompatibilityPanel } from '@/components/PlantLocationCompatibilityPanel'
import { LocationCompatibilitySelect } from '@/components/LocationCompatibilitySelect'
import { AcquisitionSourceChainFields } from '@/components/AcquisitionSourceChainFields'
import { DistributorFields } from '@/components/DistributorFields'
import { collectionPath, requireCollectionViewer, canCreateInCollection } from '@/lib/collections'
import { locationPath } from '@/lib/locations'
import { evaluatePlantLocationCompatibility, getEffectiveLocationEnvironment, getEffectivePlantEnvironmentRequirements } from '@/lib/location-compatibility'
import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/time'
import { cn, plantName } from '@/lib/utils'
import { getCurrentUser } from '@/lib/auth'
import { distributorDisplay, sourceChainDisplay } from '@/lib/provenance'

const acquisitionStatuses = [
  ['RESEARCHING', 'Researching'],
  ['WISHLIST', 'Wishlist'],
  ['ACTIVELY_SEEKING', 'Actively seeking'],
  ['ON_HOLD', 'On hold'],
  ['FULFILLED', 'Fulfilled'],
  ['NO_LONGER_INTERESTED', 'No longer interested'],
] as const

const availabilities = [
  ['UNKNOWN', 'Unknown'],
  ['PLENTY', 'Plenty'],
  ['LIMITED', 'Limited'],
  ['LAST_ONE', 'Last one'],
  ['SOLD_OUT', 'Sold out'],
] as const

function money(value?: unknown, currency = 'USD') {
  if (value == null || value === '') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(numeric)
}

function statusLabel(status?: string | null) {
  return acquisitionStatuses.find(([value]) => value === status)?.[1] || 'No intent'
}

function stars(priority?: number | null) {
  const count = Math.max(0, Math.min(5, Number(priority || 0)))
  return '★'.repeat(count) + '☆'.repeat(5 - count)
}

function preferredVendors(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function urlList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function priceStats(observations: Array<{ observedPrice: unknown; currency: string; vendor: string | null; observedAt: Date; distributor?: { name: string } | null }>) {
  const priced = observations
    .map((observation) => ({ ...observation, price: Number(observation.observedPrice) }))
    .filter((observation) => Number.isFinite(observation.price))
  if (priced.length === 0) return null
  const prices = priced.map((observation) => observation.price)
  const vendorCounts = new Map<string, number>()
  for (const observation of priced) {
    const name = observation.distributor?.name || observation.vendor
    if (name) vendorCounts.set(name, (vendorCounts.get(name) || 0) + 1)
  }
  const preferredVendor = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null
  return {
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
    average: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    currency: priced[0]?.currency || 'USD',
    preferredVendor,
  }
}

export default async function AcquisitionPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ definition?: string; status?: string; q?: string; sort?: string; observation?: string }>
}) {
  const user = await getCurrentUser()
  const context = await requireCollectionViewer()
  const { collection } = context
  const canEdit = canCreateInCollection(user, context)
  const canViewPipeline = canEdit
    || (collection.acquisitionVisibility === 'MEMBERS' && context.membership?.status === 'ACTIVE')
    || (collection.acquisitionVisibility === 'PUBLIC' && collection.visibility === 'PUBLIC')
  const sp = await searchParams
  const statusFilter = sp.status || ''
  const q = (sp.q || '').trim().toLowerCase()
  const sort = sp.sort || 'priority'
  const collectionWhere = { collectionId: collection.id }

  if (!canViewPipeline) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Acquisition Pipeline</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-600">This collection has not made acquisition planning visible to your role.</p>
        </div>
        <Card>
          <p className="text-sm text-stone-600">Ask a collection manager for access if you need to review pre-accession research and wishlist records.</p>
        </Card>
      </div>
    )
  }

  const [definitions, locations, sources, distributors] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: {
        ...collectionWhere,
        ...(statusFilter ? { acquisitionStatus: statusFilter as any } : { acquisitionStatus: { not: null } }),
        ...(q ? {
          OR: [
            { genus: { contains: q, mode: 'insensitive' } },
            { species: { contains: q, mode: 'insensitive' } },
            { cultivarName: { contains: q, mode: 'insensitive' } },
            { acquisitionLabel: { contains: q, mode: 'insensitive' } },
            { acquisitionInterestNotes: { contains: q, mode: 'insensitive' } },
            { acquisitionResearchSummary: { contains: q, mode: 'insensitive' } },
            { plantObservations: { some: { OR: [{ vendor: { contains: q, mode: 'insensitive' } }, { distributor: { name: { contains: q, mode: 'insensitive' } } }, { distributorLocation: { name: { contains: q, mode: 'insensitive' } } }] } } },
            { acquisitionRecords: { some: { OR: [{ vendor: { contains: q, mode: 'insensitive' } }, { distributor: { name: { contains: q, mode: 'insensitive' } } }, { sources: { some: { source: { name: { contains: q, mode: 'insensitive' } } } } }] } } },
          ],
        } : {}),
      },
      include: {
        desiredLocation: { include: { locationType: true } },
        instances: { select: { id: true, status: true } },
        plantObservations: { include: { distributor: true, distributorLocation: true }, orderBy: { observedAt: 'desc' } },
        acquisitionRecords: { include: { distributor: true, distributorLocation: true, sources: { include: { source: true }, orderBy: { sortOrder: 'asc' } }, plantInstances: { include: { plantInstance: true } } }, orderBy: { acquiredAt: 'desc' } },
        acquisitionResearchEntries: { orderBy: { occurredAt: 'desc' } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.location.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.source.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' } }),
    prisma.distributor.findMany({ where: { collectionId: collection.id, active: true }, include: { locations: { where: { active: true }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
  ])
  const locationNodes = locations.map((location) => ({
    id: location.id,
    parentLocationId: location.parentLocationId,
    name: location.name,
    code: location.code,
    status: location.status,
    sortOrder: location.sortOrder,
    locationType: location.locationType,
  }))
  const sortedDefinitions = [...definitions].sort((left, right) => {
    if (sort === 'price') return Number(left.maximumPurchasePrice || 0) - Number(right.maximumPurchasePrice || 0)
    if (sort === 'recent') return Math.max(...left.plantObservations.map((item) => item.observedAt.getTime()), left.updatedAt.getTime()) - Math.max(...right.plantObservations.map((item) => item.observedAt.getTime()), right.updatedAt.getTime())
    if (sort === 'name') return plantName(left).localeCompare(plantName(right))
    return (right.acquisitionPriority || 0) - (left.acquisitionPriority || 0) || plantName(left).localeCompare(plantName(right))
  })
  if (sort === 'recent') sortedDefinitions.reverse()
  const selected = sortedDefinitions.find((definition) => definition.id === sp.definition) || sortedDefinitions[0] || null
  const selectedPhoto = selected
    ? await prisma.photo.findFirst({
        where: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId: selected.id },
        orderBy: [{ isType: 'desc' }, { createdAt: 'desc' }],
      })
    : null
  const selectedStats = selected ? priceStats(selected.plantObservations) : null
  const selectedObservation = selected?.plantObservations.find((observation) => observation.id === sp.observation) || null
  const activeIntentCount = definitions.filter((definition) => !['FULFILLED', 'NO_LONGER_INTERESTED'].includes(definition.acquisitionStatus || '')).length
  const ownedCount = selected?.instances.filter((instance) => instance.status !== 'ARCHIVED').length || 0
  const selectedBack = collectionPath(collection.slug, `/acquisitions?definition=${selected?.id || ''}`)
  const desiredLocationCompatibility = selected?.desiredLocationId
    ? evaluatePlantLocationCompatibility({
        plantRequirements: await getEffectivePlantEnvironmentRequirements(prisma, collection.id, { plantDefinitionId: selected.id }),
        locationEnvironment: await getEffectiveLocationEnvironment(prisma, collection.id, selected.desiredLocationId),
      })
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Acquisition Pipeline</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-600">
            Track research, wishlist intent, nursery sightings, and purchases before a plant becomes an accessioned specimen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[#c7d8bd] bg-[#edf3e6] px-3 py-1 text-sm font-semibold text-[#2f6b45]">{activeIntentCount} active</span>
          <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-sm font-semibold text-stone-700">{definitions.length} tracked</span>
        </div>
      </div>

      {canEdit && (
        <AddPanel label="Add acquisition target">
          <form action={createAcquisitionTarget} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Field label="Genus" name="genus" required />
            <Field label="Species" name="species" placeholder="sp." autoCapitalize="none" />
            <Field label="Cultivar" name="cultivarName" />
            <Select label="Status" name="acquisitionStatus" defaultValue="WISHLIST">
              {acquisitionStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Select label="Priority" name="acquisitionPriority" defaultValue="3">
              {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{stars(value)} {value}</option>)}
            </Select>
            <Field label="Desired size" name="desiredSpecimenSize" placeholder={'4", plug, mature'} />
            <Field label="Ideal price" name="idealPurchasePrice" type="number" step="0.01" />
            <Field label="Maximum price" name="maximumPurchasePrice" type="number" step="0.01" />
            <Select label="Desired location" name="desiredLocationId" defaultValue="" wrapperClassName="md:col-span-2">
              <option value="">No desired location</option>
              {locationNodes.map((location) => <option key={location.id} value={location.id}>{location.code} · {locationPath(location.id, locationNodes)}</option>)}
            </Select>
            <Field label="Preferred vendors" name="preferredVendors" placeholder="One per line or comma separated" wrapperClassName="md:col-span-2" />
            <TextArea label="Interest notes" name="acquisitionInterestNotes" wrapperClassName="md:col-span-2" />
            <TextArea label="Research summary" name="acquisitionResearchSummary" wrapperClassName="md:col-span-2" />
            <Button className="w-fit md:col-span-4">Add target</Button>
          </form>
        </AddPanel>
      )}

      <Card>
        <form className="grid gap-3 md:grid-cols-[1fr_12rem_12rem_auto] md:items-end">
          <Field label="Search" name="q" defaultValue={sp.q || ''} placeholder="Plant, vendor, note, cultivar" />
          <Select label="Status" name="status" defaultValue={statusFilter}>
            <option value="">All acquisition targets</option>
            {acquisitionStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select label="Sort" name="sort" defaultValue={sort}>
            <option value="priority">Priority</option>
            <option value="recent">Recently observed</option>
            <option value="price">Maximum price</option>
            <option value="name">Name</option>
          </Select>
          <Button>Filter</Button>
        </form>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,24rem)_1fr]">
        <div className="grid content-start gap-3">
          {sortedDefinitions.length === 0 && <Card><p className="text-sm text-stone-600">No acquisition targets match these filters.</p></Card>}
          {sortedDefinitions.map((definition) => {
            const stats = priceStats(definition.plantObservations)
            const isSelected = selected?.id === definition.id
            return (
              <Link
                key={definition.id}
                href={collectionPath(collection.slug, `/acquisitions?definition=${definition.id}${statusFilter ? `&status=${statusFilter}` : ''}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}&sort=${sort}`)}
                className={cn(
                  'block rounded-lg border bg-[#fffaf0]/82 p-3 text-sm shadow-sm transition hover:border-[#8fa58f]',
                  isSelected ? 'border-[#2f6b45] ring-2 ring-[#8fa58f]/20' : 'border-stone-200',
                )}
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f6b45]">{statusLabel(definition.acquisitionStatus)}</p>
                <h3 className="mt-1 font-serif text-xl font-semibold leading-tight">{plantName(definition)}</h3>
                <p className="mt-1 font-mono text-xs text-[#2f6b45]">{stars(definition.acquisitionPriority)}</p>
                <p className="mt-2 text-xs text-stone-600">
                  {definition.instances.length ? `Already owned (${definition.instances.length})` : 'Not yet owned'}
                  {definition.desiredLocation ? ` · wants ${definition.desiredLocation.code}` : ''}
                </p>
                <p className="mt-1 text-xs text-stone-600">
                  Target {money(definition.idealPurchasePrice)} / max {money(definition.maximumPurchasePrice)}
                  {stats ? ` · seen ${money(stats.lowest, stats.currency)}-${money(stats.highest, stats.currency)}` : ''}
                </p>
              </Link>
            )
          })}
        </div>

        {selected ? (
          <div className="grid gap-4">
            <Card>
              <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white/60">
                  <div className="aspect-[4/3]">
                    <PlantImage src={selectedPhoto} alt={plantName(selected)} />
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f6b45]">{statusLabel(selected.acquisitionStatus)} · {stars(selected.acquisitionPriority)}</p>
                      <h3 className="font-serif text-3xl font-semibold">{plantName(selected)}</h3>
                      <p className="mt-1 text-sm text-stone-600">{ownedCount ? `Already owned (${ownedCount} active specimen${ownedCount === 1 ? '' : 's'})` : 'Not yet owned'}</p>
                    </div>
                    <LinkButton href={collectionPath(collection.slug, `/plants/${selected.id}/edit`)}>Open definition</LinkButton>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-lg border border-stone-200 bg-white/50 p-3"><dt className="text-xs uppercase tracking-wide text-stone-500">Desired size</dt><dd className="font-semibold">{selected.desiredSpecimenSize || '—'}</dd></div>
                    <div className="rounded-lg border border-stone-200 bg-white/50 p-3"><dt className="text-xs uppercase tracking-wide text-stone-500">Ideal / max</dt><dd className="font-semibold">{money(selected.idealPurchasePrice)} / {money(selected.maximumPurchasePrice)}</dd></div>
                    <div className="rounded-lg border border-stone-200 bg-white/50 p-3"><dt className="text-xs uppercase tracking-wide text-stone-500">Desired location</dt><dd className="font-semibold">{selected.desiredLocation ? `${selected.desiredLocation.code} · ${locationPath(selected.desiredLocation.id, locationNodes)}` : '—'}</dd></div>
                    <div className="rounded-lg border border-stone-200 bg-white/50 p-3"><dt className="text-xs uppercase tracking-wide text-stone-500">Observations</dt><dd className="font-semibold">{selected.plantObservations.length}</dd></div>
                    <div className="rounded-lg border border-stone-200 bg-white/50 p-3"><dt className="text-xs uppercase tracking-wide text-stone-500">Observed price</dt><dd className="font-semibold">{selectedStats ? `${money(selectedStats.lowest, selectedStats.currency)} low · ${money(selectedStats.average, selectedStats.currency)} avg` : '—'}</dd></div>
                    <div className="rounded-lg border border-stone-200 bg-white/50 p-3"><dt className="text-xs uppercase tracking-wide text-stone-500">Preferred vendor</dt><dd className="font-semibold">{selectedStats?.preferredVendor || preferredVendors(selected.preferredVendorsJson).join(', ') || '—'}</dd></div>
                  </div>
                  {selected.acquisitionResearchSummary && <p className="mt-4 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3 text-sm">{selected.acquisitionResearchSummary}</p>}
                </div>
              </div>
            </Card>

            {desiredLocationCompatibility && (
              <PlantLocationCompatibilityPanel
                result={desiredLocationCompatibility}
                title={`Desired location: ${selected.desiredLocation?.code || 'location'}`}
              />
            )}

            {canEdit && (
              <Card>
                <details>
                  <summary className="cursor-pointer font-serif text-xl font-semibold">Edit acquisition intent</summary>
                  <form action={updateAcquisitionIntent} className="mt-4 grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="plantDefinitionId" value={selected.id} />
                    <input type="hidden" name="back" value={selectedBack} />
                    <Select label="Status" name="acquisitionStatus" defaultValue={selected.acquisitionStatus || ''}>
                      <option value="">No acquisition intent</option>
                      {acquisitionStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                    <Select label="Priority" name="acquisitionPriority" defaultValue={String(selected.acquisitionPriority || 3)}>
                      {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{stars(value)} {value}</option>)}
                    </Select>
                    <Field label="Desired size" name="desiredSpecimenSize" defaultValue={selected.desiredSpecimenSize} />
                    <Field label="Ideal price" name="idealPurchasePrice" type="number" step="0.01" defaultValue={selected.idealPurchasePrice ? String(selected.idealPurchasePrice) : ''} />
                    <Field label="Maximum price" name="maximumPurchasePrice" type="number" step="0.01" defaultValue={selected.maximumPurchasePrice ? String(selected.maximumPurchasePrice) : ''} />
                    <div className="md:col-span-2">
                      <LocationCompatibilitySelect
                        collectionSlug={collection.slug}
                        name="desiredLocationId"
                        label="Desired location"
                        defaultValue={selected.desiredLocationId}
                        plantDefinitionId={selected.id}
                        locations={locationNodes.map((location) => ({ id: location.id, label: `${location.code} · ${locationPath(location.id, locationNodes)}` }))}
                      />
                    </div>
                    <TextArea label="Preferred vendors" name="preferredVendors" defaultValue={preferredVendors(selected.preferredVendorsJson).join('\n')} wrapperClassName="md:col-span-2" />
                    <TextArea label="Interest notes" name="acquisitionInterestNotes" defaultValue={selected.acquisitionInterestNotes} wrapperClassName="md:col-span-2" />
                    <TextArea label="Research summary" name="acquisitionResearchSummary" defaultValue={selected.acquisitionResearchSummary} wrapperClassName="md:col-span-4" />
                    <Button className="w-fit md:col-span-4">Save intent</Button>
                  </form>
                </details>
              </Card>
            )}

            {canEdit && (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <h3 className="font-serif text-xl font-semibold">Research note</h3>
                  <form action={createAcquisitionResearchEntry} className="mt-3 grid gap-3">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="plantDefinitionId" value={selected.id} />
                    <input type="hidden" name="back" value={selectedBack} />
                    <Field label="Date" name="occurredAt" type="date" />
                    <Field label="Title" name="title" />
                    <TextArea label="Body" name="body" required />
                    <TextArea label="URLs" name="urls" />
                    <Field label="Source citation" name="sourceCitation" />
                    <Button>Add research</Button>
                  </form>
                </Card>
                <Card>
                  <h3 className="font-serif text-xl font-semibold">Seen at...</h3>
                  <form action={createPlantObservation} className="mt-3 grid gap-3">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="plantDefinitionId" value={selected.id} />
                    <input type="hidden" name="back" value={selectedBack} />
                    <Field label="Date" name="observedAt" type="date" />
                    <DistributorFields distributors={distributors} />
                    <Field label="Observed price" name="observedPrice" type="number" step="0.01" />
                    <Field label="Currency" name="currency" defaultValue="USD" />
                    <Field label="Specimen size" name="specimenSize" />
                    <Field label="Condition" name="condition" />
                    <Select label="Availability" name="availability" defaultValue="UNKNOWN">
                      {availabilities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                    <TextArea label="Notes" name="notes" />
                    <label className="flex items-start gap-2 rounded-md border border-stone-200 bg-white/55 p-3 text-sm"><input className="mt-1" type="checkbox" name="isPublic" /><span><span className="block font-semibold">Public observation</span><span className="block text-xs text-stone-600">Allow its date, price, size, condition, and availability in public-safe wishlist summaries. Distributor identity and notes remain private.</span></span></label>
                    <Button>Add observation</Button>
                  </form>
                </Card>
                <Card>
                  <h3 className="font-serif text-xl font-semibold">Acquire</h3>
                  <form action={createPlantAcquisitionRecord} className="mt-3 grid gap-3">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="plantDefinitionId" value={selected.id} />
                    <input type="hidden" name="back" value={selectedBack} />
                    <Field label="Purchase date" name="acquiredAt" type="date" />
                    {selectedObservation && <input type="hidden" name="observationId" value={selectedObservation.id} />}
                    <DistributorFields distributors={distributors} defaultDistributorId={selectedObservation?.distributorId || ''} defaultLocationId={selectedObservation?.distributorLocationId || ''} />
                    <AcquisitionSourceChainFields sources={sources} />
                    <Field label="Price" name="price" type="number" step="0.01" defaultValue={selectedObservation?.observedPrice ? String(selectedObservation.observedPrice) : ''} />
                    <Field label="Currency" name="currency" defaultValue="USD" />
                    <Field label="Quantity" name="quantity" type="number" min="1" max="50" defaultValue="1" />
                    <Field label="Specimen size" name="specimenSize" defaultValue={selectedObservation?.specimenSize || selected.desiredSpecimenSize || ''} />
                    <Field label="Pot size" name="potSize" />
                    <LocationCompatibilitySelect
                      collectionSlug={collection.slug}
                      name="initialLocationId"
                      label="Initial location"
                      defaultValue={selected.desiredLocationId}
                      plantDefinitionId={selected.id}
                      locations={locationNodes.map((location) => ({ id: location.id, label: `${location.code} · ${locationPath(location.id, locationNodes)}` }))}
                    />
                    <Select label="Create instances" name="createInstances" defaultValue="1">
                      <option value="1">Create Plant Instance(s)</option>
                      <option value="0">Record purchase only</option>
                    </Select>
                    <Select label="Instance type" name="instanceType" defaultValue="MOTHER">
                      <option value="MOTHER">Mother / established plant</option>
                      <option value="ACQUIRED_PROPAGATION">Acquired propagation</option>
                      <option value="PROPAGATION">Propagation</option>
                    </Select>
                    <Select label="After acquisition" name="fulfillmentChoice" defaultValue="FULFILLED">
                      <option value="FULFILLED">Mark intent fulfilled</option>
                      <option value="KEEP_ACTIVE">Keep active</option>
                      <option value="REPEAT_PURCHASE">Repeat purchase / still seeking</option>
                    </Select>
                    <TextArea label="Notes" name="notes" />
                    <Button>Record acquisition</Button>
                  </form>
                </Card>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <h3 className="font-serif text-xl font-semibold">Research Journal</h3>
                <div className="mt-3 grid gap-3">
                  {selected.acquisitionResearchEntries.map((entry) => (
                    <article key={entry.id} className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm">
                      <p className="text-xs text-stone-500">{formatDate(entry.occurredAt)}</p>
                      <h4 className="font-semibold">{entry.title}</h4>
                      <p className="mt-1 whitespace-pre-wrap">{entry.body}</p>
                      {entry.sourceCitation && <p className="mt-2 text-xs text-stone-600">Source: {entry.sourceCitation}</p>}
                      {urlList(entry.urlsJson).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {urlList(entry.urlsJson).map((url) => <a key={url} href={url} className="text-xs font-semibold text-[#2f6b45] underline">{url}</a>)}
                        </div>
                      )}
                    </article>
                  ))}
                  {selected.acquisitionResearchEntries.length === 0 && <p className="text-sm text-stone-600">No research entries yet.</p>}
                </div>
              </Card>
              <Card>
                <h3 className="font-serif text-xl font-semibold">Observations</h3>
                <div className="mt-3 grid gap-3">
                  {selected.plantObservations.map((observation) => (
                    <article key={observation.id} className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm">
                      <p className="text-xs text-stone-500">{formatDate(observation.observedAt)} · {observation.availability.toLowerCase().replaceAll('_', ' ')}</p>
                      <h4 className="font-semibold">{distributorDisplay(observation.distributor, observation.distributorLocation, observation.vendor)}</h4>
                      <p>{money(observation.observedPrice, observation.currency)} · {observation.specimenSize || 'size not recorded'}</p>
                      {observation.condition && <p className="text-stone-600">Condition: {observation.condition}</p>}
                      {observation.notes && <p className="mt-1 whitespace-pre-wrap">{observation.notes}</p>}
                      {canEdit && <Link className="mt-2 inline-block text-xs font-semibold text-[#2f6b45] underline" href={collectionPath(collection.slug, `/acquisitions?definition=${selected.id}&observation=${observation.id}`)}>Acquire from this observation</Link>}
                    </article>
                  ))}
                  {selected.plantObservations.length === 0 && <p className="text-sm text-stone-600">No sightings recorded yet.</p>}
                </div>
              </Card>
              <Card>
                <h3 className="font-serif text-xl font-semibold">Acquisition Records</h3>
                <div className="mt-3 grid gap-3">
                  {selected.acquisitionRecords.map((record) => (
                    <article key={record.id} className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm">
                      <p className="text-xs text-stone-500">{formatDate(record.acquiredAt)} · {record.fulfillmentChoice.toLowerCase().replaceAll('_', ' ')}</p>
                      <h4 className="font-semibold">{distributorDisplay(record.distributor, record.distributorLocation, record.vendor)}</h4>
                      <p>{record.quantity} item{record.quantity === 1 ? '' : 's'} · {money(record.price, record.currency)}</p>
                      <p className="mt-1 text-xs text-stone-600">Produced by: {sourceChainDisplay(record.sources, record.plantInstances[0]?.plantInstance.source)}</p>
                      {record.notes && <p className="mt-1 whitespace-pre-wrap">{record.notes}</p>}
                      {record.plantInstances.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {record.plantInstances.map(({ plantInstance }) => (
                            <Link key={plantInstance.id} className="rounded-md border border-[#c7d8bd] bg-[#edf3e6] px-2 py-1 font-mono text-xs font-semibold text-[#2f6b45]" href={collectionPath(collection.slug, `/instances/${plantInstance.id}`)}>
                              {plantInstance.plantId}
                            </Link>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                  {selected.acquisitionRecords.length === 0 && <p className="text-sm text-stone-600">No acquisition records yet.</p>}
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card><p className="text-sm text-stone-600">Add an acquisition target to start tracking pre-accession research.</p></Card>
        )}
      </div>
    </div>
  )
}
