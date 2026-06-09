import { PrismaClient } from '@prisma/client'
import { processPendingImageModeration } from '../lib/image-moderation'

const prisma = new PrismaClient()

async function main() {
  const limit = Math.max(1, Math.min(50, Number(process.env.IMAGE_MODERATION_BATCH_SIZE || 10) || 10))
  const result = await processPendingImageModeration(prisma, limit)
  console.info(`Processed ${result.processed} image moderation check(s); considered ${result.considered}; skipped=${result.skipped}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
