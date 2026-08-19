import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { deletePhoto, deletePlantDefinition, deletePlantHusbandryGuide, forkPlantHusbandryGuide, linkPlantHusbandryGuide, mergePlantDefinition, nominatePlantDefinitionForValidation, savePlantHusbandryGuide, savePlantHusbandryGuideField, updatePhotoCaption, updatePhotoFraming, updatePlantDefinition } from '@/app/actions'
import { Button, Card, Field, HelpTooltip, SuggestionDatalist, TextArea } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { PlantImage } from '@/components/PlantImage'
import { PhotoFramingEditor } from '@/components/PhotoFramingEditor'
import { rankedSuggestions } from '@/lib/suggestions'
import { AIDescriptionField, AIMagicFillButton } from '@/components/AIDescriptionField'
import { PlantIdentificationAssistant } from '@/components/PlantIdentificationAssistant'
import { collectionPath, requireCollectionAdmin } from '@/lib/collections'
import { HusbandryBadges, HusbandryGuideView } from '@/components/Husbandry'
import { HusbandryMagicFillButton } from '@/components/HusbandryMagicFillButton'
import { PlantEnvironmentRequirementsForm } from '@/components/PlantEnvironmentRequirementsForm'
import { savePlantDefinitionEnvironmentRequirements } from '@/app/location-environment-actions'
import { husbandryFieldNames } from '@/lib/husbandry'
import { locationPath } from '@/lib/locations'
import { findMatchingValidatedDefinition } from '@/lib/validated-definitions'
import { acceptedPlantName, plantName, plantNeedsIdentification } from '@/lib/utils'
import { collectionRoleAtLeast, isServerAdminRole } from '@/lib/roles'
import { getUserUnitPreferences } from '@/lib/units'
import { PlantTagPicker } from '@/components/PlantTagPicker'
import { PlantTagRow } from '@/components/PlantTagChip'
import { authoritySelectionValue, taxonomicAuthorityWhere, taxonomicPlacementValue } from '@/lib/taxonomic-authorities'
import { addSubstrateRecommendation, removeSubstrateRecommendation, updateSubstrateRecommendation } from '@/app/substrate-actions'
import { substrateLabel, substrateSuitabilities } from '@/lib/substrates'
import { SubstrateCompositionBar } from '@/components/SubstrateCompositionBar'
import { PlantDefinitionReadinessPanel } from '@/components/PlantDefinitionCompleteness'
import { evaluatePlantDefinitionCompleteness } from '@/lib/plant-definition-completeness'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

const acquisitionStatuses = [
  ['RESEARCHING', 'Researching'],
  ['WISHLIST', 'Wishlist'],
  ['ACTIVELY_SEEKING', 'Actively seeking'],
  ['ON_HOLD', 'On hold'],
  ['FULFILLED', 'Fulfilled'],
  ['NO_LONGER_INTERESTED', 'No longer interested'],
] as const

function preferredVendors(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).join('\n') : ''
}

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
  const { collection, role, user } = await requireCollectionAdmin()
  const canManageImages = isServerAdminRole(user.role) || collectionRoleAtLeast(role, 'MANAGER')
  const unitPreferences = await getUserUnitPreferences(prisma, user.id)
  const { id } = await params
  const { uploadError } = await searchParams
  const [plant, bodies, typePhotos, definitionSuggestionRows, guideSourceOptions, mergeTargetOptions, fertilizerRecipes, locations, activeTags] = await Promise.all([
    prisma.plantDefinition.findFirstOrThrow({
      where: { id, collectionId: collection.id },
      include: {
        taxonomicAuthority: { include: { publications: true } },
        automaticTaxonomicAuthority: true,
        taxonomicAuthorityMatches: { include: { taxonomicAuthority: true }, orderBy: { priority: 'desc' } },
        aliases: { orderBy: { name: 'asc' } },
        husbandryGuide: { include: { fertilizerRecipe: true } },
        validationCandidates: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { instances: true } },
        tags: { include: { plantTag: true }, orderBy: { plantTag: { name: 'asc' } } },
      },
    }),
    prisma.taxonomicAuthority.findMany({ where: taxonomicAuthorityWhere(collection.id), include: { scopeRules: true }, orderBy: { name: 'asc' } }),
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
    prisma.fertilizerRecipe.findMany({
      where: { collectionId: collection.id, active: true },
      orderBy: [{ draft: 'asc' }, { name: 'asc' }],
    }),
    prisma.location.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.plantTag.findMany({ where: { collectionId: collection.id, active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
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
  const currentTypePhoto = typePhotos[0]
  const sourceDefinition = plant.husbandryGuide?.sourcePlantDefinitionId
    ? await prisma.plantDefinition.findFirst({
        where: { id: plant.husbandryGuide.sourcePlantDefinitionId, collectionId: collection.id },
        include: { husbandryGuide: { include: { fertilizerRecipe: true } } },
      })
    : null
  const effectiveGuide = sourceDefinition?.husbandryGuide || plant.husbandryGuide
  const definitionSuggestions = {
    genus: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.genus)),
    species: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.species)),
    hybridNotation: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.hybridNotation)),
    cultivarName: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.cultivarName)),
    authority: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.authority)),
    provisionalTaxon: rankedSuggestions(definitionSuggestionRows.map((definition) => definition.provisionalTaxon)),
    aliasSource: rankedSuggestions(definitionSuggestionRows.flatMap((definition) => definition.aliases.map((alias) => alias.source))),
  }
  const taxonomicAuthorityOptions = bodies.map((body) => ({ id: body.id, name: body.name, abbreviation: body.abbreviation }))
  const matchingValidatedDefinition = plant.validatedPlantDefinitionId ? null : await findMatchingValidatedDefinition(prisma, plant)
  const pendingValidationCandidate = plant.validationCandidates.find((candidate) => candidate.status === 'PENDING')
  const [substrateVersions, substrateRecommendations] = await Promise.all([
    prisma.substrateRecipeVersion.findMany({
      where: { collectionId: collection.id, recipe: { archivedAt: null }, OR: [{ status: 'ACTIVE' }, { recommendations: { some: { collectionId: collection.id, plantDefinitionId: plant.id } } }] },
      include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ recipe: { name: 'asc' } }, { versionNumber: 'desc' }],
    }),
    prisma.plantDefinitionSubstrateRecommendation.findMany({
      where: { collectionId: collection.id, plantDefinitionId: plant.id },
      include: { recipeVersion: { include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } } },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    }),
  ])
  const completeness = await evaluatePlantDefinitionCompleteness(prisma, plant.id, collection.id)
  const magicFillOpportunityCount = completeness.criticalMissing.length + completeness.recommendedNextActions.length

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Edit Plant Definition</h2>
      <PlantDefinitionReadinessPanel result={completeness} baseHref={collectionPath(collection.slug, `/plants/${plant.id}/edit`)} />
      <Card id="definition-fields">
        <form action={updatePlantDefinition} className="grid max-w-6xl gap-x-3 gap-y-2 lg:grid-cols-4">
          <SuggestionDatalist id="definition-genus-suggestions" suggestions={definitionSuggestions.genus} />
          <SuggestionDatalist id="definition-species-suggestions" suggestions={definitionSuggestions.species} />
          <SuggestionDatalist id="definition-hybrid-notation-suggestions" suggestions={definitionSuggestions.hybridNotation} />
          <SuggestionDatalist id="definition-cultivar-name-suggestions" suggestions={definitionSuggestions.cultivarName} />
          <SuggestionDatalist id="definition-authority-suggestions" suggestions={definitionSuggestions.authority} />
          <SuggestionDatalist id="definition-provisional-taxon-suggestions" suggestions={definitionSuggestions.provisionalTaxon} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          {plantNeedsIdentification(plant) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 lg:col-span-4">
              <p className="font-semibold">Needs identification review</p>
              <p className="mt-1">{plantName(plant)} is the displayed provisional identity. Its working placement is {acceptedPlantName(plant)}. Replace the provisional taxon or sp. only after identifying the species.</p>
            </div>
          )}
          <Field label="Genus" help="Required when the provisional taxon is cleared. This working placement is also used for plant ID generation." name="genus" defaultValue={plant.genus} list="definition-genus-suggestions" />
          <Field label="Species" help="Required when the provisional taxon is cleared. Use sp. with a named cultivar when the species is unresolved." name="species" defaultValue={plant.species} list="definition-species-suggestions" autoCapitalize="none" />
          <Field label="Hybrid notation" help="Use for botanical hybrid markers or formula context, such as x, grex, or parentage notation that belongs with the name." name="hybridNotation" defaultValue={plant.hybridNotation} list="definition-hybrid-notation-suggestions" />
          <Field label="Cultivar name" help="The named cultivated variety, usually written in single quotes, such as 'Morning Glow'. Leave blank for unnamed species or clones." name="cultivarName" defaultValue={plant.cultivarName} list="definition-cultivar-name-suggestions" />
          <div className="min-w-0 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 px-3 py-2 text-sm text-stone-700 lg:col-span-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">Update the core name first, then let AxilDB draft taxonomy metadata and suggested aliases.</span>
              <AIMagicFillButton taxonomicAuthorities={taxonomicAuthorityOptions} />
            </div>
            {magicFillOpportunityCount > 0 && <p className="mt-1 text-xs text-stone-500">Magic Fill may help draft up to {magicFillOpportunityCount} missing or partial readiness item{magicFillOpportunityCount === 1 ? '' : 's'}. Suggestions do not count until you review and save them.</p>}
            <PlantIdentificationAssistant collectionSlug={collection.slug} plantDefinitionId={plant.id} className="mt-3" />
          </div>
          <Field label="Author citation" help="The author citation for the scientific name, such as (L.f.) R.Br. It records who validly published the name or combination." name="authority" defaultValue={plant.authority} list="definition-authority-suggestions" />
          <Field label="Cultivar registration number" help="Use when a formal registry or Taxonomic Authority assigns a registration number to the cultivar." name="cultivarRegistrationNumber" defaultValue={plant.cultivarRegistrationNumber} />
          <Field label="Order" name="taxonomicOrder" defaultValue={taxonomicPlacementValue(plant.taxonomicPlacementJson, 'ORDER')} />
          <Field label="Family" name="taxonomicFamily" defaultValue={taxonomicPlacementValue(plant.taxonomicPlacementJson, 'FAMILY')} />
          <Field label="Tribe" name="taxonomicTribe" defaultValue={taxonomicPlacementValue(plant.taxonomicPlacementJson, 'TRIBE')} />
          <Field label="Section" name="taxonomicSection" help="For an infrageneric placement such as Saintpaulia within Streptocarpus." defaultValue={taxonomicPlacementValue(plant.taxonomicPlacementJson, 'SECTION')} />
          <ConfidenceSelect name="confidence" defaultValue={plant.confidence} />
          <label className="grid gap-1 text-sm font-medium text-stone-800">
            <span className="flex items-center gap-1.5">
              <span>Taxonomic Authority</span>
              <HelpTooltip>Automatic matching uses structured scope specificity. A manual override remains selected when taxonomy changes.</HelpTooltip>
            </span>
            <select className={selectClass} name="taxonomicAuthoritySelection" defaultValue={authoritySelectionValue(plant)}>
              <option value="AUTO">Automatic matching</option>
              <option value="NONE">Continue without authority</option>
              {bodies.map((body) => (
                <option key={body.id} value={`MANUAL:${body.id}`}>
                  Override: {body.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-md border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3 text-sm lg:col-span-4">
            <p className="font-semibold">{plant.taxonomicAuthority ? plant.taxonomicAuthority.name : 'No matching Taxonomic Authority found.'}</p>
            <p className="text-stone-600">{plant.taxonomicAuthorityMatchReason || 'Add an authority scope rule or choose a manual override. This does not block saving.'}</p>
            {!plant.taxonomicAuthority && <Link className="mt-2 inline-block font-semibold text-[#2f6b45] underline" href={collectionPath(collection.slug, '/taxonomic-authorities')}>Create or review Taxonomic Authorities</Link>}
            {plant.taxonomicAuthoritySource === 'MANUAL' && plant.automaticTaxonomicAuthority && <p className="mt-1 text-xs text-stone-600">Automatically matched: {plant.automaticTaxonomicAuthority.name}</p>}
            {plant.taxonomicAuthorityMatches.length > 1 && <p className="mt-1 text-xs text-stone-600">Other matches: {plant.taxonomicAuthorityMatches.filter((match) => match.taxonomicAuthorityId !== plant.taxonomicAuthorityId).map((match) => match.taxonomicAuthority.name).join(', ')}</p>}
            {plant.taxonomicAuthority && <div className="mt-2 flex flex-wrap gap-2">{[[plant.taxonomicAuthority.website, 'Website'], [plant.taxonomicAuthority.registrationUrl, 'Registration'], [plant.taxonomicAuthority.cultivarSearchUrl, 'Cultivar search'], [plant.taxonomicAuthority.externalAuthorityUrl, 'Official record']].filter(([url]) => url).map(([url, label]) => <a key={label} className="text-[#2f6b45] underline" href={String(url)} target="_blank" rel="noreferrer">{label}</a>)}</div>}
            {plant.taxonomicAuthority?.publications.length ? <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-stone-600"><span>Publications:</span>{plant.taxonomicAuthority.publications.map((publication) => publication.url ? <a key={publication.id} href={publication.url} target="_blank" rel="noreferrer" className="text-[#2f6b45] underline">{publication.name}</a> : <span key={publication.id}>{publication.name}</span>)}</div> : null}
          </div>
          <Field label="Provisional / working taxon" help="When present, this takes precedence as the displayed name and marks the definition as needing identification review." name="provisionalTaxon" defaultValue={plant.provisionalTaxon} list="definition-provisional-taxon-suggestions" wrapperClassName="lg:col-span-4" />
          <Field label="Wikipedia URL" help="Optional quick reference link for the species or genus entry." name="wikipediaUrl" type="url" defaultValue={plant.wikipediaUrl} />
          <Field label="iNaturalist URL" help="Optional link to an iNaturalist taxon page for observations, common names, and community references." name="inaturalistUrl" type="url" defaultValue={plant.inaturalistUrl} />
          <Field label="POWO URL" help="Optional Plants of the World Online link for accepted names, synonyms, and distribution data." name="powoUrl" type="url" defaultValue={plant.powoUrl} />
          <Field label="GBIF URL" help="Optional GBIF link for occurrence records, taxonomy backbone data, and biodiversity references." name="gbifUrl" type="url" defaultValue={plant.gbifUrl} />
          <AIDescriptionField defaultValue={plant.description} wrapperClassName="lg:col-span-2" />
          <TextArea label="Notes" name="notes" defaultValue={plant.notes} wrapperClassName="lg:col-span-2" />
          <div id="plant-tags" className="lg:col-span-4"><PlantTagPicker tags={activeTags} selectedIds={plant.tags.filter((item) => item.plantTag.active).map((item) => item.plantTagId)} />{plant.tags.some((item) => !item.plantTag.active) && <div className="mt-2"><p className="mb-1 text-xs font-semibold text-stone-600">Archived historical tags</p><PlantTagRow tags={plant.tags.filter((item) => !item.plantTag.active).map((item) => item.plantTag)} /></div>}</div>
          <div className="rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3 lg:col-span-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-xl font-semibold">Acquisition pipeline</h3>
                <p className="mt-1 text-sm text-stone-600">Track pre-accession intent separately from owned specimens.</p>
              </div>
              <a className="text-sm font-semibold text-[#2f6b45] underline" href={collectionPath(collection.slug, `/acquisitions?definition=${plant.id}`)}>Open pipeline</a>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="grid gap-1 text-sm font-medium text-stone-800">
                Acquisition status
                <select className={selectClass} name="acquisitionStatus" defaultValue={plant.acquisitionStatus || ''}>
                  <option value="">No acquisition intent</option>
                  {acquisitionStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-stone-800">
                Priority
                <select className={selectClass} name="acquisitionPriority" defaultValue={String(plant.acquisitionPriority || '')}>
                  <option value="">—</option>
                  {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{'★'.repeat(value)}{'☆'.repeat(5 - value)} {value}</option>)}
                </select>
              </label>
              <Field label="Desired specimen size" name="desiredSpecimenSize" defaultValue={plant.desiredSpecimenSize} />
              <Field label="Ideal purchase price" name="idealPurchasePrice" type="number" step="0.01" defaultValue={plant.idealPurchasePrice ? String(plant.idealPurchasePrice) : ''} />
              <Field label="Maximum purchase price" name="maximumPurchasePrice" type="number" step="0.01" defaultValue={plant.maximumPurchasePrice ? String(plant.maximumPurchasePrice) : ''} />
              <label className="grid gap-1 text-sm font-medium text-stone-800 lg:col-span-2">
                Desired location
                <select className={selectClass} name="desiredLocationId" defaultValue={plant.desiredLocationId || ''}>
                  <option value="">No desired location</option>
                  {locationNodes.map((location) => (
                    <option key={location.id} value={location.id}>{location.code} · {locationPath(location.id, locationNodes)}</option>
                  ))}
                </select>
              </label>
              <TextArea label="Preferred vendors" name="preferredVendors" defaultValue={preferredVendors(plant.preferredVendorsJson)} wrapperClassName="lg:col-span-2" />
              <TextArea label="Personal interest notes" name="acquisitionInterestNotes" defaultValue={plant.acquisitionInterestNotes} wrapperClassName="lg:col-span-2" />
              <TextArea label="Research summary" name="acquisitionResearchSummary" defaultValue={plant.acquisitionResearchSummary} wrapperClassName="lg:col-span-4" />
            </div>
          </div>
          <PlantAliasFields aliases={plant.aliases} submitLabel="Save changes" sourceSuggestions={definitionSuggestions.aliasSource} />
        </form>
      </Card>
      <Card id="validation">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl font-semibold">Validation</h3>
            <p className="mt-1 text-sm text-stone-600">Nominate high-quality definitions for site-level validation so other collections can use the curated definition.</p>
          </div>
          {plant.validatedPlantDefinitionId && <span className="rounded-full bg-[#edf3e6] px-3 py-1 text-xs font-semibold text-[#2f6b45]">Linked to validated</span>}
        </div>
        {matchingValidatedDefinition ? (
          <p className="mt-3 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3 text-sm text-stone-700">
            A matching validated definition already exists: <strong>{plantName(matchingValidatedDefinition)}</strong>. Use the validated definition for new instances, or keep this local definition independent.
          </p>
        ) : pendingValidationCandidate ? (
          <p className="mt-3 rounded-lg border border-[#dfcc87] bg-[#fff8dc] p-3 text-sm text-[#6f541f]">
            Validation nomination pending review.
          </p>
        ) : (
          <form action={nominatePlantDefinitionForValidation} className="mt-3 grid gap-2">
            <input type="hidden" name="id" value={plant.id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <TextArea label="Nomination notes" name="notes" help="Summarize why this definition is ready for site-level validation." />
            <Button className="w-fit">Nominate for Validation</Button>
          </form>
        )}
        {plant.validationCandidates.length > 0 && (
          <div className="mt-4 grid gap-2 text-sm">
            {plant.validationCandidates.map((candidate) => (
              <div key={candidate.id} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-2">
                <span className="font-semibold">{candidate.status.replace('_', ' ')}</span>
                {candidate.reviewNotes ? ` · ${candidate.reviewNotes}` : ''}
              </div>
            ))}
          </div>
        )}
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
                <input type="hidden" name="fertilizerRecipeId" defaultValue={(plant.husbandryGuide as any)?.fertilizerRecipeId || ''} />
                <input type="hidden" name="fertilizationCadenceDays" defaultValue={(plant.husbandryGuide as any)?.fertilizationCadenceDays || ''} />
                {(plant.husbandryGuide as any)?.fertilizationPaused && <input type="hidden" name="fertilizationPaused" value="on" />}
                <HusbandryMagicFillButton
                  plant={plant}
                  collectionSlug={collection.slug}
                  substrateRecommendationCount={substrateRecommendations.length}
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

          {!sourceDefinition && (
            <details className="group rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/70">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
                <span>Structured fertilizer schedule</span>
                <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Open</span>
                <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Hide</span>
              </summary>
              <form action={savePlantHusbandryGuide} className="grid gap-3 border-t border-[#d6dfc9] p-3 md:grid-cols-3">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="plantDefinitionId" value={plant.id} />
                {husbandryFieldNames.map((field) => (
                  <input key={field} type="hidden" name={field} defaultValue={(plant.husbandryGuide as any)?.[field] || ''} />
                ))}
                <input type="hidden" name="reviewStatus" defaultValue={(plant.husbandryGuide as any)?.reviewStatus || 'DRAFT'} />
                <input type="hidden" name="reviewNotes" defaultValue={(plant.husbandryGuide as any)?.reviewNotes || ''} />
                <input type="hidden" name="aiModel" defaultValue={(plant.husbandryGuide as any)?.aiModel || ''} />
                <label className="grid gap-1 text-sm font-medium text-stone-800 md:col-span-2">
                  Fertilizer recipe
                  <select name="fertilizerRecipeId" className={selectClass} defaultValue={(plant.husbandryGuide as any)?.fertilizerRecipeId || ''}>
                    <option value="">No structured recipe</option>
                    {fertilizerRecipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>{recipe.name}{recipe.declaredNpk || recipe.calculatedNpk ? ` · ${recipe.declaredNpk || recipe.calculatedNpk}` : ''}{recipe.draft ? ' (draft)' : ''}</option>
                    ))}
                  </select>
                </label>
                <Field label="Cadence days" name="fertilizationCadenceDays" type="number" min="1" max="365" defaultValue={(plant.husbandryGuide as any)?.fertilizationCadenceDays || ''} />
                <label className="inline-flex items-center gap-2 text-sm font-medium text-stone-800 md:col-span-3">
                  <input type="checkbox" name="fertilizationPaused" defaultChecked={Boolean((plant.husbandryGuide as any)?.fertilizationPaused)} />
                  Pause fertilizing for this definition
                </label>
                <Button className="w-fit md:col-span-3">Save fertilizer schedule</Button>
              </form>
            </details>
          )}

          <details id="substrate-recommendations" className="group rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/70" open={substrateRecommendations.length > 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
              <span>Recommended substrates · {substrateRecommendations.length}</span>
              <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Open</span>
              <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Hide</span>
            </summary>
            <div className="grid gap-3 border-t border-[#d6dfc9] p-3">
              <p className="text-sm text-stone-600">These collection-local recommendations augment the readable soil and medium guidance above. They remain local even when a definition is linked to a site-validated definition.</p>
              {substrateRecommendations.map((recommendation) => <form key={recommendation.id} action={updateSubstrateRecommendation} className="grid gap-2 rounded-md border border-stone-200 bg-white/60 p-3 md:grid-cols-[5rem_minmax(11rem,1fr)_minmax(12rem,2fr)_auto]">
                <input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="recommendationId" value={recommendation.id} />
                <Field label="Rank" name="rank" type="number" min="1" defaultValue={recommendation.rank} />
                <label className="grid gap-1 text-sm font-medium">Suitability<select className={selectClass} name="suitability" defaultValue={recommendation.suitability}>{substrateSuitabilities.map((value) => <option key={value} value={value}>{substrateLabel(value)}</option>)}</select></label>
                <label className="grid min-w-0 gap-1 text-sm font-medium">{recommendation.recipeVersion.recipe.name} v{recommendation.recipeVersion.versionNumber}<input className={selectClass} name="notes" defaultValue={recommendation.notes || ''} placeholder="Recommendation note" /><SubstrateCompositionBar items={recommendation.recipeVersion.components} mode="tiny" /></label>
                <div className="flex items-end gap-2"><Button className="px-3 py-2 text-xs">Save</Button><button formAction={removeSubstrateRecommendation} className="px-2 py-2 text-xs font-semibold text-[#9a3f35] underline">Remove</button></div>
              </form>)}
              <form action={addSubstrateRecommendation} className="grid gap-3 rounded-md border border-stone-200 bg-white/60 p-3 md:grid-cols-[minmax(12rem,1fr)_12rem_minmax(12rem,1fr)_auto]">
                <input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="plantDefinitionId" value={plant.id} />
                <label className="grid gap-1 text-sm font-medium">Recipe version<select className={selectClass} name="substrateRecipeVersionId" required defaultValue=""><option value="">Choose current recipe...</option>{substrateVersions.filter((version) => !substrateRecommendations.some((item) => item.substrateRecipeVersionId === version.id)).map((version) => <option key={version.id} value={version.id}>{version.recipe.name} v{version.versionNumber}{version.status !== 'ACTIVE' ? ` · ${substrateLabel(version.status)}` : ''}</option>)}</select></label>
                <label className="grid gap-1 text-sm font-medium">Suitability<select className={selectClass} name="suitability" defaultValue="RECOMMENDED">{substrateSuitabilities.map((value) => <option key={value} value={value}>{substrateLabel(value)}</option>)}</select></label>
                <Field label="Notes" name="notes" />
                <Button className="self-end">Add recommendation</Button>
              </form>
            </div>
          </details>

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
          <details id="environment-requirements" className="rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/70 p-3">
            <summary className="cursor-pointer font-serif text-xl font-semibold">Environmental requirements</summary>
            <p className="mt-1 text-sm text-stone-600">These structured fields power deterministic location compatibility checks. They supplement the readable husbandry guide.</p>
            {sourceDefinition ? (
              <p className="mt-3 rounded-md border border-stone-200 bg-white/55 p-3 text-sm">Environmental requirements are inherited from {plantName(sourceDefinition)}. Make a local copy above to override them.</p>
            ) : (
              <div className="mt-4">
                <PlantEnvironmentRequirementsForm
                  action={savePlantDefinitionEnvironmentRequirements}
                  collectionSlug={collection.slug}
                  plantDefinitionId={plant.id}
                  values={plant.husbandryGuide}
                  unitPreferences={unitPreferences}
                />
              </div>
            )}
          </details>
        </div>
      </Card>
      <Card id="definition-photos">
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
                      <span>Edit caption</span>
                      <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:hidden">Open</span>
                      <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:inline-block">Hide</span>
                    </summary>
                    <form action={updatePhotoCaption} className="grid gap-2 border-t border-stone-200 p-2">
                      <input type="hidden" name="id" value={currentTypePhoto.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, `/plants/${id}/edit`)} />
                      <input className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1.5 text-xs shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30" name="caption" defaultValue={currentTypePhoto.caption || ''} placeholder="Photo caption" />
                      <Button className="px-3 py-1.5 text-xs">Save caption</Button>
                    </form>
                  </details>
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
                  {canManageImages && (
                    <form action={deletePhoto}>
                      <input type="hidden" name="id" value={currentTypePhoto.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, `/plants/${id}/edit`)} />
                      <ConfirmDeleteButton
                        className="bg-[#9a3f35] px-3 py-1.5 text-xs hover:bg-[#7d3028]"
                        title="Delete type image?"
                        message="This will permanently delete this type image and any related moderation review records."
                        confirmLabel="Delete image"
                      >
                        Delete type image
                      </ConfirmDeleteButton>
                    </form>
                  )}
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
