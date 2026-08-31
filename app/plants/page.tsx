import { prisma } from '@/lib/prisma'
import { copyPlantDefinition, createPlantDefinition, followEntity, unfollowEntity } from '@/app/actions'
import { requestAiCuratorResearchNow } from '@/app/ai-curator-actions'
import { createPlantDefinitionShareRequest } from '@/app/transfer-actions'
import { AddPanel, Button, Card, Field, HelpTooltip, TextArea, LinkButton, SuggestionDatalist } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { PlantImage } from '@/components/PlantImage'
import { PlantDefinitionFilters } from '@/components/PlantDefinitionFilters'
import { SortControl } from '@/components/SortControl'
import { AIDescriptionField, AIMagicFillButton } from '@/components/AIDescriptionField'
import { PlantIdentificationAssistant } from '@/components/PlantIdentificationAssistant'
import { HusbandryBadges } from '@/components/Husbandry'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { suggestedAliasesForForm, type PlantIdentificationSuggestion } from '@/lib/plant-identification-history'
import { rankedSuggestions } from '@/lib/suggestions'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { acceptedPlantName, plantName, plantNeedsIdentification, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'
import { PlantTagPicker } from '@/components/PlantTagPicker'
import { PlantTagRow } from '@/components/PlantTagChip'
import { PlantTagFilter } from '@/components/PlantTagFilter'
import { TAXONOMIC_AUTHORITY_TYPES, taxonomicAuthorityWhere } from '@/lib/taxonomic-authorities'
import { PlantDefinitionCompletenessBar } from '@/components/PlantDefinitionCompleteness'
import { completenessMatchesMissing, completenessMatchesReadiness, evaluatePlantDefinitionCompletenessBatch } from '@/lib/plant-definition-completeness'
import { decodeSpeciesFilter, getAvailableGenera, getSpeciesOptionsByGenus, matchingRawGenera, matchingRawSpecies, noSpeciesFilterToken } from '@/lib/taxonomy'
import type { Prisma } from '@prisma/client'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

const plantSortOptions: SortOption[] = [
  { value: 'nameAsc', label: 'Name A-Z' },
  { value: 'nameDesc', label: 'Name Z-A' },
  { value: 'updatedDesc', label: 'Recently updated' },
  { value: 'updatedAsc', label: 'Oldest updated' },
  { value: 'createdDesc', label: 'Newest created' },
  { value: 'createdAsc', label: 'Oldest created' },
  { value: 'completenessDesc', label: 'Completeness: highest first' },
  { value: 'completenessAsc', label: 'Completeness: lowest first' },
]

function referencePrefill(log: { resultJson: unknown }) {
  const references = Array.isArray((log.resultJson as any)?.suggestedReferences) ? (log.resultJson as any).suggestedReferences : []
  const fields: Record<string, string> = {}
  for (const rawReference of references) {
    const reference = String(rawReference || '').trim()
    const normalized = reference.toLowerCase()
    if (normalized.includes('wikipedia.org') && !fields.wikipediaUrl) fields.wikipediaUrl = reference
    if (normalized.includes('inaturalist.org') && !fields.inaturalistUrl) fields.inaturalistUrl = reference
    if (normalized.includes('powo.science.kew.org') && !fields.powoUrl) fields.powoUrl = reference
    if (normalized.includes('gbif.org') && !fields.gbifUrl) fields.gbifUrl = reference
  }
  return fields
}

export default async function Plants({
  searchParams,
}: {
  searchParams: Promise<{ fromIdentification?: string; wishlist?: string; tag?: string | string[]; tagMode?: string; q?: string; genus?: string; species?: string; taxonomicAuthorityId?: string; authorityType?: string; registrationAuthority?: string; readiness?: string; missing?: string; curatorStatus?: string; curator?: string }>
}) {
  const user = await getCurrentUser()
  const sp = await searchParams
  const context = await requireCollectionViewer()
  const { collection } = context
  const canCreate = canCreateInCollection(user, context)
  const canEdit = canEditInCollection(user, context)
  const canManage = canManageCollection(user, context)
  const collectionWhere = { collectionId: collection.id }
  const selectedTagIds = (Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : []).filter(Boolean)
  const tagMode = sp.tagMode === 'all' ? 'all' : 'any'
  const q = String(sp.q || '').trim()
  const genusFilter = String(sp.genus || '').trim()
  const speciesFilter = genusFilter ? decodeSpeciesFilter(sp.species) : ''
  const authorityFilter = String(sp.taxonomicAuthorityId || '')
  const authorityTypeFilter = String(sp.authorityType || '')
  const registrationAuthorityOnly = sp.registrationAuthority === '1'
  const readinessFilter = String(sp.readiness || '')
  const missingFilter = String(sp.missing || '')
  const curatorStatusFilter = String(sp.curatorStatus || '')
  const sortKey = await sortPreference(user?.id, 'plants', 'nameAsc', plantSortOptions.map((option) => option.value))
  const taxonomyRows = await prisma.plantDefinition.findMany({
    where: collectionWhere,
    select: { genus: true, species: true },
    orderBy: [{ genus: 'asc' }, { species: 'asc' }],
  })
  const genusOptions = getAvailableGenera(taxonomyRows)
  const speciesOptionsByGenus = getSpeciesOptionsByGenus(taxonomyRows)
  const genusValues = genusFilter ? matchingRawGenera(taxonomyRows, genusFilter) : []
  const speciesValues = genusFilter && speciesFilter ? matchingRawSpecies(taxonomyRows, genusFilter, speciesFilter) : { values: [], includesNull: false }
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const })
  const speciesWhere = speciesFilter
    ? speciesFilter === noSpeciesFilterToken
      ? { OR: [{ species: null }, { species: { in: speciesValues.values.length ? speciesValues.values : [''] } }] }
      : speciesValues.values.length
        ? { species: { in: speciesValues.values } }
        : { species: { equals: speciesFilter, mode: 'insensitive' as const } }
    : null
  const definitionWhere: Prisma.PlantDefinitionWhereInput = {
    ...collectionWhere,
    AND: [
      ...(q ? [{
        OR: [
          { genus: contains(q) },
          { species: contains(q) },
          { hybridNotation: contains(q) },
          { cultivarName: contains(q) },
          { authority: contains(q) },
          { provisionalTaxon: contains(q) },
          { description: contains(q) },
          { notes: contains(q) },
          { taxonomicAuthority: { OR: [{ name: contains(q) }, { abbreviation: contains(q) }] } },
          { aliases: { some: { OR: [{ name: contains(q) }, { source: contains(q) }, { notes: contains(q) }] } } },
          { tags: { some: { plantTag: { OR: [{ name: contains(q) }, { description: contains(q) }] } } } },
        ],
      }] : []),
      ...(genusFilter ? [{ genus: genusValues.length ? { in: genusValues } : { equals: genusFilter, mode: 'insensitive' as const } }] : []),
      ...(speciesWhere ? [speciesWhere] : []),
      ...(authorityFilter ? [{ taxonomicAuthorityId: authorityFilter }] : []),
      ...(authorityTypeFilter ? [{ taxonomicAuthority: { authorityType: authorityTypeFilter } }] : []),
      ...(registrationAuthorityOnly ? [{ taxonomicAuthority: { authorityType: 'ICRA' } }] : []),
      ...(selectedTagIds.length ? tagMode === 'all'
        ? selectedTagIds.map((plantTagId) => ({ tags: { some: { plantTagId } } }))
        : [{ tags: { some: { plantTagId: { in: selectedTagIds } } } }]
        : []),
    ],
  }
  const [plants, bodies, follows, activeTags, outgoingTransferConnections, completenessByDefinition, curatorSuggestionCounts, curatorWaitingCounts] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: definitionWhere,
      include: {
        taxonomicAuthority: true,
        aliases: { orderBy: { name: 'asc' } },
        husbandryGuide: true,
        instances: { select: { id: true } },
        tags: { include: { plantTag: true }, orderBy: { plantTag: { name: 'asc' } } },
        _count: { select: { instances: true } },
      },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }],
    }),
    prisma.taxonomicAuthority.findMany({ where: taxonomicAuthorityWhere(collection.id), include: { scopeRules: true }, orderBy: { name: 'asc' } }),
    user
      ? prisma.follow.findMany({
          where: { ...collectionWhere, userId: user.id, scope: 'TYPE', entityType: 'PLANT_DEFINITION' },
        })
      : [],
    prisma.plantTag.findMany({ where: { collectionId: collection.id, active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    canEdit
      ? prisma.collectionTransferConnection.findMany({
          where: { sourceCollectionId: collection.id, status: 'ACTIVE' },
          include: { targetCollection: true },
          orderBy: { requestedAt: 'desc' },
        })
      : [],
    evaluatePlantDefinitionCompletenessBatch(prisma, { collectionId: collection.id }),
    prisma.aiCuratorSuggestion.groupBy({
      by: ['plantDefinitionId'],
      where: { collectionId: collection.id, status: 'PENDING', plantDefinitionId: { not: null } },
      _count: { _all: true },
    }),
    prisma.aiCuratorJob.groupBy({
      by: ['plantDefinitionId'],
      where: { collectionId: collection.id, status: 'WAITING_FOR_HUMAN', plantDefinitionId: { not: null } },
      _count: { _all: true },
    }),
  ])
  const curatorSuggestionsByDefinitionId = new Map(curatorSuggestionCounts.map((row) => [row.plantDefinitionId, row._count._all]))
  const curatorWaitingByDefinitionId = new Map(curatorWaitingCounts.map((row) => [row.plantDefinitionId, row._count._all]))
  const followsByDefinitionId = new Map(follows.map((follow) => [follow.entityId, follow]))
  const definitionSuggestions = {
    genus: rankedSuggestions(plants.map((plant) => plant.genus)),
    species: rankedSuggestions(plants.map((plant) => plant.species)),
    hybridNotation: rankedSuggestions(plants.map((plant) => plant.hybridNotation)),
    cultivarName: rankedSuggestions(plants.map((plant) => plant.cultivarName)),
    authority: rankedSuggestions(plants.map((plant) => plant.authority)),
    provisionalTaxon: rankedSuggestions(plants.map((plant) => plant.provisionalTaxon)),
    aliasSource: rankedSuggestions(plants.flatMap((plant) => plant.aliases.map((alias) => alias.source))),
  }
  const taxonomicAuthorityOptions = bodies.map((body) => ({ id: body.id, name: body.name, abbreviation: body.abbreviation }))
  const identificationPrefill = canCreate && sp.fromIdentification
    ? await prisma.plantIdentificationLog.findFirst({
        where: { id: sp.fromIdentification, collectionId: collection.id },
        include: { uploadedPhoto: true },
      })
    : null
  const identificationSuggestion = identificationPrefill?.resultJson as PlantIdentificationSuggestion | undefined
  const identificationReferences = identificationPrefill ? referencePrefill(identificationPrefill) : {}
  const identificationAliases = identificationSuggestion ? suggestedAliasesForForm(identificationSuggestion) : []
  const instanceIds = plants.flatMap((plant) => plant.instances.map((instance) => instance.id))
  const plantIds = plants.map((plant) => plant.id)
  const [definitionPhotos, typePhotos, followCounts, allHusbandryGuides] = await Promise.all([
    prisma.photo.findMany({
      where: { ...collectionWhere, entityType: 'PLANT_DEFINITION', entityId: { in: plantIds }, isType: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.photo.findMany({
      where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: { in: instanceIds }, isType: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.groupBy({
      by: ['entityId'],
      where: { ...collectionWhere, scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: { in: plantIds } },
      _count: { _all: true },
    }),
    prisma.plantHusbandryGuide.findMany({ where: { collectionId: collection.id } }),
  ])
  const husbandryGuideByDefinitionId = new Map(allHusbandryGuides.map((guide) => [guide.plantDefinitionId, guide]))
  const followCountByDefinitionId = new Map(followCounts.map((follow) => [follow.entityId, follow._count._all]))
  const typePhotoByDefinition = definitionPhotos.reduce<Record<string, (typeof definitionPhotos)[number]>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const typePhotoByInstance = typePhotos.reduce<Record<string, (typeof typePhotos)[number]>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const readinessCounts = [...completenessByDefinition.values()].reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1
    return counts
  }, {})
  const sortedPlants = plants.filter((plant) => {
    const completeness = completenessByDefinition.get(plant.id)
    const curatorMatch = !curatorStatusFilter
      || (curatorStatusFilter === 'suggested' && (curatorSuggestionsByDefinitionId.get(plant.id) || 0) > 0)
      || (curatorStatusFilter === 'waiting' && (curatorWaitingByDefinitionId.get(plant.id) || 0) > 0)
      || (curatorStatusFilter === 'complete' && Boolean(completeness && completeness.overallScore >= 90) && (curatorSuggestionsByDefinitionId.get(plant.id) || 0) === 0 && (curatorWaitingByDefinitionId.get(plant.id) || 0) === 0)
    return completeness && completenessMatchesReadiness(completeness, readinessFilter) && completenessMatchesMissing(completeness, missingFilter) && curatorMatch
  }).sort((left, right) => {
    const leftCompleteness = completenessByDefinition.get(left.id)?.overallScore || 0
    const rightCompleteness = completenessByDefinition.get(right.id)?.overallScore || 0
    if (sortKey === 'completenessDesc') return rightCompleteness - leftCompleteness || compareText(plantName(left), plantName(right))
    if (sortKey === 'completenessAsc') return leftCompleteness - rightCompleteness || compareText(plantName(left), plantName(right))
    if (sortKey === 'nameDesc') return compareText(plantName(right), plantName(left))
    if (sortKey === 'updatedDesc') return timeValue(right.updatedAt) - timeValue(left.updatedAt)
    if (sortKey === 'updatedAsc') return timeValue(left.updatedAt) - timeValue(right.updatedAt)
    if (sortKey === 'createdDesc') return timeValue(right.createdAt) - timeValue(left.createdAt)
    if (sortKey === 'createdAsc') return timeValue(left.createdAt) - timeValue(right.createdAt)
    return compareText(plantName(left), plantName(right))
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold">Plant Definitions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SortControl
            section="plants"
            value={sortKey}
            options={plantSortOptions}
            back={collectionPath(collection.slug, '/plants')}
            disabled={!user}
          />
          {canManage && <LinkButton href={collectionPath(collection.slug, '/id-history')}>ID History</LinkButton>}
          <LinkButton href={collectionPath(collection.slug, '/validated-definitions')}>Validated</LinkButton>
          <LinkButton href={collectionPath(collection.slug, '/search')}>Search</LinkButton>
          {canManage && <a className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold" href={`/api/exports/plant-definitions?collectionSlug=${encodeURIComponent(collection.slug)}`}>Export CSV</a>}
          {canCreate && <LinkButton href={collectionPath(collection.slug, '/plant-tags')}>Plant Tags</LinkButton>}
        </div>
      </div>

      {canCreate && (
        <AddPanel label={identificationPrefill ? 'Add plant definition from ID My Plant history' : 'Add plant definition'} defaultOpen={Boolean(identificationPrefill)}>
          <SuggestionDatalist id="definition-genus-suggestions" suggestions={definitionSuggestions.genus} />
          <SuggestionDatalist id="definition-species-suggestions" suggestions={definitionSuggestions.species} />
          <SuggestionDatalist id="definition-hybrid-notation-suggestions" suggestions={definitionSuggestions.hybridNotation} />
          <SuggestionDatalist id="definition-cultivar-name-suggestions" suggestions={definitionSuggestions.cultivarName} />
          <SuggestionDatalist id="definition-authority-suggestions" suggestions={definitionSuggestions.authority} />
          <SuggestionDatalist id="definition-provisional-taxon-suggestions" suggestions={definitionSuggestions.provisionalTaxon} />
          <form action={createPlantDefinition} className="grid max-w-6xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            {identificationPrefill && <input type="hidden" name="plantIdentificationLogId" value={identificationPrefill.id} />}
            {identificationPrefill && sp.wishlist === '1' && <><input type="hidden" name="acquisitionStatus" value="WISHLIST" /><input type="hidden" name="acquisitionPriority" value="3" /></>}
            {identificationPrefill && (
              <div className="rounded-lg border border-[#b7caa9] bg-[#edf3e6] p-3 text-sm text-[#255537] lg:col-span-4">
                <p className="font-semibold">Prefilled from ID My Plant history.</p>
                <p className="mt-1">Review the AI-assisted draft before saving. Confidence is set to AI Determined.</p>
                {sp.wishlist === '1' && <p className="mt-1 font-semibold">Saving will also add this definition to the Wishlist at priority 3.</p>}
                {identificationPrefill.uploadedPhoto && (
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" name="attachIdentificationImage" defaultChecked />
                    <span>Attach the uploaded ID image as this definition's type image.</span>
                  </label>
                )}
              </div>
            )}
            <Field label="Genus" help="Required for an identified definition. For an unresolved plant, enter a provisional taxon below and AxilDB will retain a working placement for IDs." name="genus" list="definition-genus-suggestions" defaultValue={identificationPrefill?.genus || ''} />
            <Field label="Species" help="Species epithet. Leave blank when the accepted horticultural name intentionally omits species (for example, Begonia 'Looking Glass'). Use sp. only when the species is genuinely unknown." name="species" list="definition-species-suggestions" autoCapitalize="none" defaultValue={identificationPrefill?.species || ''} />
            <Field label="Hybrid notation" help="Use for botanical hybrid markers or formula context, such as x, grex, or parentage notation that belongs with the name." name="hybridNotation" list="definition-hybrid-notation-suggestions" defaultValue={identificationPrefill?.hybridNotation || ''} />
            <Field label="Cultivar name" help="The named cultivated variety, usually written in single quotes, such as 'Morning Glow'. Leave blank for unnamed species or clones." name="cultivarName" list="definition-cultivar-name-suggestions" defaultValue={identificationPrefill?.cultivarName || ''} />
            <div className="min-w-0 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 px-3 py-2 text-sm text-stone-700 lg:col-span-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">Enter the core name first, then let AxilDB draft taxonomy metadata and suggested aliases.</span>
                <AIMagicFillButton taxonomicAuthorities={taxonomicAuthorityOptions} />
              </div>
              <PlantIdentificationAssistant collectionSlug={collection.slug} className="mt-3" />
            </div>
            <Field label="Author citation" help="The author citation for the scientific name, such as (L.f.) R.Br. It records who validly published the name or combination." name="authority" list="definition-authority-suggestions" />
            <Field label="Cultivar registration number" help="Use when a formal registry or Taxonomic Authority assigns a registration number to the cultivar." name="cultivarRegistrationNumber" />
            <Field label="Order" name="taxonomicOrder" />
            <Field label="Family" name="taxonomicFamily" />
            <Field label="Tribe" name="taxonomicTribe" />
            <Field label="Section" name="taxonomicSection" help="For an infrageneric placement such as Saintpaulia within Streptocarpus." />
            <ConfidenceSelect name="confidence" defaultValue={identificationPrefill ? 'AI_DETERMINED' : 'UNCERTAIN'} />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span className="flex items-center gap-1.5">
                <span>Taxonomic Authority</span>
                <HelpTooltip>Use automatic matching from structured scope rules, choose a manual override, or explicitly continue without an authority.</HelpTooltip>
              </span>
              <select className={selectClass} name="taxonomicAuthoritySelection" defaultValue="AUTO">
                <option value="AUTO">Automatic matching</option>
                <option value="NONE">Continue without authority</option>
                {bodies.map((body) => (
                  <option key={body.id} value={`MANUAL:${body.id}`}>
                    Override: {body.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Provisional / working taxon" help="Use the label you currently suspect when identification is unresolved. It takes precedence as the displayed name and marks the definition as needing identification review." name="provisionalTaxon" list="definition-provisional-taxon-suggestions" wrapperClassName="lg:col-span-4" />
            <Field label="Wikipedia URL" help="Optional quick reference link for the species or genus entry." name="wikipediaUrl" type="url" defaultValue={identificationReferences.wikipediaUrl || ''} />
            <Field label="iNaturalist URL" help="Optional link to an iNaturalist taxon page for observations, common names, and community references." name="inaturalistUrl" type="url" defaultValue={identificationReferences.inaturalistUrl || ''} />
            <Field label="POWO URL" help="Optional Plants of the World Online link for accepted names, synonyms, and distribution data." name="powoUrl" type="url" defaultValue={identificationReferences.powoUrl || ''} />
            <Field label="GBIF URL" help="Optional GBIF link for occurrence records, taxonomy backbone data, and biodiversity references." name="gbifUrl" type="url" defaultValue={identificationReferences.gbifUrl || ''} />
            <AIDescriptionField wrapperClassName="lg:col-span-2" defaultValue={identificationPrefill?.suggestedDescription || ''} />
            <TextArea label="Notes" name="notes" wrapperClassName="lg:col-span-2" defaultValue={identificationPrefill?.confidenceExplanation || ''} />
            <PlantTagPicker tags={activeTags} />
            <PlantAliasFields aliases={identificationAliases} submitLabel="Create plant definition" sourceSuggestions={definitionSuggestions.aliasSource} />
          </form>
        </AddPanel>
      )}

      {sp.curator === 'queued' && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">AI Curator research was queued for that plant definition.</p>}

      <Card>
        <PlantDefinitionFilters
          q={q}
          genus={genusFilter}
          species={speciesFilter}
          taxonomicAuthorityId={authorityFilter}
          authorityType={authorityTypeFilter}
          registrationAuthorityOnly={registrationAuthorityOnly}
          readiness={readinessFilter}
          missing={missingFilter}
          curatorStatus={curatorStatusFilter}
          genusOptions={genusOptions}
          speciesOptionsByGenus={speciesOptionsByGenus}
          authorityOptions={bodies.map((body) => ({ value: body.id, label: body.name }))}
          authorityTypeOptions={TAXONOMIC_AUTHORITY_TYPES.map(([value, label]) => ({ value, label }))}
          visibleCount={sortedPlants.length}
          totalCount={taxonomyRows.length}
          hasActiveFilters={Boolean(q || genusFilter || speciesFilter || authorityFilter || authorityTypeFilter || registrationAuthorityOnly || readinessFilter || missingFilter || curatorStatusFilter || selectedTagIds.length)}
        />
        <p className="mt-2 text-xs text-stone-600">Definition completeness reflects how much applicable AxilDB metadata is populated. It does not guarantee taxonomic correctness.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-stone-300 px-2.5 py-1 font-semibold">{completenessByDefinition.size} total</span>
          <span className="rounded-full border border-stone-300 px-2.5 py-1">{readinessCounts.COMPLETE || 0} complete</span>
          <span className="rounded-full border border-stone-300 px-2.5 py-1">{readinessCounts.MOSTLY_COMPLETE || 0} mostly complete</span>
          <span className="rounded-full border border-stone-300 px-2.5 py-1">{readinessCounts.NEEDS_WORK || 0} need work</span>
          <span className="rounded-full border border-stone-300 px-2.5 py-1">{(readinessCounts.SPARSE || 0) + (readinessCounts.MINIMAL || 0)} sparse/minimal</span>
          <span className="rounded-full border border-stone-300 px-2.5 py-1">{readinessCounts.PROVISIONAL || 0} provisional</span>
        </div>
      </Card>

      {activeTags.length > 0 && (
        <Card>
          <PlantTagFilter tags={activeTags} selectedTagIds={selectedTagIds} matchMode={tagMode} />
        </Card>
      )}

      <div className="grid auto-rows-fr gap-4 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
        {sortedPlants.map((plant) => {
          const typePhoto = typePhotoByDefinition[plant.id] || plant.instances.map((instance) => typePhotoByInstance[instance.id]).find(Boolean)
          const completeness = completenessByDefinition.get(plant.id)!
          return (
            <Card key={plant.id} className="flex h-full flex-col overflow-hidden p-0">
              <div className="aspect-[4/3] overflow-hidden">
                <PlantImage src={typePhoto} alt={plantName(plant)} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                <div className="flex flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="line-clamp-2 text-sm font-bold leading-tight">{plantName(plant)}</span>
                    <p className="truncate text-sm">
                      {plant.taxonomicAuthority?.abbreviation || 'No matching Taxonomic Authority'} · {plant._count.instances} instance(s) ·{' '}
                      {taxonomyLabel(plant.confidence)}
                    </p>
                    {(plantNeedsIdentification(plant) || plant.authority) && (
                      <p className="line-clamp-2 text-sm text-stone-600">
                        {plantNeedsIdentification(plant) && <>Needs identification review. Working placement: {acceptedPlantName(plant)}. </>}
                        {plant.authority && <>Author citation: {plant.authority}.</>}
                      </p>
                    )}
                    {plant.aliases.length > 0 && (
                      <p className="line-clamp-2 text-sm text-stone-600">
                        Aliases: {plant.aliases.slice(0, 4).map((alias) => alias.name).join(', ')}
                        {plant.aliases.length > 4 ? `, +${plant.aliases.length - 4} more` : ''}
                      </p>
                    )}
                    {(plant.wikipediaUrl || plant.inaturalistUrl || plant.powoUrl || plant.gbifUrl) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {plant.wikipediaUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.wikipediaUrl}>Wikipedia</a>}
                        {plant.inaturalistUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.inaturalistUrl}>iNaturalist</a>}
                        {plant.powoUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.powoUrl}>POWO</a>}
                        {plant.gbifUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.gbifUrl}>GBIF</a>}
                      </div>
                    )}
                    <p className="line-clamp-2 text-sm text-stone-600">{plant.description}</p>
                    <div className="mt-2"><PlantTagRow tags={plant.tags.map((item) => item.plantTag)} limit={3} /></div>
                    <HusbandryBadges
                      values={(plant.husbandryGuide?.sourcePlantDefinitionId
                        ? husbandryGuideByDefinitionId.get(plant.husbandryGuide.sourcePlantDefinitionId)
                        : plant.husbandryGuide) as any}
                      href={collectionPath(collection.slug, `/plants/${plant.id}/husbandry`)}
                    />
                    <p className="mt-2 text-xs font-medium text-stone-500">
                      {followCountByDefinitionId.get(plant.id) || 0} follower{(followCountByDefinitionId.get(plant.id) || 0) === 1 ? '' : 's'}
                    </p>
                    <PlantDefinitionCompletenessBar result={completeness} className="mt-3" />
                    {(curatorSuggestionsByDefinitionId.get(plant.id) || 0) > 0 && (
                      <p className="mt-2 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-900">AI has prepared suggestions</p>
                    )}
                    {(curatorWaitingByDefinitionId.get(plant.id) || 0) > 0 && (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">AI Curator is waiting for human input</p>
                    )}
                  </div>
                  {(canEdit || canCreate) && (
                    <div className="flex shrink-0 flex-col gap-1">
                      {canEdit && (
                        <Link className="plant-card-action rounded-md border px-2 py-1 text-center text-xs" href={collectionPath(collection.slug, `/plants/${plant.id}/edit`)}>
                          Edit
                        </Link>
                      )}
                      {canEdit && collection.aiFeaturesEnabled && collection.aiCuratorEnabled && (
                        <form action={requestAiCuratorResearchNow}>
                          <input type="hidden" name="plantDefinitionId" value={plant.id} />
                          <input type="hidden" name="collectionSlug" value={collection.slug} />
                          <input type="hidden" name="back" value={collectionPath(collection.slug, '/plants')} />
                          <button type="submit" className="plant-card-action w-full rounded-md border px-2 py-1 text-center text-xs">
                            Research Now
                          </button>
                        </form>
                      )}
                      {canCreate && (
                        <form action={copyPlantDefinition}>
                          <input type="hidden" name="id" value={plant.id} />
                          <input type="hidden" name="collectionSlug" value={collection.slug} />
                          <button type="submit" className="plant-card-action w-full rounded-md border px-2 py-1 text-center text-xs">
                            Copy
                          </button>
                        </form>
                      )}
                      {canEdit && outgoingTransferConnections.length > 0 && (
                        <form action={createPlantDefinitionShareRequest} className="grid gap-1">
                          <input type="hidden" name="sourcePlantDefinitionId" value={plant.id} />
                          <input type="hidden" name="collectionSlug" value={collection.slug} />
                          <input type="hidden" name="back" value={collectionPath(collection.slug, '/plants')} />
                          {outgoingTransferConnections.length === 1 ? (
                            <input type="hidden" name="connectionId" value={outgoingTransferConnections[0].id} />
                          ) : (
                            <select name="connectionId" aria-label="Share target collection" className="max-w-24 rounded-md border border-stone-300 bg-white/80 px-1 py-1 text-xs">
                              {outgoingTransferConnections.map((connection) => (
                                <option key={connection.id} value={connection.id}>{connection.targetCollection.name}</option>
                              ))}
                            </select>
                          )}
                          <button type="submit" className="w-full rounded-md border px-2 py-1 text-center text-xs">
                            Share definition
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-auto grid gap-2 pt-3">
                  {plant._count.instances > 0 ? (
                    <Link
                      className="plant-card-action rounded-md border px-3 py-1.5 text-center text-xs"
                      href={collectionPath(collection.slug, `/instances?definition=${encodeURIComponent(plant.id)}`)}
                    >
                      View instances · {plant._count.instances}
                    </Link>
                  ) : (
                    <span className="rounded-md border border-stone-200 bg-white/45 px-3 py-1.5 text-center text-xs text-stone-500">
                      No instances
                    </span>
                  )}
                  {user && (
                    <>
                    {followsByDefinitionId.get(plant.id) ? (
                      <form action={unfollowEntity}>
                        <input type="hidden" name="id" value={followsByDefinitionId.get(plant.id)!.id} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, '/plants')} />
                        <Button className="w-full border border-stone-300 bg-white/70 px-3 py-1.5 text-xs text-stone-800 hover:bg-white">
                          Following type · {followCountByDefinitionId.get(plant.id) || 0}
                        </Button>
                      </form>
                    ) : (
                      <form action={followEntity}>
                        <input type="hidden" name="scope" value="TYPE" />
                        <input type="hidden" name="entityType" value="PLANT_DEFINITION" />
                        <input type="hidden" name="entityId" value={plant.id} />
                        <input type="hidden" name="collectionSlug" value={collection.slug} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, '/plants')} />
                        <Button className="w-full px-3 py-1.5 text-xs">Follow type · {followCountByDefinitionId.get(plant.id) || 0}</Button>
                      </form>
                    )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      {sortedPlants.length === 0 && <Card><p className="text-sm text-stone-600">No plant definitions match the selected readiness filters.</p></Card>}
    </div>
  )
}
