import { Prisma, type DomainEvent, type PrismaClient } from '@prisma/client'
import { consumersForEvent } from './consumers'

export type EventWorkerConfig = {
  batchSize: number
  maxAttempts: number
  staleMinutes: number
}

export function eventWorkerConfig(): EventWorkerConfig {
  const bounded = (value: string | undefined, fallback: number, min: number, max: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback
  }
  return {
    batchSize: bounded(process.env.EVENT_WORKER_BATCH_SIZE, 50, 1, 500),
    maxAttempts: bounded(process.env.EVENT_WORKER_MAX_ATTEMPTS, 8, 1, 25),
    staleMinutes: bounded(process.env.EVENT_WORKER_STALE_MINUTES, 15, 1, 240),
  }
}

export function retryDelayMs(attempt: number) {
  return Math.min(60 * 60_000, 5_000 * (2 ** Math.max(0, attempt - 1)))
}

export async function recoverStaleEventClaims(prisma: PrismaClient, staleMinutes: number) {
  const before = new Date(Date.now() - staleMinutes * 60_000)
  return prisma.domainEvent.updateMany({
    where: { processingStatus: 'PROCESSING', updatedAt: { lt: before } },
    data: { processingStatus: 'PENDING', nextAttemptAt: new Date(), lastProcessingError: 'Recovered stale processing claim.' },
  })
}

async function claimEvents(prisma: PrismaClient, batchSize: number) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "DomainEvent"
      WHERE "processingStatus" IN ('PENDING', 'FAILED')
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
      ORDER BY "occurredAt" ASC, "recordedAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `)
    if (!rows.length) return []
    const ids = rows.map((row) => row.id)
    await tx.domainEvent.updateMany({
      where: { id: { in: ids }, processingStatus: { in: ['PENDING', 'FAILED'] } },
      data: { processingStatus: 'PROCESSING', processingAttempts: { increment: 1 }, nextAttemptAt: null },
    })
    return tx.domainEvent.findMany({ where: { id: { in: ids } }, orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }] })
  })
}

async function processEvent(prisma: PrismaClient, event: DomainEvent, maxAttempts: number) {
  const attempt = event.processingAttempts
  const history = await prisma.domainEventProcessingAttempt.create({
    data: { eventId: event.id, attempt, status: 'PROCESSING' },
  })
  try {
    const consumers = consumersForEvent(event.eventType)
    for (const consumer of consumers) await consumer.handler(event)
    await prisma.$transaction([
      prisma.domainEventProcessingAttempt.update({ where: { id: history.id }, data: { status: 'PROCESSED', finishedAt: new Date(), metadataJson: { consumers: consumers.map((consumer) => `${consumer.name}@${consumer.version}`) } } }),
      prisma.domainEvent.update({ where: { id: event.id }, data: { processingStatus: 'PROCESSED', processedAt: new Date(), lastProcessingError: null, nextAttemptAt: null } }),
    ])
    return 'PROCESSED'
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000)
    const dead = attempt >= maxAttempts
    await prisma.$transaction([
      prisma.domainEventProcessingAttempt.update({ where: { id: history.id }, data: { status: dead ? 'DEAD_LETTER' : 'FAILED', error: message, finishedAt: new Date() } }),
      prisma.domainEvent.update({ where: { id: event.id }, data: { processingStatus: dead ? 'DEAD_LETTER' : 'FAILED', lastProcessingError: message, nextAttemptAt: dead ? null : new Date(Date.now() + retryDelayMs(attempt)) } }),
    ])
    return dead ? 'DEAD_LETTER' : 'FAILED'
  }
}

export async function processDomainEventBatch(prisma: PrismaClient, config = eventWorkerConfig()) {
  const recovered = await recoverStaleEventClaims(prisma, config.staleMinutes)
  const events = await claimEvents(prisma, config.batchSize)
  const counts = { claimed: events.length, processed: 0, failed: 0, deadLettered: 0, staleRecovered: recovered.count }
  for (const event of events) {
    const result = await processEvent(prisma, event, config.maxAttempts)
    if (result === 'PROCESSED') counts.processed += 1
    else if (result === 'FAILED') counts.failed += 1
    else counts.deadLettered += 1
  }
  return counts
}
