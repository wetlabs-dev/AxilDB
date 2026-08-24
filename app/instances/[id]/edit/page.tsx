import { createLocation, deletePlantInstance, restorePlantInstance, updatePlantInstance } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { LocationCompatibilitySelect } from '@/components/LocationCompatibilitySelect'
import { Button, Card, Field, SuggestionDatalist, TextArea } from '@/components/ui'
import { canManageCollection, collectionPath, requireCollectionAdmin } from '@/lib/collections'
import { locationPath, locationPathWithCodes } from '@/lib/locations'
import { prisma } from '@/lib/prisma'
import { rankedSuggestions } from '@/lib/suggestions'
import { dateInput, plantName } from '@/lib/utils'
import { isHistoricalConstituent } from '@/lib/plant-instance-merges'
import { redirect } from 'next/navigation'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function EditInstance({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCollectionAdmin()
  const { collection, user } = context
  const { id } = await params
  const [instance, definitions, instanceSuggestionRows, locations, locationTypes] = await Promise.all([
    prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id } }),
    prisma.plantDefinition.findMany({
      where: { OR: [{ collectionId: collection.id }, { collectionId: null, isValidated: true }] },
      orderBy: [{ isValidated: 'desc' }, { genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: collection.id },
      select: { stockNumber: true },
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
  ])
  if (isHistoricalConstituent(instance.status)) redirect(collectionPath(collection.slug, `/instances/${id}`))
  const canManage = canManageCollection(user, context)
  const locationNodes = locations.map((location) => ({
    id: location.id,
    parentLocationId: location.parentLocationId,
    name: location.name,
    code: location.code,
    status: location.status,
    sortOrder: location.sortOrder,
    locationType: location.locationType,
  }))
  const stockNumberSuggestions = rankedSuggestions(instanceSuggestionRows.map((item) => item.stockNumber))

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Edit Plant Instance</h2>
      <Card>
        <form action={updatePlantInstance} className="grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
          <SuggestionDatalist id="instance-stock-number-suggestions" suggestions={stockNumberSuggestions} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <label className="grid gap-1 text-sm font-medium text-stone-800">
            Plant definition
            <select className={selectClass} name="plantDefinitionId" defaultValue={instance.plantDefinitionId}>
              {definitions.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.isValidated ? 'Validated: ' : ''}{plantName(definition)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1 text-sm font-medium text-stone-800">
            Plant ID
            <div className="rounded-md border border-stone-300 bg-[#f5f4e8] px-3 py-2 font-normal text-stone-700">{instance.plantId}</div>
          </div>
          <label className="grid gap-1 text-sm font-medium text-stone-800">
            Type
            <select className={selectClass} name="instanceType" defaultValue={instance.instanceType}>
              <option>MOTHER</option>
              <option>ACQUIRED_PROPAGATION</option>
              <option>PROPAGATION</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-stone-800">
            Status
            <select className={selectClass} name="status" defaultValue={instance.status}>
              <option>ACTIVE</option>
              <option>ARCHIVED</option>
            </select>
          </label>
          <LocationCompatibilitySelect
            collectionSlug={collection.slug}
            name="currentLocationId"
            defaultValue={instance.currentLocationId}
            plantInstanceId={instance.id}
            locations={locationNodes.map((location) => ({ id: location.id, label: `${location.code} · ${locationPath(location.id, locationNodes)}` }))}
          />
          <Field label="Propagation date" name="propagationDate" type="date" defaultValue={dateInput(instance.propagationDate)} />
          <Field label="Stock number" name="stockNumber" defaultValue={instance.stockNumber} list="instance-stock-number-suggestions" />
          <div className="rounded-md border border-stone-200 bg-[#f5f4e8] px-3 py-2 text-sm lg:col-span-2"><span className="font-semibold">Acquisition details are managed separately.</span><a className="ml-2 font-semibold text-[#2f6b45] underline" href={collectionPath(collection.slug, `/instances/${instance.id}/acquisition`)}>Edit acquisition &amp; provenance</a></div>
          <Field label="Archive reason" name="archiveReason" defaultValue={instance.archiveReason} />
          <TextArea label="Archive notes" name="archiveNotes" defaultValue={instance.archiveNotes} wrapperClassName="lg:col-span-2" />
          <Button className="justify-self-start lg:col-span-4">Save changes</Button>
        </form>
      </Card>
      {canManage && (
        <Card>
          <h3 className="font-bold">Quick-create location</h3>
          <form action={createLocation} className="mt-3 grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}/edit`)} />
            <Field label="Location name" name="name" required />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Type
              <select className={selectClass} name="locationTypeId" required>
                {locationTypes.length === 0 && <option value="">Create a type on Locations first</option>}
                {locationTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name} ({type.abbreviation})</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Parent location
              <select className={selectClass} name="parentLocationId" defaultValue="">
                <option value="">Top level</option>
                {locationNodes.map((location) => (
                  <option key={location.id} value={location.id}>{locationPathWithCodes(location.id, locationNodes)}</option>
                ))}
              </select>
            </label>
            <Field label="Sort order" name="sortOrder" type="number" defaultValue="0" />
            <Button className="justify-self-start lg:col-span-4">Create location</Button>
          </form>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="font-bold">Restore</h3>
          <form action={restorePlantInstance}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Button>Restore active</Button>
          </form>
        </Card>
        <Card>
          <h3 className="font-bold">Delete</h3>
          <p className="mb-3 text-sm">Deletes this physical plant record. Related blooms and sport records cascade.</p>
          <form action={deletePlantInstance}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <ConfirmDeleteButton
              title="Delete plant instance?"
              message={`This will permanently delete ${instance.plantId}, including related bloom and sport records.`}
              confirmLabel="Delete instance"
            >
              Delete instance
            </ConfirmDeleteButton>
          </form>
        </Card>
      </div>
    </div>
  )
}
