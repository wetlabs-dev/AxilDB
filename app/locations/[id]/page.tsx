import Link from 'next/link'
import { archiveLocation, movePlantInstanceLocation, updateLocation } from '@/app/actions'
import { Button, Card, Field, LinkButton, TextArea } from '@/components/ui'
import { canEditInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { descendantLocationIds, isQuarantineLocation, locationPath, locationPathWithCodes } from '@/lib/locations'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function LocationDetail({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCollectionViewer()
  const { collection, user } = context
  const { id } = await params
  const canManage = canManageCollection(user, context)
  const canMovePlants = canEditInCollection(user, context)
  const [location, allLocations, types] = await Promise.all([
    prisma.location.findFirstOrThrow({
      where: { id, collectionId: collection.id },
      include: { locationType: true, parentLocation: { include: { locationType: true } } },
    }),
    prisma.location.findMany({
      where: { collectionId: collection.id },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.locationType.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ])
  const activeLocations = allLocations.filter((item) => item.status === 'ACTIVE')
  const locationNodes = activeLocations.map((item) => ({
    id: item.id,
    parentLocationId: item.parentLocationId,
    name: item.name,
    code: item.code,
    status: item.status,
    sortOrder: item.sortOrder,
    locationType: item.locationType,
  }))
  const descendantIds = descendantLocationIds(location.id, allLocations)
  const locationAndDescendantIds = [location.id, ...Array.from(descendantIds)]
  const [directPlants, nestedPlants, childLocations, activeQuarantines] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { collectionId: collection.id, currentLocationId: location.id, status: 'ACTIVE' },
      include: { plantDefinition: true },
      orderBy: { plantId: 'asc' },
    }),
    descendantIds.size
      ? prisma.plantInstance.findMany({
          where: { collectionId: collection.id, currentLocationId: { in: Array.from(descendantIds) }, status: 'ACTIVE' },
          include: { plantDefinition: true, currentLocation: true },
          orderBy: { plantId: 'asc' },
        })
      : [],
    prisma.location.findMany({
      where: { collectionId: collection.id, parentLocationId: location.id, status: 'ACTIVE' },
      include: { locationType: true, _count: { select: { plantInstances: true, childLocations: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.plantQuarantine.findMany({
      where: {
        collectionId: collection.id,
        status: 'ACTIVE',
        plantInstance: { status: 'ACTIVE', currentLocationId: { in: locationAndDescendantIds } },
      },
      include: { plantInstance: { include: { plantDefinition: true, currentLocation: true } } },
      orderBy: { targetReleaseDate: 'asc' },
    }),
  ])
  const parentOptions = locationNodes.filter((item) => item.id !== location.id && !descendantIds.has(item.id))
  const isQuarantine = isQuarantineLocation(location)
  const overdueQuarantines = activeQuarantines.filter((quarantine) => quarantine.targetReleaseDate < new Date())

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">{location.name}</h2>
          <p className="mt-1 text-sm text-stone-600">{location.code} · {location.locationType.name}</p>
          <p className="mt-1 text-sm text-stone-600">Path: {locationPathWithCodes(location.id, locationNodes)}</p>
          <p className="mt-1 text-sm text-stone-600">
            Parent:{' '}
            {location.parentLocation ? (
              <Link className="font-medium text-[#2f6b45] underline" href={collectionPath(collection.slug, `/locations/${location.parentLocation.id}`)}>
                {location.parentLocation.code} · {location.parentLocation.name}
              </Link>
            ) : (
              'Top level'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={collectionPath(collection.slug, '/locations')}>All Locations</LinkButton>
          <LinkButton href={`/api/labels/bulk?collectionSlug=${encodeURIComponent(collection.slug)}&target=locations&id=${encodeURIComponent(location.id)}`}>QR label</LinkButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-stone-600">Direct plants</p>
          <p className="mt-2 text-3xl font-bold">{directPlants.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-600">Nested plants</p>
          <p className="mt-2 text-3xl font-bold">{nestedPlants.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-600">Child locations</p>
          <p className="mt-2 text-3xl font-bold">{childLocations.length}</p>
        </Card>
      </div>

      {(isQuarantine || activeQuarantines.length > 0) && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Quarantine review</h3>
          <p className="mt-1 text-sm text-stone-600">
            {isQuarantine ? 'This is a quarantine-type location.' : 'Active quarantine records for plants in this location tree.'}
            {' '}
            {overdueQuarantines.length} release review{overdueQuarantines.length === 1 ? '' : 's'} overdue.
          </p>
          <div className="mt-3 grid gap-2">
            {activeQuarantines.length === 0 && <p className="text-sm text-stone-600">No active quarantines in this location tree.</p>}
            {activeQuarantines.map((quarantine) => (
              <Link key={quarantine.id} href={collectionPath(collection.slug, `/instances/${quarantine.plantInstanceId}#quarantine`)} className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm underline">
                {quarantine.plantInstance.plantId} · {plantName(quarantine.plantInstance.plantDefinition)} · {quarantine.riskLevel.toLowerCase()} risk · release review {quarantine.targetReleaseDate.toLocaleDateString()}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-serif text-xl font-semibold">Child locations</h3>
        <div className="mt-3 grid gap-2">
          {childLocations.length === 0 && <p className="text-sm text-stone-600">No child locations.</p>}
          {childLocations.map((child) => (
            <Link key={child.id} href={collectionPath(collection.slug, `/locations/${child.id}`)} className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm underline">
              {child.code} · {child.name} · {child.locationType.name} · {child._count.plantInstances} direct plant(s)
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-serif text-xl font-semibold">Direct plants</h3>
          <div className="mt-3 grid gap-2">
            {directPlants.length === 0 && <p className="text-sm text-stone-600">No plants are directly assigned here.</p>}
            {directPlants.map((plant) => (
              <div key={plant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/55 p-3 text-sm">
                <div>
                  <Link href={collectionPath(collection.slug, `/instances/${plant.id}`)} className="font-semibold underline">{plant.plantId}</Link>
                  <p className="text-stone-600">{plantName(plant.plantDefinition)}</p>
                </div>
                {canMovePlants && (
                  <form action={movePlantInstanceLocation} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="plantInstanceId" value={plant.id} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/locations/${location.id}`)} />
                    <select className={selectClass} name="toLocationId" defaultValue={location.id}>
                      <option value="">No structured location</option>
                      {locationNodes.map((option) => <option key={option.id} value={option.id}>{option.code} · {locationPath(option.id, locationNodes)}</option>)}
                    </select>
                    <Button className="px-3 py-1.5">Move</Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-serif text-xl font-semibold">Nested plants</h3>
          <div className="mt-3 grid gap-2">
            {nestedPlants.length === 0 && <p className="text-sm text-stone-600">No plants are assigned in child locations.</p>}
            {nestedPlants.map((plant) => (
              <div key={plant.id} className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm">
                <Link href={collectionPath(collection.slug, `/instances/${plant.id}`)} className="font-semibold underline">{plant.plantId}</Link>
                <p className="text-stone-600">{plantName(plant.plantDefinition)}</p>
                <p className="text-xs text-stone-500">{plant.currentLocation ? `${plant.currentLocation.code} · ${plant.currentLocation.name}` : 'No location'}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {canManage && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Edit location</h3>
          <form action={updateLocation} className="mt-3 grid gap-2 md:grid-cols-2">
            <input type="hidden" name="id" value={location.id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/locations/${location.id}`)} />
            <Field label="Name" name="name" defaultValue={location.name} required />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Type
              <select className={selectClass} name="locationTypeId" defaultValue={location.locationTypeId}>
                {types.map((type) => <option key={type.id} value={type.id}>{type.name} ({type.abbreviation})</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Parent location
              <select className={selectClass} name="parentLocationId" defaultValue={location.parentLocationId || ''}>
                <option value="">Top level</option>
                {parentOptions.map((option) => <option key={option.id} value={option.id}>{option.code} · {locationPath(option.id, locationNodes)}</option>)}
              </select>
            </label>
            <Field label="Sort order" name="sortOrder" type="number" defaultValue={location.sortOrder} />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Status
              <select className={selectClass} name="status" defaultValue={location.status}>
                <option>ACTIVE</option>
                <option>ARCHIVED</option>
              </select>
            </label>
            <TextArea label="Description" name="description" defaultValue={location.description} wrapperClassName="md:col-span-2" />
            <Button className="justify-self-start md:col-span-2">Save location</Button>
          </form>
          <form action={archiveLocation} className="mt-4">
            <input type="hidden" name="id" value={location.id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Button className="bg-[#9a3f35] hover:bg-[#7d3028]">Archive empty location</Button>
          </form>
        </Card>
      )}
    </div>
  )
}
