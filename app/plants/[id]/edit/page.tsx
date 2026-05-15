import { prisma } from '@/lib/prisma'
import { updatePlantDefinition, deletePlantDefinition } from '@/app/actions'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { requireAdminUser } from '@/lib/auth'
import { PlantImage } from '@/components/PlantImage'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

const uploadErrorMessages: Record<string, string> = {
  missing_photo: 'Choose an image file before uploading.',
  unsupported_format: 'That image format is not supported by this server. Try exporting it as JPEG, PNG, WebP, TIFF, or AVIF first.',
  processing_failed: 'That image could not be processed. If it came from an iPhone photo library, try exporting it as a JPEG and uploading that version.',
  upload_failed: 'The image was processed, but AxilDB could not save it. Please try again.',
}

export default async function EditPlant({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ uploadError?: string }>
}) {
  await requireAdminUser()
  const { id } = await params
  const { uploadError } = await searchParams
  const [plant, bodies, typePhotos] = await Promise.all([
    prisma.plantDefinition.findUniqueOrThrow({
      where: { id },
      include: {
        aliases: { orderBy: { name: 'asc' } },
        _count: { select: { instances: true } },
      },
    }),
    prisma.governingBody.findMany({ orderBy: { name: 'asc' } }),
    prisma.photo.findMany({
      where: { entityType: 'PLANT_DEFINITION', entityId: id },
      orderBy: [{ isType: 'desc' }, { createdAt: 'desc' }],
    }),
  ])
  const currentTypePhoto = typePhotos[0]

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Edit Plant Definition</h2>
      <Card>
        <form action={updatePlantDefinition} className="grid max-w-6xl gap-x-3 gap-y-2 lg:grid-cols-4">
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
          <Field label="Wikipedia URL" name="wikipediaUrl" type="url" defaultValue={plant.wikipediaUrl} />
          <Field label="iNaturalist URL" name="inaturalistUrl" type="url" defaultValue={plant.inaturalistUrl} />
          <Field label="POWO URL" name="powoUrl" type="url" defaultValue={plant.powoUrl} />
          <Field label="GBIF URL" name="gbifUrl" type="url" defaultValue={plant.gbifUrl} />
          <label className="grid gap-1 text-sm font-medium text-stone-800">
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
          <TextArea label="Description" name="description" defaultValue={plant.description} wrapperClassName="lg:col-span-2" />
          <TextArea label="Notes" name="notes" defaultValue={plant.notes} wrapperClassName="lg:col-span-2" />
          <PlantAliasFields aliases={plant.aliases} submitLabel="Save changes" />
        </form>
      </Card>
      <Card>
        <h3 className="font-bold">Plant definition type image</h3>
        <p className="mt-1 text-sm text-stone-600">
          Use this when the best representative image is from a reference source rather than your own collection. Uploads are resized automatically.
        </p>
        {uploadError && uploadErrorMessages[uploadError] && (
          <div className="mt-3 rounded-md border border-[#c47a5a]/30 bg-[#fff7ed] px-3 py-2 text-sm text-[#8a4b32]">
            {uploadErrorMessages[uploadError]}
          </div>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white/70">
            <div className="aspect-[4/3]">
              <PlantImage src={currentTypePhoto?.path} alt={`${plant.genus} ${plant.species} type image`} />
            </div>
            <div className="space-y-1 p-3 text-sm">
              {currentTypePhoto ? (
                <>
                  <p className="font-medium">{currentTypePhoto.caption || 'Type image'}</p>
                  <p className="text-stone-600">Source: {currentTypePhoto.source || '—'}</p>
                  {currentTypePhoto.sourceUrl && <a className="text-[#2f6b45] underline" href={currentTypePhoto.sourceUrl}>Source URL</a>}
                </>
              ) : (
                <p className="text-stone-600">No definition-level type image yet.</p>
              )}
            </div>
          </div>
          <form action="/api/photos" method="post" encType="multipart/form-data" className="grid max-w-2xl gap-2 self-start">
            <input type="hidden" name="entityType" value="PLANT_DEFINITION" />
            <input type="hidden" name="entityId" value={id} />
            <input type="hidden" name="back" value={`/plants/${id}/edit`} />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Image file
              <input name="photo" type="file" accept="image/*" className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" />
            </label>
            <Field label="Caption" name="caption" />
            <Field label="Source" name="source" placeholder="Wikipedia, Wikimedia Commons, iNaturalist, photographer name..." />
            <Field label="Source URL" name="sourceUrl" type="url" />
            <Button className="justify-self-start">Upload type image</Button>
          </form>
        </div>
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
