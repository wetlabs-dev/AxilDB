import { ensureRecentServerMetricSnapshot, formatBytes } from '@/lib/server-metrics'
import { sendServerHealthAlertEmails } from '@/lib/email-alerts'
import { prisma } from '@/lib/prisma'
import { recordServerWorkerRun } from '@/lib/server-incidents'

const startedAt = new Date()

async function main() {
  const snapshot = await ensureRecentServerMetricSnapshot()
  const metrics = snapshot.metrics
  const diskPercent = metrics.disk.totalBytes ? ((metrics.disk.usedBytes / metrics.disk.totalBytes) * 100).toFixed(1) : '0.0'
  const memoryUsed = Math.max(0, metrics.memory.systemTotalBytes - metrics.memory.systemFreeBytes)
  const memoryPercent = metrics.memory.systemTotalBytes ? ((memoryUsed / metrics.memory.systemTotalBytes) * 100).toFixed(1) : '0.0'

  console.log(
    `Server metrics ${snapshot.capturedAt.toISOString()} · memory ${memoryPercent}% · disk ${diskPercent}% · uploads ${formatBytes(metrics.disk.uploadBytes)} · database ${formatBytes(metrics.disk.databaseBytes)}`,
  )
  const alertResult = await sendServerHealthAlertEmails(prisma, snapshot)
  await recordServerWorkerRun(prisma, {
    workerName: 'metrics',
    status: 'SUCCEEDED',
    startedAt,
    summary: `Sampled server metrics; health email status ${alertResult.status}.`,
    metadata: { snapshotId: snapshot.id, alertResult },
  })
  console.log(`Server health email status: ${alertResult.status}; sent ${alertResult.sent}; failed ${alertResult.failed}.`)
}

main().catch(async (error) => {
  console.error('Server metric collection failed', error)
  await recordServerWorkerRun(prisma, {
    workerName: 'metrics',
    status: 'FAILED',
    startedAt,
    error: error instanceof Error ? error.message : String(error),
  }).catch((recordError) => {
    console.error('Failed to record metrics worker failure', recordError)
  })
  process.exit(1)
})
