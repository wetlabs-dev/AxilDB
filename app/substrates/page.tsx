import Link from 'next/link'
import { Archive, Calculator, Layers3, Plus, Sprout } from 'lucide-react'
import {
  activateSubstrateRecipeVersion,
  createSubstrateComponent,
  createSubstrateRecipeVersion,
  toggleSubstrateComponentArchive,
  toggleSubstrateRecipeArchive,
  updateSubstrateComponent,
  updateSubstrateRecipeFamily,
} from '@/app/substrate-actions'
import { SubstrateBatchCalculator, SubstrateRecipeEditor } from '@/components/SubstrateRecipeEditor'
import { SubstrateCompositionBar, SubstrateStateStrip, SubstrateSwatch } from '@/components/SubstrateCompositionBar'
import { SubstrateRecipeComparison } from '@/components/SubstrateRecipeComparison'
import { SubstrateVisualIdentityEditor } from '@/components/SubstrateVisualIdentityEditor'
import { Card, Field, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { collectionRoleAtLeast, isServerAdminRole } from '@/lib/roles'
import {
  ensureStarterSubstrates,
  substrateComponentCategories,
  substrateLabel,
  substrateLongevities,
  substrateOrganicities,
  substratePhTendencies,
  substrateQualitativeValues,
} from '@/lib/substrates'

const control = 'rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] px-3 py-2 text-sm font-normal text-[var(--ax-text)]'

function Options({ values, blank = false }: { values: readonly string[]; blank?: boolean }) {
  return <>{blank && <option value="">Not recorded</option>}{values.map((value) => <option key={value} value={value}>{substrateLabel(value)}</option>)}</>
}

function ComponentForm({ collectionSlug, component }: { collectionSlug: string; component?: any }) {
  const action = component ? updateSubstrateComponent : createSubstrateComponent
  return <form action={action} className="grid gap-3 md:grid-cols-4">
    <input type="hidden" name="collectionSlug" value={collectionSlug} />
    {component && <input type="hidden" name="substrateComponentId" value={component.id} />}
    <Field label="Name" name="name" defaultValue={component?.name || ''} required />
    <label className="grid gap-1 text-sm font-semibold">Category<select className={control} name="category" defaultValue={component?.category || 'OTHER'}><Options values={substrateComponentCategories} /></select></label>
    <Field label="Particle size / grade" name="particleSize" defaultValue={component?.particleSize || ''} />
    <label className="grid gap-1 text-sm font-semibold">Organicity<select className={control} name="organicity" defaultValue={component?.organicity || 'UNKNOWN'}><Options values={substrateOrganicities} /></select></label>
    <label className="grid gap-1 text-sm font-semibold">Water retention<select className={control} name="waterRetention" defaultValue={component?.waterRetention || ''}><Options values={substrateQualitativeValues} blank /></select></label>
    <label className="grid gap-1 text-sm font-semibold">Aeration<select className={control} name="aeration" defaultValue={component?.aeration || ''}><Options values={substrateQualitativeValues} blank /></select></label>
    <label className="grid gap-1 text-sm font-semibold">Drainage<select className={control} name="drainage" defaultValue={component?.drainage || ''}><Options values={substrateQualitativeValues} blank /></select></label>
    <label className="grid gap-1 text-sm font-semibold">CEC<select className={control} name="cationExchangeCapacity" defaultValue={component?.cationExchangeCapacity || ''}><Options values={substrateQualitativeValues} blank /></select></label>
    <label className="grid gap-1 text-sm font-semibold">pH tendency<select className={control} name="phTendency" defaultValue={component?.phTendency || ''}><Options values={substratePhTendencies} blank /></select></label>
    <label className="grid gap-1 text-sm font-semibold">Longevity<select className={control} name="longevity" defaultValue={component?.longevity || ''}><Options values={substrateLongevities} blank /></select></label>
    <label className="grid gap-1 text-sm font-semibold">Renewable<select className={control} name="renewable" defaultValue={component?.renewable === true ? 'YES' : component?.renewable === false ? 'NO' : ''}><option value="">Unknown</option><option value="YES">Yes</option><option value="NO">No</option></select></label>
    <TextArea label="Description" name="description" defaultValue={component?.description || ''} wrapperClassName="md:col-span-2" />
    <TextArea label="Notes" name="notes" defaultValue={component?.notes || ''} wrapperClassName="md:col-span-2" />
    <SubstrateVisualIdentityEditor component={component || { name: 'New component', slug: 'new-component' }} isNew={!component} />
    <button className="w-fit rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-semibold text-white md:col-span-4">{component ? 'Save component' : 'Create component'}</button>
  </form>
}

export default async function SubstratesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await requireCollectionGardener()
  const canManage = isServerAdminRole(context.user.role) || collectionRoleAtLeast(context.role, 'MANAGER')
  const sp = await searchParams
  await ensureStarterSubstrates(prisma, context.collection.id, context.user.id)
  const [components, recipes, modeCounts] = await Promise.all([
    prisma.substrateComponent.findMany({
      where: { collectionId: context.collection.id },
      include: { _count: { select: { recipeComponents: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.substrateRecipe.findMany({
      where: { collectionId: context.collection.id },
      include: {
        activeVersion: { include: { components: { include: { component: true }, orderBy: { sortOrder: 'asc' } }, _count: { select: { currentAssignments: true, recommendations: true, newHistory: true } } } },
        versions: { include: { components: { include: { component: true }, orderBy: { sortOrder: 'asc' } }, _count: { select: { currentAssignments: true, recommendations: true, newHistory: true } } }, orderBy: { versionNumber: 'desc' } },
      },
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    }),
    prisma.plantInstanceSubstrate.groupBy({ by: ['substrateMode'], where: { collectionId: context.collection.id }, _count: { _all: true } }),
  ])
  const activeComponents = components.filter((component) => component.active).map((component) => ({
    id: component.id, name: component.name, slug: component.slug, starterKey: component.starterKey,
    category: component.category, waterRetention: component.waterRetention, aeration: component.aeration,
    displayColor: component.displayColor, displayPattern: component.displayPattern, shortLabel: component.shortLabel, visualFamily: component.visualFamily,
  }))
  const selectedRecipe = recipes.find((recipe) => recipe.id === sp.recipe)
  const selectedVersion = selectedRecipe?.versions.find((version) => version.id === sp.version)

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-3xl font-bold">Substrates</h2><p className="mt-1 text-sm text-[var(--ax-muted)]">Reusable components, exact versioned recipes, recommendations, and specimen potting history. Percentages are always by volume.</p></div>
      <div className="flex flex-wrap gap-2"><a href="#recipes" className="rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold">Recipes</a><a href="#components" className="rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold">Components</a><a href="#usage" className="rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold">Plants by substrate</a></div>
    </header>

    <Card id="recipes">
      <div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-[#2f6b45]" /><h3 className="font-serif text-2xl font-semibold">Recipe Library</h3></div>
      <details className="mt-3 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-semibold"><Plus className="h-4 w-4" /> Create recipe</summary>
        <div className="border-t border-[color:var(--ax-border)] p-3"><SubstrateRecipeEditor collectionSlug={context.collection.slug} components={activeComponents} /></div>
      </details>
      <div className="mt-4 grid gap-3">
        {recipes.map((recipe) => {
          const active = recipe.activeVersion
          return <article key={recipe.id} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><h4 className="font-serif text-xl font-semibold">{recipe.name}</h4><p className="text-xs text-[var(--ax-muted)]">{active ? `v${active.versionNumber} · current` : 'No active version'}{recipe.archivedAt ? ' · archived' : ''}</p>{active && <SubstrateCompositionBar className="mt-2 max-w-3xl" items={active.components} mode="compact" />}<p className="mt-2 text-xs text-[var(--ax-muted)]">{active?._count.currentAssignments || 0} plants · {active?._count.recommendations || 0} definition recommendations · {active?._count.newHistory || 0} recorded assignments</p></div>
              <div className="flex flex-wrap gap-2"><Link href={collectionPath(context.collection.slug, `/substrates?recipe=${recipe.id}`)} className="rounded-md border border-[color:var(--ax-border)] px-3 py-1.5 text-xs font-semibold">View</Link><form action={createSubstrateRecipeVersion}><input type="hidden" name="collectionSlug" value={context.collection.slug} /><input type="hidden" name="substrateRecipeId" value={recipe.id} /><button className="rounded-md border border-[color:var(--ax-border)] px-3 py-1.5 text-xs font-semibold">Create new version</button></form></div>
            </div>
            {selectedRecipe?.id === recipe.id && <div className="mt-4 grid gap-4 border-t border-[color:var(--ax-border)] pt-4">
              <form action={updateSubstrateRecipeFamily} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={context.collection.slug} /><input type="hidden" name="substrateRecipeId" value={recipe.id} /><Field label="Family name" name="name" defaultValue={recipe.name} required /><Field label="Intended use" name="intendedUse" defaultValue={recipe.intendedUse || ''} /><TextArea label="Description" name="description" defaultValue={recipe.description || ''} wrapperClassName="sm:col-span-2" /><button className="w-fit rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold">Save family details</button></form>
              {recipe.versions.map((version) => <details key={version.id} open={selectedVersion?.id === version.id} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3"><span><strong>v{version.versionNumber}</strong> · {substrateLabel(version.status)} · {Number(version.totalPercent)}%<span className="ml-2 text-xs text-[var(--ax-muted)]">{version._count.currentAssignments} plants · {version._count.recommendations} recommendations</span></span><span className="text-xs font-semibold">Open</span></summary>
                <div className="grid gap-4 border-t border-[color:var(--ax-border)] p-3">
                  <SubstrateCompositionBar items={version.components} mode="full" />
                  {version.status === 'DRAFT' ? <SubstrateRecipeEditor collectionSlug={context.collection.slug} components={activeComponents} recipe={recipe} version={version} /> : <p className="rounded-md border border-[#d6dfc9] bg-[#f4f8ed] p-3 text-sm">Published formulation. Its composition is immutable; create a new version to make changes.</p>}
                  {version.status === 'DRAFT' && <form action={activateSubstrateRecipeVersion}><input type="hidden" name="collectionSlug" value={context.collection.slug} /><input type="hidden" name="substrateRecipeVersionId" value={version.id} /><button className="rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white">Activate v{version.versionNumber}</button></form>}
                  <details><summary className="cursor-pointer text-sm font-semibold"><Calculator className="mr-1 inline h-4 w-4" />Batch calculator</summary><div className="mt-2"><SubstrateBatchCalculator components={version.components.map((row) => ({ name: row.component.name, percentByVolume: row.percentByVolume, component: row.component }))} /></div></details>
                </div>
              </details>)}
              {canManage && <form action={toggleSubstrateRecipeArchive}><input type="hidden" name="collectionSlug" value={context.collection.slug} /><input type="hidden" name="substrateRecipeId" value={recipe.id} /><button className="inline-flex items-center gap-1 text-sm font-semibold text-[#9a3f35] underline"><Archive className="h-4 w-4" />{recipe.archivedAt ? 'Restore recipe family' : 'Archive recipe family'}</button></form>}
            </div>}
          </article>
        })}
      </div>
      <SubstrateRecipeComparison versions={recipes.flatMap((recipe) => recipe.versions.map((version) => ({
        id: version.id,
        name: `${recipe.name} v${version.versionNumber}`,
        components: version.components.map((row) => ({ id: row.id, percentByVolume: Number(row.percentByVolume), component: row.component })),
      })))} />
    </Card>

    <Card id="components">
      <h3 className="font-serif text-2xl font-semibold">Component Library</h3>
      <details className="mt-3 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)]"><summary className="cursor-pointer p-3 font-semibold">Create component</summary><div className="border-t border-[color:var(--ax-border)] p-3"><ComponentForm collectionSlug={context.collection.slug} /></div></details>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{components.map((component) => <details key={component.id} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)]"><summary className="cursor-pointer list-none p-3"><span className="flex items-center gap-2"><SubstrateSwatch component={component} className="h-8 w-12" /><strong>{component.name}</strong></span><span className="mt-1 block text-xs text-[var(--ax-muted)]">{substrateLabel(component.category)} · {substrateLabel(component.organicity)} · {component._count.recipeComponents} recipe versions{!component.active ? ' · archived' : ''}</span></summary><div className="grid gap-3 border-t border-[color:var(--ax-border)] p-3"><ComponentForm collectionSlug={context.collection.slug} component={component} />{canManage && <form action={toggleSubstrateComponentArchive}><input type="hidden" name="collectionSlug" value={context.collection.slug} /><input type="hidden" name="substrateComponentId" value={component.id} /><button className="text-sm font-semibold text-[#9a3f35] underline">{component.active ? 'Archive component' : 'Restore component'}</button></form>}</div></details>)}</div>
    </Card>

    <Card id="usage">
      <div className="flex items-center gap-2"><Sprout className="h-5 w-5 text-[#2f6b45]" /><h3 className="font-serif text-2xl font-semibold">Plants by Substrate</h3></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.flatMap((recipe) => recipe.versions.filter((version) => version._count.currentAssignments > 0).map((version) => <Link key={version.id} href={collectionPath(context.collection.slug, `/instances?substrateVersion=${version.id}`)} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3"><strong>{recipe.name} v{version.versionNumber}</strong><span className="block text-sm text-[var(--ax-muted)]">{version._count.currentAssignments} plants</span><SubstrateCompositionBar className="mt-2" items={version.components} mode="tiny" showLegend={false} /></Link>))}
        {modeCounts.map((group) => <Link key={group.substrateMode} href={collectionPath(context.collection.slug, `/instances?substrateMode=${group.substrateMode}`)} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3"><strong>{substrateLabel(group.substrateMode)}</strong><span className="block text-sm text-[var(--ax-muted)]">{group._count._all} plants</span><SubstrateStateStrip mode={group.substrateMode} /></Link>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><a href={`/api/exports/substrate-recipes?collectionSlug=${encodeURIComponent(context.collection.slug)}`} className="rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold">Recipe library CSV</a><a href={`/api/exports/plant-substrates?collectionSlug=${encodeURIComponent(context.collection.slug)}`} className="rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold">Plant substrate CSV</a><a href={`/api/exports/plant-substrates?collectionSlug=${encodeURIComponent(context.collection.slug)}&mode=RECEIVED_SUBSTRATE`} className="rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-sm font-semibold">Received Substrate CSV</a></div>
    </Card>
  </div>
}
