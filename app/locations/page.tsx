import Link from 'next/link'
import { batchMovePlantLocations, createLocation, createLocationType, updateLocationType } from '@/app/actions'
import { AddPanel, Button, Card, Field, LinkButton, TextArea } from '@/components/ui'
import { LocationDragDropManager } from '@/components/LocationDragDropManager'
import { CompatibilityMoveForm } from '@/components/CompatibilityMoveForm'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { canEditInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { descendantLocationIds, locationPath, locationPathWithCodes } from '@/lib/locations'
import { evaluatePlantLocationCompatibility, getEffectiveLocationEnvironment, getEffectivePlantEnvironmentRequirements } from '@/lib/location-compatibility'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

function locationRows(locations: any[], parentId: string | null = null, depth = 0): any[] {
  return locations
    .filter((location) => (location.parentLocationId || null) === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    .flatMap((location) => [{ ...location, depth }, ...locationRows(locations, location.id, depth + 1)])
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ batchSource?: string; batchDestination?: string; batchScope?: string }>
}) {
  const context = await requireCollectionViewer()
  const sp = await searchParams
  const { collection, user } = context
  const canManage = canManageCollection(user, context)
  const canMovePlants = canEditInCollection(user, context)
  const [types, locations, plants] = await Promise.all([
    prisma.locationType.findMany({ where: { collectionId: collection.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.location.findMany({
      where: { collectionId: collection.id },
      include: { locationType: true, _count: { select: { plantInstances: true, childLocations: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { plantDefinition: true, currentLocation: true },
      orderBy: { plantId: 'asc' },
    }),
  ])
  const activeTypes = types.filter((type) => type.status === 'ACTIVE')
  const activeLocations = locations.filter((location) => location.status === 'ACTIVE')
  const rows = locationRows(activeLocations)
  const locationNodes = activeLocations.map((location) => ({
    id: location.id,
    parentLocationId: location.parentLocationId,
    name: location.name,
    code: location.code,
    status: location.status,
    sortOrder: location.sortOrder,
    locationType: location.locationType,
  }))
  const batchSource = sp.batchSource || ''
  const batchDestination = sp.batchDestination || ''
  const batchScope = sp.batchScope === 'nested' ? 'nested' : 'direct'
  const batchSourceLocation = batchSource ? locationNodes.find((location) => location.id === batchSource) : null
  const batchDestinationLocation = batchDestination ? locationNodes.find((location) => location.id === batchDestination) : null
  const batchSourceIds = batchSourceLocation
    ? [batchSourceLocation.id, ...(batchScope === 'nested' ? Array.from(descendantLocationIds(batchSourceLocation.id, locationNodes)) : [])]
    : []
  const batchPreviewPlants = batchSourceLocation && batchDestinationLocation
    ? plants.filter((plant) => plant.currentLocationId && batchSourceIds.includes(plant.currentLocationId) && plant.currentLocationId !== batchDestinationLocation.id)
    : []
  const batchDestinationEnvironment = batchDestinationLocation
    ? await getEffectiveLocationEnvironment(prisma, collection.id, batchDestinationLocation.id)
    : null
  const batchCompatibility = batchDestinationEnvironment
    ? await Promise.all(batchPreviewPlants.map(async (plant) => ({
        plantId: plant.id,
        result: evaluatePlantLocationCompatibility({
          plantRequirements: await getEffectivePlantEnvironmentRequirements(prisma, collection.id, { plantInstanceId: plant.id }),
          locationEnvironment: batchDestinationEnvironment,
        }),
      })))
    : []
  const batchCompatibilityByPlantId = new Map(batchCompatibility.map((item) => [item.plantId, item.result]))
  const batchCompatibilityCounts = batchCompatibility.reduce((counts, item) => {
    counts[item.result.overallStatus] += 1
    return counts
  }, { GOOD_MATCH: 0, CAUTION: 0, POOR_MATCH: 0, INSUFFICIENT_DATA: 0 })
  const batchHasWarnings = batchCompatibilityCounts.CAUTION + batchCompatibilityCounts.POOR_MATCH > 0
  const dragDropLocations = activeLocations.map((location) => {
    const descendantIds = descendantLocationIds(location.id, activeLocations)
    const nestedPlantCount = plants.filter((plant) => plant.currentLocationId && descendantIds.has(plant.currentLocationId)).length
    return {
      id: location.id,
      parentLocationId: location.parentLocationId,
      name: location.name,
      code: location.code,
      sortOrder: location.sortOrder,
      status: location.status,
      locationType: location.locationType,
      directPlantCount: location._count.plantInstances,
      childLocationCount: location._count.childLocations,
      nestedPlantCount,
    }
  })
  const dragDropPlants = plants.map((plant) => ({
    id: plant.id,
    plantId: plant.plantId,
    name: plantName(plant.plantDefinition),
    currentLocationId: plant.currentLocationId,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Locations</h2>
          <p className="mt-1 text-sm text-stone-600">Map rooms, cabinets, shelves, benches, and other collection spaces. Moving a parent keeps children and assigned plants inside that hierarchy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={collectionPath(collection.slug, '/instances')}>Plant Instances</LinkButton>
        </div>
      </div>

      {canManage && (
        <div className="grid gap-3 lg:grid-cols-2">
          <AddPanel label="Add location">
            {activeTypes.length === 0 ? (
              <p className="text-sm text-stone-600">Create a location type first.</p>
            ) : (
              <form action={createLocation} className="grid gap-2 md:grid-cols-2">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <Field label="Name" name="name" required />
                <label className="grid gap-1 text-sm font-medium text-stone-800">
                  Type
                  <select className={selectClass} name="locationTypeId" required>
                    {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name} ({type.abbreviation})</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-stone-800">
                  Parent location
                  <select className={selectClass} name="parentLocationId" defaultValue="">
                    <option value="">Top level</option>
                    {locationNodes.map((location) => <option key={location.id} value={location.id}>{location.code} · {locationPath(location.id, locationNodes)}</option>)}
                  </select>
                </label>
                <Field label="Sort order" name="sortOrder" type="number" defaultValue="0" />
                <TextArea label="Description" name="description" wrapperClassName="md:col-span-2" />
                <Button className="justify-self-start md:col-span-2">Create location</Button>
              </form>
            )}
          </AddPanel>
          <AddPanel label="Add location type">
            <form action={createLocationType} className="grid gap-2 md:grid-cols-2">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <Field label="Name" name="name" required placeholder="Shelf" />
              <Field label="Abbreviation" name="abbreviation" required placeholder="SH" />
              <Field label="Sort order" name="sortOrder" type="number" defaultValue="0" />
              <TextArea label="Description" name="description" wrapperClassName="md:col-span-2" />
              <Button className="justify-self-start md:col-span-2">Create location type</Button>
            </form>
          </AddPanel>
        </div>
      )}

      <Card>
        <LocationDragDropManager
          collectionSlug={collection.slug}
          locations={dragDropLocations}
          plants={dragDropPlants}
          canManage={canManage}
          canMovePlants={canMovePlants}
        />
        <div className="mt-4 border-t border-stone-200 pt-3">
          <h3 className="font-serif text-xl font-semibold">Location links and labels</h3>
          <div className="mt-3 grid gap-2">
            {rows.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No locations yet.</p>}
            {rows.map((location) => (
              <div key={location.id} className="rounded-lg border border-stone-200 bg-white/55 p-3" style={{ marginLeft: `${Math.min(location.depth, 5) * 1.25}rem` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={collectionPath(collection.slug, `/locations/${location.id}`)} className="font-serif text-lg font-semibold underline">
                      {location.name}
                    </Link>
                    <p className="text-sm text-stone-600">{location.code} · {location.locationType.name} · {location._count.plantInstances} direct plant(s) · {location._count.childLocations} child location(s)</p>
                  </div>
                  <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-xs font-semibold" href={`/api/labels/bulk?collectionSlug=${encodeURIComponent(collection.slug)}&target=locations&id=${encodeURIComponent(location.id)}`}>
                    QR label
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {canMovePlants && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Batch move plants</h3>
          <p className="mt-1 text-sm text-stone-600">Preview direct-only or nested moves, then confirm the exact active plants to move.</p>
          <form action={collectionPath(collection.slug, '/locations')} className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem_auto] md:items-end">
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Source location
              <select className={selectClass} name="batchSource" defaultValue={batchSource}>
                <option value="">Choose source</option>
                {locationNodes.map((location) => <option key={location.id} value={location.id}>{locationPathWithCodes(location.id, locationNodes)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Destination
              <select className={selectClass} name="batchDestination" defaultValue={batchDestination}>
                <option value="">Choose destination</option>
                {locationNodes.map((location) => <option key={location.id} value={location.id}>{locationPathWithCodes(location.id, locationNodes)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Scope
              <select className={selectClass} name="batchScope" defaultValue={batchScope}>
                <option value="direct">Direct plants only</option>
                <option value="nested">Direct + nested plants</option>
              </select>
            </label>
            <Button className="px-3 py-2">Preview</Button>
          </form>
          {batchSourceLocation && batchDestinationLocation && (
            <form action={batchMovePlantLocations} className="mt-4 rounded-lg border border-stone-200 bg-white/55 p-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="sourceLocationId" value={batchSourceLocation.id} />
              <input type="hidden" name="toLocationId" value={batchDestinationLocation.id} />
              <input type="hidden" name="scope" value={batchScope} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, '/locations')} />
              <div className="grid gap-2 text-sm md:grid-cols-3">
                <p><span className="font-semibold">Source:</span> {locationPathWithCodes(batchSourceLocation.id, locationNodes)}</p>
                <p><span className="font-semibold">Destination:</span> {locationPathWithCodes(batchDestinationLocation.id, locationNodes)}</p>
                <p><span className="font-semibold">Preview:</span> {batchPreviewPlants.length} plant{batchPreviewPlants.length === 1 ? '' : 's'}</p>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <p className="rounded-md border border-[#a8c49a] bg-[#edf3e6] p-2"><strong>{batchCompatibilityCounts.GOOD_MATCH}</strong> good</p>
                <p className="rounded-md border border-[#d8bb72] bg-[#fff7dc] p-2"><strong>{batchCompatibilityCounts.CAUTION}</strong> review</p>
                <p className="rounded-md border border-[#c98b74] bg-[#fff0e8] p-2"><strong>{batchCompatibilityCounts.POOR_MATCH}</strong> poor match</p>
                <p className="rounded-md border border-stone-300 bg-stone-100 p-2"><strong>{batchCompatibilityCounts.INSUFFICIENT_DATA}</strong> unknown</p>
              </div>
              <div className="mt-3 grid gap-2">
                {batchPreviewPlants.length === 0 && <p className="text-sm text-stone-600">No eligible active plants for this move.</p>}
                {batchPreviewPlants.map((plant) => (
                  <label key={plant.id} className="flex items-start gap-2 rounded-md border border-stone-200 bg-white/60 p-2 text-sm">
                    <input type="checkbox" name="plantInstanceId" value={plant.id} defaultChecked />
                    <span>
                      <span className="font-semibold">{plant.plantId}</span> · {plantName(plant.plantDefinition)}
                      <span className="block text-xs text-stone-500">{plant.currentLocation ? `${plant.currentLocation.code} ${plant.currentLocation.name}` : 'No location'}</span>
                      {batchCompatibilityByPlantId.get(plant.id) && <span className="block text-xs font-semibold text-stone-600">Compatibility: {batchCompatibilityByPlantId.get(plant.id)!.overallStatus.replaceAll('_', ' ').toLowerCase()}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <TextArea label="Batch note" name="notes" className="min-h-16" />
                <label className="flex items-center gap-2 rounded-md border border-stone-200 bg-white/60 px-3 py-2 text-sm font-medium">
                  <input type="checkbox" name="confirm" value="yes" required />
                  Confirm move
                </label>
              </div>
              {batchHasWarnings && (
                <label className="mt-3 flex items-start gap-2 rounded-md border border-[#d8bb72] bg-[#fff7dc] px-3 py-2 text-sm font-medium text-[#71551b]">
                  <input type="checkbox" name="compatibilityConfirm" value="yes" required />
                  I reviewed the environmental cautions. Move these plants anyway.
                </label>
              )}
              <Button className="mt-3 px-3 py-2" disabled={batchPreviewPlants.length === 0}>Move selected plants</Button>
            </form>
          )}
        </Card>
      )}

      {canMovePlants && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Move plants</h3>
          <p className="mt-1 text-sm text-stone-600">Gardeners can move plants between existing locations. Managers can restructure the location tree.</p>
          <div className="mt-4 grid gap-2">
            {plants.map((plant) => (
              <div key={plant.id} className="grid gap-2 rounded-lg border border-stone-200 bg-white/50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] md:items-center">
                <div className="min-w-0">
                  <PlantIdPreviewLink collectionSlug={collection.slug} plantId={plant.plantId} href={collectionPath(collection.slug, `/instances/${plant.id}`)}>
                    {plant.plantId}
                  </PlantIdPreviewLink>
                  <p className="truncate text-sm text-stone-600">{plantName(plant.plantDefinition)} · {plant.currentLocation ? `${plant.currentLocation.code} ${plant.currentLocation.name}` : 'No location'}</p>
                </div>
                <CompatibilityMoveForm collectionSlug={collection.slug} plantInstanceId={plant.id} currentLocationId={plant.currentLocationId} locations={locationNodes.map((location) => ({ id: location.id, label: `${location.code} · ${locationPath(location.id, locationNodes)}` }))} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {canManage && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Location types</h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {types.map((type) => (
              <form key={type.id} action={updateLocationType} className="grid gap-2 rounded-lg border border-stone-200 bg-white/50 p-3 md:grid-cols-2">
                <input type="hidden" name="id" value={type.id} />
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="back" value={collectionPath(collection.slug, '/locations')} />
                <Field label="Name" name="name" defaultValue={type.name} required />
                <Field label="Abbreviation" name="abbreviation" defaultValue={type.abbreviation} required />
                <Field label="Sort order" name="sortOrder" type="number" defaultValue={type.sortOrder} />
                <label className="grid gap-1 text-sm font-medium text-stone-800">
                  Status
                  <select className={selectClass} name="status" defaultValue={type.status}>
                    <option>ACTIVE</option>
                    <option>ARCHIVED</option>
                  </select>
                </label>
                <TextArea label="Description" name="description" defaultValue={type.description} wrapperClassName="md:col-span-2" />
                <Button className="justify-self-start md:col-span-2">Save type</Button>
              </form>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
