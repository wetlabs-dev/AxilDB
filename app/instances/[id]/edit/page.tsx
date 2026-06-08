import { deletePlantInstance, restorePlantInstance, updatePlantInstance } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Button, Card, Field, SuggestionDatalist, TextArea } from '@/components/ui'
import { requireCollectionAdmin } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { rankedSuggestions } from '@/lib/suggestions'
import { dateInput, plantName } from '@/lib/utils'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function EditInstance({ params }: { params: Promise<{ id: string }> }) {
  const { collection } = await requireCollectionAdmin()
  const { id } = await params
  const [instance, definitions, instanceSuggestionRows] = await Promise.all([
    prisma.plantInstance.findFirstOrThrow({ where: { id, collectionId: collection.id } }),
    prisma.plantDefinition.findMany({
      where: { OR: [{ collectionId: collection.id }, { collectionId: null, isValidated: true }] },
      orderBy: [{ isValidated: 'desc' }, { genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: collection.id },
      select: { location: true, source: true, distributor: true, stockNumber: true },
    }),
  ])
  const locationSuggestions = rankedSuggestions(instanceSuggestionRows.map((item) => item.location))
  const sourceSuggestions = rankedSuggestions(instanceSuggestionRows.map((item) => item.source))
  const distributorSuggestions = rankedSuggestions(instanceSuggestionRows.map((item) => item.distributor))
  const stockNumberSuggestions = rankedSuggestions(instanceSuggestionRows.map((item) => item.stockNumber))

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Edit Plant Instance</h2>
      <Card>
        <form action={updatePlantInstance} className="grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
          <SuggestionDatalist id="instance-location-suggestions" suggestions={locationSuggestions} />
          <SuggestionDatalist id="instance-source-suggestions" suggestions={sourceSuggestions} />
          <SuggestionDatalist id="instance-distributor-suggestions" suggestions={distributorSuggestions} />
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
          <Field label="Location" name="location" defaultValue={instance.location} list="instance-location-suggestions" />
          <Field label="Acquisition date" name="acquisitionDate" type="date" defaultValue={dateInput(instance.acquisitionDate)} />
          <Field label="Propagation date" name="propagationDate" type="date" defaultValue={dateInput(instance.propagationDate)} />
          <Field label="Source/propagator" name="source" defaultValue={instance.source} list="instance-source-suggestions" />
          <Field label="Distributor" name="distributor" defaultValue={instance.distributor} list="instance-distributor-suggestions" />
          <Field label="Stock number" name="stockNumber" defaultValue={instance.stockNumber} list="instance-stock-number-suggestions" />
          <Field label="Purchase price" name="purchasePrice" type="number" defaultValue={instance.purchasePrice?.toString()} />
          <Field label="Archive reason" name="archiveReason" defaultValue={instance.archiveReason} />
          <TextArea label="Archive notes" name="archiveNotes" defaultValue={instance.archiveNotes} wrapperClassName="lg:col-span-2" />
          <Button className="justify-self-start lg:col-span-4">Save changes</Button>
        </form>
      </Card>
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
