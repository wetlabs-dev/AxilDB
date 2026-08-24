import { prisma } from '@/lib/prisma'
import { SunshineButton } from '@/components/SunshineButton'
import { Card, Button } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { sunshineCounts, sunshineKey, sunshineStateForUser } from '@/lib/sunshine'
import { plantName, fmtDate, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'
import { PlantTagRow } from '@/components/PlantTagChip'
import { isServerAdminRole } from '@/lib/roles'
import { substrateAssignmentLabel } from '@/lib/substrates'
import { SubstrateCompositionBar, SubstrateSwatch } from '@/components/SubstrateCompositionBar'
import { descendantLocationIds } from '@/lib/locations'

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 text-sm shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'
const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const })

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; sport?: string; tag?: string | string[]; tagMode?: string }>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  const context = await requireCollectionViewer()
  const { collection } = context
  const canSearchTreatments = Boolean(context.user && (context.membership?.status === 'ACTIVE' || isServerAdminRole(context.user.role)))
  const q = (sp.q || '').trim()
  const status = sp.status || ''
  const type = sp.type || ''
  const sport = sp.sport || ''
  const selectedTagIds = (Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : []).filter(Boolean)
  const tagMode = sp.tagMode === 'all' ? 'all' : 'any'
  const tagWhere = selectedTagIds.length ? tagMode === 'all' ? { AND: selectedTagIds.map((plantTagId) => ({ tags: { some: { plantTagId } } })) } : { tags: { some: { plantTagId: { in: selectedTagIds } } } } : {}
  const activeTags = await prisma.plantTag.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' } })
  const identityTerms = q.split(/\s+/).map((term) => term.replace(/^['"]|['"]$/g, '')).filter(Boolean)
  const locationNodes = q ? await prisma.location.findMany({ where: { collectionId: collection.id }, select: { id: true, parentLocationId: true, name: true, code: true } }) : []
  const matchingLocationIds = locationNodes
    .filter((location) => `${location.code} ${location.name}`.toLowerCase().includes(q.toLowerCase()))
    .flatMap((location) => [location.id, ...descendantLocationIds(location.id, locationNodes)])

  const definitionSearch = q
    ? {
        OR: [
          ...(identityTerms.length ? [{ AND: identityTerms.map((term) => ({ OR: [{ genus: contains(term) }, { species: contains(term) }, { cultivarName: contains(term) }] })) }] : []),
          { genus: contains(q) },
          { species: contains(q) },
          { cultivarName: contains(q) },
          { authority: contains(q) },
          { provisionalTaxon: contains(q) },
          { wikipediaUrl: contains(q) },
          { inaturalistUrl: contains(q) },
          { powoUrl: contains(q) },
          { gbifUrl: contains(q) },
          { description: contains(q) },
          { notes: contains(q) },
          { taxonomicAuthority: { is: { OR: [
            { name: contains(q) },
            { abbreviation: contains(q) },
            { authorityType: contains(q) },
            { website: contains(q) },
            { scopeRules: { some: { taxonName: contains(q) } } },
            { publications: { some: { name: contains(q) } } },
          ] } } },
          {
            husbandryGuide: {
              is: {
                OR: [
                  { summaryWater: contains(q) },
                  { summaryLight: contains(q) },
                  { summaryToxicity: contains(q) },
                  { summaryCare: contains(q) },
                  { wateringCadence: contains(q) },
                  { lightIntensity: contains(q) },
                  { mediumPreferred: contains(q) },
                  { propagationMethods: contains(q) },
                  { toxicityPets: contains(q) },
                  { toxicityHumans: contains(q) },
                  { growthHabit: contains(q) },
                  { conservationStatus: contains(q) },
                  { nativeRangeNotes: contains(q) },
                ],
              },
            },
          },
          { aliases: { some: { OR: [{ name: contains(q) }, { source: contains(q) }, { notes: contains(q) }] } } },
          { tags: { some: { plantTag: { name: contains(q) } } } },
        ],
      }
    : {}

  const instances = await prisma.plantInstance.findMany({
    where: {
      AND: [
        status ? { status } : {},
        { collectionId: collection.id },
        type ? { instanceType: type } : {},
        sport ? { sportStatus: sport } : {},
        selectedTagIds.length ? { plantDefinition: tagWhere } : {},
        q
          ? {
              OR: [
                { plantId: contains(q) },
                ...(matchingLocationIds.length ? [{ currentLocationId: { in: Array.from(new Set(matchingLocationIds)) } }] : []),
                { source: contains(q) },
                { distributor: contains(q) },
                { stockNumber: contains(q) },
                { acquisitionLabel: contains(q) },
                { currentSubstrate: { is: { OR: [
                  { receivedSubstrateDescription: contains(q) },
                  { notes: contains(q) },
                  { recipeVersion: { recipe: { name: contains(q) } } },
                  { recipeVersion: { components: { some: { component: { name: contains(q) } } } } },
                ] } } },
                { acquisitionRecordLinks: { some: { acquisitionRecord: { OR: [
                  { distributor: { name: contains(q) } },
                  { distributorOutlet: { name: contains(q) } },
                  { seller: { OR: [{ name: contains(q) }, { websiteUrl: contains(q) }] } },
                  { sellerStorefront: { OR: [{ handleOrName: contains(q) }, { profileUrl: contains(q) }, { salesChannelType: { name: contains(q) } }] } },
                  { sources: { some: { OR: [{ role: contains(q) }, { source: { OR: [{ name: contains(q) }, { websiteUrl: contains(q) }] } }] } } },
                ] } } } },
                { plantDefinition: { AND: [definitionSearch, tagWhere] } },
              ],
            }
          : {},
      ],
    },
    include: { plantDefinition: { include: { aliases: true, tags: { include: { plantTag: true } } } }, currentLocation: true, currentSubstrate: { include: { recipeVersion: { include: { recipe: true } } } }, mergeConstituent: { include: { merge: { include: { survivingPlantInstance: true } } } } },
    orderBy: { plantId: 'asc' },
  })

  const defs = await prisma.plantDefinition.findMany({
    where: { AND: [{ OR: [{ collectionId: collection.id }, { collectionId: null, isValidated: true }] }, definitionSearch, tagWhere] },
    include: {
      aliases: { orderBy: { name: 'asc' } },
      _count: { select: { instances: true } },
      tags: { include: { plantTag: true } },
    },
    orderBy: [{ isValidated: 'desc' }, { genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
  })
  const treatmentResults = q && canSearchTreatments ? await prisma.treatmentDefinition.findMany({
    where: { collectionId: collection.id, OR: [{ name: contains(q) }, { description: contains(q) }, { targetSummary: contains(q) }, { instructions: contains(q) }, { products: { some: { product: { OR: [{ name: contains(q) }, { manufacturer: contains(q) }, { activeIngredient: contains(q) }] } } } }, { applications: { some: { notes: contains(q) } } }] },
    include: { products: { include: { product: true } }, conditionTypes: true, _count: { select: { applications: true, planSteps: true } } }, orderBy: { name: 'asc' }, take: 50,
  }) : []
  const [substrateRecipes, substrateComponents] = q ? await Promise.all([
    prisma.substrateRecipe.findMany({
      where: {
        collectionId: collection.id,
        OR: [
          { name: contains(q) },
          { description: contains(q) },
          { intendedUse: contains(q) },
          { versions: { some: { OR: [{ notes: contains(q) }, { components: { some: { component: { name: contains(q) } } } }] } } },
        ],
      },
      include: { activeVersion: { include: { components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } } },
      orderBy: { name: 'asc' },
      take: 50,
    }),
    prisma.substrateComponent.findMany({ where: { collectionId: collection.id, OR: [{ name: contains(q) }, { description: contains(q) }, { notes: contains(q) }, { particleSize: contains(q) }] }, orderBy: { name: 'asc' }, take: 50 }),
  ]) : [[], []]
  const instanceSunshineTargets = instances.map((instance) => ({ targetType: 'PLANT_INSTANCE' as const, targetId: instance.id }))
  const [instanceSunshineCounts, currentUserSunshine] = await Promise.all([
    sunshineCounts(prisma, collection.id, instanceSunshineTargets),
    sunshineStateForUser(prisma, collection.id, user?.id, instanceSunshineTargets),
  ])
  const sunshineCount = (instanceId: string) => instanceSunshineCounts.get(sunshineKey('PLANT_INSTANCE', instanceId)) || 0

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Search / Filter</h2>
      <Card>
        <form className="grid gap-3 md:grid-cols-5">
          <input className={`${control} md:col-span-2`} name="q" placeholder="Search plant ID, cultivar, aliases, source, notes…" defaultValue={q} />
          <select className={control} name="status" defaultValue={status}>
            <option value="">Any status</option>
            <option>ACTIVE</option>
            <option>ARCHIVED</option>
            <option value="HISTORICAL_CONSTITUENT">Historical constituent</option>
          </select>
          <select className={control} name="type" defaultValue={type}>
            <option value="">Any type</option>
            <option>MOTHER</option>
            <option>PROPAGATION</option>
          </select>
          <select className={control} name="sport" defaultValue={sport}>
            <option value="">Any sport status</option>
            <option>NONE</option>
            <option>SUSPECTED</option>
            <option>CANDIDATE</option>
            <option>STABLE</option>
            <option>UNSTABLE</option>
            <option>REVERTED</option>
            <option>REGISTERED</option>
          </select>
          <select className={control} name="tag" multiple size={Math.min(4, Math.max(2, activeTags.length))} defaultValue={selectedTagIds}><option value="">Any tag</option>{activeTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
          <select className={control} name="tagMode" defaultValue={tagMode}><option value="any">Match any tag</option><option value="all">Match all tags</option></select>
          <Button className="md:col-span-5">Search</Button>
        </form>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-bold">Plant instances</h3>
          {instances.map((instance) => (
            <div key={instance.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 py-2 text-sm">
              <p className="min-w-0">
                <Link className="font-bold underline" href={collectionPath(collection.slug, `/instances/${instance.id}`)}>
                  {instance.plantId}
                </Link>{' '}
                · {plantName(instance.plantDefinition)} · {instance.status} · {fmtDate(instance.propagationDate || instance.acquisitionDate)}
                {instance.mergeConstituent && <> · merged into <Link className="font-semibold underline" href={collectionPath(collection.slug, `/instances/${instance.mergeConstituent.merge.survivingPlantInstanceId}`)}>{instance.mergeConstituent.merge.survivingPlantInstance.plantId}</Link></>}
              </p>
              <p className="w-full text-xs text-stone-600">Substrate: {substrateAssignmentLabel(instance.currentSubstrate)}</p>
              <SunshineButton
                collectionSlug={collection.slug}
                targetId={instance.id}
                count={sunshineCount(instance.id)}
                active={currentUserSunshine.has(sunshineKey('PLANT_INSTANCE', instance.id))}
                canToggle={Boolean(user)}
                compact
              />
            </div>
          ))}
        </Card>
        <Card>
          <h3 className="mb-3 font-bold">Plant definitions</h3>
          {defs.map((definition) => (
            <div key={definition.id} className="border-t border-stone-200 py-2 text-sm">
              <p>
                <Link className="font-bold underline" href={collectionPath(collection.slug, definition.isValidated ? '/validated-definitions' : `/plants/${definition.id}/edit`)}>
                  {plantName(definition)}
                </Link>{' '}
                {definition.isValidated && <span className="rounded-full bg-[#edf3e6] px-2 py-0.5 text-xs font-semibold text-[#2f6b45]">Validated</span>}{' '}
                · {definition._count.instances} instance(s) · {taxonomyLabel(definition.confidence)}
              </p>
              <PlantTagRow tags={definition.tags.map((item) => item.plantTag)} limit={5} />
              {definition.aliases.length > 0 && (
                <p className="text-stone-600">Aliases: {definition.aliases.map((alias) => alias.name).join(', ')}</p>
              )}
            </div>
          ))}
        </Card>
      </div>
      {q && canSearchTreatments && <Card><h3 className="mb-3 font-bold">Treatments and products</h3>{treatmentResults.map((treatment) => <div key={treatment.id} className="border-t border-stone-200 py-2 text-sm"><Link className="font-bold underline" href={collectionPath(collection.slug, `/treatments?selected=${treatment.id}`)}>{treatment.name}</Link><span> · {treatment.active ? 'active' : 'archived'} · {treatment._count.applications} applications</span><p className="text-stone-600">{treatment.conditionTypes.map((item) => taxonomyLabel(item.conditionType)).join(', ') || 'No condition links'}{treatment.products.length ? ` · Products: ${treatment.products.map((item) => item.product.name).join(', ')}` : ''}</p></div>)}{!treatmentResults.length && <p className="text-sm text-stone-600">No treatment results.</p>}</Card>}
      {q && <Card><h3 className="mb-3 font-bold">Substrate recipes and components</h3>{substrateRecipes.map((recipe) => <div key={recipe.id} className="border-t border-stone-200 py-2 text-sm"><Link className="font-bold underline" href={collectionPath(collection.slug, `/substrates?recipe=${recipe.id}`)}>{recipe.name}</Link><span> · {recipe.archivedAt ? 'archived' : 'active family'}</span>{recipe.activeVersion && <div className="mt-1"><span className="text-xs text-stone-600">v{recipe.activeVersion.versionNumber}</span><SubstrateCompositionBar className="mt-1 max-w-xl" items={recipe.activeVersion.components} mode="tiny" showLegend={false} /></div>}</div>)}{substrateComponents.map((component) => <div key={component.id} className="flex items-center gap-2 border-t border-stone-200 py-2 text-sm"><SubstrateSwatch component={component} /><span><Link className="font-bold underline" href={collectionPath(collection.slug, '/substrates#components')}>{component.name}</Link> · {taxonomyLabel(component.category)} · {component.active ? 'active' : 'archived'}</span></div>)}{!substrateRecipes.length && !substrateComponents.length && <p className="text-sm text-stone-600">No substrate results.</p>}</Card>}
    </div>
  )
}
