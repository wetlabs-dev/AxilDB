import type { Prisma } from '@prisma/client'
import { cadenceActivities, cadenceUnits } from '@/lib/care-cadences'

/** Count independently approvable intervals; never load research payloads for a badge. */
export function actionableCadenceWhere(
  collectionId?: string
): Prisma.CareCadenceProposalWhereInput {
  return {
    status: 'PENDING',
    applicability: 'RECOMMENDED',
    interval: { gte: 1, lte: 3650 },
    unit: { in: [...cadenceUnits] },
    AND: [
      { OR: [{ jobId: null }, { job: { status: 'COMPLETED' } }] },
      {
        OR: cadenceActivities.map(({ activity }) => ({
          activity,
          plantDefinition: {
            ...(collectionId ? { collectionId } : {}),
            careCadences: { none: { activity } },
            ...(activity === 'FERTILIZING'
              ? {
                  husbandryGuide: {
                    fertilizerRecipe: {
                      active: true,
                      ...(collectionId ? { collectionId } : {}),
                    },
                  },
                }
              : {}),
          },
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
    p.applicability !== 'RECOMMENDED' ||
    !cadenceActivities.some((a) => a.activity === p.activity) ||
    !Number.isInteger(p.interval) ||
    !p.interval ||
    p.interval < 1 ||
    p.interval > 3650 ||
    !cadenceUnits.some((unit) => unit === p.unit) ||
    (p.jobId && p.job?.status !== 'COMPLETED') ||
    d.careCadences.some((c) => c.activity === p.activity)
  )
    return false
  const recipe = d.husbandryGuide?.fertilizerRecipe
  return (
    p.activity !== 'FERTILIZING' ||
    Boolean(recipe?.active && recipe.collectionId === d.collectionId)
  )
}
