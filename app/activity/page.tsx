import Link from 'next/link'
import { addManualHistoricalEvent } from '@/app/event-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { allowedEventVisibilities } from '@/lib/events/visibility'
import { DOMAIN_EVENT_TYPES } from '@/lib/events/event-types'
import { prisma } from '@/lib/prisma'
import { collectionRoleAtLeast } from '@/lib/roles'
import { formatDateTime } from '@/lib/time'

export default async function CollectionActivity({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await requireCollectionViewer()
  const params = await searchParams
  const page = Math.max(1, Number(params.page || 1) || 1)
  const take = 50
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])) as [string, string][])
    query.set('page', String(nextPage))
    return `?${query.toString()}`
  }
  const where: any = {
    collectionId: context.collection.id,
    visibility: { in: allowedEventVisibilities({ siteRole: context.user?.role, collectionRole: context.membership?.role, publicCollection: context.collection.visibility === 'PUBLIC' }) },
  }
  if (params.type && DOMAIN_EVENT_TYPES.includes(params.type as any)) where.eventType = params.type
  if (params.actor) where.actorUserId = params.actor
  if (params.correlation) where.correlationId = params.correlation
  if (params.source) where.source = params.source
  if (params.visibility) where.visibility = params.visibility
  if (params.from || params.to) where.occurredAt = { ...(params.from ? { gte: new Date(`${params.from}T00:00:00`) } : {}), ...(params.to ? { lte: new Date(`${params.to}T23:59:59`) } : {}) }
  if (params.plant) where.OR = [{ aggregateType: 'PlantInstance', aggregateId: params.plant }, { payloadJson: { path: ['plantInstanceId'], equals: params.plant } }]

  const [events, total, plants, actors] = await Promise.all([
    prisma.domainEvent.findMany({ where, select: { id: true, eventType: true, eventVersion: true, occurredAt: true, recordedAt: true, visibility: true, source: true, reconstructed: true, redactedAt: true, supersededByEventId: true, processingStatus: true, correlationId: true, summaryJson: true, actor: { select: { email: true } } }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * take, take }),
    prisma.domainEvent.count({ where }),
    prisma.plantInstance.findMany({ where: { collectionId: context.collection.id }, select: { id: true, plantId: true }, orderBy: { plantId: 'asc' } }),
    prisma.collectionMembership.findMany({ where: { collectionId: context.collection.id, status: 'ACTIVE' }, select: { user: { select: { id: true, email: true } } }, orderBy: { user: { email: 'asc' } } }),
  ])
  const canAdd = Boolean(context.user && collectionRoleAtLeast(context.membership?.role, 'GARDENER'))

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-3xl font-bold">Collection Activity</h2><p className="mt-1 text-sm text-stone-600">Structured, collection-scoped event history. Current domain records remain authoritative.</p></div><Link className="rounded-md border px-3 py-2 text-sm font-semibold" href={collectionPath(context.collection.slug)}>Dashboard</Link></div>
    {canAdd && <Card><details><summary className="cursor-pointer font-semibold">Add manual historical entry</summary><form action={addManualHistoricalEvent} className="mt-4 grid gap-3 md:grid-cols-2"><input type="hidden" name="collectionSlug" value={context.collection.slug}/><Select label="Plant" name="plantInstanceId" required>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.plantId}</option>)}</Select><Field label="Occurred" name="occurredAt" type="datetime-local" required/><Field label="Title" name="title" required/><Field label="Category" name="category" placeholder="Observation, provenance, milestone"/><TextArea label="Description" name="description" wrapperClassName="md:col-span-2"/><Field label="Location or context" name="context"/><Select label="Visibility" name="visibility" defaultValue="COLLECTION_MEMBER"><option value="COLLECTION_MEMBER">Collection members</option><option value="STAFF">Staff</option>{context.collection.visibility === 'PUBLIC' && <option value="PUBLIC">Public</option>}</Select><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dateOnly"/>Date is approximate/date-only</label><Button className="w-fit">Add historical entry</Button></form></details></Card>}
    <Card><form className="grid gap-3 md:grid-cols-4"><Select label="Event type" name="type" defaultValue={params.type || ''}><option value="">All event types</option>{DOMAIN_EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}</Select><Select label="Plant" name="plant" defaultValue={params.plant || ''}><option value="">All plants</option>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.plantId}</option>)}</Select><Select label="Actor" name="actor" defaultValue={params.actor || ''}><option value="">All actors</option>{actors.map(({ user }) => <option key={user.id} value={user.id}>{user.email}</option>)}</Select><Select label="Source" name="source" defaultValue={params.source || ''}><option value="">All sources</option>{['APPLICATION','WORKER','BACKFILL','MANUAL','IMPORT','SYSTEM'].map((source) => <option key={source}>{source}</option>)}</Select><Select label="Visibility" name="visibility" defaultValue={params.visibility || ''}><option value="">All visible levels</option>{['PUBLIC','COLLECTION_MEMBER','STAFF'].map((visibility) => <option key={visibility}>{visibility}</option>)}</Select><Field label="Correlation ID" name="correlation" defaultValue={params.correlation || ''}/><Field label="From" name="from" type="date" defaultValue={params.from || ''}/><Field label="To" name="to" type="date" defaultValue={params.to || ''}/><Button className="self-end">Filter</Button></form></Card>
    <Card className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-stone-50 text-xs uppercase tracking-wide"><tr><th className="px-4 py-3">Occurred</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Summary</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Visibility</th></tr></thead><tbody>{events.map((event) => { const summary = event.summaryJson && typeof event.summaryJson === 'object' && !Array.isArray(event.summaryJson) ? event.summaryJson as Record<string, unknown> : {}; return <tr key={event.id} className="border-b last:border-0"><td className="px-4 py-3">{formatDateTime(event.occurredAt)}</td><td className="px-4 py-3"><Link className="font-semibold text-[var(--ax-primary)] underline" href={collectionPath(context.collection.slug, `/activity/${event.id}`)}>{event.eventType}</Link><p className="text-xs text-stone-500">v{event.eventVersion} · {event.processingStatus.toLowerCase()}</p></td><td className="px-4 py-3"><p className="font-medium">{String(summary.title || '')}</p><p className="text-xs text-stone-600">{event.redactedAt ? 'Redacted' : String(summary.summary || '')}{event.reconstructed ? ' · Reconstructed' : ''}{event.source === 'MANUAL' ? ' · Manual' : ''}</p></td><td className="px-4 py-3">{event.source.toLowerCase()}</td><td className="px-4 py-3">{event.visibility.toLowerCase().replaceAll('_',' ')}</td></tr>})}{events.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-600">No events match these filters.</td></tr>}</tbody></table></div></Card>
    <div className="flex items-center justify-between text-sm"><span>{total} events</span><div className="flex gap-2">{page > 1 && <Link className="rounded border px-3 py-1" href={pageHref(page-1)}>Previous</Link>}{page * take < total && <Link className="rounded border px-3 py-1" href={pageHref(page+1)}>Next</Link>}</div></div>
  </div>
}
