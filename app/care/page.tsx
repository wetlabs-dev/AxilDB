import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { startWorkflowRun } from '@/app/workflow-actions'
import { CareQueueLocationBoard } from '@/components/CareQueueLocationBoard'
import { Button, Card } from '@/components/ui'
import { canCreateInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { careQueueSummary, filterCareQueue, getCareQueue } from '@/lib/care-queue'
import { careQueueLocationFilters, careQueueLocationSections, type CareQueueGroupingMode, type CareQueueLocationSort } from '@/lib/care-queue-locations'
import { prisma } from '@/lib/prisma'
import { ensureStarterWorkflowTemplates } from '@/lib/workflows'
import { descendantLocationIds } from '@/lib/locations'

const filters = [
  ['today', 'Today'],
  ['overdue', 'Overdue'],
  ['water', 'Water'],
  ['fertilize', 'Fertilizer'],
  ['repot', 'Repot'],
  ['treatment', 'Treatments'],
  ['propagation', 'Propagation'],
  ['health', 'Health'],
  ['pest', 'Pest'],
  ['bloom', 'Bloom'],
  ['custom', 'Custom'],
  ['completed', 'Completed'],
] as const

export default async function CareQueuePage({ searchParams }: { searchParams: Promise<{ filter?: string; location?: string; grouping?: string; locationSort?: string; q?: string }> }) {
  const params = await searchParams
  const context = await requireCollectionViewer()
  const canAct = canCreateInCollection(context.user, context)
  if (canAct) await ensureStarterWorkflowTemplates(prisma, context.collection.id)
  const preferences = context.user
    ? await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
    : null
  const timezone = preferences?.timezone
  const filter = params.filter || 'today'
  const search = (params.q || '').trim()
  const grouping: CareQueueGroupingMode = ['flat', 'hierarchy'].includes(params.grouping || '') ? params.grouping as CareQueueGroupingMode : 'parent'
  const locationSort: CareQueueLocationSort = ['alphabetical', 'items', 'overdue'].includes(params.locationSort || '') ? params.locationSort as CareQueueLocationSort : 'tree'
  const [allItems, substrateRecipeVersions, locations] = await Promise.all([
    getCareQueue(prisma, {
      collectionId: context.collection.id,
      collectionSlug: context.collection.slug,
      userId: context.user?.id,
      includeCompleted: filter === 'completed',
      timezone,
    }),
    prisma.substrateRecipeVersion.findMany({
      where: { collectionId: context.collection.id, status: { in: ['ACTIVE', 'HISTORICAL'] }, recipe: { archivedAt: null } },
      include: { recipe: true },
      orderBy: [{ recipe: { name: 'asc' } }, { versionNumber: 'desc' }],
    }),
    prisma.location.findMany({
      where: { collectionId: context.collection.id, status: 'ACTIVE' },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])
  const substrateVersions = substrateRecipeVersions.map((version) => ({ id: version.id, label: `${version.recipe.name} v${version.versionNumber}` }))
  const summary = careQueueSummary(allItems, new Date(), timezone)
  const careTypeItems = filterCareQueue(allItems, filter, new Date(), timezone)
  const filteredItems = search
    ? careTypeItems.filter((item) => `${item.plantId || ''} ${item.plantName || ''} ${item.title} ${item.reason} ${item.locationPath || ''}`.toLowerCase().includes(search.toLowerCase()))
    : careTypeItems
  const locationFilters = careQueueLocationFilters(filteredItems, locations, grouping)
  const selectedLocation = locationFilters.some((location) => location.id === params.location) ? params.location! : ''
  const selectedLocationIds = selectedLocation ? new Set([selectedLocation, ...descendantLocationIds(selectedLocation, locations)]) : null
  const items = selectedLocationIds ? filteredItems.filter((item) => item.locationId && selectedLocationIds.has(item.locationId)) : filteredItems
  const sections = careQueueLocationSections(items, locations, grouping, locationSort)
  const locationCount = new Set(filteredItems.map((item) => item.locationId).filter(Boolean)).size
  const query = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams({ filter, grouping, locationSort })
    if (search) next.set('q', search)
    if (selectedLocation) next.set('location', selectedLocation)
    for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key)
    return `${collectionPath(context.collection.slug, '/care')}?${next.toString()}`
  }
  const back = query({})
  const workflowTemplates = canAct
    ? await prisma.workflowTemplate.findMany({
        where: {
          collectionId: context.collection.id,
          isArchived: false,
          OR: [
            { name: { contains: 'Round' } },
            { name: { contains: 'Pest' } },
            { name: { contains: 'Propagation' } },
            { name: { contains: 'Bloom' } },
          ],
        },
        orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
      })
    : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Care Queue</h2>
          <p className="text-sm text-stone-600">What needs attention today, and why.</p>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <Link
            href={collectionPath(context.collection.slug, '/care/bulk')}
            className="rounded-md border border-[#c7d8bd] bg-white/70 px-3 py-2 text-sm font-semibold text-[#2f6b45] shadow-sm hover:bg-[#f5fbf0]"
          >
            Bulk care by location
          </Link>
          {canAct && (
            <Link
              href={collectionPath(context.collection.slug, '/care/sync')}
              className="rounded-md border border-[#c7d8bd] bg-white/70 px-3 py-2 text-sm font-semibold text-[#2f6b45] shadow-sm hover:bg-[#f5fbf0]"
            >
              Sync care schedules
            </Link>
          )}
          <Link
            href={collectionPath(context.collection.slug, '/care/checklist')}
            className="rounded-md border border-[#c7d8bd] bg-white/70 px-3 py-2 text-sm font-semibold text-[#2f6b45] shadow-sm hover:bg-[#f5fbf0]"
          >
            Weekly checklist
          </Link>
          <div className="grid grid-cols-4 gap-2 text-center text-xs sm:flex">
            <div className="rounded-lg border border-stone-200 bg-white/60 px-3 py-2"><b className="block text-base">{summary.today}</b> due today</div>
            <div className="rounded-lg border border-stone-200 bg-white/60 px-3 py-2"><b className="block text-base">{summary.overdue}</b> overdue</div>
            <div className="rounded-lg border border-stone-200 bg-white/60 px-3 py-2"><b className="block text-base">{summary.health}</b> attention</div>
            <div className="rounded-lg border border-stone-200 bg-white/60 px-3 py-2"><b className="block text-base">{summary.propagation}</b> props</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={query({ filter: value, location: undefined })}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${filter === value ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f]' : 'border-stone-200 bg-white/60 text-stone-700'}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter care by location">
          <Link href={query({ location: undefined })} className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${!selectedLocation ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f]' : 'border-stone-200 bg-white/60 text-stone-700'}`}>All locations ({filteredItems.length})</Link>
          {locationFilters.map((location) => (
            <Link key={location.id} title={location.path} href={query({ location: location.id })} className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${selectedLocation === location.id ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f]' : 'border-stone-200 bg-white/60 text-stone-700'}`}>
              {location.label} ({location.count})
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
          <p className="text-stone-600"><strong>{locationCount}</strong> location{locationCount === 1 ? '' : 's'} with visible care</p>
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="filter" value={filter} />
            {selectedLocation && <input type="hidden" name="location" value={selectedLocation} />}
            <label className="grid gap-1 text-xs font-semibold">Search<input name="q" defaultValue={search} placeholder="Plant, task, or Location" className="w-44 rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1.5 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-semibold">Grouping<select name="grouping" defaultValue={grouping} className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1.5 text-sm font-normal"><option value="parent">Parent grouped</option><option value="flat">Flat paths</option><option value="hierarchy">Full hierarchy</option></select></label>
            <label className="grid gap-1 text-xs font-semibold">Location order<select name="locationSort" defaultValue={locationSort} className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1.5 text-sm font-normal"><option value="tree">Tree order</option><option value="alphabetical">Alphabetical</option><option value="items">Most items due</option><option value="overdue">Most overdue</option></select></label>
            <Button className="px-3 py-1.5">Apply view</Button>
          </form>
        </div>
      </div>

      {canAct && workflowTemplates.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl font-semibold">Start a workflow from the queue</h3>
              <p className="mt-1 text-sm text-stone-600">Use workflows for repeatable rounds that go beyond one care task.</p>
            </div>
            <form action={startWorkflowRun} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="collectionSlug" value={context.collection.slug} />
              <input type="hidden" name="scopeType" value="COLLECTION" />
              <select name="templateId" className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm">
                {workflowTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <Button>Start workflow</Button>
            </form>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="py-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[#2f6b45]" />
          <h3 className="font-serif text-2xl font-bold">Nothing pressing here.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600">The queue is clear for this filter. Keep an eye on the leaves, but no task is asking for your hands right now.</p>
        </Card>
      ) : (
        <CareQueueLocationBoard sections={sections} collectionSlug={context.collection.slug} back={back} canAct={canAct} timezone={timezone} substrateVersions={substrateVersions} workflowTemplates={workflowTemplates.map((template) => ({ id: template.id, name: template.name }))} bulkCarePath={collectionPath(context.collection.slug, '/care/bulk')} />
      )}
    </div>
  )
}
