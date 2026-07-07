import Link from 'next/link'
import { Bell, Bug, CheckCircle2, Droplets, Flower2, HeartPulse, Sprout } from 'lucide-react'
import {
  completeCareTask,
  conditionStillNeedsAttentionFromCareQueue,
  markPropagationEstablished,
  resolveConditionFromCareQueue,
  snoozeCareTask,
  updateConditionFromCareQueue,
} from '@/app/actions'
import { startWorkflowRun } from '@/app/workflow-actions'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { canCreateInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { careQueueSummary, careTaskLabel, filterCareQueue, getCareQueue, type CareQueueItem } from '@/lib/care-queue'
import { prisma } from '@/lib/prisma'
import { dateInputValue, formatDate } from '@/lib/time'
import { ensureStarterWorkflowTemplates } from '@/lib/workflows'

const filters = [
  ['today', 'Today'],
  ['overdue', 'Overdue'],
  ['water', 'Water'],
  ['propagation', 'Propagation'],
  ['health', 'Health'],
  ['pest', 'Pest'],
  ['bloom', 'Bloom'],
  ['custom', 'Custom'],
  ['completed', 'Completed'],
] as const

const conditionSeverityOptions = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const
const conditionStatusOptions = ['OPEN', 'IMPROVING', 'RESOLVED'] as const

function taskIcon(task: CareQueueItem) {
  const className = 'h-4 w-4'
  if (task.taskType === 'WATER') return <Droplets className={className} />
  if (task.taskType === 'PROPAGATION_CHECK') return <Sprout className={className} />
  if (task.taskType === 'PEST_CHECK') return <Bug className={className} />
  if (task.taskType === 'HEALTH_CHECK') return <HeartPulse className={className} />
  if (task.taskType === 'BLOOM_CHECK') return <Flower2 className={className} />
  return <Bell className={className} />
}

function priorityLabel(priority: number) {
  if (priority >= 180) return 'Urgent'
  if (priority >= 100) return 'High'
  if (priority >= 60) return 'Normal'
  return 'Routine'
}

function dateLabel(date: Date, timezone?: string | null) {
  return formatDate(date, timezone || undefined)
}

function labelize(value?: string | null) {
  return (value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ConditionHiddenFields({ item, collectionSlug, back }: { item: CareQueueItem; collectionSlug: string; back: string }) {
  return (
    <>
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="taskType" value={item.taskType} />
      {item.conditionId && <input type="hidden" name="conditionId" value={item.conditionId} />}
    </>
  )
}

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
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.key} className="grid gap-3 p-0 sm:grid-cols-[8.5rem_1fr]">
              <div className="h-40 min-w-0 overflow-hidden bg-[#d6dfc9]/35 sm:h-full">
                <PlantImage src={item.image} alt={item.plantName || item.title} />
              </div>
              <div className="grid gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                  <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/70 px-2 py-0.5 font-bold uppercase tracking-[0.14em] text-stone-700">
                    {taskIcon(item)} {careTaskLabel(item.taskType)}
                  </span>
                  <span>{dateLabel(item.dueAt, timezone)}</span>
                  <span className={item.priority >= 100 ? 'font-semibold text-[#9a3f35]' : 'font-medium text-stone-600'}>{priorityLabel(item.priority)}</span>
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold leading-tight">
                    {item.plantId && item.plantInstanceId ? (
                      <PlantIdPreviewLink collectionSlug={context.collection.slug} plantId={item.plantId} href={item.href}>
                        {item.plantId}
                      </PlantIdPreviewLink>
                    ) : item.title}
                  </h3>
                  <p className="text-sm text-stone-700">{item.plantName}</p>
                  {item.location && <p className="text-xs text-stone-500">{item.location}</p>}
                </div>
                <p className="text-sm text-stone-700">{item.reason}</p>
                {item.quietDayReason && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                    {item.quietDayReason}
                  </p>
                )}
                {canAct && !item.completedAt && (
                  <div className="grid gap-2 border-t border-stone-200 pt-3">
                    {item.condition ? (
                      <div className="grid gap-3 rounded-lg border border-[#c7d8bd] bg-[#f5fbf0]/70 p-3">
                        <div className="grid gap-1 text-xs text-stone-700 sm:grid-cols-2">
                          <p><span className="font-semibold">Condition:</span> {labelize(item.condition.category)}</p>
                          <p><span className="font-semibold">Severity:</span> {labelize(item.condition.severity)}</p>
                          <p><span className="font-semibold">Status:</span> {labelize(item.condition.status)}</p>
                          <p><span className="font-semibold">Opened:</span> {dateLabel(item.condition.observedAt, timezone)}</p>
                          <p><span className="font-semibold">Updated:</span> {dateLabel(item.condition.updatedAt, timezone)}</p>
                          <p><span className="font-semibold">Follow-up:</span> {item.condition.followUpAt ? dateLabel(item.condition.followUpAt, timezone) : 'No date set'}</p>
                        </div>

                        <details className="rounded-md border border-stone-200 bg-white/75 p-3" open>
                          <summary className="cursor-pointer text-sm font-semibold text-stone-800">Condition actions</summary>
                          <div className="mt-3 grid gap-3">
                            <form action={resolveConditionFromCareQueue} className="grid gap-2">
                              <ConditionHiddenFields item={item} collectionSlug={context.collection.slug} back={back} />
                              <TextArea label="Resolution note" name="resolutionNote" className="min-h-14" />
                              <Button className="w-full bg-[#2f6b45] hover:bg-[#28593b]">Resolve condition</Button>
                            </form>

                            <form action={updateConditionFromCareQueue} className="grid gap-2 border-t border-stone-200 pt-3">
                              <ConditionHiddenFields item={item} collectionSlug={context.collection.slug} back={back} />
                              <div className="grid gap-2 sm:grid-cols-3">
                                <Select label="Severity" name="severity" defaultValue={item.condition.severity}>
                                  {conditionSeverityOptions.map((severity) => (
                                    <option key={severity} value={severity}>{labelize(severity)}</option>
                                  ))}
                                </Select>
                                <Select label="Status" name="status" defaultValue={item.condition.status}>
                                  {conditionStatusOptions.map((status) => (
                                    <option key={status} value={status}>{labelize(status)}</option>
                                  ))}
                                </Select>
                                <Field
                                  label="Follow-up date"
                                  name="followUpAt"
                                  type="date"
                                  defaultValue={item.condition.followUpAt ? dateInputValue(item.condition.followUpAt, timezone || undefined) : ''}
                                />
                              </div>
                              <TextArea label="Update note" name="updateNote" className="min-h-14" />
                              <button className="rounded-md border border-[#c7d8bd] bg-white px-3 py-2 text-sm font-semibold text-[#2f6b45] shadow-sm hover:bg-[#f5fbf0]">Update condition</button>
                            </form>

                            <form action={conditionStillNeedsAttentionFromCareQueue} className="grid gap-2 border-t border-stone-200 pt-3">
                              <ConditionHiddenFields item={item} collectionSlug={context.collection.slug} back={back} />
                              <Field
                                label="Next follow-up"
                                name="followUpAt"
                                type="date"
                                help="Leave blank to keep this item active in the queue."
                                defaultValue={item.condition.followUpAt ? dateInputValue(item.condition.followUpAt, timezone || undefined) : ''}
                              />
                              <TextArea label="Attention note" name="attentionNote" className="min-h-14" />
                              <button className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100">Still needs attention</button>
                            </form>
                          </div>
                        </details>
                      </div>
                    ) : (
                      <>
                        <form action={completeCareTask} className="grid gap-2">
                          <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                          <input type="hidden" name="back" value={back} />
                          <input type="hidden" name="taskType" value={item.taskType} />
                          {item.plantInstanceId && <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />}
                          {item.reminderId && <input type="hidden" name="reminderId" value={item.reminderId} />}
                          {item.bloomEventId && <input type="hidden" name="bloomEventId" value={item.bloomEventId} />}
                          {item.source === 'derived' && <TextArea label="Quick note" name="notes" className="min-h-14" />}
                          <Button className="w-full">Complete</Button>
                        </form>
                        {item.plantInstanceId && item.source === 'derived' && (
                          <div className="flex flex-wrap gap-2">
                            {[1, 3, 7].map((days) => (
                              <form key={days} action={snoozeCareTask}>
                                <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                                <input type="hidden" name="back" value={back} />
                                <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />
                                <input type="hidden" name="taskType" value={item.taskType} />
                                <input type="hidden" name="days" value={days} />
                                <button className="rounded-md border border-stone-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-stone-700">Snooze {days}d</button>
                              </form>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {item.taskType === 'PROPAGATION_CHECK' && item.plantInstanceId && (item.propagationAgeDays || 0) >= 14 && (
                      <form action={markPropagationEstablished}>
                        <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />
                        <Button className="w-full bg-[#4f7f55] hover:bg-[#426d48]">Mark established</Button>
                      </form>
                    )}
                  </div>
                )}
                <Link href={item.href} className="text-sm font-medium text-[#2f6b45] underline">View record</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
