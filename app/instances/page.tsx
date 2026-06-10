import { createPlantInstance } from '@/app/actions'
import { PlantImage } from '@/components/PlantImage'
import { SortControl } from '@/components/SortControl'
import { SunshineButton } from '@/components/SunshineButton'
import { AddPanel, Button, Card, Field, HelpTooltip, SuggestionDatalist, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { sunshineCounts, sunshineKey, sunshineStateForUser, WELL_LOVED_THRESHOLD } from '@/lib/sunshine'
import { rankedSuggestions } from '@/lib/suggestions'
import { cn, plantName } from '@/lib/utils'
import Link from 'next/link'

const instanceSortOptions: SortOption[] = [
  { value: 'plantIdAsc', label: 'Plant ID A-Z' },
  { value: 'plantIdDesc', label: 'Plant ID Z-A' },
  { value: 'updatedDesc', label: 'Recently updated' },
  { value: 'updatedAsc', label: 'Oldest updated' },
  { value: 'acquiredDesc', label: 'Newest acquired' },
  { value: 'acquiredAsc', label: 'Oldest acquired' },
  { value: 'sunshineDesc', label: 'Sunshine high-low' },
  { value: 'sunshineAsc', label: 'Sunshine low-high' },
]

export default async function Instances({
  searchParams,
}: {
  searchParams: Promise<{ definition?: string }>
}) {
  const user = await getCurrentUser()
  const sp = await searchParams
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }
  const definitionFilter = sp.definition || ''
  const sortKey = await sortPreference(user?.id, 'instances', 'plantIdAsc', instanceSortOptions.map((option) => option.value))
  const [instances, defs, instanceSuggestionRows] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, status: 'ACTIVE', ...(definitionFilter ? { plantDefinitionId: definitionFilter } : {}) },
      include: { plantDefinition: true },
      orderBy: { plantId: 'asc' },
    }),
    prisma.plantDefinition.findMany({
      where: { OR: [collectionWhere, { collectionId: null, isValidated: true }] },
      orderBy: [{ isValidated: 'desc' }, { genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
    }),
    prisma.plantInstance.findMany({
      where: collectionWhere,
      select: { location: true, source: true, distributor: true, stockNumber: true },
    }),
  ])
  const locationSuggestions = rankedSuggestions(instanceSuggestionRows.map((instance) => instance.location))
  const sourceSuggestions = rankedSuggestions(instanceSuggestionRows.map((instance) => instance.source))
  const distributorSuggestions = rankedSuggestions(instanceSuggestionRows.map((instance) => instance.distributor))
  const stockNumberSuggestions = rankedSuggestions(instanceSuggestionRows.map((instance) => instance.stockNumber))
  const filteredDefinition = definitionFilter
    ? defs.find((definition) => definition.id === definitionFilter)
    : null

  const photos = await prisma.photo.findMany({
    where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: { in: instances.map((item) => item.id) } },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
  })
  const photoByInstance = photos.reduce<Record<string, (typeof photos)[number]>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const instanceSunshineTargets = instances.map((instance) => ({ targetType: 'PLANT_INSTANCE' as const, targetId: instance.id }))
  const [instanceSunshineCounts, currentUserSunshine] = await Promise.all([
    sunshineCounts(prisma, collection.id, instanceSunshineTargets),
    sunshineStateForUser(prisma, collection.id, user?.id, instanceSunshineTargets),
  ])
  const sunshineCount = (instanceId: string) => instanceSunshineCounts.get(sunshineKey('PLANT_INSTANCE', instanceId)) || 0
  const sortedInstances = [...instances].sort((left, right) => {
    if (sortKey === 'plantIdDesc') return compareText(right.plantId, left.plantId)
    if (sortKey === 'updatedDesc') return timeValue(right.updatedAt) - timeValue(left.updatedAt)
    if (sortKey === 'updatedAsc') return timeValue(left.updatedAt) - timeValue(right.updatedAt)
    if (sortKey === 'acquiredDesc') return timeValue(right.acquisitionDate || right.createdAt) - timeValue(left.acquisitionDate || left.createdAt)
    if (sortKey === 'acquiredAsc') return timeValue(left.acquisitionDate || left.createdAt) - timeValue(right.acquisitionDate || right.createdAt)
    if (sortKey === 'sunshineDesc') return sunshineCount(right.id) - sunshineCount(left.id) || compareText(left.plantId, right.plantId)
    if (sortKey === 'sunshineAsc') return sunshineCount(left.id) - sunshineCount(right.id) || compareText(left.plantId, right.plantId)
    return compareText(left.plantId, right.plantId)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Plant Instances</h2>
          {filteredDefinition && (
            <p className="mt-1 text-sm text-stone-600">
              Showing {plantName(filteredDefinition)}.
              {' '}
              <Link className="font-medium text-[#2f6b45] underline" href={collectionPath(collection.slug, '/instances')}>Show all instances</Link>
            </p>
          )}
        </div>
        <SortControl
          section="instances"
          value={sortKey}
          options={instanceSortOptions}
          back={collectionPath(collection.slug, definitionFilter ? `/instances?definition=${encodeURIComponent(definitionFilter)}` : '/instances')}
          disabled={!user}
        />
      </div>

      {canCreateInCollection(user, context) && (
        <AddPanel label="Add plant instance">
          <SuggestionDatalist id="instance-location-suggestions" suggestions={locationSuggestions} />
          <SuggestionDatalist id="instance-source-suggestions" suggestions={sourceSuggestions} />
          <SuggestionDatalist id="instance-distributor-suggestions" suggestions={distributorSuggestions} />
          <SuggestionDatalist id="instance-stock-number-suggestions" suggestions={stockNumberSuggestions} />
          <form action={createPlantInstance} className="grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <label className="grid gap-1 text-sm font-medium">
              Plant definition
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="plantDefinitionId" required>
                {defs.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.isValidated ? 'Validated: ' : ''}{plantName(definition)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <span>Type</span>
                <HelpTooltip>Mother plants are acquired established/source plants. Acquired propagations are starter plants, cuttings, or leaf props from outside this collection. Propagations are plants created from tracked parents inside this collection.</HelpTooltip>
              </span>
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="instanceType">
                <option>MOTHER</option>
                <option>ACQUIRED_PROPAGATION</option>
                <option>PROPAGATION</option>
              </select>
            </label>
            <p className="rounded-md border border-[#d6dfc9] bg-[#f5f4e8] px-3 py-2 text-sm text-stone-700 lg:col-span-2">
              Plant ID will be generated automatically from the plant definition, relevant date, and record type.
            </p>
            <Field label="Location" name="location" list="instance-location-suggestions" />
            <Field label="Acquisition date" help="When this physical plant entered your collection." name="acquisitionDate" type="date" />
            <Field label="Propagation date" help="When this plant was propagated, if it was created from another plant." name="propagationDate" type="date" />
            <Field label="Source/propagator" help="Who produced or propagated the plant, or the immediate source of the plant material." name="source" list="instance-source-suggestions" />
            <Field label="Distributor" help="The seller, vendor, swap partner, or organization that distributed the plant to you." name="distributor" list="instance-distributor-suggestions" />
            <Field label="Stock number" help="Optional vendor, nursery, or collection stock number from the original source." name="stockNumber" list="instance-stock-number-suggestions" />
            <Field label="Purchase price" help="Optional cost record for your own collection tracking." name="purchasePrice" type="number" />
            <TextArea label="Notes" help="Initial observation or context to add to the plant's note history at creation." name="note" wrapperClassName="lg:col-span-2" />
            <Button className="justify-self-start lg:col-span-4">Create instance</Button>
          </form>
        </AddPanel>
      )}

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {sortedInstances.map((instance) => {
          const count = sunshineCount(instance.id)
          return (
            <Card
              key={instance.id}
              className={cn(
                'flex h-full flex-col overflow-hidden p-0',
                count >= WELL_LOVED_THRESHOLD ? 'well-loved-card' : '',
              )}
            >
              <Link href={collectionPath(collection.slug, `/instances/${instance.id}`)} className="block flex-1">
                <div className="aspect-[4/3] overflow-hidden">
                  <PlantImage src={photoByInstance[instance.id]} alt={instance.plantId} />
                </div>
                <div className="min-h-0 overflow-hidden p-3">
                  <p className="line-clamp-2 text-sm font-bold underline">{instance.plantId}</p>
                  <p className="line-clamp-2 text-sm text-stone-700">
                    {instance.plantDefinition.isValidated ? 'Validated: ' : ''}{plantName(instance.plantDefinition)}
                  </p>
                  <p className="truncate text-sm text-stone-600">{instance.instanceType} · {instance.location || 'No location'}</p>
                </div>
              </Link>
              <div className="flex gap-2 border-t border-stone-200 p-3">
                {canEditInCollection(user, context) && <Link className="rounded-md border px-2 py-1 text-xs" href={collectionPath(collection.slug, `/instances/${instance.id}/edit`)}>Edit</Link>}
                <Link className="rounded-md border px-2 py-1 text-xs" href={collectionPath(collection.slug, `/labels/${instance.id}`)}>Label</Link>
              </div>
              <div className="border-t border-stone-200 p-3">
                <SunshineButton
                  collectionSlug={collection.slug}
                  targetId={instance.id}
                  count={count}
                  active={currentUserSunshine.has(sunshineKey('PLANT_INSTANCE', instance.id))}
                  canToggle={Boolean(user)}
                  compact
                />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
