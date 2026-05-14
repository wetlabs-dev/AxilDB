import { prisma } from '@/lib/prisma'
import { updatePlantDefinition, deletePlantDefinition } from '@/app/actions'
import { Card, Field, TextArea, Button } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { requireAdminUser } from '@/lib/auth'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function EditPlant({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminUser()
  const { id } = await params
  const [plant, bodies] = await Promise.all([
    prisma.plantDefinition.findUniqueOrThrow({
      where: { id },
      include: {
        aliases: { orderBy: { name: 'asc' } },
        _count: { select: { instances: true } },
      },
    }),
    prisma.governingBody.findMany({ orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Edit Plant Definition</h2>
      <Card>
        <form action={updatePlantDefinition} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="id" value={id} />
          <Field label="Genus" name="genus" required defaultValue={plant.genus} />
          <Field label="Species" name="species" required defaultValue={plant.species} />
          <Field label="Hybrid notation" name="hybridNotation" defaultValue={plant.hybridNotation} />
          <Field label="Cultivar name" name="cultivarName" defaultValue={plant.cultivarName} />
          <Field label="Authority" name="authority" defaultValue={plant.authority} />
          <Field label="Cultivar registration number" name="cultivarRegistrationNumber" defaultValue={plant.cultivarRegistrationNumber} />
          <ConfidenceSelect name="confidence" defaultValue={plant.confidence} />
          <Field label="Acquisition label" name="acquisitionLabel" defaultValue={plant.acquisitionLabel} />
          <Field label="Provisional taxon" name="provisionalTaxon" defaultValue={plant.provisionalTaxon} />
          <label className="grid gap-1.5 text-sm font-medium text-stone-800">
            Governing body
            <select className={selectClass} name="governingBodyId" defaultValue={plant.governingBodyId || ''}>
              <option value="">—</option>
              {bodies.map((body) => (
                <option key={body.id} value={body.id}>
                  {body.name}
                </option>
              ))}
            </select>
          </label>
          <TextArea label="Description" name="description" defaultValue={plant.description} />
          <TextArea label="Notes" name="notes" defaultValue={plant.notes} />
          <PlantAliasFields aliases={plant.aliases} />
          <Button className="md:col-span-2">Save changes</Button>
        </form>
      </Card>
      <Card>
        <h3 className="font-bold">Delete</h3>
        <p className="mb-3 text-sm">Delete is only safe when no instances use this definition. Current instances: {plant._count.instances}</p>
        <form action={deletePlantDefinition}>
          <input type="hidden" name="id" value={id} />
          <ConfirmDeleteButton
            title="Delete plant definition?"
            message={`This will permanently delete ${plant.genus} ${plant.species}${plant.cultivarName ? ` '${plant.cultivarName}'` : ''}. Related instances may also be affected.`}
            confirmLabel="Delete definition"
          >
            Delete plant definition
          </ConfirmDeleteButton>
        </form>
      </Card>
    </div>
  )
}
