import { updateValidatedPlantDefinition } from '@/app/actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { confidenceOptions } from '@/lib/taxonomy'
import { plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function EditValidatedDefinition({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireServerAdmin()
  const { id } = await params
  const definition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id, collectionId: null, isValidated: true },
  })

  return (
    <div className="space-y-6">
      <div>
        <Link href="/server/validated-definitions" className="text-sm font-medium text-[#2f6b45] underline">Back to validated definitions</Link>
        <h2 className="mt-2 text-3xl font-bold">Edit Validated Definition</h2>
        <p className="mt-1 text-sm text-stone-600">
          Changes here are site-level library updates. Collections using this definition can receive them in the Collection Update Digest.
        </p>
      </div>

      <Card>
        <h3 className="font-serif text-2xl font-semibold">{plantName(definition)}</h3>
        <form action={updateValidatedPlantDefinition} className="mt-4 grid gap-x-3 gap-y-3 md:grid-cols-2">
          <input type="hidden" name="id" value={definition.id} />
          <Field label="Genus" name="genus" defaultValue={definition.genus} required />
          <Field label="Species" help="Species epithet. Leave blank when the accepted horticultural name intentionally omits species (for example, Begonia 'Looking Glass'). Use sp. only when the species is genuinely unknown." name="species" defaultValue={definition.species || ''} />
          <Field label="Hybrid notation" name="hybridNotation" defaultValue={definition.hybridNotation || ''} />
          <Field label="Cultivar name" name="cultivarName" defaultValue={definition.cultivarName || ''} />
          <Field label="Authority" name="authority" defaultValue={definition.authority || ''} />
          <Field label="Registration number" name="cultivarRegistrationNumber" defaultValue={definition.cultivarRegistrationNumber || ''} />
          <Select label="Confidence" name="confidence" defaultValue={definition.confidence}>
            {confidenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Field label="Wikipedia URL" name="wikipediaUrl" defaultValue={definition.wikipediaUrl || ''} />
          <Field label="iNaturalist URL" name="inaturalistUrl" defaultValue={definition.inaturalistUrl || ''} />
          <Field label="POWO URL" name="powoUrl" defaultValue={definition.powoUrl || ''} />
          <Field label="GBIF URL" name="gbifUrl" defaultValue={definition.gbifUrl || ''} />
          <TextArea label="Description" name="description" defaultValue={definition.description || ''} wrapperClassName="md:col-span-2" />
          <TextArea label="Notes" name="notes" defaultValue={definition.notes || ''} wrapperClassName="md:col-span-2" />
          <TextArea label="Validation notes" name="validationNotes" defaultValue={definition.validationNotes || ''} wrapperClassName="md:col-span-2" />
          <Button className="justify-self-start md:col-span-2">Save validated definition</Button>
        </form>
      </Card>
    </div>
  )
}
