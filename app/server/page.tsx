import Link from 'next/link'
import { approveAiAccessRequest, approveCollectionRequest, rejectAiAccessRequest, rejectCollectionRequest } from '@/app/collection-actions'
import { requestSitewideBackup } from '@/app/server-actions'
import { MetricChart } from '@/components/MetricChart'
import { Button, Card, LinkButton, TextArea } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureRecentServerMetricSnapshot, formatBytes, serverMetricHistory } from '@/lib/server-metrics'
import { formatDateTime } from '@/lib/time'

function formatDuration(start?: Date | null, end?: Date | null) {
  if (!start || !end) return '—'
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function statusClass(status: string) {
  if (status === 'SUCCEEDED') return 'border-green-200 bg-green-50 text-green-900'
  if (status === 'FAILED') return 'border-red-200 bg-red-50 text-red-900'
  if (status === 'RUNNING') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

function featureLabel(feature: string) {
  if (feature === 'AI_DESCRIPTION') return 'Description drafts'
  if (feature === 'AI_MAGIC_FILL') return 'Definition Magic Fill'
  if (feature === 'AI_HUSBANDRY_FILL') return 'Husbandry Magic Fill'
  if (feature === 'AI_GREEN_THUMB') return 'Green Thumb assist'
  if (feature === 'AI_COLLECTION_BRIEFING') return 'Collection Briefing'
  return feature.replace(/^AI_/, '').toLowerCase().replaceAll('_', ' ')
}

export default async function ServerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ backup?: string; collectionRequest?: string; aiAccess?: string }>
}) {
  const admin = await requireServerAdmin()
  const sp = await searchParams
  const [preferences, users, collections, archived, memberships, photos, latestSnapshot, backupRuns, collectionRequests, aiAccessRequests, aiUsageByCollection, aiUsageByFeature] = await Promise.all([
    prisma.emailPreference.findUnique({ where: { userId: admin.id } }),
    prisma.user.count(),
    prisma.collection.count({ where: { status: 'ACTIVE' } }),
    prisma.collection.count({ where: { status: 'ARCHIVED' } }),
    prisma.collectionMembership.count({ where: { status: 'ACTIVE' } }),
    prisma.photo.count(),
    ensureRecentServerMetricSnapshot(),
    prisma.backupRun.findMany({
      orderBy: { requestedAt: 'desc' },
      take: 10,
      include: { requestedBy: { select: { email: true } } },
    }),
    prisma.collectionRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 8,
      include: { requestedBy: { select: { email: true } } },
    }),
    prisma.aiAccessRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 8,
      include: {
        collection: { select: { id: true, name: true, slug: true, aiFeaturesEnabled: true } },
        requestedBy: { select: { email: true } },
      },
    }),
    prisma.aiUsageEvent.groupBy({
      by: ['collectionId'],
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      orderBy: { _count: { collectionId: 'desc' } },
      take: 12,
    }),
    prisma.aiUsageEvent.groupBy({
      by: ['collectionId', 'feature'],
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
  ])
  const timezone = preferences?.timezone
  const aiUsageCollections = aiUsageByCollection.length
    ? await prisma.collection.findMany({
        where: { id: { in: aiUsageByCollection.map((row) => row.collectionId) } },
        select: { id: true, name: true, slug: true, aiFeaturesEnabled: true },
      })
    : []
  const aiUsageCollectionMap = new Map(aiUsageCollections.map((collection) => [collection.id, collection]))
  const aiFeatureRows = new Map<string, typeof aiUsageByFeature>()
  for (const row of aiUsageByFeature) {
    const existing = aiFeatureRows.get(row.collectionId) || []
    existing.push(row)
    aiFeatureRows.set(row.collectionId, existing)
  }
  const metricHistory = await serverMetricHistory()
  const latest = latestSnapshot.metrics
  const diskUsedPercent = latest.disk.totalBytes ? (latest.disk.usedBytes / latest.disk.totalBytes) * 100 : 0
  const memoryUsedBytes = Math.max(0, latest.memory.systemTotalBytes - latest.memory.systemFreeBytes)
  const memoryUsedPercent = latest.memory.systemTotalBytes ? (memoryUsedBytes / latest.memory.systemTotalBytes) * 100 : 0
  const previous = metricHistory.length > 1 ? metricHistory[metricHistory.length - 2] : null
  const elapsedSeconds = previous ? Math.max(1, (latestSnapshot.capturedAt.getTime() - previous.capturedAt.getTime()) / 1000) : 1
  const rxRate = previous ? Math.max(0, latest.network.rxBytes - previous.metrics.network.rxBytes) / elapsedSeconds : 0
  const txRate = previous ? Math.max(0, latest.network.txBytes - previous.metrics.network.txBytes) / elapsedSeconds : 0
  const storageSegments = [
    ['Uploaded photos', latest.disk.uploadBytes, 'bg-[#8fa58f]'],
    ['Database', latest.disk.databaseBytes, 'bg-[#c47a5a]'],
    ['Code/app image', latest.disk.codeBytes, 'bg-[#6d7f6d]'],
    ['Other server usage', latest.disk.otherBytes, 'bg-stone-400'],
  ] as const

  const checks = [
    ['Server admin account', await prisma.user.count({ where: { email: 'admin@axildb.com', role: 'SERVER_ADMIN' } }) > 0],
    ['Default collection', await prisma.collection.count({ where: { isDefault: true } }) === 1],
    ['Legacy site roles cleared', await prisma.user.count({ where: { role: { in: ['ADMIN', 'LOGGER', 'VIEWER'] } } }) === 0],
    ['Legacy collection roles cleared', await prisma.collectionMembership.count({ where: { role: { in: ['OWNER', 'ADMIN'] } } }) === 0],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Server Management</h2>
          <p className="mt-1 text-sm text-stone-600">Global AxilDB administration, collection lifecycle, health, and backup status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/server/collections">Collections</LinkButton>
          <LinkButton href="/server/users">Users</LinkButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Users', users],
          ['Active collections', collections],
          ['Archived collections', archived],
          ['Active memberships', memberships],
          ['Photos', photos],
        ].map(([label, value]) => (
          <Card key={label} className="min-h-28">
            <p className="text-sm text-stone-600">{label}</p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Pending collection requests</h3>
            <p className="mt-1 text-sm text-stone-600">Review registered users asking for their own AxilDB collection.</p>
          </div>
          {collectionRequests.length > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">{collectionRequests.length} pending</span>}
        </div>
        {sp.collectionRequest === 'approved' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Collection request approved and collection created.</p>}
        {sp.collectionRequest === 'rejected' && <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">Collection request rejected.</p>}
        <div className="mt-4 grid gap-3">
          {collectionRequests.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No pending collection requests.</p>}
          {collectionRequests.map((request) => (
            <div key={request.id} className="rounded-lg border border-stone-200 bg-white/50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-serif text-lg font-semibold">{request.requestedName}</h4>
                  <p className="text-sm text-stone-600">/{request.requestedSlug} · {request.visibility.toLowerCase()} · requested by {request.requestedBy.email}</p>
                  {request.description && <p className="mt-2 text-sm text-stone-700">{request.description}</p>}
                  {request.rationale && <p className="mt-2 text-sm text-stone-600">Reason: {request.rationale}</p>}
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                <form action={approveCollectionRequest} className="grid gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <TextArea label="Approval note" name="reviewNote" className="min-h-16" />
                  <Button className="w-fit">Approve and create collection</Button>
                </form>
                <form action={rejectCollectionRequest} className="grid gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <TextArea label="Rejection note" name="reviewNote" className="min-h-16" />
                  <Button className="w-fit bg-[#9a3f35] hover:bg-[#7d3028]">Reject request</Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Pending AI access requests</h3>
            <p className="mt-1 text-sm text-stone-600">Review collection managers asking to enable metered AI drafting tools.</p>
          </div>
          {aiAccessRequests.length > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">{aiAccessRequests.length} pending</span>}
        </div>
        {sp.aiAccess === 'approved' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">AI access approved and enabled for the collection.</p>}
        {sp.aiAccess === 'rejected' && <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">AI access request rejected.</p>}
        <div className="mt-4 grid gap-3">
          {aiAccessRequests.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No pending AI access requests.</p>}
          {aiAccessRequests.map((request) => (
            <div key={request.id} className="rounded-lg border border-stone-200 bg-white/50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-serif text-lg font-semibold">{request.collection.name}</h4>
                  <p className="text-sm text-stone-600">
                    /{request.collection.slug} · AI currently {request.collection.aiFeaturesEnabled ? 'enabled' : 'disabled'} · requested by {request.requestedBy.email}
                  </p>
                  {request.rationale && <p className="mt-2 text-sm text-stone-700">Reason: {request.rationale}</p>}
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                <form action={approveAiAccessRequest} className="grid gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <TextArea label="Approval note" name="reviewNote" className="min-h-16" />
                  <Button className="w-fit">Approve and enable AI</Button>
                </form>
                <form action={rejectAiAccessRequest} className="grid gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <TextArea label="Rejection note" name="reviewNote" className="min-h-16" />
                  <Button className="w-fit bg-[#9a3f35] hover:bg-[#7d3028]">Reject request</Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">AI usage by collection</h3>
            <p className="mt-1 text-sm text-stone-600">Counts and token estimates are recorded when AxilDB calls the AI endpoints.</p>
          </div>
          <LinkButton href="/server/collections">Toggle AI availability</LinkButton>
        </div>
        <div className="mt-4 grid gap-3">
          {aiUsageByCollection.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No AI usage has been recorded yet.</p>}
          {aiUsageByCollection.map((usage) => {
            const collection = aiUsageCollectionMap.get(usage.collectionId)
            const featureRows = aiFeatureRows.get(usage.collectionId) || []
            return (
              <div key={usage.collectionId} className="rounded-lg border border-stone-200 bg-white/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-lg font-semibold">{collection?.name || 'Deleted collection'}</p>
                    <p className="text-sm text-stone-600">
                      {collection ? `/${collection.slug}` : usage.collectionId} · AI {collection?.aiFeaturesEnabled ? 'enabled' : 'disabled'}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">{usage._count._all} calls</p>
                    <p className="text-stone-600">{(usage._sum.totalTokens || 0).toLocaleString()} total tokens</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                  <span>Input: {(usage._sum.inputTokens || 0).toLocaleString()}</span>
                  <span>Output: {(usage._sum.outputTokens || 0).toLocaleString()}</span>
                  <span>Total: {(usage._sum.totalTokens || 0).toLocaleString()}</span>
                </div>
                {featureRows.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {featureRows.map((feature) => (
                      <span key={`${feature.collectionId}-${feature.feature}`} className="rounded-full border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700">
                        {featureLabel(feature.feature)}: {feature._count._all} calls
                        {feature._sum.totalTokens ? `, ${feature._sum.totalTokens.toLocaleString()} tokens` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Health checks</h3>
        <div className="mt-4 grid gap-2">
          {checks.map(([label, ok]) => (
            <div key={String(label)} className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white/50 px-3 py-2 text-sm">
              <span>{label}</span>
              <span className={ok ? 'font-semibold text-[#2f6b45]' : 'font-semibold text-[#9a3f35]'}>{ok ? 'OK' : 'Needs attention'}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-600">For full database relationship checks, run <code>npm run check:collection-integrity</code> inside the Docker app or migrate container.</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Server Metrics</h3>
            <p className="mt-1 text-sm text-stone-600">Prometheus-style snapshots are retained for the last 36 hours. Host-level values are best-effort from inside the app container.</p>
          </div>
          <p className="rounded-full border border-stone-200 bg-white/60 px-3 py-1 text-xs text-stone-600">
            Last sample {formatDateTime(latestSnapshot.capturedAt, timezone)}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <MetricChart
            title="Memory"
            value={`${memoryUsedPercent.toFixed(1)}%`}
            subtitle={`${formatBytes(memoryUsedBytes)} used of ${formatBytes(latest.memory.systemTotalBytes)}`}
            points={metricHistory.map((snapshot) => ({
              at: snapshot.capturedAt,
              value: snapshot.metrics.memory.systemTotalBytes ? ((snapshot.metrics.memory.systemTotalBytes - snapshot.metrics.memory.systemFreeBytes) / snapshot.metrics.memory.systemTotalBytes) * 100 : 0,
            }))}
          />
          <MetricChart
            title="Disk"
            value={`${diskUsedPercent.toFixed(1)}%`}
            subtitle={`${formatBytes(latest.disk.usedBytes)} used of ${formatBytes(latest.disk.totalBytes)}`}
            points={metricHistory.map((snapshot) => ({
              at: snapshot.capturedAt,
              value: snapshot.metrics.disk.totalBytes ? (snapshot.metrics.disk.usedBytes / snapshot.metrics.disk.totalBytes) * 100 : 0,
            }))}
          />
          <MetricChart
            title="Network"
            value={`${formatBytes(rxRate + txRate)}/s`}
            subtitle={`RX ${formatBytes(rxRate)}/s · TX ${formatBytes(txRate)}/s`}
            points={metricHistory.map((snapshot, index) => {
              const prior = metricHistory[index - 1]
              const seconds = prior ? Math.max(1, (snapshot.capturedAt.getTime() - prior.capturedAt.getTime()) / 1000) : 1
              return {
                at: snapshot.capturedAt,
                value: prior ? (Math.max(0, snapshot.metrics.network.rxBytes - prior.metrics.network.rxBytes) + Math.max(0, snapshot.metrics.network.txBytes - prior.metrics.network.txBytes)) / seconds : 0,
              }
            })}
          />
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Storage Breakdown</h3>
        <p className="mt-1 text-sm text-stone-600">
          Estimated categories are compared against total disk usage visible to the uploads mount. Database size is logical PostgreSQL database size.
        </p>
        <div className="mt-4 overflow-hidden rounded-full border border-stone-200 bg-white/60">
          <div className="flex h-5 w-full">
            {storageSegments.map(([label, bytes, color]) => (
              <span
                key={label}
                className={color}
                title={`${label}: ${formatBytes(bytes)}`}
                style={{ width: `${latest.disk.usedBytes ? Math.max(0.75, (bytes / latest.disk.usedBytes) * 100) : 0}%` }}
              />
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {storageSegments.map(([label, bytes, color]) => (
            <div key={label} className="rounded-md border border-stone-200 bg-white/50 p-3">
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${color}`} />
                <p className="text-sm font-semibold">{label}</p>
              </div>
              <p className="mt-2 font-mono text-lg">{formatBytes(bytes)}</p>
              <p className="text-xs text-stone-500">{latest.disk.usedBytes ? ((bytes / latest.disk.usedBytes) * 100).toFixed(1) : '0.0'}% of visible used disk</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Collection Storage Estimates</h3>
        <div className="mt-4 grid gap-2">
          {latest.collections.map((collection) => (
            <div key={collection.id} className="grid gap-2 rounded-md border border-stone-200 bg-white/50 px-3 py-2 text-sm md:grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem]">
              <div className="min-w-0">
                <p className="truncate font-semibold">{collection.name}</p>
                <p className="text-xs text-stone-500">/{collection.slug} · {collection.status.toLowerCase()}</p>
              </div>
              <span>Uploads: {formatBytes(collection.uploadBytes)}</span>
              <span>Records: {collection.recordCount}</span>
              <span>Photos: {collection.photos}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Backups</h3>
        <p className="mt-2 text-sm text-stone-700">
          Sitewide backups include the Postgres database, uploaded images, generated labels, and a manifest. Collection-specific import/export is intentionally separate future work.
        </p>
        {sp.backup === 'requested' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Backup requested. The backup worker should pick it up shortly.</p>}
        {sp.backup === 'already-queued' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A sitewide backup is already requested or running.</p>}
        <form action={requestSitewideBackup} className="mt-4 grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3">
          <label className="text-sm font-semibold" htmlFor="backup-notes">Backup notes</label>
          <input
            id="backup-notes"
            name="notes"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
            placeholder="Optional reason, such as before deployment"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-semibold text-white shadow-sm" type="submit">Request sitewide backup</button>
            <span className="text-xs text-stone-600">Handled by the <code>backups</code> worker service.</span>
          </div>
        </form>
        <div className="mt-5">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Recent backup runs</h4>
          <div className="mt-3 grid gap-2">
            {backupRuns.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No backup requests yet.</p>}
            {backupRuns.map((run) => (
              <div key={run.id} className="grid gap-2 rounded-lg border border-stone-200 bg-white/50 p-3 text-sm lg:grid-cols-[8rem_minmax(10rem,1fr)_10rem_8rem]">
                <div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(run.status)}`}>{run.status.toLowerCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{run.backupPath || 'Path assigned when worker starts'}</p>
                  <p className="text-xs text-stone-500">
                    Requested {formatDateTime(run.requestedAt, timezone)} by {run.requestedBy?.email || 'unknown'}
                  </p>
                  {run.notes && <p className="mt-1 text-xs text-stone-600">{run.notes}</p>}
                  {run.error && <p className="mt-1 text-xs text-red-800">{run.error}</p>}
                </div>
                <div className="text-xs text-stone-600">
                  <p>Started: {formatDateTime(run.startedAt, timezone)}</p>
                  <p>Finished: {formatDateTime(run.finishedAt, timezone)}</p>
                </div>
                <p className="text-xs text-stone-600">Duration: {formatDuration(run.startedAt, run.finishedAt)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Restore strategy</p>
          <p className="mt-1">
            Restore remains command-line only because it is destructive. Use <code>AXILDB_RESTORE_CONFIRM=YES scripts/restore.sh backups/axildb-...</code> from the server after stopping app traffic or during a planned maintenance window.
          </p>
        </div>
      </Card>

      <p className="text-sm text-stone-600">
        <Link href="/collections" className="underline">Back to collection browser</Link>
      </p>
    </div>
  )
}
