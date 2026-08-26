import type { PrismaClient } from '@prisma/client'

export type BackgroundServiceName = 'reminders' | 'metrics' | 'image-moderation' | 'backups' | 'ai-curator'

export type BackgroundServiceHealth = {
  name: BackgroundServiceName
  label: string
  enabled: boolean
  cadence: string
  concurrency: number
  lastRunAt: Date | null
  lastRunStatus: string
  currentTask: string
  queueStats: Record<string, number>
  recentErrors: string[]
  runtimeMetrics: Record<string, unknown>
}

const labels: Record<BackgroundServiceName, string> = {
  reminders: 'Reminders',
  metrics: 'Metrics',
  'image-moderation': 'Image Moderation',
  backups: 'Backups',
  'ai-curator': 'AI Curator',
}

export async function backgroundServiceHealth(
  prisma: PrismaClient,
  input: {
    name: BackgroundServiceName
    enabled?: boolean
    cadence?: string
    concurrency?: number
    currentTask?: string
    queueStats?: Record<string, number>
    runtimeMetrics?: Record<string, unknown>
  },
): Promise<BackgroundServiceHealth> {
  const [latest, recentFailures] = await Promise.all([
    prisma.serverWorkerRun.findFirst({ where: { workerName: input.name }, orderBy: { startedAt: 'desc' } }),
    prisma.serverWorkerRun.findMany({
      where: { workerName: input.name, status: 'FAILED' },
      orderBy: { startedAt: 'desc' },
      take: 3,
      select: { error: true, summary: true },
    }),
  ])

  return {
    name: input.name,
    label: labels[input.name],
    enabled: input.enabled ?? true,
    cadence: input.cadence || 'Manual',
    concurrency: input.concurrency || 1,
    lastRunAt: latest?.startedAt || null,
    lastRunStatus: latest?.status || 'NEVER_RUN',
    currentTask: input.currentTask || (latest?.status === 'RUNNING' ? latest.summary || 'Working' : 'Idle'),
    queueStats: input.queueStats || {},
    recentErrors: recentFailures.map((run) => run.error || run.summary || 'Worker failed.').filter(Boolean),
    runtimeMetrics: input.runtimeMetrics || {},
  }
}
