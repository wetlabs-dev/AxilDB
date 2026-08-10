'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Bell, Bug, ChevronDown, Droplets, FlaskConical, Flower2, HeartPulse, Layers3, Sprout } from 'lucide-react'
import {
  completeCareTask,
  conditionStillNeedsAttentionFromCareQueue,
  markPropagationEstablished,
  resolveConditionFromCareQueue,
  snoozeCareTask,
  updateConditionFromCareQueue,
} from '@/app/actions'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import type { CareQueueItem } from '@/lib/care-queue'
import { dateInputValue, formatDate } from '@/lib/time'
import { cn } from '@/lib/utils'

const conditionSeverityOptions = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const
const conditionStatusOptions = ['OPEN', 'IMPROVING', 'RESOLVED'] as const

function taskIcon(task: CareQueueItem) {
  const className = 'h-4 w-4'
  if (task.taskType === 'WATER') return <Droplets className={className} />
  if (task.taskType === 'FERTILIZE') return <FlaskConical className={className} />
  if (task.taskType === 'REPOT') return <Layers3 className={className} />
  if (task.taskType === 'TREATMENT') return <FlaskConical className={className} />
  if (task.taskType === 'PROPAGATION_CHECK') return <Sprout className={className} />
  if (task.taskType === 'PEST_CHECK') return <Bug className={className} />
  if (task.taskType === 'HEALTH_CHECK') return <HeartPulse className={className} />
  if (task.taskType === 'BLOOM_CHECK') return <Flower2 className={className} />
  return <Bell className={className} />
}

function careTaskLabel(type: CareQueueItem['taskType']) {
  if (type === 'WATER') return 'Water'
  if (type === 'FERTILIZE') return 'Fertilize'
  if (type === 'REPOT') return 'Repot'
  if (type === 'TREATMENT') return 'Treatment'
  if (type === 'PROPAGATION_CHECK') return 'Propagation check'
  if (type === 'PEST_CHECK') return 'Pest check'
  if (type === 'HEALTH_CHECK') return 'Health check'
  if (type === 'BLOOM_CHECK') return 'Bloom check'
  if (type === 'QUARANTINE_REVIEW') return 'Quarantine review'
  return 'Reminder'
}

function priorityLabel(priority: number) {
  if (priority >= 180) return 'Urgent'
  if (priority >= 100) return 'High'
  if (priority >= 60) return 'Normal'
  return 'Routine'
}

function dateLabel(date: Date | string, timezone?: string | null) {
  return formatDate(date, timezone || undefined)
}

function labelize(value?: string | null) {
  return (value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function compactConditionSummary(item: CareQueueItem, timezone?: string | null) {
  if (!item.condition) return item.reason
  return [
    `${labelize(item.condition.status)} ${item.condition.severity.toLowerCase()} ${item.condition.category.replaceAll('_', ' ').toLowerCase()} condition`,
    `updated ${dateLabel(item.condition.updatedAt, timezone)}`,
    item.condition.followUpAt ? `follow-up ${dateLabel(item.condition.followUpAt, timezone)}` : 'follow-up not set',
  ].join(' · ')
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

function CompleteCareHiddenFields({ item, collectionSlug, back }: { item: CareQueueItem; collectionSlug: string; back: string }) {
  return (
    <>
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="taskType" value={item.taskType} />
      {item.plantInstanceId && <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />}
      {item.reminderId && <input type="hidden" name="reminderId" value={item.reminderId} />}
      {item.bloomEventId && <input type="hidden" name="bloomEventId" value={item.bloomEventId} />}
      {item.fertilizerRecipeId && <input type="hidden" name="fertilizerRecipeId" value={item.fertilizerRecipeId} />}
    </>
  )
}

function MetaRow({ item, timezone }: { item: CareQueueItem; timezone?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
      <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/70 px-2 py-0.5 font-bold uppercase tracking-[0.14em] text-stone-700">
        {taskIcon(item)} {careTaskLabel(item.taskType)}
      </span>
      <span>{dateLabel(item.dueAt, timezone)}</span>
      <span className={item.priority >= 100 ? 'font-semibold text-[#9a3f35]' : 'font-medium text-stone-600'}>{priorityLabel(item.priority)}</span>
    </div>
  )
}

function PlantHeading({ item, collectionSlug }: { item: CareQueueItem; collectionSlug: string }) {
  return (
    <div>
      <h3 className="font-serif text-xl font-bold leading-tight md:text-lg">
        {item.plantId && item.plantInstanceId ? (
          <PlantIdPreviewLink collectionSlug={collectionSlug} plantId={item.plantId} href={item.href}>
            {item.plantId}
          </PlantIdPreviewLink>
        ) : item.title}
      </h3>
      <p className="text-sm text-stone-700">{item.plantName}</p>
      {item.location && <p className="text-xs text-stone-500">{item.location}</p>}
    </div>
  )
}

function QuietDayNotice({ item }: { item: CareQueueItem }) {
  if (!item.quietDayReason) return null
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
      {item.quietDayReason}
    </p>
  )
}

function ConditionActionsPanel({
  item,
  collectionSlug,
  back,
  timezone,
}: {
  item: CareQueueItem
  collectionSlug: string
  back: string
  timezone?: string | null
}) {
  if (!item.condition) return null
  return (
    <div className="grid gap-3 rounded-lg border border-[#c7d8bd] bg-[#f5fbf0]/70 p-3">
      <div className="grid gap-1 text-xs text-stone-700 sm:grid-cols-2 lg:grid-cols-3">
        <p><span className="font-semibold">Condition:</span> {labelize(item.condition.category)}</p>
        <p><span className="font-semibold">Severity:</span> {labelize(item.condition.severity)}</p>
        <p><span className="font-semibold">Status:</span> {labelize(item.condition.status)}</p>
        <p><span className="font-semibold">Opened:</span> {dateLabel(item.condition.observedAt, timezone)}</p>
        <p><span className="font-semibold">Updated:</span> {dateLabel(item.condition.updatedAt, timezone)}</p>
        <p><span className="font-semibold">Follow-up:</span> {item.condition.followUpAt ? dateLabel(item.condition.followUpAt, timezone) : 'No date set'}</p>
      </div>

      <div className="rounded-md border border-stone-200 bg-white/75 p-3">
        <h4 className="text-sm font-semibold text-stone-800">Condition actions</h4>
        {item.plantInstanceId && item.conditionId && <div className="mt-2 flex flex-wrap gap-2"><Link href={`/c/${encodeURIComponent(collectionSlug)}/treatments?plant=${encodeURIComponent(item.plantInstanceId)}&condition=${encodeURIComponent(item.conditionId)}`} className="rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white">Start treatment plan</Link><Link href={`/c/${encodeURIComponent(collectionSlug)}/treatments/apply?plant=${encodeURIComponent(item.plantInstanceId)}&condition=${encodeURIComponent(item.conditionId)}`} className="rounded-md border border-[#8fa58f] bg-white px-3 py-2 text-sm font-semibold text-[#2f6b45]">Apply one-off treatment</Link></div>}
        <div className="mt-3 grid gap-3">
          <form action={resolveConditionFromCareQueue} className="grid gap-2">
            <ConditionHiddenFields item={item} collectionSlug={collectionSlug} back={back} />
            <TextArea label="Resolution note" name="resolutionNote" className="min-h-14" />
            <Button className="w-full bg-[#2f6b45] hover:bg-[#28593b]">Resolve condition</Button>
          </form>

          <form action={updateConditionFromCareQueue} className="grid gap-2 border-t border-stone-200 pt-3">
            <ConditionHiddenFields item={item} collectionSlug={collectionSlug} back={back} />
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
            <ConditionHiddenFields item={item} collectionSlug={collectionSlug} back={back} />
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
      </div>
    </div>
  )
}

function NormalCareDetails({
  item,
  collectionSlug,
  back,
  substrateVersions,
}: {
  item: CareQueueItem
  collectionSlug: string
  back: string
  substrateVersions: Array<{ id: string; label: string }>
}) {
  if (item.source === 'treatment-plan') return (
    <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm text-stone-700">
      <p className="font-semibold text-stone-900">{item.treatmentPlanTitle || 'Treatment plan'}</p>
      {item.treatmentName && <p>Treatment: {item.treatmentName}</p>}
      {item.treatmentProgress && <p>{item.treatmentProgress}</p>}
      {item.treatmentSafetySummary && <p className="font-medium text-amber-900">Safety: {item.treatmentSafetySummary}</p>}
      <Link href={item.href} className="mt-1 inline-flex w-fit rounded-md bg-[#2f6b45] px-3 py-2 font-semibold text-white">Continue plan</Link>
    </div>
  )
  return (
    <>
      <form action={completeCareTask} className="grid gap-2">
        <CompleteCareHiddenFields item={item} collectionSlug={collectionSlug} back={back} />
        {item.taskType === 'FERTILIZE' && (
          <div className="rounded-md border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3 text-sm text-stone-700">
            <p className="font-semibold text-stone-800">{item.fertilizerRecipeName || 'Fertilizer recipe'}</p>
            {item.fertilizerRecipeSummary && <p className="mt-1">{item.fertilizerRecipeSummary}</p>}
            {item.fertilizerSource && <p className="mt-1 text-xs uppercase tracking-[0.12em] text-stone-500">{item.fertilizerSource} schedule</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Field label="Strength" name="fertilizerStrength" defaultValue={item.fertilizerStrength || ''} />
              <Field label="Dose" name="fertilizerDose" placeholder="e.g. 2 ml" />
              <Field label="Water volume" name="fertilizerWaterVolume" placeholder="e.g. 1 L" />
            </div>
          </div>
        )}
        {item.taskType === 'REPOT' && (
          <div className="grid gap-3 rounded-md border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3 text-sm text-stone-700">
            <div className="grid gap-1 sm:grid-cols-2">
              <p><span className="font-semibold text-stone-800">Current:</span> {item.currentSubstrate || 'Unknown substrate'}</p>
              <p><span className="font-semibold text-stone-800">Recommended:</span> {item.recommendedSubstrate || 'No ranked recommendation'}</p>
            </div>
            <Select label="New substrate type" name="substrateMode" defaultValue={item.recommendedSubstrateRecipeVersionId ? 'RECIPE' : 'RECEIVED_SUBSTRATE'}>
              <option value="RECIPE">Substrate recipe</option>
              <option value="RECEIVED_SUBSTRATE">Received Substrate</option>
              <option value="CUSTOM_UNKNOWN">Custom / Unknown Mix</option>
              <option value="NO_SUBSTRATE">No Substrate</option>
              <option value="UNKNOWN">Unknown</option>
            </Select>
            <Select label="Recipe version" name="substrateRecipeVersionId" defaultValue={item.recommendedSubstrateRecipeVersionId || ''}>
              <option value="">Choose a recipe when using Substrate recipe</option>
              {substrateVersions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}
            </Select>
            <TextArea label="Received/custom substrate description" name="receivedSubstrateDescription" className="min-h-14" />
            <Field label="Substrate notes" name="substrateNotes" />
          </div>
        )}
        {item.source === 'derived' && <TextArea label="Quick note" name="notes" className="min-h-14" />}
        <Button className="w-full">Complete</Button>
      </form>
      {item.plantInstanceId && item.source === 'derived' && (
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7].map((days) => (
            <form key={days} action={snoozeCareTask}>
              <input type="hidden" name="collectionSlug" value={collectionSlug} />
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
  )
}

function PropagationEstablishedAction({
  item,
  collectionSlug,
  back,
}: {
  item: CareQueueItem
  collectionSlug: string
  back: string
}) {
  if (item.taskType !== 'PROPAGATION_CHECK' || !item.plantInstanceId || (item.propagationAgeDays || 0) < 14) return null
  return (
    <form action={markPropagationEstablished}>
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="plantInstanceId" value={item.plantInstanceId} />
      <Button className="w-full bg-[#4f7f55] hover:bg-[#426d48]">Mark established</Button>
    </form>
  )
}

function CareQueueItemDetails({
  item,
  collectionSlug,
  back,
  canAct,
  timezone,
  substrateVersions,
}: {
  item: CareQueueItem
  collectionSlug: string
  back: string
  canAct: boolean
  timezone?: string | null
  substrateVersions: Array<{ id: string; label: string }>
}) {
  if (!canAct || item.completedAt) return null
  return (
    <div className="grid gap-2 border-t border-stone-200 pt-3">
      {item.condition ? (
        <ConditionActionsPanel item={item} collectionSlug={collectionSlug} back={back} timezone={timezone} />
      ) : (
        <NormalCareDetails item={item} collectionSlug={collectionSlug} back={back} substrateVersions={substrateVersions} />
      )}
      <PropagationEstablishedAction item={item} collectionSlug={collectionSlug} back={back} />
    </div>
  )
}

function DesktopPrimaryAction({
  item,
  collectionSlug,
  back,
  canAct,
}: {
  item: CareQueueItem
  collectionSlug: string
  back: string
  canAct: boolean
}) {
  if (!canAct || item.completedAt || item.condition || item.taskType === 'REPOT') return null
  if (item.source === 'treatment-plan') return <Link href={item.href} className="rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#28593b]">Continue plan</Link>
  return (
    <form action={completeCareTask}>
      <CompleteCareHiddenFields item={item} collectionSlug={collectionSlug} back={back} />
      <button className="rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#28593b]">
        Complete
      </button>
    </form>
  )
}

export function CareQueueItemCard({
  item,
  collectionSlug,
  back,
  canAct,
  timezone,
  substrateVersions,
}: {
  item: CareQueueItem
  collectionSlug: string
  back: string
  canAct: boolean
  timezone?: string | null
  substrateVersions: Array<{ id: string; label: string }>
}) {
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  const detailsId = `care-item-details-${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const summary = item.condition ? compactConditionSummary(item, timezone) : item.reason

  return (
    <Card className="p-0">
      <div className="grid gap-3 p-0 md:hidden sm:grid-cols-[8.5rem_1fr]">
        <div className="h-40 min-w-0 overflow-hidden bg-[#d6dfc9]/35 sm:h-full">
          <PlantImage src={item.image} alt={item.plantName || item.title} />
        </div>
        <div className="grid gap-2 p-4">
          <MetaRow item={item} timezone={timezone} />
          <PlantHeading item={item} collectionSlug={collectionSlug} />
          <p className="text-sm text-stone-700">{item.reason}</p>
          <QuietDayNotice item={item} />
          <CareQueueItemDetails item={item} collectionSlug={collectionSlug} back={back} canAct={canAct} timezone={timezone} substrateVersions={substrateVersions} />
          <Link href={item.href} className="text-sm font-medium text-[#2f6b45] underline">View record</Link>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="grid gap-4 p-3 md:grid-cols-[5.5rem_1fr_auto] md:items-center">
          <div className="h-20 overflow-hidden rounded-md border border-[#d6dfc9] bg-[#d6dfc9]/35">
            <PlantImage src={item.image} alt={item.plantName || item.title} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <MetaRow item={item} timezone={timezone} />
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <PlantHeading item={item} collectionSlug={collectionSlug} />
            </div>
            <p className="line-clamp-1 text-sm text-stone-700">{summary}</p>
            <QuietDayNotice item={item} />
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row md:flex-col lg:flex-row">
            <DesktopPrimaryAction item={item} collectionSlug={collectionSlug} back={back} canAct={canAct} />
            <button
              type="button"
              aria-expanded={desktopExpanded}
              aria-controls={detailsId}
              onClick={() => setDesktopExpanded((open) => !open)}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[#c7d8bd] bg-white/80 px-3 py-2 text-sm font-semibold text-[#2f6b45] shadow-sm hover:bg-[#f5fbf0]"
            >
              {item.condition ? 'Condition actions' : 'Details'}
              <ChevronDown className={cn('h-4 w-4 transition', desktopExpanded && 'rotate-180')} />
            </button>
          </div>
        </div>
        {desktopExpanded && (
          <div id={detailsId} className="border-t border-stone-200 px-4 pb-4 pt-3">
            <div className="grid gap-2">
              <p className="text-sm text-stone-700">{item.reason}</p>
              <CareQueueItemDetails item={item} collectionSlug={collectionSlug} back={back} canAct={canAct} timezone={timezone} substrateVersions={substrateVersions} />
              <Link href={item.href} className="text-sm font-medium text-[#2f6b45] underline">View record</Link>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
