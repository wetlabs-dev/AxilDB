import { createPropagationEvent } from '@/app/actions'
import { PlantImage } from '@/components/PlantImage'
import { SortControl } from '@/components/SortControl'
import { AddPanel, Button, Card, Field, HelpTooltip, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { locationPathWithCodes } from '@/lib/locations'
import { fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'

const propagationSortOptions: SortOption[] = [
  { value: 'dateDesc', label: 'Newest propagation' },
  { value: 'dateAsc', label: 'Oldest propagation' },
  { value: 'updatedDesc', label: 'Recently updated' },
  { value: 'methodAsc', label: 'Method A-Z' },
  { value: 'statusAsc', label: 'Status A-Z' },
]

export default async function Propagations() {
  const user = await getCurrentUser()
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }
  const sortKey = await sortPreference(user?.id, 'propagations', 'dateDesc', propagationSortOptions.map((option) => option.value))
  const [instances, events, acquiredPropagations, locations] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, status: 'ACTIVE' },
      include: { plantDefinition: true },
      orderBy: { plantId: 'asc' },
    }),
    prisma.propagationEvent.findMany({
      where: collectionWhere,
      include: {
        parents: { include: { parentPlantInstance: { include: { plantDefinition: true } } } },
        children: { include: { childPlantInstance: { include: { plantDefinition: true } } } },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, status: { not: 'ARCHIVED' }, instanceType: 'ACQUIRED_PROPAGATION' },
      include: { plantDefinition: true },
      orderBy: { propagationDate: 'desc' },
    }),
    prisma.location.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, include: { locationType: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ])

  const instanceIds = Array.from(new Set(events.flatMap((event) => [
    ...event.parents.map((parent) => parent.parentPlantInstanceId),
    ...event.children.map((child) => child.childPlantInstanceId),
  ]).concat(acquiredPropagations.map((instance) => instance.id))))
  const photos = await prisma.photo.findMany({
    where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: { in: instanceIds } },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
  })
  const photoByInstance = photos.reduce<Record<string, (typeof photos)[number]>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const propagationItems = [
    ...events.map((event) => ({ kind: 'event' as const, event })),
    ...acquiredPropagations.map((instance) => ({ kind: 'acquired' as const, instance })),
  ]
  const sortedPropagationItems = propagationItems.sort((left, right) => {
    const leftDate = left.kind === 'event' ? left.event.date : (left.instance.propagationDate || left.instance.acquisitionDate || left.instance.createdAt)
    const rightDate = right.kind === 'event' ? right.event.date : (right.instance.propagationDate || right.instance.acquisitionDate || right.instance.createdAt)
    const leftUpdated = left.kind === 'event' ? left.event.updatedAt : left.instance.updatedAt
    const rightUpdated = right.kind === 'event' ? right.event.updatedAt : right.instance.updatedAt
    const leftMethod = left.kind === 'event' ? left.event.method : 'ACQUIRED'
    const rightMethod = right.kind === 'event' ? right.event.method : 'ACQUIRED'
    const leftStatus = left.kind === 'event' ? left.event.successStatus : left.instance.status
    const rightStatus = right.kind === 'event' ? right.event.successStatus : right.instance.status

    if (sortKey === 'dateAsc') return timeValue(leftDate) - timeValue(rightDate)
    if (sortKey === 'updatedDesc') return timeValue(rightUpdated) - timeValue(leftUpdated)
    if (sortKey === 'methodAsc') return compareText(leftMethod, rightMethod) || timeValue(rightDate) - timeValue(leftDate)
    if (sortKey === 'statusAsc') return compareText(leftStatus, rightStatus) || timeValue(rightDate) - timeValue(leftDate)
    return timeValue(rightDate) - timeValue(leftDate)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold">Propagations</h2>
        <SortControl
          section="propagations"
          value={sortKey}
          options={propagationSortOptions}
          back={collectionPath(collection.slug, '/propagations')}
          disabled={!user}
        />
      </div>

      {canCreateInCollection(user, context) && (
        <AddPanel label="Add propagation event">
          <form action={createPropagationEvent} className="grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <label className="grid gap-1 text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <span>Method</span>
                <HelpTooltip>The propagation technique used. This affects lineage graph styling and helps interpret parent/child records later.</HelpTooltip>
              </span>
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="method">
                <option>LEAF</option>
                <option>CUTTING</option>
                <option>RHIZOME_SPLIT</option>
                <option>DIVISION</option>
                <option>SEED</option>
                <option>TISSUE_CULTURE</option>
                <option>RUNNER</option>
                <option>OTHER</option>
              </select>
            </label>
            <Field label="Date" name="date" type="date" required />
            <label className="grid gap-1 text-sm font-medium">
              Parent / seed parent
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="parent1">
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.plantId} · {plantName(instance.plantDefinition)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Pollen parent, for seed only
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="parent2">
                <option value="">—</option>
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.plantId} · {plantName(instance.plantDefinition)}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Number of child plants to create" name="childCount" type="number" required defaultValue="1" min="1" max="50" />
            <p className="rounded-md border border-[#d6dfc9] bg-[#f5f4e8] px-3 py-2 text-sm text-stone-700 lg:col-span-2">
              Child plant IDs will be generated from the parent definition, propagation date, method, and sequence.
            </p>
            <label className="grid gap-1 text-sm font-medium">Child location<select name="currentLocationId" className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal"><option value="">No location</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationPathWithCodes(location.id, locations)}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <span>Success status</span>
                <HelpTooltip>Use pending while the propagation is still in progress, then update to success, partial, or failed once the outcome is clear.</HelpTooltip>
              </span>
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="successStatus">
                <option>PENDING</option>
                <option>SUCCESS</option>
                <option>PARTIAL</option>
                <option>FAILED</option>
              </select>
            </label>
            <TextArea label="Notes" name="notes" wrapperClassName="lg:col-span-2" />
            <Button className="justify-self-start lg:col-span-4">Create propagation</Button>
          </form>
        </AddPanel>
      )}

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {sortedPropagationItems.map((item) => {
          if (item.kind === 'acquired') {
            const { instance } = item
            const date = instance.propagationDate || instance.acquisitionDate || instance.createdAt

            return (
              <Card key={`acquired-${instance.id}`} className="flex h-full flex-col overflow-hidden p-0">
                <Link href={collectionPath(collection.slug, `/instances/${instance.id}`)} className="block flex-1">
                  <div className="aspect-[4/3] overflow-hidden">
                    <PlantImage src={photoByInstance[instance.id]} alt={instance.plantId} />
                  </div>
                  <div className="min-h-0 overflow-hidden p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2f6b45]">{fmtDate(date)} · ACQUIRED</p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight">{instance.plantId}</h3>
                    <p className="mt-1 text-xs text-stone-600">{instance.status}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-stone-700">
                      Acquired propagation · {plantName(instance.plantDefinition)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                      Source: {instance.source || instance.distributor || 'External source'}
                    </p>
                  </div>
                </Link>
                {canEditInCollection(user, context) && (
                  <div className="flex flex-wrap gap-2 border-t border-stone-200 p-3">
                    <Link className="plant-card-action inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm" href={collectionPath(collection.slug, `/instances/${instance.id}/edit`)}>Edit</Link>
                  </div>
                )}
              </Card>
            )
          }

          const { event } = item
          const firstChild = event.children[0]?.childPlantInstance
          const firstParent = event.parents[0]?.parentPlantInstance
          const image = photoByInstance[firstChild?.id || ''] || photoByInstance[firstParent?.id || '']

          return (
            <Card key={event.id} className="flex h-full flex-col overflow-hidden p-0">
              <Link href={firstChild ? collectionPath(collection.slug, `/instances/${firstChild.id}`) : collectionPath(collection.slug, '/propagations')} className="block flex-1">
                <div className="aspect-[4/3] overflow-hidden">
                  <PlantImage src={image} alt={firstChild?.plantId || event.method} />
                </div>
                <div className="min-h-0 overflow-hidden p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2f6b45]">{fmtDate(event.date)} · {event.method}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight">{firstChild?.plantId || event.method}</h3>
                  <p className="mt-1 text-xs text-stone-600">{event.successStatus}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-stone-700">
                    Children: {event.children.map((child) => child.childPlantInstance.plantId).join(', ') || '—'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                    Parents: {event.parents.map((parent) => parent.parentPlantInstance.plantId).join(', ') || '—'}
                  </p>
                </div>
              </Link>
              {canEditInCollection(user, context) && (
                <div className="flex flex-wrap gap-2 border-t border-stone-200 p-3">
                  <Link className="plant-card-action inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm" href={collectionPath(collection.slug, `/propagations/${event.id}/edit`)}>Edit</Link>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
