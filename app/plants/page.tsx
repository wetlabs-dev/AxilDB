import { prisma } from '@/lib/prisma'
import { createPlantDefinition, followEntity, unfollowEntity } from '@/app/actions'
import { AddPanel, Button, Card, Field, HelpTooltip, TextArea, LinkButton, SuggestionDatalist } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { PlantImage } from '@/components/PlantImage'
import { AIDescriptionField, AIMagicFillButton } from '@/components/AIDescriptionField'
import { HusbandryBadges } from '@/components/Husbandry'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { rankedSuggestions } from '@/lib/suggestions'
import { plantName, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function Plants() {
  const user = await getCurrentUser()
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }
  const [plants, bodies, follows] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: collectionWhere,
      include: {
        governingBody: true,
        aliases: { orderBy: { name: 'asc' } },
        husbandryGuide: true,
        instances: { select: { id: true } },
        _count: { select: { instances: true } },
      },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }],
    }),
    prisma.governingBody.findMany({ where: collectionWhere, orderBy: { name: 'asc' } }),
    user
      ? prisma.follow.findMany({
          where: { ...collectionWhere, userId: user.id, scope: 'TYPE', entityType: 'PLANT_DEFINITION' },
        })
      : [],
  ])
  const followsByDefinitionId = new Map(follows.map((follow) => [follow.entityId, follow]))
  const definitionSuggestions = {
    genus: rankedSuggestions(plants.map((plant) => plant.genus)),
    species: rankedSuggestions(plants.map((plant) => plant.species)),
    hybridNotation: rankedSuggestions(plants.map((plant) => plant.hybridNotation)),
    cultivarName: rankedSuggestions(plants.map((plant) => plant.cultivarName)),
    authority: rankedSuggestions(plants.map((plant) => plant.authority)),
    acquisitionLabel: rankedSuggestions(plants.map((plant) => plant.acquisitionLabel)),
    provisionalTaxon: rankedSuggestions(plants.map((plant) => plant.provisionalTaxon)),
    aliasSource: rankedSuggestions(plants.flatMap((plant) => plant.aliases.map((alias) => alias.source))),
  }
  const governingBodyOptions = bodies.map((body) => ({ id: body.id, name: body.name, abbreviation: body.abbreviation }))
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
  const typePhotoByDefinition = definitionPhotos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})
  const typePhotoByInstance = typePhotos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Plant Definitions</h2>
        <LinkButton href={collectionPath(collection.slug, '/search')}>Search</LinkButton>
      </div>

      {canCreateInCollection(user, context) && (
        <AddPanel label="Add plant definition">
          <SuggestionDatalist id="definition-genus-suggestions" suggestions={definitionSuggestions.genus} />
          <SuggestionDatalist id="definition-species-suggestions" suggestions={definitionSuggestions.species} />
          <SuggestionDatalist id="definition-hybrid-notation-suggestions" suggestions={definitionSuggestions.hybridNotation} />
          <SuggestionDatalist id="definition-cultivar-name-suggestions" suggestions={definitionSuggestions.cultivarName} />
          <SuggestionDatalist id="definition-authority-suggestions" suggestions={definitionSuggestions.authority} />
          <SuggestionDatalist id="definition-acquisition-label-suggestions" suggestions={definitionSuggestions.acquisitionLabel} />
          <SuggestionDatalist id="definition-provisional-taxon-suggestions" suggestions={definitionSuggestions.provisionalTaxon} />
          <form action={createPlantDefinition} className="grid max-w-6xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Field label="Genus" name="genus" required list="definition-genus-suggestions" />
            <Field label="Species" name="species" required list="definition-species-suggestions" autoCapitalize="none" />
            <Field label="Hybrid notation" help="Use for botanical hybrid markers or formula context, such as x, grex, or parentage notation that belongs with the name." name="hybridNotation" list="definition-hybrid-notation-suggestions" />
            <Field label="Cultivar name" help="The named cultivated variety, usually written in single quotes, such as 'Morning Glow'. Leave blank for unnamed species or clones." name="cultivarName" list="definition-cultivar-name-suggestions" />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 px-3 py-2 text-sm text-stone-700 lg:col-span-4">
              <span className="min-w-0">Enter the core name first, then let AxilDB draft taxonomy metadata and suggested aliases.</span>
              <AIMagicFillButton governingBodies={governingBodyOptions} />
            </div>
            <Field label="Authority" help="The author citation for the scientific name, such as (L.f.) R.Br. It records who validly published the name or combination." name="authority" list="definition-authority-suggestions" />
            <Field label="Cultivar registration number" help="Use when a formal cultivar registry or governing body assigns a registration number to the cultivar." name="cultivarRegistrationNumber" />
            <ConfidenceSelect name="confidence" />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span className="flex items-center gap-1.5">
                <span>Governing body</span>
                <HelpTooltip>The registry, society, or authority that governs naming or registration for this plant group, if applicable.</HelpTooltip>
              </span>
              <select className={selectClass} name="governingBodyId">
                <option value="">—</option>
                {bodies.map((body) => (
                  <option key={body.id} value={body.id}>
                    {body.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Acquisition label" help="The name or label the plant arrived with, even if you later determine a different accepted name." name="acquisitionLabel" list="definition-acquisition-label-suggestions" wrapperClassName="lg:col-span-2" />
            <Field label="Provisional taxon" help="A cautious working identification when the accepted name is not settled yet. Useful for 'probably this' or awaiting confirmation." name="provisionalTaxon" list="definition-provisional-taxon-suggestions" wrapperClassName="lg:col-span-2" />
            <Field label="Wikipedia URL" help="Optional quick reference link for the species or genus entry." name="wikipediaUrl" type="url" />
            <Field label="iNaturalist URL" help="Optional link to an iNaturalist taxon page for observations, common names, and community references." name="inaturalistUrl" type="url" />
            <Field label="POWO URL" help="Optional Plants of the World Online link for accepted names, synonyms, and distribution data." name="powoUrl" type="url" />
            <Field label="GBIF URL" help="Optional GBIF link for occurrence records, taxonomy backbone data, and biodiversity references." name="gbifUrl" type="url" />
            <AIDescriptionField wrapperClassName="lg:col-span-2" />
            <TextArea label="Notes" name="notes" wrapperClassName="lg:col-span-2" />
            <PlantAliasFields submitLabel="Create plant definition" sourceSuggestions={definitionSuggestions.aliasSource} />
          </form>
        </AddPanel>
      )}

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {plants.map((plant) => {
          const typePhoto = typePhotoByDefinition[plant.id] || plant.instances.map((instance) => typePhotoByInstance[instance.id]).find(Boolean)
          return (
            <Card key={plant.id} className="flex h-full flex-col overflow-hidden p-0">
              <div className="aspect-[4/3]">
                <PlantImage src={typePhoto} alt={plantName(plant)} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                <div className="flex flex-1 items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="line-clamp-2 text-sm font-bold leading-tight">{plantName(plant)}</span>
                    <p className="truncate text-sm">
                      {plant.governingBody?.abbreviation || 'No governing body'} · {plant._count.instances} instance(s) ·{' '}
                      {taxonomyLabel(plant.confidence)}
                    </p>
                    {(plant.acquisitionLabel || plant.provisionalTaxon || plant.authority) && (
                      <p className="line-clamp-2 text-sm text-stone-600">
                        {plant.acquisitionLabel && <>Acquired as {plant.acquisitionLabel}. </>}
                        {plant.provisionalTaxon && <>Provisional taxon: {plant.provisionalTaxon}. </>}
                        {plant.authority && <>Authority: {plant.authority}.</>}
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
                    <HusbandryBadges
                      values={(plant.husbandryGuide?.sourcePlantDefinitionId
                        ? husbandryGuideByDefinitionId.get(plant.husbandryGuide.sourcePlantDefinitionId)
                        : plant.husbandryGuide) as any}
                      href={collectionPath(collection.slug, `/plants/${plant.id}/husbandry`)}
                    />
                    <p className="mt-2 text-xs font-medium text-stone-500">
                      {followCountByDefinitionId.get(plant.id) || 0} follower{(followCountByDefinitionId.get(plant.id) || 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  {canEditInCollection(user, context) && (
                    <Link className="rounded-md border px-2 py-1 text-xs" href={collectionPath(collection.slug, `/plants/${plant.id}/edit`)}>
                      Edit
                    </Link>
                  )}
                </div>
                {user && (
                  <div className="mt-auto pt-3">
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
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
