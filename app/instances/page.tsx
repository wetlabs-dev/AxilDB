import { createLocation, createPlantInstance } from '@/app/actions'
import { startWorkflowRun } from '@/app/workflow-actions'
import { PlantImage } from '@/components/PlantImage'
import { PlantInstanceFilters } from '@/components/PlantInstanceFilters'
import { LifecycleDateFields } from '@/components/LifecycleDateFields'
import { LocationCompatibilitySelect } from '@/components/LocationCompatibilitySelect'
import { PlantDefinitionCascadePicker, type PlantDefinitionCascadeOption } from '@/components/PlantDefinitionCascadePicker'
import { PlantInstanceTypeSelect } from '@/components/PlantInstanceTypeSelect'
import { AcquisitionSourceChainFields } from '@/components/AcquisitionSourceChainFields'
import { DistributorFields } from '@/components/DistributorFields'
import { SortControl } from '@/components/SortControl'
import { SunshineButton } from '@/components/SunshineButton'
import { AddPanel, Button, Card, Field, SuggestionDatalist, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { descendantLocationIds, locationPath, locationPathWithCodes } from '@/lib/locations'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { sunshineCounts, sunshineKey, sunshineStateForUser, WELL_LOVED_THRESHOLD } from '@/lib/sunshine'
import { rankedSuggestions } from '@/lib/suggestions'
import { cn, plantName } from '@/lib/utils'
import { plantInstanceTypeLabel, plantInstanceTypes } from '@/lib/plant-instance-types'
import { decodeSpeciesFilter, getAvailableGenera, getSpeciesOptionsByGenus, matchingRawGenera, matchingRawSpecies, noSpeciesFilterToken } from '@/lib/taxonomy'
import { ensureStarterWorkflowTemplates } from '@/lib/workflows'
import Link from 'next/link'
import { PlantTagRow } from '@/components/PlantTagChip'
import { substrateAssignmentLabel, substrateLabel, substrateModes } from '@/lib/substrates'
import type { Prisma } from '@prisma/client'

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
  searchParams: Promise<{ definition?: string; genus?: string; species?: string; location?: string; includeNested?: string; tag?: string; type?: string; substrateMode?: string; substrateVersion?: string; substrateComponent?: string }>
}) {
  const user = await getCurrentUser()
  const sp = await searchParams
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }
  const definitionFilter = sp.definition || ''
  const genusFilter = String(sp.genus || '').trim()
  const speciesFilter = genusFilter ? decodeSpeciesFilter(sp.species) : ''
  const locationFilter = sp.location || ''
  const includeNestedLocations = sp.includeNested !== '0'
  const tagFilter = sp.tag || ''
  const typeFilter = plantInstanceTypes.includes(sp.type as any) ? sp.type || '' : ''
  const substrateModeFilter = sp.substrateMode || ''
  const substrateVersionFilter = sp.substrateVersion || ''
  const substrateComponentFilter = sp.substrateComponent || ''
  const sortKey = await sortPreference(user?.id, 'instances', 'plantIdAsc', instanceSortOptions.map((option) => option.value))
  await ensureStarterWorkflowTemplates(prisma, collection.id)
  const [defs, instanceSuggestionRows, instanceTaxonomyRows, locations, locationTypes, workflowTemplates, sources, distributors, sellers, activeTags, substrateVersions, substrateComponents] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: { OR: [collectionWhere, { collectionId: null, isValidated: true }] },
      orderBy: [{ isValidated: 'desc' }, { genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
    }),
    prisma.plantInstance.findMany({
      where: collectionWhere,
      select: { source: true, distributor: true, stockNumber: true, acquisitionLabel: true },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, status: 'ACTIVE' },
      select: { plantDefinition: { select: { genus: true, species: true } } },
      orderBy: { plantId: 'asc' },
    }),
    prisma.location.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.locationType.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.workflowTemplate.findMany({
      where: { collectionId: collection.id, isArchived: false },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
      take: 12,
    }),
    prisma.source.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' } }),
    prisma.distributor.findMany({ where: { collectionId: collection.id, active: true }, include: { outlets: { where: { active: true }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
    prisma.seller.findMany({ where: { collectionId: collection.id, active: true }, include: { storefronts: { where: { active: true }, include: { salesChannelType: true }, orderBy: { handleOrName: 'asc' } } }, orderBy: { name: 'asc' } }),
    prisma.plantTag.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' } }),
    prisma.substrateRecipeVersion.findMany({ where: { collectionId: collection.id, status: 'ACTIVE', recipe: { archivedAt: null } }, include: { recipe: true }, orderBy: { recipe: { name: 'asc' } } }),
    prisma.substrateComponent.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' } }),
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
  const selectedLocation = locationFilter ? locationNodes.find((location) => location.id === locationFilter) : null
  const filteredLocationIds = selectedLocation
    ? [selectedLocation.id, ...(includeNestedLocations ? Array.from(descendantLocationIds(selectedLocation.id, locationNodes)) : [])]
    : []
  const instanceTaxonomyDefinitions = instanceTaxonomyRows.map((row) => row.plantDefinition)
  const genusOptions = getAvailableGenera(instanceTaxonomyDefinitions)
  const speciesOptionsByGenus = getSpeciesOptionsByGenus(instanceTaxonomyDefinitions)
  const genusValues = genusFilter ? matchingRawGenera(instanceTaxonomyDefinitions, genusFilter) : []
  const speciesValues = genusFilter && speciesFilter ? matchingRawSpecies(instanceTaxonomyDefinitions, genusFilter, speciesFilter) : { values: [], includesNull: false }
  const speciesWhere: Prisma.PlantDefinitionWhereInput | null = speciesFilter
    ? speciesFilter === noSpeciesFilterToken
      ? { OR: [{ species: null }, { species: { in: speciesValues.values.length ? speciesValues.values : [''] } }] }
      : speciesValues.values.length
        ? { species: { in: speciesValues.values } }
        : { species: { equals: speciesFilter, mode: 'insensitive' } }
    : null
  const instanceWhere: Prisma.PlantInstanceWhereInput = {
    ...collectionWhere,
    status: 'ACTIVE',
    AND: [
      ...(definitionFilter ? [{ plantDefinitionId: definitionFilter }] : []),
      ...(genusFilter ? [{ plantDefinition: { genus: genusValues.length ? { in: genusValues } : { equals: genusFilter, mode: 'insensitive' as const } } }] : []),
      ...(speciesWhere ? [{ plantDefinition: speciesWhere }] : []),
      ...(filteredLocationIds.length ? [{ currentLocationId: { in: filteredLocationIds } }] : []),
      ...(tagFilter ? [{ plantDefinition: { tags: { some: { plantTagId: tagFilter } } } }] : []),
      ...(typeFilter ? [{ instanceType: typeFilter }] : []),
      ...(substrateModeFilter ? [{ currentSubstrate: { is: { substrateMode: substrateModeFilter } } }] : []),
      ...(substrateVersionFilter ? [{ currentSubstrate: { is: { substrateRecipeVersionId: substrateVersionFilter } } }] : []),
      ...(substrateComponentFilter ? [{ currentSubstrate: { is: { recipeVersion: { components: { some: { substrateComponentId: substrateComponentFilter } } } } } }] : []),
    ],
  }
  const instances = await prisma.plantInstance.findMany({
    where: instanceWhere,
    include: { plantDefinition: { include: { tags: { include: { plantTag: true }, orderBy: { plantTag: { name: 'asc' } } } } }, currentLocation: { include: { locationType: true } }, currentSubstrate: { include: { recipeVersion: { include: { recipe: true } } } }, quarantines: { where: { status: 'ACTIVE' }, take: 1 } },
    orderBy: { plantId: 'asc' },
  })
  const stockNumberSuggestions = rankedSuggestions(instanceSuggestionRows.map((instance) => instance.stockNumber))
  const acquisitionLabelSuggestions = rankedSuggestions(instanceSuggestionRows.map((instance) => instance.acquisitionLabel))
  const filteredDefinition = definitionFilter
    ? defs.find((definition) => definition.id === definitionFilter)
    : null
  const filterParams = new URLSearchParams()
  if (definitionFilter) filterParams.set('definition', definitionFilter)
  if (genusFilter) filterParams.set('genus', genusFilter)
  if (speciesFilter) filterParams.set('species', speciesFilter)
  if (locationFilter) filterParams.set('location', locationFilter)
  if (tagFilter) filterParams.set('tag', tagFilter)
  if (typeFilter) filterParams.set('type', typeFilter)
  if (substrateModeFilter) filterParams.set('substrateMode', substrateModeFilter)
  if (substrateVersionFilter) filterParams.set('substrateVersion', substrateVersionFilter)
  if (substrateComponentFilter) filterParams.set('substrateComponent', substrateComponentFilter)
  filterParams.set('includeNested', includeNestedLocations ? '1' : '0')
  const instancesBackPath = collectionPath(collection.slug, `/instances${filterParams.toString() ? `?${filterParams}` : ''}`)
  const definitionOptions: PlantDefinitionCascadeOption[] = defs.map((definition) => ({
    id: definition.id,
    genus: definition.genus,
    species: definition.species,
    hybridNotation: definition.hybridNotation,
    cultivarName: definition.cultivarName,
    displayName: plantName(definition),
    isValidated: definition.isValidated,
    identificationStatus: definition.identificationStatus,
    confidence: definition.confidence,
  }))
  const careSyncParams = new URLSearchParams()
  if (definitionFilter) careSyncParams.set('definitionId', definitionFilter)
  if (locationFilter) {
    careSyncParams.set('locationId', locationFilter)
    careSyncParams.set('includeNested', includeNestedLocations ? '1' : '0')
  }
  const careSyncPath = collectionPath(collection.slug, `/care/sync${careSyncParams.toString() ? `?${careSyncParams}` : ''}`)

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
          {selectedLocation && (
            <p className="mt-1 text-sm text-stone-600">
              Filtered to {locationPathWithCodes(selectedLocation.id, locationNodes)}
              {includeNestedLocations ? ' including child locations' : ' only'}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {canCreateInCollection(user, context) && (
            <Link className="rounded-md border border-[#c7d8bd] bg-white/70 px-3 py-2 text-sm font-semibold text-[#2f6b45] shadow-sm hover:bg-[#f5fbf0]" href={careSyncPath}>
              Sync care schedules
            </Link>
          )}
          <SortControl
            section="instances"
            value={sortKey}
            options={instanceSortOptions}
            back={instancesBackPath}
            disabled={!user}
          />
        </div>
      </div>

      <Card>
        <PlantInstanceFilters
          genus={genusFilter}
          species={speciesFilter}
          location={locationFilter}
          includeNested={includeNestedLocations}
          tag={tagFilter}
          type={typeFilter}
          substrateMode={substrateModeFilter}
          substrateVersion={substrateVersionFilter}
          substrateComponent={substrateComponentFilter}
          genusOptions={genusOptions}
          speciesOptionsByGenus={speciesOptionsByGenus}
          locationOptions={locationNodes.map((location) => ({ value: location.id, label: locationPathWithCodes(location.id, locationNodes) }))}
          tagOptions={activeTags.map((tag) => ({ value: tag.id, label: tag.name }))}
          typeOptions={plantInstanceTypes.map((type) => ({ value: type, label: plantInstanceTypeLabel(type) }))}
          substrateModeOptions={substrateModes.map((mode) => ({ value: mode, label: substrateLabel(mode) }))}
          substrateVersionOptions={substrateVersions.map((version) => ({ value: version.id, label: `${version.recipe.name} v${version.versionNumber}` }))}
          substrateComponentOptions={substrateComponents.map((component) => ({ value: component.id, label: component.name }))}
          visibleCount={sortedInstances.length}
          totalCount={instanceTaxonomyRows.length}
          hasActiveFilters={Boolean(definitionFilter || genusFilter || speciesFilter || locationFilter || tagFilter || typeFilter || substrateModeFilter || substrateVersionFilter || substrateComponentFilter || !includeNestedLocations)}
          clearHref={collectionPath(collection.slug, '/instances')}
        />
      </Card>

      {canCreateInCollection(user, context) && (
        <AddPanel label="Add plant instance">
          <SuggestionDatalist id="instance-stock-number-suggestions" suggestions={stockNumberSuggestions} />
          <SuggestionDatalist id="instance-acquisition-label-suggestions" suggestions={acquisitionLabelSuggestions} />
          <form action={createPlantInstance} className="grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <PlantDefinitionCascadePicker definitions={definitionOptions} name="plantDefinitionId" required createHref={collectionPath(collection.slug, '/plants')} />
            <PlantInstanceTypeSelect />
            <p className="rounded-md border border-[#d6dfc9] bg-[#f5f4e8] px-3 py-2 text-sm text-stone-700 lg:col-span-2">
              Plant ID will be generated automatically from the plant definition, relevant date, and record type.
            </p>
            <LocationCompatibilitySelect
              collectionSlug={collection.slug}
              name="currentLocationId"
              locations={locationNodes.map((location) => ({ id: location.id, label: `${location.code} · ${locationPath(location.id, locationNodes)}` }))}
              definitionSelectName="plantDefinitionId"
            />
            <LifecycleDateFields />
            <Field label="Acquisition label" help="The name or identification written on this particular specimen when it entered the collection. It does not change the shared plant definition." name="acquisitionLabel" list="instance-acquisition-label-suggestions" wrapperClassName="lg:col-span-2" />
            <div className="lg:col-span-4"><DistributorFields distributors={distributors} sellers={sellers} /></div>
            <div className="lg:col-span-4"><AcquisitionSourceChainFields sources={sources} /></div>
            <Field label="Stock number" help="Optional vendor, nursery, or collection stock number from the original source." name="stockNumber" list="instance-stock-number-suggestions" />
            <Field label="Purchase price" help="Optional cost record for your own collection tracking." name="purchasePrice" type="number" min="0" step="0.01" />
            <label className="grid gap-1 text-sm font-medium">Initial substrate<select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="substrateMode" defaultValue="RECEIVED_SUBSTRATE">{substrateModes.map((mode) => <option key={mode} value={mode}>{substrateLabel(mode)}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Substrate recipe version<select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="substrateRecipeVersionId" defaultValue=""><option value="">Choose when using Recipe</option>{substrateVersions.map((version) => <option key={version.id} value={version.id}>{version.recipe.name} v{version.versionNumber}</option>)}</select></label>
            <Field label="Received/custom substrate description" name="receivedSubstrateDescription" wrapperClassName="lg:col-span-2" />
            <Field label="Substrate notes" name="substrateNotes" wrapperClassName="lg:col-span-2" />
            <TextArea label="Notes" help="Initial observation or context to add to the plant's note history at creation." name="note" wrapperClassName="lg:col-span-2" />
            <Button className="justify-self-start lg:col-span-4">Create instance</Button>
          </form>
          {canManageCollection(user, context) && (
            <form action={createLocation} className="mt-4 grid max-w-5xl gap-x-3 gap-y-2 border-t border-stone-200 pt-4 lg:grid-cols-4">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="back" value={instancesBackPath} />
              <p className="text-sm font-semibold text-stone-700 lg:col-span-4">Quick-create a location</p>
              <Field label="Location name" name="name" required />
              <label className="grid gap-1 text-sm font-medium">
                Type
                <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="locationTypeId" required>
                  {locationTypes.length === 0 && <option value="">Create a type on Locations first</option>}
                  {locationTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name} ({type.abbreviation})</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Parent location
                <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="parentLocationId" defaultValue="">
                  <option value="">Top level</option>
                  {locationNodes.map((location) => (
                    <option key={location.id} value={location.id}>{locationPathWithCodes(location.id, locationNodes)}</option>
                  ))}
                </select>
              </label>
              <Field label="Sort order" name="sortOrder" type="number" defaultValue="0" />
              <Button className="justify-self-start lg:col-span-4">Create location</Button>
            </form>
          )}
        </AddPanel>
      )}

      {canManageCollection(user, context) && (
        <Card>
          <form id="selected-plants-merge" action={collectionPath(collection.slug, '/instances/merge')} className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-bold">Pot checked specimens together</p><p className="text-xs text-stone-500">Select at least two active specimens with the same plant definition.</p></div>
            <Button>Review permanent merge</Button>
          </form>
        </Card>
      )}

      {canCreateInCollection(user, context) && (
        <Card>
          <form id="selected-plants-workflow" action={startWorkflowRun} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="scopeType" value="PLANTS" />
            <label className="grid gap-1 text-sm font-medium">
              Start workflow for checked plants
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="templateId">
                {workflowTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <Button>Start selected workflow</Button>
          </form>
          <p className="mt-2 text-xs text-stone-500">Check specimens below, then start a workflow scoped to those plants.</p>
        </Card>
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
              {canCreateInCollection(user, context) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-stone-200 bg-white/70 px-3 py-2 text-xs font-semibold">
                  <label className="flex items-center gap-2"><input form="selected-plants-workflow" type="checkbox" name="plantInstanceId" value={instance.id} />Workflow</label>
                  {canManageCollection(user, context) && <label className="flex items-center gap-2"><input form="selected-plants-merge" type="checkbox" name="ids" value={instance.id} />Pot together</label>}
                </div>
              )}
              <Link href={collectionPath(collection.slug, `/instances/${instance.id}`)} className="block flex-1">
                <div className="aspect-[4/3] overflow-hidden">
                  <PlantImage src={photoByInstance[instance.id]} alt={instance.plantId} />
                </div>
                <div className="min-h-0 overflow-hidden p-3">
                  <p className="line-clamp-2 text-sm font-bold underline">{instance.plantId}</p>
                  <p className="line-clamp-2 text-sm text-stone-700">
                    {instance.plantDefinition.isValidated ? 'Validated: ' : ''}{plantName(instance.plantDefinition)}
                  </p>
                  <p className="truncate text-sm text-stone-600">
                    {plantInstanceTypeLabel(instance.instanceType)} · {instance.currentLocation ? `${instance.currentLocation.code} · ${locationPath(instance.currentLocation.id, locationNodes)}` : 'No location'}
                  </p>
                  <p className="mt-1 truncate text-xs text-stone-600">Substrate: {substrateAssignmentLabel(instance.currentSubstrate)}</p>
                  <div className="mt-2"><PlantTagRow tags={instance.plantDefinition.tags.map((item) => item.plantTag)} limit={3} /></div>
                  {instance.quarantines.length > 0 && (
                    <p className="mt-2 inline-flex rounded-full border border-[#c9a15b] bg-[#fff2cf] px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#6f4b12]">
                      Quarantine
                    </p>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-2 border-t border-stone-200 p-3">
                {canEditInCollection(user, context) && <Link className="rounded-md border px-2 py-1 text-xs" href={collectionPath(collection.slug, `/instances/${instance.id}/edit`)}>Edit</Link>}
                <Link className="rounded-md border px-2 py-1 text-xs" href={collectionPath(collection.slug, `/labels/${instance.id}`)}>Label</Link>
                <div className="ml-auto">
                  <SunshineButton
                    collectionSlug={collection.slug}
                    targetId={instance.id}
                    count={count}
                    active={currentUserSunshine.has(sunshineKey('PLANT_INSTANCE', instance.id))}
                    canToggle={Boolean(user)}
                    compact
                  />
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
