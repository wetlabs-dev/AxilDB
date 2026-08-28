import Link from 'next/link'
import { approveAiAccessRequest, approveCollectionRequest, rejectAiAccessRequest, rejectCollectionRequest } from '@/app/collection-actions'
import {
  createRestoreRequest,
  deleteOldBackups,
  deleteSelectedBackup,
  generateRestoreCommand,
  requestSitewideBackup,
  updateMaintenanceMode,
  updateRestoreRequest,
  validateRestoreRequest,
} from '@/app/server-actions'
import { AiUsageBreakdown, type AiUsageBreakdownEvent } from '@/components/AiUsageBreakdown'
import { MetricChart } from '@/components/MetricChart'
import { Button, Card, LinkButton, TextArea } from '@/components/ui'
import { backupCleanupPreview, backupDetail, backupRootRelativePath, listBackupFolders, type BackupFolder, type RestoreValidationResult } from '@/lib/admin/restore-management'
import { tokenUsageCostDollars } from '@/lib/ai-pricing'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatIncidentDuration, incidentSummary } from '@/lib/server-incidents'
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

function restoreStatusClass(status: string) {
  if (status === 'COMPLETED_EXTERNALLY') return 'border-green-200 bg-green-50 text-green-900'
  if (status === 'CANCELLED') return 'border-stone-300 bg-stone-100 text-stone-700'
  if (status === 'COMMAND_GENERATED') return 'border-blue-200 bg-blue-50 text-blue-900'
  if (status === 'VALIDATED') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

function readinessClass(readiness?: string | null) {
  if (readiness === 'Ready') return 'border-green-200 bg-green-50 text-green-900'
  if (readiness === 'Ready with warnings') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (readiness === 'Not ready') return 'border-red-200 bg-red-50 text-red-900'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

function validationResult(value: unknown): RestoreValidationResult | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as RestoreValidationResult
  if (!candidate.readiness || !Array.isArray(candidate.passed) || !Array.isArray(candidate.warnings) || !Array.isArray(candidate.failed)) return null
  return candidate
}

function formatManifest(manifest: Record<string, unknown> | null) {
  if (!manifest) return 'No readable manifest.'
  return Object.entries(manifest).map(([key, value]) => `${key}: ${String(value)}`).join('\n')
}

function artifact(folder: BackupFolder, name: string) {
  return folder.artifacts.find((item) => item.name === name)
}

function artifactStatusLabel(folder: BackupFolder, name: string) {
  const item = artifact(folder, name)
  if (!item?.present) return 'missing'
  if (item.sizeBytes === 0) return 'empty'
  return 'present'
}

function artifactStatusClass(status: string) {
  if (status === 'present') return 'border-green-200 bg-green-50 text-green-900'
  if (status === 'missing' || status === 'empty') return 'border-red-200 bg-red-50 text-red-900'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

function manifestGitCommit(folder: BackupFolder | null) {
  const commit = folder?.manifest?.git_commit
  return typeof commit === 'string' && commit.trim() ? commit.trim() : 'unknown'
}

function featureLabel(feature: string) {
  if (feature === 'AI_DESCRIPTION') return 'Description drafts'
  if (feature === 'AI_MAGIC_FILL') return 'Definition Magic Fill'
  if (feature === 'AI_PLANT_IDENTIFICATION') return 'ID My Plant'
  if (feature === 'AI_HUSBANDRY_FILL') return 'Husbandry Magic Fill'
  if (feature === 'AI_GREEN_THUMB') return 'Green Thumb assist'
  if (feature === 'AI_COLLECTION_BRIEFING') return 'Collection Briefing'
  if (feature === 'AI_FERTILIZER_PRODUCT_FILL') return 'Fertilizer product fill'
  if (feature === 'AI_IMAGE_MODERATION') return 'Image moderation'
  if (feature === 'AI_IMAGE_PLANT_CHECK') return 'Image plant check'
  if (feature === 'AI_CURATOR') return 'AI Curator'
  return feature.replace(/^AI_/, '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function markerTooltip(incident: {
  title: string
  severity: string
  detectedAt: Date
  resolvedAt?: Date | null
  durationSeconds?: number | null
  peakValue?: number | null
}, timezone?: string | null) {
  return [
    `${incident.title} (${incident.severity.toLowerCase()})`,
    `Opened: ${formatDateTime(incident.detectedAt, timezone || undefined)}`,
    incident.peakValue != null ? `Peak: ${incident.peakValue.toFixed(1)}%` : null,
    incident.resolvedAt ? `Resolved: ${formatDateTime(incident.resolvedAt, timezone || undefined)}` : 'Resolved: open',
    `Duration: ${formatIncidentDuration(incident.durationSeconds)}`,
  ].filter(Boolean).join('\n')
}

export default async function ServerDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    backup?: string
    collectionRequest?: string
    aiAccess?: string
    maintenance?: string
    restore?: string
    selectedBackup?: string
    cleanupPreview?: string
    cleanupMonths?: string
    deleted?: string
    failed?: string
    bytes?: string
    reason?: string
  }>
}) {
  const admin = await requireServerAdmin()
  const sp = await searchParams
  const [preferences, users, collections, archived, memberships, photos, latestSnapshot, backupRuns, backupFolders, maintenanceMode, restoreRequests, collectionRequests, aiAccessRequests, aiUsageEvents, incidentStats, recentIncidents] = await Promise.all([
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
    listBackupFolders(prisma),
    prisma.maintenanceMode.findFirst({
      orderBy: { updatedAt: 'desc' },
      include: {
        startedBy: { select: { email: true } },
        endedBy: { select: { email: true } },
      },
    }),
    prisma.restoreRequest.findMany({
      orderBy: { requestedAt: 'desc' },
      take: 8,
      include: {
        requestedBy: { select: { email: true } },
        completedBy: { select: { email: true } },
        cancelledBy: { select: { email: true } },
      },
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
    prisma.aiUsageEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { collection: { select: { name: true, slug: true, aiFeaturesEnabled: true } } },
    }),
    incidentSummary(prisma),
    prisma.serverIncident.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 8,
    }),
  ])
  const timezone = preferences?.timezone
  const selectedBackup = sp.selectedBackup ? await backupDetail(prisma, sp.selectedBackup) : backupFolders[0] || null
  const cleanupMonths = Number(sp.cleanupMonths || '6')
  const cleanupPreview = sp.cleanupPreview === '1' ? await backupCleanupPreview(prisma, cleanupMonths) : null
  const backupFoldersByPath = new Map(backupFolders.map((folder) => [folder.relativePath, folder]))
  const backupRunsWithoutFolders = backupRuns.filter((run) => !run.backupPath || !backupFoldersByPath.has(run.backupPath))
  const unifiedBackups = [
    ...backupFolders.map((folder) => ({
      key: folder.relativePath,
      folder,
      run: folder.linkedRun,
      sortAt: folder.linkedRun?.requestedAt || folder.createdAt || new Date(0),
    })),
    ...backupRunsWithoutFolders.map((run) => ({
      key: run.id,
      folder: null,
      run,
      sortAt: run.requestedAt,
    })),
  ].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
  const availableBackupPaths = new Set(backupFolders.map((folder) => folder.relativePath))
  const aiUsageBreakdownEvents: AiUsageBreakdownEvent[] = aiUsageEvents.map((event) => {
    const inputTokens = event.inputTokens || 0
    const outputTokens = event.outputTokens || 0
    const totalTokens = event.totalTokens || inputTokens + outputTokens
    const costInputTokens = inputTokens || (outputTokens ? 0 : totalTokens)
    return {
      id: event.id,
      collectionId: event.collectionId,
      collectionName: event.collection.name,
      collectionSlug: event.collection.slug,
      collectionAiEnabled: event.collection.aiFeaturesEnabled,
      feature: event.feature,
      featureLabel: featureLabel(event.feature),
      model: event.model,
      inputTokens,
      outputTokens,
      totalTokens,
      costDollars: tokenUsageCostDollars({ inputTokens: costInputTokens, outputTokens }, event.model),
      createdAt: event.createdAt.toISOString(),
    }
  })
  const metricHistory = await serverMetricHistory()
  const metricIncidentMarkers = await prisma.serverIncident.findMany({
    where: {
      metricType: { in: ['memory', 'disk', 'network'] },
      detectedAt: { gte: metricHistory[0]?.capturedAt || new Date(Date.now() - 36 * 60 * 60 * 1000) },
    },
    orderBy: { detectedAt: 'asc' },
    take: 50,
  })
  const latest = latestSnapshot.metrics
  const diskUsedPercent = latest.disk.totalBytes ? (latest.disk.usedBytes / latest.disk.totalBytes) * 100 : 0
  const memoryUsedBytes = Math.max(0, latest.memory.systemTotalBytes - latest.memory.systemFreeBytes)
  const memoryUsedPercent = latest.memory.systemTotalBytes ? (memoryUsedBytes / latest.memory.systemTotalBytes) * 100 : 0
  const heapUsedPercent = latest.memory.heapTotalBytes ? (latest.memory.heapUsedBytes / latest.memory.heapTotalBytes) * 100 : 0
  const containerMemoryPercent = latest.memory.containerLimitBytes ? (latest.memory.containerUsedBytes / latest.memory.containerLimitBytes) * 100 : 0
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
  const markersFor = (metricType: string) => metricIncidentMarkers
    .filter((incident) => incident.metricType === metricType)
    .flatMap((incident) => [
      { at: incident.detectedAt, label: incident.title, severity: incident.severity, status: incident.status, tooltip: markerTooltip(incident, timezone) },
      ...(incident.resolvedAt ? [{ at: incident.resolvedAt, label: `${incident.title} resolved`, severity: incident.severity, status: 'RESOLVED', tooltip: markerTooltip(incident, timezone) }] : []),
    ])

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
          <LinkButton href="/server/validated-definitions">Validated Definitions</LinkButton>
          <LinkButton href="/server/incidents">Incident History</LinkButton>
          <LinkButton href="/server/events">Event Processing</LinkButton>
          <LinkButton href="/server/image-moderation">Image Moderation</LinkButton>
          <LinkButton href="/server/ai-curator">AI Curator</LinkButton>
          <LinkButton href="/server/orphaned-images">Orphaned Images</LinkButton>
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
            <h3 className="font-serif text-xl font-semibold">Server Health</h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">Open incidents, recent resolutions, and operational notes stay here after metric snapshots expire.</p>
          </div>
          <LinkButton href="/server/incidents">Open Incident History</LinkButton>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-stone-200 bg-white/60 p-3 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)]">
            <p className="text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">Open incidents</p>
            <p className="mt-1 text-2xl font-bold text-stone-950 dark:text-[color:var(--ax-heading)]">{incidentStats.open}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950 dark:border-[color:var(--ax-danger)]/45 dark:bg-[color:var(--ax-danger-soft)] dark:text-[color:var(--ax-danger-strong)]">
            <p className="text-sm font-semibold">Critical</p>
            <p className="mt-1 text-2xl font-bold">{incidentStats.critical}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-[color:var(--ax-warning)]/45 dark:bg-[color:var(--ax-warning-soft)] dark:text-[color:var(--ax-warning)]">
            <p className="text-sm font-semibold">Warning</p>
            <p className="mt-1 text-2xl font-bold">{incidentStats.warning}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/60 p-3 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)]">
            <p className="text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">Last resolved</p>
            <p className="mt-1 truncate font-semibold text-stone-950 dark:text-[color:var(--ax-heading)]">{incidentStats.lastResolved?.title || 'None recorded'}</p>
          </div>
        </div>
        {recentIncidents.length > 0 && (
          <div className="mt-4 grid gap-2">
            {recentIncidents.slice(0, 4).map((incident) => (
              <Link key={incident.id} href={`/server/incidents/${incident.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white/50 px-3 py-2 text-sm transition hover:bg-white dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)] dark:hover:bg-[color:var(--ax-primary-wash)]">
                <span className="font-semibold text-stone-900 dark:text-[color:var(--ax-heading)]">{incident.title}</span>
                <span className="text-stone-600 dark:text-[color:var(--ax-muted)]">{incident.severity.toLowerCase()} · {incident.status.toLowerCase()} · {formatIncidentDuration(incident.durationSeconds)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

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
            <p className="mt-1 text-sm text-stone-600">Usage is estimated from recorded input/output tokens and current model pricing.</p>
          </div>
          <LinkButton href="/server/collections">Toggle AI availability</LinkButton>
        </div>
        <AiUsageBreakdown events={aiUsageBreakdownEvents} timezone={timezone} now={new Date().toISOString()} />
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
            markers={markersFor('memory')}
          />
          <MetricChart
            title="Disk"
            value={`${diskUsedPercent.toFixed(1)}%`}
            subtitle={`${formatBytes(latest.disk.usedBytes)} used of ${formatBytes(latest.disk.totalBytes)}`}
            points={metricHistory.map((snapshot) => ({
              at: snapshot.capturedAt,
              value: snapshot.metrics.disk.totalBytes ? (snapshot.metrics.disk.usedBytes / snapshot.metrics.disk.totalBytes) * 100 : 0,
            }))}
            markers={markersFor('disk')}
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
            markers={markersFor('network')}
          />
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Memory Diagnostics</h3>
        <p className="mt-1 text-sm text-stone-600">Current Node process memory, peak RSS, external buffers, and container memory when available.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-stone-200 bg-white/50 p-3">
            <p className="text-sm text-stone-600">Node RSS</p>
            <p className="mt-1 font-mono text-lg font-semibold">{formatBytes(latest.memory.rssBytes)}</p>
            <p className="text-xs text-stone-500">Peak {formatBytes(latest.memory.peakRssBytes || 0)}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white/50 p-3">
            <p className="text-sm text-stone-600">V8 heap</p>
            <p className="mt-1 font-mono text-lg font-semibold">{heapUsedPercent.toFixed(1)}%</p>
            <p className="text-xs text-stone-500">{formatBytes(latest.memory.heapUsedBytes)} of {formatBytes(latest.memory.heapTotalBytes)}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white/50 p-3">
            <p className="text-sm text-stone-600">External memory</p>
            <p className="mt-1 font-mono text-lg font-semibold">{formatBytes((latest.memory.externalBytes || 0) + (latest.memory.arrayBuffersBytes || 0))}</p>
            <p className="text-xs text-stone-500">Includes native buffers and ArrayBuffers</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white/50 p-3">
            <p className="text-sm text-stone-600">Container memory</p>
            <p className="mt-1 font-mono text-lg font-semibold">{latest.memory.containerLimitBytes ? `${containerMemoryPercent.toFixed(1)}%` : 'Unavailable'}</p>
            <p className="text-xs text-stone-500">{latest.memory.containerLimitBytes ? `${formatBytes(latest.memory.containerUsedBytes)} of ${formatBytes(latest.memory.containerLimitBytes)}` : `Process uptime ${latest.memory.processUptimeSeconds || 0}s`}</p>
          </div>
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Maintenance Mode</h3>
            <p className="mt-2 text-sm text-stone-700">
              When enabled, public visitors and normal users see a maintenance screen while server admins keep access to manage the window.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${maintenanceMode?.enabled ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-900'}`}>
            {maintenanceMode?.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>
        {sp.maintenance === 'updated' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Maintenance mode updated.</p>}
        <form action={updateMaintenanceMode} className="mt-4 grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3">
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name="enabled" value="false" defaultChecked={!maintenanceMode?.enabled} />
              Disabled
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name="enabled" value="true" defaultChecked={Boolean(maintenanceMode?.enabled)} />
              Enabled
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Message
            <textarea
              name="message"
              defaultValue={maintenanceMode?.message || ''}
              className="min-h-20 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-normal"
              placeholder="Optional maintenance message for visitors"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold sm:max-w-sm">
            Expected return
            <input
              type="datetime-local"
              name="expectedReturnAt"
              defaultValue={maintenanceMode?.expectedReturnAt ? maintenanceMode.expectedReturnAt.toISOString().slice(0, 16) : ''}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Save maintenance mode</Button>
            {maintenanceMode?.startedAt && (
              <span className="text-xs text-stone-600">
                Started {formatDateTime(maintenanceMode.startedAt, timezone)} by {maintenanceMode.startedBy?.email || 'unknown'}
              </span>
            )}
            {maintenanceMode?.endedAt && !maintenanceMode.enabled && (
              <span className="text-xs text-stone-600">
                Last ended {formatDateTime(maintenanceMode.endedAt, timezone)} by {maintenanceMode.endedBy?.email || 'unknown'}
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="font-serif text-xl font-semibold">Backups</h3>
        <p className="mt-2 text-sm text-stone-700">
          Sitewide backups include the Postgres database, uploaded images, generated labels, and a manifest. Collection-specific import/export is intentionally separate future work.
        </p>
        {sp.backup === 'requested' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Backup requested. The backup worker should pick it up shortly.</p>}
        {sp.backup === 'already-queued' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A sitewide backup is already requested or running.</p>}
        {sp.backup === 'deleted' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Backup folder deleted.</p>}
        {sp.backup === 'delete-confirmation-required' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Type the exact backup folder name before deleting.</p>}
        {sp.backup === 'delete-failed' && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">Backup deletion failed{sp.reason ? `: ${sp.reason}` : '.'}</p>}
        {sp.backup === 'invalid-delete' && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">That backup folder is not valid under the configured backup root.</p>}
        {sp.backup === 'cleanup-confirmation-required' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Preview old backups first, then type the confirmation phrase to delete.</p>}
        {sp.backup === 'cleanup-done' && (
          <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            Old-backup cleanup finished: {sp.deleted || '0'} deleted, {sp.failed || '0'} failed, {formatBytes(Number(sp.bytes || 0))} reclaimed.
          </p>
        )}
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
        <div className="mt-6 border-t border-stone-200 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Backup management</h4>
              <p className="mt-1 text-xs text-stone-600">Browsing and cleanup are limited to <code>{backupRootRelativePath()}</code>.</p>
            </div>
            <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs font-semibold text-stone-700">
              {backupFolders.length} folder{backupFolders.length === 1 ? '' : 's'} · {backupRuns.length} recent run{backupRuns.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mt-3 rounded-lg border border-stone-200 bg-white/50 p-3">
            <form className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="cleanupPreview" value="1" />
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                Cleanup dry run
                <span className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal text-stone-700">
                  Delete backups older than
                  <input
                    name="cleanupMonths"
                    type="number"
                    min="1"
                    max="120"
                    defaultValue={Number.isFinite(cleanupMonths) ? cleanupMonths : 6}
                    className="w-20 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
                  />
                  months
                </span>
              </label>
              <Button type="submit" className="px-3 py-1.5">Preview cleanup</Button>
              <p className="text-xs text-stone-600">The first step only previews complete, inactive backup folders. Restore request history is never deleted.</p>
            </form>
            {cleanupPreview && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">
                  Cleanup preview: {cleanupPreview.matched.length} backup{cleanupPreview.matched.length === 1 ? '' : 's'} matched · {formatBytes(cleanupPreview.totalBytes)} reclaimable
                </p>
                <p className="mt-1 text-xs">
                  Cutoff: before {formatDateTime(cleanupPreview.cutoff, timezone)}.
                  {cleanupPreview.oldest && cleanupPreview.newest ? ` Matched range: ${formatDateTime(cleanupPreview.oldest, timezone)} to ${formatDateTime(cleanupPreview.newest, timezone)}.` : ''}
                </p>
                {cleanupPreview.matched.length > 0 ? (
                  <>
                    <ul className="mt-2 max-h-36 overflow-auto rounded border border-amber-200 bg-white/60 p-2 text-xs">
                      {cleanupPreview.matched.map((folder) => (
                        <li key={folder.relativePath} className="flex justify-between gap-3">
                          <span className="font-mono">{folder.relativePath}</span>
                          <span>{formatBytes(folder.sizeBytes)}</span>
                        </li>
                      ))}
                    </ul>
                    <form action={deleteOldBackups} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="months" value={cleanupPreview.months} />
                      <label className="grid gap-1 text-xs font-semibold">
                        Type DELETE OLD BACKUPS to delete these folders
                        <input name="confirmation" className="min-w-64 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-normal" />
                      </label>
                      <button type="submit" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">Delete matched backups</button>
                    </form>
                  </>
                ) : (
                  <p className="mt-2 text-xs">No complete inactive backup folders matched this retention window.</p>
                )}
                {(cleanupPreview.skippedActive.length > 0 || cleanupPreview.skippedIncomplete.length > 0) && (
                  <p className="mt-2 text-xs">
                    Skipped {cleanupPreview.skippedActive.length} active and {cleanupPreview.skippedIncomplete.length} incomplete backup folder{cleanupPreview.skippedActive.length + cleanupPreview.skippedIncomplete.length === 1 ? '' : 's'}.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(14rem,0.9fr)_minmax(18rem,1.1fr)]">
            <div className="grid content-start gap-2">
              {unifiedBackups.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">No backup runs or folders found under the configured backup root.</p>
                  <p className="mt-1">
                    {backupRuns.some((run) => run.backupPath)
                      ? <>Backup run records exist, but the app process cannot read <code>{backupRootRelativePath()}</code>. Mount that backup directory into the app container or set <code>AXILDB_BACKUP_ROOT</code> to the readable backup root.</>
                      : <>Create or process a backup first, then confirm the app can read <code>{backupRootRelativePath()}</code>.</>}
                  </p>
                </div>
              )}
              {unifiedBackups.map(({ key, folder, run }) => folder ? (
                <Link key={key} href={`/server?selectedBackup=${encodeURIComponent(folder.name)}`} className={`rounded-lg border p-3 text-sm transition hover:border-[#8fa58f] hover:bg-white/80 ${selectedBackup?.name === folder.name ? 'border-[#8fa58f] bg-white/80' : 'border-stone-200 bg-white/50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{folder.name}</p>
                      <p className="text-xs text-stone-500">
                        Requested {run?.requestedAt ? formatDateTime(run.requestedAt, timezone) : 'unknown'} by {run?.requestedByEmail || 'unknown'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${readinessClass(folder.quickStatus === 'Complete' ? 'Ready' : folder.quickStatus === 'Incomplete' ? 'Ready with warnings' : folder.quickStatus === 'Invalid' ? 'Not ready' : null)}`}>
                      {folder.quickStatus}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-stone-600">
                    <p>{folder.relativePath}</p>
                    <p>Started {run?.startedAt ? formatDateTime(run.startedAt, timezone) : '—'} · Finished {run?.finishedAt ? formatDateTime(run.finishedAt, timezone) : '—'} · Duration {formatDuration(run?.startedAt, run?.finishedAt)}</p>
                    <p>{formatBytes(folder.sizeBytes)} · manifest {folder.manifestStatus} · git {manifestGitCommit(folder)}</p>
                    <div className="flex flex-wrap gap-1">
                      {['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz'].map((name) => {
                        const status = artifactStatusLabel(folder, name)
                        return <span key={name} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${artifactStatusClass(status)}`}>{name.replace('.tar.gz', '').replace('axildb.dump', 'db')}: {status}</span>
                      })}
                    </div>
                  </div>
                </Link>
              ) : (
                <div key={key} className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{run?.backupPath || 'Path assigned when worker starts'}</p>
                      <p className="text-xs text-stone-500">Requested {run ? formatDateTime(run.requestedAt, timezone) : 'unknown'} by {run?.requestedBy?.email || 'unknown'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass(run?.status || 'UNKNOWN')}`}>{(run?.status || 'unknown').toLowerCase()}</span>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">Started {run?.startedAt ? formatDateTime(run.startedAt, timezone) : '—'} · Finished {run?.finishedAt ? formatDateTime(run.finishedAt, timezone) : '—'} · Duration {formatDuration(run?.startedAt, run?.finishedAt)}</p>
                  <p className="mt-1 text-xs text-amber-800">{run?.status === 'DELETED' ? 'Backup folder has been deleted.' : 'Backup folder is not currently readable by the app.'}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm">
              {selectedBackup ? (
                <div className="grid gap-4">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h5 className="truncate font-semibold">{selectedBackup.name}</h5>
                        <p className="text-xs text-stone-500">{selectedBackup.relativePath}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${readinessClass(selectedBackup.quickStatus === 'Complete' ? 'Ready' : selectedBackup.quickStatus === 'Incomplete' ? 'Ready with warnings' : selectedBackup.quickStatus === 'Invalid' ? 'Not ready' : null)}`}>
                        {selectedBackup.quickStatus}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
                      <p>Linked run: {selectedBackup.linkedRunStatus?.toLowerCase() || 'none'}</p>
                      <p>Requested: {selectedBackup.linkedRun?.requestedAt ? formatDateTime(selectedBackup.linkedRun.requestedAt, timezone) : 'unknown'}</p>
                      <p>Started: {selectedBackup.linkedRun?.startedAt ? formatDateTime(selectedBackup.linkedRun.startedAt, timezone) : '—'}</p>
                      <p>Finished: {selectedBackup.linkedRun?.finishedAt ? formatDateTime(selectedBackup.linkedRun.finishedAt, timezone) : '—'}</p>
                      <p>Duration: {formatDuration(selectedBackup.linkedRun?.startedAt, selectedBackup.linkedRun?.finishedAt)}</p>
                      <p>Requested by: {selectedBackup.linkedRun?.requestedByEmail || 'unknown'}</p>
                      <p>Git commit: <code>{manifestGitCommit(selectedBackup)}</code></p>
                      <p>Manifest: {selectedBackup.manifestStatus}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {selectedBackup.artifacts.map((artifact) => (
                      <div key={artifact.name} className="rounded-md border border-stone-200 bg-[#fffaf0] p-2">
                        <p className="truncate text-xs font-semibold">{artifact.name}</p>
                        <p className="mt-1 text-xs text-stone-600">{artifact.present ? formatBytes(artifact.sizeBytes) : 'Missing'}</p>
                      </div>
                    ))}
                  </div>
                  {selectedBackup.warnings.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                      <p className="font-semibold">Warnings</p>
                      <ul className="mt-1 list-disc pl-5">
                        {selectedBackup.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Manifest</p>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-stone-200 bg-[#fffaf0] p-3 text-xs text-stone-700">{formatManifest(selectedBackup.manifest)}</pre>
                  </div>
                  <form action={createRestoreRequest} className="grid gap-2 rounded-md border border-stone-200 bg-[#fffaf0] p-3">
                    <input type="hidden" name="backupPath" value={selectedBackup.relativePath} />
                    <label className="text-xs font-semibold" htmlFor="restore-notes">Create restore planning request</label>
                    <textarea
                      id="restore-notes"
                      name="notes"
                      className="min-h-16 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
                      placeholder="Optional context for this restore plan"
                    />
                    <Button type="submit">Create restore request</Button>
                  </form>
                  <details className="rounded-md border border-red-200 bg-red-50 p-3 text-red-950">
                    <summary className="cursor-pointer text-sm font-semibold">Delete this backup folder</summary>
                    <div className="mt-3 grid gap-2 text-xs">
                      <p>This removes only the selected folder under <code>{backupRootRelativePath()}</code>. It does not delete restore request history or database contents.</p>
                      <dl className="grid gap-1 rounded border border-red-200 bg-white/70 p-2 sm:grid-cols-2">
                        <div><dt className="font-semibold">Folder</dt><dd className="font-mono">{selectedBackup.name}</dd></div>
                        <div><dt className="font-semibold">Size</dt><dd>{formatBytes(selectedBackup.sizeBytes)}</dd></div>
                        <div><dt className="font-semibold">Manifest</dt><dd>{selectedBackup.manifestStatus}</dd></div>
                        <div><dt className="font-semibold">Linked run</dt><dd>{selectedBackup.linkedRunStatus?.toLowerCase() || 'none'}</dd></div>
                      </dl>
                      <form action={deleteSelectedBackup} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="backupPath" value={selectedBackup.relativePath} />
                        <input type="hidden" name="expectedName" value={selectedBackup.name} />
                        <label className="grid gap-1 font-semibold">
                          Type {selectedBackup.name} to confirm
                          <input name="confirmation" className="min-w-72 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-normal text-stone-900" />
                        </label>
                        <button type="submit" className="rounded-md border border-red-300 bg-red-100 px-3 py-2 text-sm font-semibold text-red-950">Delete backup</button>
                      </form>
                    </div>
                  </details>
                </div>
              ) : (
                <p className="text-sm text-stone-600">Select a backup folder to inspect its manifest, artifacts, warnings, and restore planning options.</p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Restore strategy</p>
          <p className="mt-1">
            Restore remains command-line only because it is destructive. The UI can validate backups and generate the SSH command, but it never executes <code>scripts/restore.sh</code>.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs">
            <li>Announce the maintenance window and enable Maintenance Mode.</li>
            <li>Stop app traffic if needed and confirm a recent backup exists.</li>
            <li>SSH to the server repo root and run the generated restore command.</li>
            <li>Run <code>docker compose up -d --build</code>.</li>
            <li>Run <code>docker compose run --rm migrate npm run check:production</code>.</li>
          </ol>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Restore History</h3>
            <p className="mt-2 text-sm text-stone-700">
              Restore requests are planning records only. Validation and command generation never modify the database or extract backup archives.
            </p>
          </div>
          <span className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs font-semibold text-stone-700">{restoreRequests.length} recent</span>
        </div>
        {sp.restore === 'requested' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Restore request created.</p>}
        {sp.restore === 'validated' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Restore validation completed.</p>}
        {sp.restore === 'command-generated' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Restore command generated and saved.</p>}
        {sp.restore === 'updated' && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Restore request updated.</p>}
        {sp.restore === 'invalid-backup' && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">That backup folder is not valid under the configured backup root.</p>}
        <div className="mt-4 grid gap-3">
          {restoreRequests.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No restore requests yet. Create one from a selected backup folder above.</p>}
          {restoreRequests.map((request) => {
            const validation = validationResult(request.validationJson)
            return (
              <div key={request.id} className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{request.backupName}</p>
                    <p className="text-xs text-stone-500">
                      Requested {formatDateTime(request.requestedAt, timezone)} by {request.requestedBy?.email || 'unknown'} · {request.backupPath}
                    </p>
                    {!availableBackupPaths.has(request.backupPath) && (
                      <p className="mt-1 text-xs font-semibold text-amber-800">Backup folder is missing or has been deleted; restore history is retained.</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${restoreStatusClass(request.status)}`}>{request.status.toLowerCase().replaceAll('_', ' ')}</span>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${readinessClass(validation?.readiness)}`}>{validation?.readiness || 'Not validated'}</span>
                  </div>
                </div>
                {validation && (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <details className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-950">
                      <summary className="cursor-pointer font-semibold">Passed ({validation.passed.length})</summary>
                      <ul className="mt-2 list-disc pl-5">
                        {validation.passed.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </details>
                    <details className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950" open={validation.warnings.length > 0}>
                      <summary className="cursor-pointer font-semibold">Warnings ({validation.warnings.length})</summary>
                      <ul className="mt-2 list-disc pl-5">
                        {validation.warnings.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </details>
                    <details className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-950" open={validation.failed.length > 0}>
                      <summary className="cursor-pointer font-semibold">Failed ({validation.failed.length})</summary>
                      <ul className="mt-2 list-disc pl-5">
                        {validation.failed.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </details>
                  </div>
                )}
                {request.generatedCommand && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Server-side command</p>
                    <pre className="mt-2 overflow-auto rounded-md border border-stone-200 bg-[#fffaf0] p-3 text-xs text-stone-800">{request.generatedCommand}</pre>
                    <p className="mt-1 text-xs text-stone-600">Run this over SSH from the server repo root. AxilDB does not run this command from the browser.</p>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={validateRestoreRequest}>
                    <input type="hidden" name="id" value={request.id} />
                    <Button type="submit" className="px-3 py-1.5">Validate restore</Button>
                  </form>
                  <form action={generateRestoreCommand}>
                    <input type="hidden" name="id" value={request.id} />
                    <Button type="submit" className="px-3 py-1.5">Generate command</Button>
                  </form>
                </div>
                <form action={updateRestoreRequest} className="mt-3 grid gap-2 rounded-md border border-stone-200 bg-[#fffaf0] p-3">
                  <input type="hidden" name="id" value={request.id} />
                  <label className="text-xs font-semibold" htmlFor={`restore-notes-${request.id}`}>Notes</label>
                  <textarea
                    id={`restore-notes-${request.id}`}
                    name="notes"
                    defaultValue={request.notes || ''}
                    className="min-h-16 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
                    placeholder="Document why this restore is planned or how it was completed"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select name="status" defaultValue={request.status} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm">
                      <option value="PLANNED">Planned</option>
                      <option value="VALIDATED">Validated</option>
                      <option value="COMMAND_GENERATED">Command generated</option>
                      <option value="COMPLETED_EXTERNALLY">Completed externally</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                    <Button type="submit" className="px-3 py-1.5">Save request</Button>
                    {request.completedAt && <span className="text-xs text-stone-600">Completed {formatDateTime(request.completedAt, timezone)} by {request.completedBy?.email || 'unknown'}</span>}
                    {request.cancelledAt && <span className="text-xs text-stone-600">Cancelled {formatDateTime(request.cancelledAt, timezone)} by {request.cancelledBy?.email || 'unknown'}</span>}
                  </div>
                </form>
              </div>
            )
          })}
        </div>
      </Card>

      <p className="text-sm text-stone-600">
        <Link href="/collections" className="underline">Back to collection browser</Link>
      </p>
    </div>
  )
}
