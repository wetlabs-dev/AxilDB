import { CareQueueProvider } from '@/components/CareQueueOptimistic'
import { CareQueueView } from '@/components/CareQueueView'
import { canCreateInCollection, requireCollectionViewer } from '@/lib/collections'
import { getCareQueue } from '@/lib/care-queue'
import type { CareQueueGroupingMode, CareQueueLocationSort } from '@/lib/care-queue-locations'
import { prisma } from '@/lib/prisma'
import { ensureStarterWorkflowTemplates } from '@/lib/workflows'

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
  const snapshotAt = Date.now()
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

  return <CareQueueProvider collectionSlug={context.collection.slug} userId={context.user?.id || 'public'} initialItems={allItems} snapshotAt={snapshotAt} timezone={timezone}>
    <CareQueueView collectionSlug={context.collection.slug} canAct={canAct} timezone={timezone} filter={filter} search={search} grouping={grouping} locationSort={locationSort} selectedLocationParam={params.location} locations={locations} substrateVersions={substrateVersions} workflowTemplates={workflowTemplates.map(template => ({ id: template.id, name: template.name }))} />
  </CareQueueProvider>
}
