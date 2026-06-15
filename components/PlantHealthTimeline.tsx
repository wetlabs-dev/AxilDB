'use client'

import { PlantImage } from '@/components/PlantImage'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { Card } from '@/components/ui'
import type { PlantTimelineEvent, PlantTimelineMetrics } from '@/lib/timeline/plantTimeline'
import { cn, fmtDate } from '@/lib/utils'
import Link from 'next/link'
import { useState } from 'react'

const colorStyles = {
  green: {
    dot: 'border-[#5f8f5f] bg-[#dcebd0] text-[#245737]',
    accent: 'border-l-[#6f9b63]',
  },
  sage: {
    dot: 'border-[#7a9d96] bg-[#e2eeea] text-[#315c56]',
    accent: 'border-l-[#7a9d96]',
  },
  amber: {
    dot: 'border-[#b79b45] bg-[#fff2c2] text-[#6f541f]',
    accent: 'border-l-[#b79b45]',
  },
  rust: {
    dot: 'border-[#b56b56] bg-[#ffe4dc] text-[#8a3b2f]',
    accent: 'border-l-[#b56b56]',
  },
  mauve: {
    dot: 'border-[#9675b0] bg-[#eadcf4] text-[#63477a]',
    accent: 'border-l-[#9675b0]',
  },
  gray: {
    dot: 'border-[#a6a095] bg-[#efebe2] text-[#575247]',
    accent: 'border-l-[#a6a095]',
  },
} as const

const eventPanelClass = 'border-[color:var(--ax-border)] border-l-4 bg-[var(--ax-surface-solid)] text-[var(--ax-text)] shadow-[0_16px_48px_var(--ax-shadow)]'

function monthKey(date: Date, timezone?: string | null) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: timezone || undefined }).format(date)
}

function daysLabel(days: number | null) {
  if (days === null) return 'No data'
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function eventPosition(event: PlantTimelineEvent, firstDate: Date, span: number) {
  if (span <= 0) return 50
  const percent = ((event.date.getTime() - firstDate.getTime()) / span) * 100
  return Math.max(2, Math.min(98, percent))
}

function visibleEventPositions(events: PlantTimelineEvent[], firstDate?: Date, span = 0) {
  const items = events
    .map((event, index) => ({
      id: event.id,
      order: index,
      position: firstDate ? eventPosition(event, firstDate, span) : 50,
    }))
    .sort((left, right) => left.position - right.position || left.order - right.order)

  if (items.length <= 1) return new Map(items.map((item) => [item.id, item.position]))

  const minGap = Math.min(8, Math.max(3.25, 88 / (items.length + 4)))
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1]
    const current = items[index]
    if (current.position < previous.position + minGap) current.position = previous.position + minGap
  }

  const overflow = items[items.length - 1].position - 98
  if (overflow > 0) items.forEach((item) => { item.position -= overflow })

  const underflow = 2 - items[0].position
  if (underflow > 0) items.forEach((item) => { item.position += underflow })

  return new Map(items.map((item) => [item.id, Math.max(2, Math.min(98, item.position))]))
}

function groupedEvents(events: PlantTimelineEvent[], timezone?: string | null) {
  return events.reduce<Array<{ label: string; events: PlantTimelineEvent[] }>>((groups, event) => {
    const label = monthKey(event.date, timezone)
    const existing = groups.find((group) => group.label === label)
    if (existing) existing.events.push(event)
    else groups.push({ label, events: [event] })
    return groups
  }, [])
}

function panelAlignClass(position: number) {
  if (position < 18) return 'left-0'
  if (position > 82) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}

function insightItems(metrics: PlantTimelineMetrics) {
  return [
    ['Timeline status', metrics.timelineStatus],
    ['Health trend', metrics.healthTrend],
    ['Age in collection', daysLabel(metrics.ageDays)],
    ['Last observation', daysLabel(metrics.daysSinceLastObservation)],
    ['Last watering', daysLabel(metrics.daysSinceLastWatering)],
    ['Last photo', daysLabel(metrics.daysSinceLastPhoto)],
    ['Last bloom', daysLabel(metrics.daysSinceLastBloom)],
    ['Bloom cycles', String(metrics.bloomCycles)],
    ['Propagations produced', String(metrics.propagationsProduced)],
    ['Unresolved issues', String(metrics.unresolvedHealthIssues)],
    ['Watch items', String(metrics.activeWatchItems)],
    ['Longest quiet period', daysLabel(metrics.longestQuietPeriodDays)],
  ] as const
}

function EventDetails({
  event,
  timezone,
  collectionSlug,
}: {
  event: PlantTimelineEvent
  timezone?: string | null
  collectionSlug: string
}) {
  const summary = event.relatedPlantLinks?.length
    ? event.summary.split(new RegExp(`(${event.relatedPlantLinks.map((link) => link.plantId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')).map((part, index) => {
        const link = event.relatedPlantLinks?.find((item) => item.plantId === part)
        return link ? (
          <PlantIdPreviewLink key={`${link.id}-${index}`} collectionSlug={collectionSlug} plantId={link.plantId} href={link.href}>
            {link.plantId}
          </PlantIdPreviewLink>
        ) : part
      })
    : event.summary
  const content = (
    <>
      <div className="flex items-start gap-3">
        {event.thumbnailUrl && (
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[color:var(--ax-border)]">
            <PlantImage src={event.thumbnailUrl} alt="" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-[var(--ax-heading)]">{event.title}</p>
          <p className="text-xs text-[var(--ax-muted)]">{fmtDate(event.date, timezone)} · {event.category}</p>
          <p className="mt-1 text-sm text-[var(--ax-text)]">{summary}</p>
          {(event.status || event.severity) && (
            <p className="mt-1 text-xs text-[var(--ax-muted)]">
              {[event.severity, event.status].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </>
  )

  if (!event.href || event.relatedPlantLinks?.length) return content
  return (
    <Link href={event.href} className="block rounded-md transition hover:bg-[var(--ax-primary-wash)]">
      {content}
    </Link>
  )
}

export function PlantHealthTimeline({
  events,
  metrics,
  timezone,
  collectionSlug,
}: {
  events: PlantTimelineEvent[]
  metrics: PlantTimelineMetrics
  timezone?: string | null
  collectionSlug: string
}) {
  const sorted = [...events].sort((left, right) => left.date.getTime() - right.date.getTime())
  const firstDate = sorted[0]?.date
  const lastDate = sorted[sorted.length - 1]?.date
  const span = firstDate && lastDate ? Math.max(0, lastDate.getTime() - firstDate.getTime()) : 0
  const groups = groupedEvents(sorted, timezone)
  const shownEvents = sorted.slice(-28)
  const displayPositions = visibleEventPositions(shownEvents, firstDate, span)
  const [openEventId, setOpenEventId] = useState<string | null>(null)

  return (
    <Card className="overflow-visible">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl font-semibold">Plant Health Timeline</h3>
          <p className="mt-1 text-sm text-[var(--ax-muted)]">
            A deterministic record of care, observations, blooms, documentation, and lineage activity for this specimen.
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--ax-muted-strong)]">
          {sorted.length} event{sorted.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {insightItems(metrics).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-2">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--ax-muted)]">{label}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--ax-heading)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div className={cn('relative z-20 min-w-[44rem] py-8', openEventId ? 'min-h-[15rem]' : 'min-h-[8rem]')}>
          <div className="absolute left-4 right-4 top-14 h-1 rounded-full bg-[var(--ax-border)]" />
          {firstDate && lastDate && (
            <div className="absolute left-4 right-4 top-20 flex justify-between text-xs font-medium text-[var(--ax-muted)]">
              <span>{fmtDate(firstDate, timezone)}</span>
              <span>{fmtDate(lastDate, timezone)}</span>
            </div>
          )}
          {shownEvents.length === 0 && (
            <p className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 text-sm text-[var(--ax-muted)]">
              No timeline events yet.
            </p>
          )}
          {shownEvents.map((event) => {
            const styles = colorStyles[event.colorVariant]
            const position = displayPositions.get(event.id) ?? (firstDate ? eventPosition(event, firstDate, span) : 50)
            const isOpen = openEventId === event.id
            return (
              <div
                key={event.id}
                className={cn('absolute h-10 w-10', isOpen ? 'z-[90]' : 'z-30')}
                style={{ left: `${position}%`, top: '3.5rem', transform: 'translate(-50%, -50%)' }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenEventId((current) => current === event.id ? null : event.id)}
                  className={cn(
                    'flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border-2 text-lg shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--ax-focus)]',
                    isOpen && 'ring-2 ring-[var(--ax-focus)]',
                    styles.dot,
                  )}
                  title={`${event.title} · ${fmtDate(event.date, timezone)}`}
                >
                  <span aria-hidden="true">{event.icon}</span>
                  <span className="sr-only">{event.title}</span>
                </button>
                {isOpen && (
                  <div
                    className={cn(
                      'absolute top-12 z-[100] w-72 rounded-lg border p-3',
                      panelAlignClass(position),
                      eventPanelClass,
                      styles.accent,
                    )}
                  >
                    <EventDetails event={event} timezone={timezone} collectionSlug={collectionSlug} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <details className="group mt-4 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--ax-heading)] [&::-webkit-details-marker]:hidden">
          <span>Life Story list</span>
          <span className="text-xs text-[var(--ax-muted)]">
            <span className="group-open:hidden">Open</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-5 border-t border-[color:var(--ax-border)] p-4">
          {groups.length === 0 && <p className="text-sm text-[var(--ax-muted)]">No life story entries yet.</p>}
          {groups.map((group) => (
            <section key={group.label}>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ax-muted)]">{group.label}</h4>
              <div className="mt-2 space-y-2">
                {group.events.map((event) => {
                  const styles = colorStyles[event.colorVariant]
                  return (
                    <div key={event.id} className={cn('rounded-lg border p-3', eventPanelClass, styles.accent)}>
                      <EventDetails event={event} timezone={timezone} collectionSlug={collectionSlug} />
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </details>
    </Card>
  )
}
