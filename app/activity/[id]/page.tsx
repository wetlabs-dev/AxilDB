import Link from 'next/link'
import { correctDomainEvent } from '@/app/event-actions'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { allowedEventVisibilities } from '@/lib/events/visibility'
import { prisma } from '@/lib/prisma'
import { collectionRoleAtLeast } from '@/lib/roles'
import { formatDateTime } from '@/lib/time'

export default async function CollectionEventDetail({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCollectionViewer()
  const { id } = await params
  const event = await prisma.domainEvent.findFirstOrThrow({
    where: { id, collectionId: context.collection.id, visibility: { in: allowedEventVisibilities({ siteRole: context.user?.role, collectionRole: context.membership?.role, publicCollection: context.collection.visibility === 'PUBLIC' }) } },
    include: { actor: { select: { email: true } }, supersededByEvent: { select: { id: true, eventType: true } }, processingHistory: { orderBy: { startedAt: 'desc' }, take: 20 } },
  })
  const canCorrect = Boolean(context.user && collectionRoleAtLeast(context.membership?.role, 'MANAGER'))
  return <div className="space-y-5"><div className="flex justify-between gap-3"><div><h2 className="text-3xl font-bold">{event.eventType}</h2><p className="text-sm text-stone-600">Version {event.eventVersion} · {formatDateTime(event.occurredAt)}</p></div><Link className="rounded border px-3 py-2 text-sm font-semibold" href={collectionPath(context.collection.slug, '/activity')}>Collection Activity</Link></div>
    <Card><dl className="grid gap-3 text-sm md:grid-cols-2"><div><dt className="text-stone-500">Aggregate</dt><dd className="font-mono">{event.aggregateType}:{event.aggregateId}</dd></div><div><dt className="text-stone-500">Source / visibility</dt><dd>{event.source} · {event.visibility}</dd></div><div><dt className="text-stone-500">Actor</dt><dd>{event.actor?.email || 'System'}</dd></div><div><dt className="text-stone-500">Correlation</dt><dd className="font-mono">{event.correlationId || '—'}</dd></div></dl>{event.reconstructed && <p className="mt-3 text-sm font-semibold text-amber-800">Reconstructed historical event</p>}{event.source === 'MANUAL' && <p className="mt-3 text-sm font-semibold text-indigo-800">Manual historical entry</p>}{event.redactedAt ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">Payload redacted. The immutable envelope and redaction history remain.</p> : <><h3 className="mt-5 font-semibold">Summary</h3><pre className="mt-2 overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-100">{JSON.stringify(event.summaryJson, null, 2)}</pre><details className="mt-3"><summary className="cursor-pointer font-semibold">Structured payload</summary><pre className="mt-2 overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-100">{JSON.stringify(event.payloadJson, null, 2)}</pre></details></>}{event.supersededByEvent && <p className="mt-3 text-sm">Superseded by <Link className="underline" href={collectionPath(context.collection.slug, `/activity/${event.supersededByEvent.id}`)}>{event.supersededByEvent.eventType}</Link>.</p>}</Card>
    {canCorrect && !event.redactedAt && <Card><details><summary className="cursor-pointer font-semibold">Add correction</summary><form action={correctDomainEvent} className="mt-4 grid gap-3"><input type="hidden" name="collectionSlug" value={context.collection.slug}/><input type="hidden" name="eventId" value={event.id}/><Field label="Correction title" name="title"/><TextArea label="Reason" name="reason" required/><TextArea label="Corrected display summary" name="correctedSummary" required/><Button className="w-fit">Record correction</Button></form></details></Card>}
  </div>
}
