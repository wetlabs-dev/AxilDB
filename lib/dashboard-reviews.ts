import type { PrismaClient } from '@prisma/client'
import { hasAiCuratorSuggestionChange } from '@/lib/ai-curator'
import { actionableCadenceWhere } from '@/lib/cadence-review'

export type OpenReviewItem = {
  label: string
  count: number | null
  href: string
  description: string
}
export async function researchReviewQueues(
  db: PrismaClient,
  collectionId: string,
  collectionSlug: string,
  authorized: boolean
): Promise<OpenReviewItem[]> {
  if (!authorized) return []
  const results = await Promise.allSettled([
    db.aiCuratorSuggestion
      .findMany({
        where: {
          collectionId,
          status: 'PENDING',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { currentValue: true, suggestedValue: true, targetField: true },
      })
      .then(
        (rows) =>
          rows.filter((p) =>
            hasAiCuratorSuggestionChange(
              p.currentValue,
              p.suggestedValue,
              p.targetField
            )
          ).length
      ),
    db.careCadenceProposal.count({
      where: actionableCadenceWhere(collectionId),
    }),
  ])
  return [
    {
      label: 'AI Curator suggestions',
      description: 'Botanical enrichment waiting for human approval.',
      href: '/server/ai-curator',
    },
    {
      label: 'Care cadence suggestions',
      description: 'AI-researched care schedules and N/A decisions awaiting approval.',
      href: `/server/care-cadence-research?tab=review&collection=${encodeURIComponent(collectionSlug)}`,
    },
  ].map((queue, index) => ({
    ...queue,
    count: results[index].status === 'fulfilled' ? results[index].value : null,
  }))
}
export function summarizeReviewQueues(items: OpenReviewItem[]) {
  const pending = items
    .filter((item) => item.count === null || item.count > 0)
    .sort((a, b) => (b.count ?? -1) - (a.count ?? -1))
  return {
    items: pending,
    count: pending.reduce((sum, item) => sum + (item.count ?? 0), 0),
    queues: pending.filter((item) => item.count !== null).length,
    unavailable: pending.some((item) => item.count === null),
  }
}
