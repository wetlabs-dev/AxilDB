import Link from 'next/link'
import { ignoreDomainEvent, retryDomainEvent } from '@/app/event-actions'
import { Button, Card, Field, Select } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/time'

export default async function ServerEvents({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireServerAdmin()
  const params = await searchParams
  const page = Math.max(1, Number(params.page || 1) || 1)
  const where = params.status ? { processingStatus: params.status } : {}
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [groups, oldest, processedRecent, events, total, recentFailures] = await Promise.all([
    prisma.domainEvent.groupBy({ by: ['processingStatus'], _count: { _all: true } }),
    prisma.domainEvent.findFirst({ where: { processingStatus: { in: ['PENDING', 'FAILED'] } }, orderBy: { recordedAt: 'asc' }, select: { id: true, recordedAt: true } }),
    prisma.domainEvent.count({ where: { processedAt: { gte: since } } }),
    prisma.domainEvent.findMany({ where, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50, select: { id: true, eventType: true, processingStatus: true, processingAttempts: true, recordedAt: true, occurredAt: true, collection: { select: { name: true } }, lastProcessingError: true, ignoredAt: true } }),
    prisma.domainEvent.count({ where }),
    prisma.domainEvent.findMany({ where: { processingStatus: { in: ['FAILED', 'DEAD_LETTER'] } }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, eventType: true, lastProcessingError: true, processingStatus: true } }),
  ])
  const counts = Object.fromEntries(groups.map((group) => [group.processingStatus, group._count._all]))
  return <div className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-3xl font-bold">Event Processing</h2><p className="text-sm text-stone-600">Transactional outbox health, retries, dead letters, and processing history.</p></div><Link className="rounded border px-3 py-2 text-sm font-semibold" href="/server">Server Management</Link></div>
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{['PENDING','PROCESSING','FAILED','DEAD_LETTER'].map((status) => <Card key={status}><p className="text-xs text-stone-500">{status.replaceAll('_',' ')}</p><p className="text-2xl font-bold">{counts[status] || 0}</p></Card>)}<Card><p className="text-xs text-stone-500">Processed 24h</p><p className="text-2xl font-bold">{processedRecent}</p></Card><Card><p className="text-xs text-stone-500">Oldest queued</p><p className="text-sm font-semibold">{oldest ? formatDateTime(oldest.recordedAt) : 'None'}</p></Card></div>
    {recentFailures.length > 0 && <Card><h3 className="font-semibold">Recent failures</h3><div className="mt-3 grid gap-2">{recentFailures.map((event) => <Link key={event.id} href={`/server/events/${event.id}`} className="rounded border p-3 text-sm"><span className="font-semibold">{event.eventType} · {event.processingStatus}</span><p className="mt-1 line-clamp-2 text-xs text-red-800">{event.lastProcessingError}</p></Link>)}</div></Card>}
    <Card><form className="flex items-end gap-3"><Select label="Status" name="status" defaultValue={params.status || ''}><option value="">All statuses</option>{['PENDING','PROCESSING','PROCESSED','FAILED','DEAD_LETTER'].map((status) => <option key={status}>{status}</option>)}</Select><Button>Filter</Button></form></Card>
    <Card className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b bg-stone-50"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Collection</th><th className="px-4 py-3">Recorded</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b"><td className="px-4 py-3"><Link className="font-semibold underline" href={`/server/events/${event.id}`}>{event.eventType}</Link>{event.lastProcessingError && <p className="max-w-sm truncate text-xs text-red-700">{event.lastProcessingError}</p>}</td><td className="px-4 py-3">{event.collection?.name || 'Sitewide'}</td><td className="px-4 py-3">{formatDateTime(event.recordedAt)}</td><td className="px-4 py-3">{event.ignoredAt ? 'IGNORED' : event.processingStatus}</td><td className="px-4 py-3">{event.processingAttempts}</td><td className="px-4 py-3"><div className="flex gap-2">{['FAILED','DEAD_LETTER'].includes(event.processingStatus) && <form action={retryDomainEvent}><input type="hidden" name="eventId" value={event.id}/><Button className="px-2 py-1 text-xs">Retry</Button></form>}{['FAILED','DEAD_LETTER'].includes(event.processingStatus) && <form action={ignoreDomainEvent} className="flex gap-1"><input type="hidden" name="eventId" value={event.id}/><Field aria-label="Ignore reason" name="reason" placeholder="Reason" required/><Button className="px-2 py-1 text-xs">Ignore</Button></form>}</div></td></tr>)}</tbody></table></div></Card>
    <div className="flex justify-between text-sm"><span>{total} events</span><div className="flex gap-2">{page > 1 && <Link href={`?status=${params.status || ''}&page=${page-1}`}>Previous</Link>}{page * 50 < total && <Link href={`?status=${params.status || ''}&page=${page+1}`}>Next</Link>}</div></div>
  </div>
}
