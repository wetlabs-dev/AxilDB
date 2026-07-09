import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { startWorkflowRun } from '@/app/workflow-actions'
import { CareQueueItemCard } from '@/components/CareQueueItemCard'
import { Button, Card } from '@/components/ui'
import { canCreateInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { careQueueSummary, filterCareQueue, getCareQueue } from '@/lib/care-queue'
import { prisma } from '@/lib/prisma'
import { ensureStarterWorkflowTemplates } from '@/lib/workflows'

const filters = [
  ['today', 'Today'],
  ['overdue', 'Overdue'],
  ['water', 'Water'],
  ['fertilize', 'Fertilizer'],
  ['propagation', 'Propagation'],
  ['health', 'Health'],
  ['pest', 'Pest'],
  ['bloom', 'Bloom'],
  ['custom', 'Custom'],
  ['completed', 'Completed'],
] as const

export default async function CareQueuePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const params = await searchParams
  const context = await requireCollectionViewer()
  const canAct = canCreateInCollection(context.user, context)
  if (canAct) await ensureStarterWorkflowTemplates(prisma, context.collection.id)
  const preferences = context.user
    ? await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
    : null
  const timezone = preferences?.timezone
  const filter = params.filter || 'today'
  const back = `${collectionPath(context.collection.slug, '/care')}?filter=${encodeURIComponent(filter)}`
  const allItems = await getCareQueue(prisma, {
    collectionId: context.collection.id,
    collectionSlug: context.collection.slug,
    userId: context.user?.id,
    includeCompleted: filter === 'completed',
    timezone,
  })
  const summary = careQueueSummary(allItems, new Date(), timezone)
  const items = filterCareQueue(allItems, filter, new Date(), timezone)
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
            href={`${collectionPath(context.collection.slug, '/care')}?filter=${value}`}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${filter === value ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f]' : 'border-stone-200 bg-white/60 text-stone-700'}`}
          >
            {label}
          </Link>
        ))}
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
        <div className="grid gap-3">
          {items.map((item) => (
            <CareQueueItemCard
              key={item.key}
              item={item}
              collectionSlug={context.collection.slug}
              back={back}
              canAct={canAct}
              timezone={timezone}
            />
          ))}
        </div>
      )}
    </div>
  )
}
