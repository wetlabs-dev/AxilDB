import type { Prisma } from '@prisma/client'
import {
  cadenceActivities,
  cadenceUnits,
  supportsNotApplicable,
} from '@/lib/care-cadences'

/** Count independently approvable intervals; never load research payloads for a badge. */
export function actionableCadenceWhere(
  collectionId?: string
): Prisma.CareCadenceProposalWhereInput {
  return {
    status: 'PENDING',
    AND: [
      { OR: [{ jobId: null }, { job: { status: 'COMPLETED' } }] },
      {
        OR: cadenceActivities.map(({ activity }) => ({
          activity,
          plantDefinition: {
            ...(collectionId ? { collectionId } : {}),
            careCadences: { none: { activity } },
          },
          OR: [
            {
              applicability: 'RECOMMENDED',
              interval: { gte: 1, lte: 3650 },
              unit: { in: [...cadenceUnits] },
              ...(activity === 'FERTILIZING'
                ? {
                    plantDefinition: {
                      husbandryGuide: {
                        fertilizerRecipe: {
                          active: true,
                          ...(collectionId ? { collectionId } : {}),
                        },
                      },
                    },
                  }
                : {}),
            },
            ...(supportsNotApplicable(activity)
              ? [
                  {
                    applicability: 'NOT_APPLICABLE',
                    interval: null,
                    unit: null,
                  },
                ]
              : []),
          ],
        })),
      },
    ],
  }
}

type ReviewProposal = {
  status: string
  applicability: string
  activity: string
  interval: number | null
  unit: string | null
  jobId?: string | null
  job?: { status: string } | null
}
type ReviewDefinition = {
  collectionId: string | null
  careCadences: Array<{ activity: string }>
  husbandryGuide: {
    fertilizerRecipe: { active: boolean; collectionId: string } | null
  } | null
}
export function isActionableCadenceProposal(
  p: ReviewProposal,
  d: ReviewDefinition
) {
  if (
    p.status !== 'PENDING' ||
    !['RECOMMENDED', 'NOT_APPLICABLE'].includes(p.applicability) ||
    !cadenceActivities.some((a) => a.activity === p.activity) ||
    (p.jobId && p.job?.status !== 'COMPLETED') ||
    d.careCadences.some((c) => c.activity === p.activity)
  )
    return false
  if (p.applicability === 'NOT_APPLICABLE')
    return (
      supportsNotApplicable(p.activity) &&
      p.interval === null &&
      p.unit === null
    )
  if (
    !Number.isInteger(p.interval) ||
    !p.interval ||
    p.interval < 1 ||
    p.interval > 3650 ||
    !cadenceUnits.some((unit) => unit === p.unit)
  )
    return false
  const recipe = d.husbandryGuide?.fertilizerRecipe
  return (
    p.activity !== 'FERTILIZING' ||
    Boolean(recipe?.active && recipe.collectionId === d.collectionId)
  )
}

/** Unresolved findings belong in Review too, but must never enter bulk approval. */
export function needsCadenceAttention(p: ReviewProposal, d: ReviewDefinition) {
  return p.status === 'PENDING' &&
    (!p.jobId || p.job?.status === 'COMPLETED') &&
    !d.careCadences.some(c => c.activity === p.activity) &&
    !isActionableCadenceProposal(p, d)
}
