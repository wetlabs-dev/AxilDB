import { isCuratorJsonModeRequestFailure, isCuratorResponseFailure } from '@/lib/ai-curator-response'
import type { PrismaClient } from '@prisma/client'

export function isCuratorHistoryConflict(message: string | null | undefined) {
  return Boolean(
    message &&
    /unique constraint|P2002/i.test(message) &&
    (/AiCuratorJob_active_scope_key/.test(message) ||
      [
        'collectionId',
        'jobType',
        'phase',
        'plantDefinitionId',
        'targetEntityType',
        'targetEntityId',
        'targetField',
        'status',
      ].every((field) => message.includes(field)))
  )
}
export function curatorFailureDescription(message: string | null | undefined) {
  if (isCuratorJsonModeRequestFailure(message)) return 'The AI provider rejected an invalid JSON-mode request before research started. This is an application request-format issue. After upgrading, use Retry response-error jobs.'
  if (isCuratorHistoryConflict(message))
    return 'A legacy database index blocked this job from finishing. This is an application issue, not missing botanical evidence. Install the Curator repair, then retry database-blocked jobs.'
  if (
    isCuratorResponseFailure(message) &&
    !message?.startsWith(
      'AI Curator response reached the configured output limit'
    )
  )
    return 'The AI response was incomplete or could not be read as valid JSON. This is a response-format problem, not missing botanical evidence. After upgrading, use Retry response-error jobs.'
  return message
}

export async function retryCuratorJob(
  db: PrismaClient,
  id: string,
  databaseOnly = false
) {
  return db.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<
      Array<{ acquired: boolean }>
    >`SELECT pg_try_advisory_xact_lock(186104, 2) AS acquired`
    if (!lock.acquired) return 'WORKER_BUSY'
    const job = await tx.aiCuratorJob.findUnique({
      where: { id },
      include: {
        suggestion: true,
        _count: { select: { cadenceProposals: true } },
      },
    })
    if (!job || !['WAITING_FOR_HUMAN', 'DEFERRED'].includes(job.status))
      return 'UNCHANGED'
    const limit = job.blockingReason?.match(
      /configured output limit \((\d+) tokens\)/
    )
    if (limit) {
      const settings = await tx.aiCuratorSettings.findUnique({
        where: { id: 'global' },
        select: { maxTokens: true },
      })
      if (!settings || settings.maxTokens <= Number(limit[1]))
        return 'OUTPUT_LIMIT_UNCHANGED'
    }
    if (databaseOnly && !isCuratorHistoryConflict(job.blockingReason))
      return 'UNCHANGED'
    if (isCuratorHistoryConflict(job.blockingReason)) {
      const [index] = await tx.$queryRaw<
        Array<{ ready: boolean }>
      >`SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND tablename='AiCuratorJob'
        AND indexname='AiCuratorJob_active_scope_key' AND indexdef LIKE '%WHERE%'
        AND indexdef NOT LIKE '%SKIPPED%' AND indexdef NOT LIKE '%COMPLETED%') AS ready`
      const indexes = await tx.$queryRaw<
        Array<{ indexdef: string }>
      >`SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename='AiCuratorJob'`
      const legacy = indexes.some(
        ({ indexdef }) =>
          indexdef.startsWith('CREATE UNIQUE INDEX') &&
          !indexdef.includes(' WHERE ') &&
          [
            'collectionId',
            'jobType',
            'phase',
            'plantDefinitionId',
            'targetEntityType',
            'targetEntityId',
            'targetField',
            'status',
          ].every((field) => indexdef.includes(field))
      )
      if (!index?.ready || legacy)
        throw new Error(
          'Deploy the Curator database repair before retrying these jobs.'
        )
    }
    const conflict = await tx.aiCuratorJob.findFirst({
      where: {
        id: { not: id },
        collectionId: job.collectionId,
        jobType: job.jobType,
        phase: job.phase,
        plantDefinitionId: job.plantDefinitionId,
        targetEntityType: job.targetEntityType,
        targetEntityId: job.targetEntityId,
        targetField: job.targetField,
        status: { in: ['QUEUED', 'RUNNING', 'DEFERRED', 'WAITING_FOR_HUMAN'] },
      },
    })
    if (conflict) return 'ACTIVE_WORK_EXISTS'
    if (job.suggestion || job._count.cadenceProposals > 0) {
      await tx.aiCuratorJob.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          claimedAt: null,
          claimedBy: null,
          nextRetryAt: null,
          blockingReason: null,
          humanActionRequired: null,
          retryConditions: null,
          ...(job.suggestion
            ? {
                confidence: job.suggestion.confidence,
                actualCostDollars: job.suggestion.actualCostDollars,
              }
            : {}),
          resultSummary:
            'Recovered the existing Curator results; no new AI request was made.',
        },
      })
      return 'RECOVERED'
    }
    await tx.aiCuratorJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        attempts: 0,
        claimedAt: null,
        claimedBy: null,
        completedAt: null,
        nextRetryAt: null,
        blockingReason: null,
        humanActionRequired: null,
        retryConditions: null,
        resultSummary: 'Explicitly retried by a server administrator.',
      },
    })
    return 'QUEUED'
  })
}
export async function retryDatabaseBlockedCuratorJobs(db: PrismaClient) {
  const rows = await db.aiCuratorJob.findMany({
    where: {
      status: { in: ['WAITING_FOR_HUMAN', 'DEFERRED'] },
      OR: [
        {
          blockingReason: {
            contains: 'Unique constraint',
            mode: 'insensitive',
          },
        },
        { blockingReason: { contains: 'P2002' } },
      ],
    },
    take: 200,
    orderBy: { createdAt: 'asc' },
    select: { id: true, blockingReason: true },
  })
  const results: Record<string, number> = {}
  for (const row of rows.filter((row) =>
    isCuratorHistoryConflict(row.blockingReason)
  )) {
    let result: string
    try {
      result = await retryCuratorJob(db, row.id, true)
    } catch {
      result = 'FAILED'
    }
    results[result] = (results[result] || 0) + 1
  }
  return results
}

export async function retryResponseBlockedCuratorJobs(db: PrismaClient) {
  const rows = await db.aiCuratorJob.findMany({
    where: {
      status: { in: ['WAITING_FOR_HUMAN', 'DEFERRED'] },
      OR: [
        { blockingReason: { contains: 'JSON', mode: 'insensitive' } },
        {
          blockingReason: {
            contains: 'AI Curator response',
            mode: 'insensitive',
          },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, blockingReason: true },
  })
  const results: Record<string, number> = {}
  for (const row of rows.filter((row) =>
    isCuratorResponseFailure(row.blockingReason)
  )) {
    let result: string
    try {
      result = await retryCuratorJob(db, row.id)
    } catch {
      result = 'FAILED'
    }
    results[result] = (results[result] || 0) + 1
  }
  return results
}
