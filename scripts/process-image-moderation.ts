import { PrismaClient } from '@prisma/client'
import { processPendingImageModeration } from '../lib/image-moderation'
import { recordServerWorkerRun } from '../lib/server-incidents'

const prisma = new PrismaClient()
const startedAt = new Date()

async function main() {
  const limit = Math.max(1, Math.min(50, Number(process.env.IMAGE_MODERATION_BATCH_SIZE || 10) || 10))
  const result = await processPendingImageModeration(prisma, limit)
  await recordServerWorkerRun(prisma, {
    workerName: 'image-moderation',
    status: 'SUCCEEDED',
    startedAt,
    summary: `Processed ${result.processed} image moderation checks.`,
    metadata: result,
  })
  console.info(`Processed ${result.processed} image moderation check(s); considered ${result.considered}; skipped=${result.skipped}.`)
}

main()
  .catch(async (error) => {
    console.error(error)
    await recordServerWorkerRun(prisma, {
      workerName: 'image-moderation',
      status: 'FAILED',
      startedAt,
      error: error instanceof Error ? error.message : String(error),
    }).catch((recordError) => {
      console.error('Failed to record image moderation worker failure', recordError)
    })
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
