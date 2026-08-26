import { PrismaClient } from '@prisma/client'
import { processAiCuratorWake } from '../lib/ai-curator'
import { recordServerWorkerRun } from '../lib/server-incidents'

const prisma = new PrismaClient()
const startedAt = new Date()

async function main() {
  const result = await processAiCuratorWake(prisma)
  await recordServerWorkerRun(prisma, {
    workerName: 'ai-curator',
    status: result.status === 'SUCCEEDED' || result.status === 'WAITING' || result.status === 'STOPPED' ? 'SUCCEEDED' : 'FAILED',
    startedAt,
    summary: result.summary,
    metadata: result,
  })
  console.info(`AI Curator wake: ${result.summary}`)
}

main()
  .catch(async (error) => {
    console.error(error)
    await recordServerWorkerRun(prisma, {
      workerName: 'ai-curator',
      status: 'FAILED',
      startedAt,
      error: error instanceof Error ? error.message : String(error),
    }).catch((recordError) => {
      console.error('Failed to record AI Curator worker failure', recordError)
    })
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
