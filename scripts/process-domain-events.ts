import { prisma } from '../lib/prisma'
import { eventEngineEnabled } from '../lib/events/emit'
import { processDomainEventBatch } from '../lib/events/process'
import { recordServerWorkerRun } from '../lib/server-incidents'

const startedAt = new Date()

async function main() {
  if (!eventEngineEnabled()) return
  try {
    const result = await processDomainEventBatch(prisma)
    await recordServerWorkerRun(prisma, {
      workerName: 'domain-events', status: 'SUCCEEDED', startedAt,
      summary: `Processed ${result.processed} of ${result.claimed} claimed events.`, metadata: result,
    })
    console.log(JSON.stringify(result))
  } catch (error) {
    await recordServerWorkerRun(prisma, {
      workerName: 'domain-events', status: 'FAILED', startedAt,
      summary: 'Domain event processing failed.', error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

main().finally(() => prisma.$disconnect())
