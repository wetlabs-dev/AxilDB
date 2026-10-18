 'use client'
import Link from 'next/link'
import { CalendarDays, CheckCircle2, MapPin } from 'lucide-react'
import { createCareSheet, completeCareTask, markPropagationEstablished, snoozeCareTask } from '@/app/actions'
import { CareActionForm, useCareQueue } from '@/components/CareQueueOptimistic'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, TextArea } from '@/components/ui'
import { collectionPath } from '@/lib/collection-path'
import type { CareQueueItem } from '@/lib/care-queue'
import { husbandrySections as careSheetSectionOptions } from '@/lib/husbandry'
import { dateInputValue, formatDate } from '@/lib/time'
import { careTaskLabel } from '@/lib/care-queue-view'
function dateLabel(date: Date, timezone?: string | null) {
  return formatDate(date, timezone || undefined)
}

function groupByLocation(items: CareQueueItem[]) {
  return items.reduce<Record<string, CareQueueItem[]>>((acc, item) => {
    const location = item.locationPath || 'No location'
    acc[location] ||= []
    acc[location].push(item)
    return acc
  }, {})
}

export function CareQueueChecklist({ collectionSlug, canAct, timezone, rangeEnd }: { collectionSlug: string; canAct: boolean; timezone?: string; rangeEnd: Date }) {
 const context = { collection: { slug: collectionSlug } }
 const { items: queue, authoritativeItems } = useCareQueue()
 const items = queue.filter(item => !item.completedAt && item.dueAt <= rangeEnd)
 const renderItems = authoritativeItems.filter(item => !item.completedAt && item.dueAt <= rangeEnd)
 const visibleKeys = new Set(items.map(item => item.key))
 const grouped = groupByLocation(renderItems)
 const back = collectionPath(collectionSlug, '/care/checklist')
  return (
    <div className="space-y-5" data-care-queue-root>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Weekly Greenhouse Checklist</h2>
          <p className="text-sm text-stone-600">Overdue, due today, and upcoming care grouped by location.</p>
        </div>
        <Link className="text-sm font-medium text-[#2f6b45] underline" href={collectionPath(context.collection.slug, '/care')}>
          Care queue
        </Link>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-stone-700">
          <CalendarDays className="h-4 w-4 text-[#2f6b45]" />
          <span>Planning window: today through {dateLabel(rangeEnd, timezone)}</span>
        </div>
        {canAct && items.length > 0 && (
          <form action={createCareSheet} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
            <input type="hidden" name="mode" value="WEEKLY_CHECKLIST" />
            <input type="hidden" name="title" value={`Weekly checklist ${formatDate(new Date(), timezone)}`} />
            <input type="hidden" name="expiresAt" value={dateInputValue(rangeEnd, timezone || undefined)} />
            {items.map((item) => item.plantInstanceId && (
              <input key={`${item.key}:${item.plantInstanceId}`} type="hidden" name="plantInstanceId" value={item.plantInstanceId} />
            ))}
            {careSheetSectionOptions.slice(0, 6).map((section) => (
              <input key={section.key} type="hidden" name="section" value={section.key} />
            ))}
            {['WATER', 'PROPAGATION_CHECK', 'PEST_CHECK', 'HEALTH_CHECK', 'BLOOM_CHECK', 'REMINDER'].map((taskType) => (
              <input key={taskType} type="hidden" name="taskType" value={taskType} />
            ))}
            <Button className="px-3 py-1.5 text-sm">Save printable checklist</Button>
          </form>
        )}
      </Card>

      {items.length === 0 ? (
        <Card className="py-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[#2f6b45]" />
          <h3 data-care-empty-focus tabIndex={-1} className="font-serif text-2xl font-bold">No weekly tasks queued.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600">Nothing is overdue or due in the next week. A rare quiet moment in the greenhouse.</p>
        </Card>
      ) : null}
      {renderItems.length > 0 && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([location, locationItems]) => (
            <Card key={location} style={{ display: locationItems.some(item => visibleKeys.has(item.key)) ? undefined : 'none' }}>
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#2f6b45]" />
                <h3 className="font-serif text-xl font-bold">{location}</h3>
                <span className="text-sm text-stone-500">{locationItems.filter(item => visibleKeys.has(item.key)).length} task{locationItems.filter(item => visibleKeys.has(item.key)).length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {locationItems.map((item) => (
                  <div key={item.key} data-care-key={item.key} tabIndex={-1} aria-label={item.title} style={{ display: visibleKeys.has(item.key) ? undefined : 'none' }} className="grid min-w-0 grid-cols-[5rem_1fr] gap-3 rounded-xl border border-stone-200 bg-white/60 p-3">
                    <div className="h-20 overflow-hidden rounded-lg bg-[#d6dfc9]/35">
                      <PlantImage src={item.image} alt={item.plantName || item.title} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2f6b45]">{careTaskLabel(item.taskType)} · {dateLabel(item.dueAt, timezone)}</p>
                      <p className="truncate font-serif text-lg font-bold">
                        {item.plantId && item.plantInstanceId ? (
                          <PlantIdPreviewLink collectionSlug={context.collection.slug} plantId={item.plantId} href={item.href}>
                            {item.plantId}
                          </PlantIdPreviewLink>
                        ) : item.title}
                      </p>
                      {item.plantName && <p className="truncate text-sm text-stone-700">{item.plantName}</p>}
                      <p className="mt-1 line-clamp-2 text-xs text-stone-600">{item.reason}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <Link href={item.href} className="inline-flex items-center whitespace-nowrap font-medium leading-5 text-[#2f6b45] underline">View</Link>
                        {canAct && (
                          <CareActionForm actionName="complete" item={item} action={completeCareTask} className="inline-flex">
                            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="taskType" value={item.taskType} />
                            {item.plantInstanceId && <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />}
                            {item.reminderId && <input type="hidden" name="reminderId" value={item.reminderId} />}
                            {item.conditionId && <input type="hidden" name="conditionId" value={item.conditionId} />}
                            {item.bloomEventId && <input type="hidden" name="bloomEventId" value={item.bloomEventId} />}
                            <button className="inline-flex items-center whitespace-nowrap font-medium leading-5 text-[#2f6b45] underline">Complete</button>
                          </CareActionForm>
                        )}
                        {canAct && item.plantInstanceId && item.source === 'derived' && (
                          <CareActionForm actionName="snooze" item={item} action={snoozeCareTask} className="inline-flex">
                            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />
                            <input type="hidden" name="taskType" value={item.taskType} />
                            <input type="hidden" name="days" value="3" />
                            <button className="inline-flex items-center whitespace-nowrap font-medium leading-5 text-stone-600 underline">Snooze 3d</button>
                          </CareActionForm>
                        )}
                        {canAct && item.taskType === 'PROPAGATION_CHECK' && item.plantInstanceId && (item.propagationAgeDays || 0) >= 14 && (
                          <CareActionForm actionName="establish" item={item} action={markPropagationEstablished} className="inline-flex">
                            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />
                            <button className="inline-flex items-center whitespace-nowrap font-medium leading-5 text-[#2f6b45] underline">Mark established</button>
                          </CareActionForm>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {canAct && items.length > 0 && (
        <Card>
          <h3 className="font-bold">Add a checklist note</h3>
          <p className="mt-1 text-sm text-stone-600">Notes entered here are only used when you save a checklist as a care sheet.</p>
          <form action={createCareSheet} className="mt-3 grid gap-2">
            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
            <input type="hidden" name="mode" value="WEEKLY_CHECKLIST" />
            <input type="hidden" name="title" value={`Weekly checklist ${formatDate(new Date(), timezone)}`} />
            <input type="hidden" name="expiresAt" value={dateInputValue(rangeEnd, timezone || undefined)} />
            {items.map((item) => item.plantInstanceId && (
              <input key={`note:${item.key}:${item.plantInstanceId}`} type="hidden" name="plantInstanceId" value={item.plantInstanceId} />
            ))}
            <TextArea label="Checklist instructions" name="customInstructions" />
            <Button>Save checklist with note</Button>
          </form>
        </Card>
      )}
    </div>
  )
}
