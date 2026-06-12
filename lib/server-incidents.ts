import type { PrismaClient } from '@prisma/client'
import type { ServerMetricSnapshot } from '@/lib/server-metrics'

export const incidentCategories = ['MEMORY', 'DISK', 'WORKER', 'EMAIL', 'AI', 'NETWORK', 'MANUAL'] as const
export const incidentSeverities = ['INFO', 'WARNING', 'CRITICAL'] as const
export const incidentStatuses = ['OPEN', 'RESOLVED'] as const

export type IncidentCategory = (typeof incidentCategories)[number]
export type IncidentSeverity = (typeof incidentSeverities)[number]
export type IncidentStatus = (typeof incidentStatuses)[number]

const SAMPLE_COUNT = 3
const MEMORY_WARNING = 75
const MEMORY_CRITICAL = 90
const DISK_WARNING = 80
const DISK_CRITICAL = 90
const FAILURE_THRESHOLD = 3
const EMAIL_BACKLOG_THRESHOLD = 50

function pct(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : 0
}

function memoryPercent(snapshot: ServerMetricSnapshot) {
  const total = snapshot.metrics.memory.systemTotalBytes
  if (!total) return 0
  return pct(((total - snapshot.metrics.memory.systemFreeBytes) / total) * 100)
}

function diskPercent(snapshot: ServerMetricSnapshot) {
  const total = snapshot.metrics.disk.totalBytes
  if (!total) return 0
  return pct((snapshot.metrics.disk.usedBytes / total) * 100)
}

export function formatIncidentDuration(seconds?: number | null) {
  if (seconds == null) return 'Open'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function incidentLabel(value?: string | null) {
  return (value || '').toLowerCase().replaceAll('_', ' ')
}

function durationSeconds(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
}

async function auditIncident(prisma: PrismaClient, action: string, incidentId: string, summary: string, metadata?: unknown) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType: 'SERVER_INCIDENT',
      entityId: incidentId,
      summary,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    },
  })
}

async function openOrEscalateIncident(
  prisma: PrismaClient,
  input: {
    type: string
    category: IncidentCategory
    severity: IncidentSeverity
    title: string
    description?: string
    detectedAt: Date
    metricType?: string
    thresholdValue?: number
    observedValue?: number
    metadata?: Record<string, unknown>
  },
) {
  const existing = await prisma.serverIncident.findFirst({
    where: { type: input.type, status: 'OPEN' },
    orderBy: { detectedAt: 'desc' },
  })

  if (existing) {
    const severityRank = incidentSeverities.indexOf(input.severity)
    const existingRank = incidentSeverities.indexOf(existing.severity as IncidentSeverity)
    const peakValue = Math.max(Number(existing.peakValue || existing.observedValue || 0), input.observedValue || 0)
    if (severityRank > existingRank || peakValue !== Number(existing.peakValue || existing.observedValue || 0)) {
      await prisma.serverIncident.update({
        where: { id: existing.id },
        data: {
          severity: severityRank > existingRank ? input.severity : existing.severity,
          title: severityRank > existingRank ? input.title : existing.title,
          description: input.description || existing.description,
          thresholdValue: input.thresholdValue ?? existing.thresholdValue,
          observedValue: input.observedValue ?? existing.observedValue,
          peakValue,
          metadata: { ...(existing.metadata as any || {}), ...(input.metadata || {}) } as any,
        },
      })
    }
    return existing.id
  }

  const incident = await prisma.serverIncident.create({
    data: {
      type: input.type,
      category: input.category,
      severity: input.severity,
      status: 'OPEN',
      title: input.title,
      description: input.description,
      detectedAt: input.detectedAt,
      metricType: input.metricType,
      thresholdValue: input.thresholdValue,
      observedValue: input.observedValue,
      peakValue: input.observedValue,
      metadata: (input.metadata || undefined) as any,
    },
  })
  await auditIncident(prisma, 'OPEN', incident.id, `Opened ${incident.title}`, {
    category: incident.category,
    severity: incident.severity,
    observedValue: incident.observedValue,
    thresholdValue: incident.thresholdValue,
  })
  return incident.id
}

async function resolveIncident(prisma: PrismaClient, type: string, resolvedAt: Date, metadata?: Record<string, unknown>) {
  const incident = await prisma.serverIncident.findFirst({
    where: { type, status: 'OPEN' },
    orderBy: { detectedAt: 'desc' },
  })
  if (!incident) return
  await prisma.serverIncident.update({
    where: { id: incident.id },
    data: {
      status: 'RESOLVED',
      resolvedAt,
      durationSeconds: durationSeconds(incident.detectedAt, resolvedAt),
      metadata: { ...(incident.metadata as any || {}), ...(metadata || {}) } as any,
    },
  })
  await auditIncident(prisma, 'RESOLVE', incident.id, `Resolved ${incident.title}`, metadata)
}

async function evaluateMetricIncident(
  prisma: PrismaClient,
  input: {
    type: 'MEMORY_PRESSURE' | 'DISK_PRESSURE'
    category: IncidentCategory
    metricType: 'memory' | 'disk'
    points: Array<{ at: Date; value: number }>
    warning: number
    critical: number
    title: string
    consecutiveOpen?: boolean
  },
) {
  const latest = input.points[input.points.length - 1]
  if (!latest) return
  const recent = input.points.slice(-SAMPLE_COUNT)
  const allCritical = input.consecutiveOpen === false
    ? latest.value > input.critical
    : recent.length >= SAMPLE_COUNT && recent.every((point) => point.value > input.critical)
  const allWarning = input.consecutiveOpen === false
    ? latest.value > input.warning
    : recent.length >= SAMPLE_COUNT && recent.every((point) => point.value > input.warning)
  const allClear = recent.length >= SAMPLE_COUNT && recent.every((point) => point.value <= input.warning)

  if (allCritical || allWarning) {
    const severity = allCritical ? 'CRITICAL' : 'WARNING'
    const threshold = allCritical ? input.critical : input.warning
    await openOrEscalateIncident(prisma, {
      type: input.type,
      category: input.category,
      severity,
      title: `${input.title} ${severity.toLowerCase()}`,
      description: input.consecutiveOpen === false
        ? `${input.title} exceeded ${threshold}%.`
        : `${input.title} exceeded ${threshold}% for ${SAMPLE_COUNT} consecutive samples.`,
      detectedAt: input.consecutiveOpen === false ? latest.at : recent[0].at,
      metricType: input.metricType,
      thresholdValue: threshold,
      observedValue: latest.value,
      metadata: {
        sampleCount: input.consecutiveOpen === false ? 1 : SAMPLE_COUNT,
        recentValues: recent.map((point) => point.value),
        metricSamples: recent.map((point) => ({ at: point.at.toISOString(), value: point.value })),
      },
    })
  } else if (allClear) {
    await resolveIncident(prisma, input.type, latest.at, {
      resolvedAfterClearSamples: SAMPLE_COUNT,
      recentValues: recent.map((point) => point.value),
      resolutionMetricSamples: recent.map((point) => ({ at: point.at.toISOString(), value: point.value })),
    })
  }
}

async function evaluateCountIncident(
  prisma: PrismaClient,
  input: {
    type: string
    category: IncidentCategory
    severity: IncidentSeverity
    title: string
    description: string
    count: number
    threshold: number
    now: Date
    metadata?: Record<string, unknown>
  },
) {
  if (input.count >= input.threshold) {
    await openOrEscalateIncident(prisma, {
      type: input.type,
      category: input.category,
      severity: input.severity,
      title: input.title,
      description: input.description,
      detectedAt: input.now,
      thresholdValue: input.threshold,
      observedValue: input.count,
      metadata: input.metadata,
    })
  } else {
    await resolveIncident(prisma, input.type, input.now, { observedValue: input.count, thresholdValue: input.threshold })
  }
}

export async function evaluateServerIncidents(prisma: PrismaClient, snapshot: ServerMetricSnapshot, now = new Date()) {
  const rows = await prisma.serverMetricSnapshot.findMany({
    orderBy: { capturedAt: 'desc' },
    take: 12,
  })
  const snapshots = rows
    .filter((row) => row.metrics && typeof row.metrics === 'object')
    .reverse() as ServerMetricSnapshot[]

  await evaluateMetricIncident(prisma, {
    type: 'MEMORY_PRESSURE',
    category: 'MEMORY',
    metricType: 'memory',
    points: snapshots.map((row) => ({ at: row.capturedAt, value: memoryPercent(row) })),
    warning: MEMORY_WARNING,
    critical: MEMORY_CRITICAL,
    title: 'Memory pressure',
  })

  await evaluateMetricIncident(prisma, {
    type: 'DISK_PRESSURE',
    category: 'DISK',
    metricType: 'disk',
    points: snapshots.map((row) => ({ at: row.capturedAt, value: diskPercent(row) })),
    warning: DISK_WARNING,
    critical: DISK_CRITICAL,
    title: 'Disk pressure',
    consecutiveOpen: false,
  })

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const [recentBackupFailures, recentAiFailures, recentModerationFailures, recentReminderWorkerFailures, recentMetricsWorkerFailures, recentModerationWorkerFailures, latestReminderWorkerRun, latestMetricsWorkerRun, latestModerationWorkerRun, recentEmailFailures, failedIncidentNotifications, reminderBacklog] = await Promise.all([
    prisma.backupRun.count({ where: { status: 'FAILED', updatedAt: { gte: dayAgo } } }),
    prisma.aiUsageEvent.count({ where: { success: false, createdAt: { gte: hourAgo } } }),
    prisma.photo.count({ where: { moderationStatus: 'MODERATION_FAILED', createdAt: { gte: dayAgo } } }),
    prisma.serverWorkerRun.count({ where: { workerName: 'reminders', status: 'FAILED', startedAt: { gte: dayAgo } } }),
    prisma.serverWorkerRun.count({ where: { workerName: 'metrics', status: 'FAILED', startedAt: { gte: dayAgo } } }),
    prisma.serverWorkerRun.count({ where: { workerName: 'image-moderation', status: 'FAILED', startedAt: { gte: dayAgo } } }),
    prisma.serverWorkerRun.findFirst({ where: { workerName: 'reminders' }, orderBy: { startedAt: 'desc' } }),
    prisma.serverWorkerRun.findFirst({ where: { workerName: 'metrics' }, orderBy: { startedAt: 'desc' } }),
    prisma.serverWorkerRun.findFirst({ where: { workerName: 'image-moderation' }, orderBy: { startedAt: 'desc' } }),
    prisma.reminderDelivery.count({ where: { status: 'FAILED', createdAt: { gte: hourAgo } } }),
    prisma.serverIncidentNotification.count({ where: { status: 'FAILED', sentAt: { gte: hourAgo } } }),
    prisma.reminder.count({ where: { completedAt: null, pausedAt: null, nextSendAt: { lte: now } } }),
  ])

  await evaluateCountIncident(prisma, {
    type: 'BACKUP_WORKER_FAILURES',
    category: 'WORKER',
    severity: recentBackupFailures >= FAILURE_THRESHOLD ? 'CRITICAL' : 'WARNING',
    title: 'Backup worker failures',
    description: 'Recent backup worker runs failed.',
    count: recentBackupFailures,
    threshold: 1,
    now,
    metadata: { window: '24h' },
  })
  await evaluateCountIncident(prisma, {
    type: 'OPENAI_FAILURES',
    category: 'AI',
    severity: recentAiFailures >= FAILURE_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
    title: 'OpenAI request failures',
    description: 'Recent AxilDB AI requests failed.',
    count: recentAiFailures,
    threshold: FAILURE_THRESHOLD,
    now,
    metadata: { window: '1h' },
  })
  await evaluateCountIncident(prisma, {
    type: 'REMINDER_WORKER_FAILURES',
    category: 'WORKER',
    severity: recentReminderWorkerFailures >= FAILURE_THRESHOLD ? 'CRITICAL' : 'WARNING',
    title: 'Reminder worker failures',
    description: 'The reminder worker has failed recently.',
    count: latestReminderWorkerRun?.status === 'FAILED' ? Math.max(1, recentReminderWorkerFailures) : 0,
    threshold: 1,
    now,
    metadata: { window: '24h' },
  })
  await evaluateCountIncident(prisma, {
    type: 'METRICS_WORKER_FAILURES',
    category: 'WORKER',
    severity: recentMetricsWorkerFailures >= FAILURE_THRESHOLD ? 'CRITICAL' : 'WARNING',
    title: 'Metrics worker failures',
    description: 'The metrics worker has failed recently.',
    count: latestMetricsWorkerRun?.status === 'FAILED' ? Math.max(1, recentMetricsWorkerFailures) : 0,
    threshold: 1,
    now,
    metadata: { window: '24h' },
  })
  await evaluateCountIncident(prisma, {
    type: 'IMAGE_MODERATION_WORKER_FAILURES',
    category: 'WORKER',
    severity: recentModerationWorkerFailures >= FAILURE_THRESHOLD ? 'CRITICAL' : 'WARNING',
    title: 'Image moderation worker failures',
    description: 'The image moderation worker has failed recently.',
    count: latestModerationWorkerRun?.status === 'FAILED' ? Math.max(1, recentModerationWorkerFailures) : 0,
    threshold: 1,
    now,
    metadata: { window: '24h' },
  })
  await evaluateCountIncident(prisma, {
    type: 'IMAGE_MODERATION_FAILURES',
    category: 'AI',
    severity: recentModerationFailures >= FAILURE_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
    title: 'Image moderation failures',
    description: 'Recent image moderation checks failed repeatedly.',
    count: recentModerationFailures,
    threshold: FAILURE_THRESHOLD,
    now,
    metadata: { window: '24h' },
  })
  await evaluateCountIncident(prisma, {
    type: 'SMTP_FAILURES',
    category: 'EMAIL',
    severity: recentEmailFailures + failedIncidentNotifications >= FAILURE_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
    title: 'SMTP delivery failures',
    description: 'Email delivery failures exceeded the incident threshold.',
    count: recentEmailFailures + failedIncidentNotifications,
    threshold: FAILURE_THRESHOLD,
    now,
    metadata: { window: '1h', reminderDeliveryFailures: recentEmailFailures, serverHealthNotificationFailures: failedIncidentNotifications },
  })
  await evaluateCountIncident(prisma, {
    type: 'EMAIL_DELIVERY_BACKLOG',
    category: 'EMAIL',
    severity: reminderBacklog >= EMAIL_BACKLOG_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
    title: 'Email delivery backlog',
    description: 'Due reminders waiting for delivery exceeded the backlog threshold.',
    count: reminderBacklog,
    threshold: EMAIL_BACKLOG_THRESHOLD,
    now,
    metadata: { source: 'due reminders' },
  })

  return prisma.serverIncident.findMany({
    where: { status: 'OPEN' },
    orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
  })
}

export async function incidentSummary(prisma: PrismaClient) {
  const [open, critical, warning, lastResolved] = await Promise.all([
    prisma.serverIncident.count({ where: { status: 'OPEN' } }),
    prisma.serverIncident.count({ where: { status: 'OPEN', severity: 'CRITICAL' } }),
    prisma.serverIncident.count({ where: { status: 'OPEN', severity: 'WARNING' } }),
    prisma.serverIncident.findFirst({ where: { status: 'RESOLVED' }, orderBy: { resolvedAt: 'desc' } }),
  ])
  return { open, critical, warning, lastResolved }
}

export async function recordServerWorkerRun(
  prisma: PrismaClient,
  input: {
    workerName: string
    status: 'SUCCEEDED' | 'FAILED'
    startedAt: Date
    finishedAt?: Date
    summary?: string
    error?: string
    metadata?: Record<string, unknown>
  },
) {
  const finishedAt = input.finishedAt || new Date()
  return prisma.serverWorkerRun.create({
    data: {
      workerName: input.workerName,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
      summary: input.summary,
      error: input.error,
      metadata: (input.metadata || undefined) as any,
    },
  })
}
