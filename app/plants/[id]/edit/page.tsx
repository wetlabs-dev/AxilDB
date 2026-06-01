import { prisma } from '@/lib/prisma'
import { deletePlantDefinition, deletePlantHusbandryGuide, forkPlantHusbandryGuide, linkPlantHusbandryGuide, mergePlantDefinition, savePlantHusbandryGuide, savePlantHusbandryGuideField, updatePhotoFraming, updatePlantDefinition } from '@/app/actions'
import { Button, Card, Field, HelpTooltip, SuggestionDatalist, TextArea } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { PlantImage } from '@/components/PlantImage'
import { PhotoFramingEditor } from '@/components/PhotoFramingEditor'
import { rankedSuggestions } from '@/lib/suggestions'
import { AIDescriptionField, AIMagicFillButton } from '@/components/AIDescriptionField'
import { collectionPath, requireCollectionAdmin } from '@/lib/collections'
import { HusbandryBadges, HusbandryGuideView } from '@/components/Husbandry'
import { HusbandryMagicFillButton } from '@/components/HusbandryMagicFillButton'
import { husbandryFieldNames } from '@/lib/husbandry'
import { plantName } from '@/lib/utils'

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
  const { collection } = await requireCollectionAdmin()
  const { id } = await params
  const { uploadError } = await searchParams
  const [plant, bodies, typePhotos, definitionSuggestionRows, guideSourceOptions, mergeTargetOptions] = await Promise.all([
    prisma.plantDefinition.findFirstOrThrow({
      where: { id, collectionId: collection.id },
      include: {
        aliases: { orderBy: { name: 'asc' } },
        husbandryGuide: true,
        _count: { select: { instances: true } },
      },
    }),
    prisma.governingBody.findMany({ where: { collectionId: collection.id }, orderBy: { name: 'asc' } }),
    prisma.photo.findMany({
      where: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId: id },
      orderBy: [{ isType: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.plantDefinition.findMany({
      where: { collectionId: collection.id },
      select: {
        genus: true,
        species: true,
        hybridNotation: true,
        cultivarName: true,
        authority: true,
        acquisitionLabel: true,
        provisionalTaxon: true,
        aliases: { select: { source: true } },
      },
    }),
    prisma.plantDefinition.findMany({
      where: { collectionId: collection.id, NOT: { id }, husbandryGuide: { is: { sourcePlantDefinitionId: null } } },
      include: { husbandryGuide: true },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }],
    }),
    prisma.plantDefinition.findMany({
      where: { collectionId: collection.id, NOT: { id } },
      include: { _count: { select: { instances: true } } },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
    }),
  ])
  const currentTypePhoto = typePhotos[0]
  const sourceDefinition = plant.husbandryGuide?.sourcePlantDefinitionId
    ? await prisma.plantDefinition.findFirst({
        where: { id: plant.husbandryGuide.sourcePlantDefinitionId, collectionId: collection.id },
        include: { husbandryGuide: true },
      })
    : null
  const effectiveGuide = sourceDefinition?.husbandryGuide || plant.husbandryGuide
  const definitionSuggestions = {
    genus: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.genus)),
    species: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.species)),
    hybridNotation: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.hybridNotation)),
    cultivarName: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.cultivarName)),
    authority: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.authority)),
    acquisitionLabel: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.acquisitionLabel)),
    provisionalTaxon: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.provisionalTaxon)),
    aliasSource: rankedSuggestions(definitionSuggestionRows.flatMap((definition) => definition.aliases.map((alias) => alias.source))),
  }
  const governingBodyOptions = bodies.map((body) => ({ id: body.id, name: body.name, abbreviation: body.abbreviation }))

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Edit Plant Definition</h2>
      <Card>
        <form action={updatePlantDefinition} className="grid max-w-6xl gap-x-3 gap-y-2 lg:grid-cols-4">
          <SuggestionDatalist id="definition-genus-suggestions" suggestions={definitionSuggestions.genus} />
          <SuggestionDatalist id="definition-species-suggestions" suggestions={definitionSuggestions.species} />
          <SuggestionDatalist id="definition-hybrid-notation-suggestions" suggestions={definitionSuggestions.hybridNotation} />
          <SuggestionDatalist id="definition-cultivar-name-suggestions" suggestions={definitionSuggestions.cultivarName} />
          <SuggestionDatalist id="definition-authority-suggestions" suggestions={definitionSuggestions.authority} />
          <SuggestionDatalist id="definition-acquisition-label-suggestions" suggestions={definitionSuggestions.acquisitionLabel} />
          <SuggestionDatalist id="definition-provisional-taxon-suggestions" suggestions={definitionSuggestions.provisionalTaxon} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Field label="Genus" name="genus" required defaultValue={plant.genus} list="definition-genus-suggestions" />
          <Field label="Species" name="species" required defaultValue={plant.species} list="definition-species-suggestions" autoCapitalize="none" />
          <Field label="Hybrid notation" help="Use for botanical hybrid markers or formula context, such as x, grex, or parentage notation that belongs with the name." name="hybridNotation" defaultValue={plant.hybridNotation} list="definition-hybrid-notation-suggestions" />
          <Field label="Cultivar name" help="The named cultivated variety, usually written in single quotes, such as 'Morning Glow'. Leave blank for unnamed species or clones." name="cultivarName" defaultValue={plant.cultivarName} list="definition-cultivar-name-suggestions" />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 px-3 py-2 text-sm text-stone-700 lg:col-span-4">
            <span className="min-w-0">Update the core name first, then let AxilDB draft taxonomy metadata and suggested aliases.</span>
            <AIMagicFillButton governingBodies={governingBodyOptions} />
          </div>
          <Field label="Author citation" help="The author citation for the scientific name, such as (L.f.) R.Br. It records who validly published the name or combination." name="authority" defaultValue={plant.authority} list="definition-authority-suggestions" />
          <Field label="Cultivar registration number" help="Use when a formal cultivar registry or governing body assigns a registration number to the cultivar." name="cultivarRegistrationNumber" defaultValue={plant.cultivarRegistrationNumber} />
          <ConfidenceSelect name="confidence" defaultValue={plant.confidence} />
          <label className="grid gap-1 text-sm font-medium text-stone-800">
            <span className="flex items-center gap-1.5">
              <span>Governing body</span>
              <HelpTooltip>The registry, society, or authority that governs naming or registration for this plant group, if applicable.</HelpTooltip>
            </span>
            <select className={selectClass} name="governingBodyId" defaultValue={plant.governingBodyId || ''}>
              <option value="">—</option>
              {bodies.map((body) => (
                <option key={body.id} value={body.id}>
                  {body.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Acquisition label" help="The name or label the plant arrived with, even if you later determine a different accepted name." name="acquisitionLabel" defaultValue={plant.acquisitionLabel} list="definition-acquisition-label-suggestions" wrapperClassName="lg:col-span-2" />
          <Field label="Provisional taxon" help="A cautious working identification when the accepted name is not settled yet. Useful for 'probably this' or awaiting confirmation." name="provisionalTaxon" defaultValue={plant.provisionalTaxon} list="definition-provisional-taxon-suggestions" wrapperClassName="lg:col-span-2" />
          <Field label="Wikipedia URL" help="Optional quick reference link for the species or genus entry." name="wikipediaUrl" type="url" defaultValue={plant.wikipediaUrl} />
          <Field label="iNaturalist URL" help="Optional link to an iNaturalist taxon page for observations, common names, and community references." name="inaturalistUrl" type="url" defaultValue={plant.inaturalistUrl} />
          <Field label="POWO URL" help="Optional Plants of the World Online link for accepted names, synonyms, and distribution data." name="powoUrl" type="url" defaultValue={plant.powoUrl} />
          <Field label="GBIF URL" help="Optional GBIF link for occurrence records, taxonomy backbone data, and biodiversity references." name="gbifUrl" type="url" defaultValue={plant.gbifUrl} />
          <AIDescriptionField defaultValue={plant.description} wrapperClassName="lg:col-span-2" />
          <TextArea label="Notes" name="notes" defaultValue={plant.notes} wrapperClassName="lg:col-span-2" />
          <PlantAliasFields aliases={plant.aliases} submitLabel="Save changes" sourceSuggestions={definitionSuggestions.aliasSource} />
        </form>
      </Card>
      <Card id="husbandry">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl font-semibold">Plant husbandry</h3>
            <p className="mt-1 text-sm text-stone-600">Create a care guide, link to a similar definition&apos;s guide, or fork linked care into a local guide.</p>
            <HusbandryBadges values={effectiveGuide as any} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!sourceDefinition && (
              <form action={savePlantHusbandryGuide} className="contents">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="plantDefinitionId" value={plant.id} />
                {husbandryFieldNames.map((field) => (
                  <input key={field} type="hidden" name={field} defaultValue={(plant.husbandryGuide as any)?.[field] || ''} />
                ))}
                <input type="hidden" name="reviewStatus" defaultValue={(plant.husbandryGuide as any)?.reviewStatus || 'DRAFT'} />
                <input type="hidden" name="reviewNotes" defaultValue={(plant.husbandryGuide as any)?.reviewNotes || ''} />
                <input type="hidden" name="aiModel" defaultValue={(plant.husbandryGuide as any)?.aiModel || ''} />
                <HusbandryMagicFillButton
                  plant={plant}
                  autoSubmit
                  label={plant.husbandryGuide ? 'Magic refill husbandry' : 'Magic Fill husbandry'}
                />
              </form>
            )}
            {plant.husbandryGuide && (
              <form action={deletePlantHusbandryGuide}>
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="plantDefinitionId" value={plant.id} />
                <ConfirmDeleteButton
                  title="Delete husbandry guide?"
                  message="This removes the guide or linked-guide reference for this plant definition. It does not delete plant records."
                  confirmLabel="Delete husbandry"
                  className="px-3 py-1.5 text-xs"
                >
                  Delete husbandry
                </ConfirmDeleteButton>
              </form>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          {sourceDefinition && plant.husbandryGuide ? (
            <div className="rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3">
              <p className="text-sm text-stone-700">
                This definition uses live-linked husbandry from{' '}
                <a className="font-semibold underline" href={collectionPath(collection.slug, `/plants/${sourceDefinition.id}/edit#husbandry`)}>
                  {plantName(sourceDefinition)}
                </a>
                . Changes to that source guide will appear here.
              </p>
              <form action={forkPlantHusbandryGuide} className="mt-3">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="plantDefinitionId" value={plant.id} />
                <Button className="w-fit">Make local copy</Button>
              </form>
            </div>
          ) : null}

          <details className="group rounded-lg border border-stone-200 bg-white/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
              <span>Link husbandry from another definition</span>
              <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Open</span>
              <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Hide</span>
            </summary>
            <form action={linkPlantHusbandryGuide} className="grid gap-3 border-t border-stone-200 p-3 md:grid-cols-[1fr_auto]">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="plantDefinitionId" value={plant.id} />
              <label className="grid gap-1 text-sm font-medium text-stone-800">
                Source plant definition
                <select name="sourcePlantDefinitionId" className={selectClass} required defaultValue={plant.husbandryGuide?.sourcePlantDefinitionId || ''}>
                  <option value="">Choose a guide...</option>
                  {guideSourceOptions.map((option) => (
                    <option key={option.id} value={option.id}>{plantName(option)}</option>
                  ))}
                </select>
              </label>
              <Button className="self-end">Link guide</Button>
            </form>
          </details>

          {effectiveGuide ? (
            <HusbandryGuideView
              values={(sourceDefinition ? effectiveGuide : plant.husbandryGuide) as any}
              editAction={!sourceDefinition ? savePlantHusbandryGuideField : undefined}
              collectionSlug={collection.slug}
              plantDefinitionId={plant.id}
              canEdit={!sourceDefinition}
              showEmptyFields={!sourceDefinition}
              title="Current husbandry guide"
              sourceLabel={sourceDefinition ? `Inherited from ${plantName(sourceDefinition)}` : undefined}
            />
          ) : (
            <HusbandryGuideView
              values={plant.husbandryGuide as any}
              editAction={savePlantHusbandryGuideField}
              collectionSlug={collection.slug}
              plantDefinitionId={plant.id}
              canEdit
              showEmptyFields
              title="Create husbandry guide"
            />
          )}
        </div>
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
            <div className="aspect-[4/3] overflow-hidden">
              <PlantImage src={currentTypePhoto} alt={`${plant.genus} ${plant.species} type image`} />
            </div>
            <div className="space-y-3 p-3 text-sm">
              {currentTypePhoto ? (
                <>
                  <div className="space-y-1">
                    <p className="font-medium">{currentTypePhoto.caption || 'Type image'}</p>
                    <p className="text-stone-600">
                      Source:{' '}
                      {currentTypePhoto.sourceUrl ? (
                        <a className="text-[#2f6b45] underline" href={currentTypePhoto.sourceUrl}>
                          {currentTypePhoto.source || currentTypePhoto.sourceUrl}
                        </a>
                      ) : (
                        currentTypePhoto.source || '—'
                      )}
                    </p>
                  </div>
                  <details className="group rounded-lg border border-stone-200 bg-white/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium">
                      <span>Edit framing</span>
                      <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:hidden">Open</span>
                      <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:inline-block">Hide</span>
                    </summary>
                    <form action={updatePhotoFraming} className="grid gap-2 border-t border-stone-200 p-2">
                      <input type="hidden" name="id" value={currentTypePhoto.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, `/plants/${id}/edit`)} />
                      <PhotoFramingEditor src={currentTypePhoto.path} initial={currentTypePhoto} />
                      <Button className="px-3 py-1.5 text-xs">Save framing</Button>
                    </form>
                  </details>
                </>
              ) : (
                <p className="text-stone-600">No definition-level type image yet.</p>
              )}
            </div>
          </div>
          <form action="/api/photos" method="post" encType="multipart/form-data" className="grid max-w-2xl gap-2 self-start">
            <input type="hidden" name="entityType" value="PLANT_DEFINITION" />
            <input type="hidden" name="entityId" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/plants/${id}/edit`)} />
            <PhotoFramingEditor fileInputName="photo" />
            <Field label="Caption" name="caption" />
            <Field label="Source" help="Credit where the image came from, such as Wikimedia Commons, a photographer, a nursery, or your own reference file." name="source" placeholder="Wikipedia, Wikimedia Commons, iNaturalist, photographer name..." />
            <Field label="Source URL" help="Optional link back to the image source or license page." name="sourceUrl" type="url" />
            <Button className="justify-self-start">Upload type image</Button>
          </form>
        </div>
      </Card>
      <Card>
        <h3 className="font-bold">Merge duplicate definition</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-700">
          Move this definition&apos;s specimens, aliases, definition photos, notes, reminders, follows, and husbandry links into another definition,
          then delete this duplicate definition. The target definition&apos;s taxonomy fields are kept.
        </p>
        {mergeTargetOptions.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">No other plant definitions are available as merge targets.</p>
        ) : (
          <form action={mergePlantDefinition} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="sourcePlantDefinitionId" value={plant.id} />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Merge into
              <select className={selectClass} name="targetPlantDefinitionId" required defaultValue="">
                <option value="">Choose the definition to keep...</option>
                {mergeTargetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {plantName(option)} · {option._count.instances} instance{option._count.instances === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            <div className="self-end">
              <ConfirmDeleteButton
                title="Merge this duplicate definition?"
                message={`This will move records from ${plantName(plant)} into the selected target definition and permanently delete this definition. The target taxonomy fields will not be overwritten.`}
                confirmLabel="Merge definition"
              >
                Merge duplicate
              </ConfirmDeleteButton>
            </div>
          </form>
        )}
      </Card>
      <Card>
        <h3 className="font-bold">Delete</h3>
        <p className="mb-3 text-sm">Delete is only safe when no instances use this definition. Current instances: {plant._count.instances}</p>
        <form action={deletePlantDefinition}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="collectionSlug" value={collection.slug} />
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
