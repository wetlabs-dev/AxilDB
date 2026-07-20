import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { archiveLocation, regenerateLocationCode, updateLocation } from '@/app/actions'
import { startWorkflowRun } from '@/app/workflow-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { CompatibilityMoveForm } from '@/components/CompatibilityMoveForm'
import { LocationEnvironmentForm } from '@/components/LocationEnvironmentForm'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { EffectiveEnvironmentSummary, PlantLocationCompatibilityPanel } from '@/components/PlantLocationCompatibilityPanel'
import { Button, Card, Field, LinkButton, TextArea } from '@/components/ui'
import { canCreateInCollection, canEditInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { descendantLocationIds, isQuarantineLocation, locationPath, locationPathWithCodes, nextLocationCode } from '@/lib/locations'
import { evaluatePlantLocationCompatibility, getEffectiveLocationEnvironment, getEffectivePlantEnvironmentRequirements } from '@/lib/location-compatibility'
import { prisma } from '@/lib/prisma'
import { getUserUnitPreferences } from '@/lib/units'
import { plantName } from '@/lib/utils'
import { ensureStarterWorkflowTemplates } from '@/lib/workflows'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function LocationDetail({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCollectionViewer()
  const { collection, user } = context
  const { id } = await params
  const canManage = canManageCollection(user, context)
  const canBulkCare = canCreateInCollection(user, context)
  const canMovePlants = canEditInCollection(user, context)
  if (canBulkCare) await ensureStarterWorkflowTemplates(prisma, collection.id)
  const [location, allLocations, types, unitPreferences] = await Promise.all([
    prisma.location.findFirstOrThrow({
      where: { id, collectionId: collection.id },
      include: { locationType: true, parentLocation: { include: { locationType: true } }, environmentProfile: true },
    }),
    prisma.location.findMany({
      where: { collectionId: collection.id },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.locationType.findMany({ where: { collectionId: collection.id, status: 'ACTIVE' }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    getUserUnitPreferences(prisma, user?.id),
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
  const [directPlants, nestedPlants, childLocations, activeQuarantines, workflowTemplates, activeWorkflowRuns] = await Promise.all([
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
    prisma.workflowTemplate.findMany({ where: { collectionId: collection.id, isArchived: false }, orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }] }),
    prisma.workflowRun.findMany({
      where: { collectionId: collection.id, locationId: location.id, status: 'ACTIVE' },
      include: { steps: true, assignedTo: { select: { email: true } } },
      orderBy: { startedAt: 'desc' },
      take: 6,
    }),
  ])
  const parentOptions = locationNodes.filter((item) => item.id !== location.id && !descendantIds.has(item.id))
  const isQuarantine = isQuarantineLocation(location)
  const overdueQuarantines = activeQuarantines.filter((quarantine) => quarantine.targetReleaseDate < new Date())
  const expectedCodePrefix = `LOC-${location.locationType.abbreviation.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'LOC'}-`
  const canRegenerateLocationCode = canManage && !location.code.startsWith(expectedCodePrefix)
  const proposedLocationCode = canRegenerateLocationCode
    ? await nextLocationCode(prisma, collection.id, location.locationType.abbreviation)
    : location.code
  const effectiveEnvironment = await getEffectiveLocationEnvironment(prisma, collection.id, location.id)
  const directCompatibility = await Promise.all(directPlants.map(async (plant) => {
    const requirements = await getEffectivePlantEnvironmentRequirements(prisma, collection.id, { plantInstanceId: plant.id })
    return { plant, result: evaluatePlantLocationCompatibility({ plantRequirements: requirements, locationEnvironment: effectiveEnvironment }) }
  }))
  const compatibilityCounts = directCompatibility.reduce((counts, item) => {
    counts[item.result.overallStatus] += 1
    return counts
  }, { GOOD_MATCH: 0, CAUTION: 0, POOR_MATCH: 0, INSUFFICIENT_DATA: 0 })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-bold">{location.name}</h2>
            {canRegenerateLocationCode && (
              <form action={regenerateLocationCode}>
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="id" value={location.id} />
                <input type="hidden" name="proposedCode" value={proposedLocationCode} />
                <ConfirmDeleteButton
                  title="Regenerate location code?"
                  message={`Change this location code from ${location.code} to ${proposedLocationCode}? Existing QR links point to this same location record, but printed labels using the old code should be replaced.`}
                  confirmLabel="Regenerate code"
                  pendingLabel={<><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /><span className="sr-only">Regenerating location code</span></>}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#c7d8bd] bg-[#f5fbf0] p-0 text-[#2f6b45] shadow-sm hover:bg-[#e6f0db]"
                  confirmClassName="bg-[#2f6b45] hover:bg-[#245737]"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Regenerate location code</span>
                </ConfirmDeleteButton>
              </form>
            )}
          </div>
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
          {canBulkCare && <LinkButton href={collectionPath(collection.slug, `/care/bulk?locationId=${encodeURIComponent(location.id)}&includeNested=1`)}>Bulk care</LinkButton>}
          {canBulkCare && <LinkButton href={collectionPath(collection.slug, `/care/sync?locationId=${encodeURIComponent(location.id)}&includeNested=1`)}>Sync care</LinkButton>}
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

      <Card id="environment">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Environment</h3>
            <p className="mt-1 text-sm text-stone-600">Effective conditions combine local values with the nearest configured ancestor.</p>
          </div>
          <span className="rounded-full border border-[#c7d8bd] bg-[#edf3e6] px-3 py-1 text-xs font-semibold text-[#2f6b45]">
            {effectiveEnvironment.completeness.replaceAll('_', ' ').toLowerCase()}
          </span>
        </div>
        <div className="mt-4">
          <EffectiveEnvironmentSummary environment={effectiveEnvironment} unitPreferences={unitPreferences} />
        </div>
        {effectiveEnvironment.stale && <p className="mt-3 rounded-md border border-[#d8bb72] bg-[#fff7dc] px-3 py-2 text-sm text-[#71551b]">The newest effective measurement is more than one year old. Confirm that these conditions are still current.</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-stone-200 bg-white/55 p-3"><p className="text-xs text-stone-500">Good matches</p><p className="text-2xl font-bold">{compatibilityCounts.GOOD_MATCH}</p></div>
          <div className="rounded-md border border-stone-200 bg-white/55 p-3"><p className="text-xs text-stone-500">Review</p><p className="text-2xl font-bold">{compatibilityCounts.CAUTION}</p></div>
          <div className="rounded-md border border-stone-200 bg-white/55 p-3"><p className="text-xs text-stone-500">Poor matches</p><p className="text-2xl font-bold">{compatibilityCounts.POOR_MATCH}</p></div>
          <div className="rounded-md border border-stone-200 bg-white/55 p-3"><p className="text-xs text-stone-500">Not enough data</p><p className="text-2xl font-bold">{compatibilityCounts.INSUFFICIENT_DATA}</p></div>
        </div>
        {directCompatibility.some((item) => item.result.overallStatus === 'CAUTION' || item.result.overallStatus === 'POOR_MATCH') && (
          <details className="mt-4 rounded-lg border border-stone-200 bg-white/45 p-3">
            <summary className="cursor-pointer font-semibold">Review affected plants</summary>
            <div className="mt-3 grid gap-3">
              {directCompatibility.filter((item) => ['CAUTION', 'POOR_MATCH'].includes(item.result.overallStatus)).map((item) => (
                <PlantLocationCompatibilityPanel key={item.plant.id} result={item.result} title={`${item.plant.plantId} compatibility`} compact unitPreferences={unitPreferences} />
              ))}
            </div>
          </details>
        )}
        {canManage && (
          <details className="mt-4 rounded-lg border border-stone-200 bg-white/45 p-3">
            <summary className="cursor-pointer font-semibold">Edit local environment profile</summary>
            <div className="mt-4"><LocationEnvironmentForm collectionSlug={collection.slug} locationId={location.id} profile={location.environmentProfile} unitPreferences={unitPreferences} /></div>
          </details>
        )}
      </Card>

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
          {canBulkCare && activeQuarantines.length > 0 && (
            <form action={startWorkflowRun} className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-200 pt-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="scopeType" value="PLANTS" />
              {activeQuarantines.map((quarantine) => <input key={quarantine.id} type="hidden" name="plantInstanceId" value={quarantine.plantInstanceId} />)}
              <select name="templateId" className={selectClass}>
                {workflowTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <Button>Start quarantine workflow</Button>
            </form>
          )}
        </Card>
      )}

      {canBulkCare && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl font-semibold">Location workflows</h3>
              <p className="mt-1 text-sm text-stone-600">Start a greenhouse round, pest response, move, or other workflow scoped to this location.</p>
            </div>
            <form action={startWorkflowRun} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="scopeType" value="LOCATION" />
              <input type="hidden" name="locationId" value={location.id} />
              <input type="hidden" name="includeNestedLocations" value="1" />
              <select name="templateId" className={selectClass}>
                {workflowTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <Button>Start workflow here</Button>
            </form>
          </div>
          <div className="mt-3 grid gap-2">
            {activeWorkflowRuns.length === 0 && <p className="text-sm text-stone-600">No active workflow runs for this location.</p>}
            {activeWorkflowRuns.map((run) => (
              <Link key={run.id} href={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm underline">
                {run.title} · {run.steps.filter((step) => step.status !== 'PENDING').length}/{run.steps.length} steps · assigned to {run.assignedTo?.email || 'no one'}
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
                  <PlantIdPreviewLink collectionSlug={collection.slug} plantId={plant.plantId} href={collectionPath(collection.slug, `/instances/${plant.id}`)}>
                    {plant.plantId}
                  </PlantIdPreviewLink>
                  <p className="text-stone-600">{plantName(plant.plantDefinition)}</p>
                </div>
                {canMovePlants && (
                  <CompatibilityMoveForm collectionSlug={collection.slug} plantInstanceId={plant.id} currentLocationId={location.id} locations={locationNodes.map((option) => ({ id: option.id, label: `${option.code} · ${locationPath(option.id, locationNodes)}` }))} />
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
                <PlantIdPreviewLink collectionSlug={collection.slug} plantId={plant.plantId} href={collectionPath(collection.slug, `/instances/${plant.id}`)}>
                  {plant.plantId}
                </PlantIdPreviewLink>
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
