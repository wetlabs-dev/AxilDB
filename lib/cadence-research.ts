import {
  actionableCadenceWhere,
  isActionableCadenceProposal,
} from '@/lib/cadence-review'
import { configureDefinitionCadence } from '@/lib/care-cadence-service'
import { createHash } from 'crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { cadenceActivities, validateCadence } from '@/lib/care-cadences'
import {
  explicitLegacyInterval,
  validateRecommendations,
} from '@/lib/cadence-recommendations'

export const researchDefinitionInclude = {
  careCadences: true,
  cadenceProposals: true,
  husbandryGuide: { include: { fertilizerRecipe: true } },
} satisfies Prisma.PlantDefinitionInclude
export type ResearchDefinition = Prisma.PlantDefinitionGetPayload<{
  include: typeof researchDefinitionInclude
}>
export function definitionHasRecipe(d: Pick<ResearchDefinition, 'husbandryGuide' | 'collectionId'>) {
  return Boolean(
    d.husbandryGuide?.fertilizerRecipe?.active &&
      d.husbandryGuide.fertilizerRecipe.collectionId === d.collectionId
  )
}
export function cadenceActivityState(d: ResearchDefinition, activity: string) {
  const configured = d.careCadences.find((c) => c.activity === activity)
  if (configured)
    return configured.status === 'NOT_APPLICABLE'
      ? 'NOT_APPLICABLE_CONFIGURED'
      : 'CONFIGURED'
  const prior = d.cadenceProposals
    .filter((p) => p.activity === activity)
    .sort((a, b) => b.researchedAt.getTime() - a.researchedAt.getTime())[0]
  if (!prior || prior.status === 'FAILED') return 'MISSING'
  if (!['RECOMMENDED', 'NOT_APPLICABLE'].includes(prior.applicability))
    return prior.applicability
  return prior.status
}
export function missingActivities(d: ResearchDefinition, explicit = false) {
  return cadenceActivities
    .filter(({ activity }) => {
      const state = cadenceActivityState(d, activity)
      return (
        state === 'MISSING' ||
        (explicit &&
          ![
            'CONFIGURED',
            'NOT_APPLICABLE_CONFIGURED',
            'BLOCKED_BY_DEPENDENCY',
            'PENDING',
          ].includes(state))
      )
    })
    .map((a) => a.activity)
}
export async function cadenceResearchContext(
  db: PrismaClient,
  collectionId: string,
  id: string,
  explicit = false
) {
  const d = await db.plantDefinition.findFirstOrThrow({
    where: { id, collectionId },
    include: researchDefinitionInclude,
  })
  // Deliberate allowlist: no acquisition, instance, user or collection-private records.
  const g = d.husbandryGuide
  return {
    plantDefinition: {
      genus: d.genus,
      species: d.species,
      cultivarName: d.cultivarName,
      hybridNotation: d.hybridNotation,
      taxonomy: d.taxonomicPlacementJson,
      description: d.description,
      husbandry: g
        ? Object.fromEntries(
            Object.entries(g).filter(
              ([key]) =>
                ![
                  'id',
                  'collectionId',
                  'plantDefinitionId',
                  'sourcePlantDefinitionId',
                  'reviewNotes',
                  'reviewedByUserId',
                  'fertilizerRecipe',
                ].includes(key)
            )
          )
        : null,
      assignedRecipe: definitionHasRecipe(d)
        ? {
            name: g!.fertilizerRecipe!.name,
            frequencyDays: g!.fertilizerRecipe!.frequencyDays,
            frequencyNotes: g!.fertilizerRecipe!.frequencyNotes,
          }
        : null,
    },
    missingEligibleActivities: missingActivities(d, explicit),
    configuredCadences: d.careCadences,
    hasAssignedRecipe: definitionHasRecipe(d),
  }
}

export async function persistCadenceRecommendations(
  db: PrismaClient,
  input: {
    definitionId: string
    collectionId: string
    recommendations: unknown
    source: string
    model?: string
    jobId?: string
    explicit?: boolean
  }
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
    // Cancelled jobs cannot publish results from an in-flight provider request.
    if (
      input.jobId &&
      !(await tx.aiCuratorJob.findFirst({
        where: { id: input.jobId, status: 'RUNNING' },
      }))
    )
      return []
    const d = await tx.plantDefinition.findFirstOrThrow({
      where: { id: input.definitionId, collectionId: input.collectionId },
      include: researchDefinitionInclude,
    })
    const allowed = new Set<string>(missingActivities(d, input.explicit))
    const rows = validateRecommendations(
      input.recommendations,
      definitionHasRecipe(d)
    ).filter((r) => allowed.has(r.activity))
    const saved = []
    if (input.explicit)
      await tx.careCadenceProposal.updateMany({
        where: {
          plantDefinitionId: d.id,
          activity: { in: rows.map((r) => r.activity) },
          status: 'PENDING',
          applicability: { not: 'RECOMMENDED' },
        },
        data: { status: 'SUPERSEDED', reviewNote: 'Explicitly re-researched.' },
      })
    for (const r of rows)
      saved.push(
        await tx.careCadenceProposal.create({
          data: {
            plantDefinitionId: d.id,
            activity: r.activity,
            interval: r.recommendedInterval,
            unit: r.recommendedUnit,
            confidence: r.confidence,
            rationale: r.rationale,
            applicability: r.applicability,
            sourceReferences: r.sourceReferences,
            source: input.source,
            provider: 'OPENAI',
            model: input.model,
            jobId: input.jobId,
          },
        })
      )
    return saved
  })
}

export async function approveCadenceProposal(
  db: PrismaClient,
  id: string,
  reviewerId: string,
  edit?: { interval: number; unit: string }
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
    const p = await tx.careCadenceProposal.findUnique({
      where: { id },
      include: {
        job: { select: { status: true } },
        plantDefinition: { include: { careCadences: true, husbandryGuide: { include: { fertilizerRecipe: true } } } },
      },
    })
    if (!p || p.status !== 'PENDING') return 'No longer pending'
    if (!['RECOMMENDED', 'NOT_APPLICABLE'].includes(p.applicability))
      return 'No actionable recommendation'
    if (p.applicability === 'NOT_APPLICABLE' && edit)
      throw new Error('N/A recommendations cannot include an interval.')
    if (p.plantDefinition.careCadences.some((c) => c.activity === p.activity)) {
      await tx.careCadenceProposal.update({
        where: { id },
        data: { status: 'SUPERSEDED', reviewNote: 'Already configured.' },
      })
      return 'Already configured'
    }
    if (
      p.applicability === 'RECOMMENDED' &&
      p.activity === 'FERTILIZING' &&
      !definitionHasRecipe(p.plantDefinition)
    )
      return 'Fertilizer recipe is no longer assigned or active'
    if (!isActionableCadenceProposal(p, p.plantDefinition))
      return 'Recommendation is no longer actionable'
    const interval =
      p.applicability === 'NOT_APPLICABLE'
        ? null
        : (edit?.interval ?? p.interval!)
    const unit =
      p.applicability === 'NOT_APPLICABLE' ? null : (edit?.unit ?? p.unit!)
    if (p.applicability === 'RECOMMENDED') validateCadence(interval!, unit!)
    const created = await configureDefinitionCadence(tx, {
      definitionId: p.plantDefinitionId,
      activity: p.activity,
      interval,
      unit,
      status:
        p.applicability === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'SCHEDULED',
      missingOnly: true,
    })
    if (!created.count) return 'Already configured'
    // The cadence insert supersedes conflicts. Promote exactly this reviewed result afterward.
    await tx.careCadenceProposal.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedByUserId: reviewerId,
        approvedInterval: interval,
        approvedUnit: unit,
        reviewNote:
          p.applicability === 'NOT_APPLICABLE'
            ? 'Approved: no recurring cadence applies. Manual care remains available.'
            : null,
      },
    })
    return 'APPROVED'
  })
}
export async function approveCadenceBatch(
  db: PrismaClient,
  ids: string[],
  reviewerId: string
) {
  const results: Record<string, number> = {}
  for (const id of [...new Set(ids)]) {
    let result: string
    try {
      result = await approveCadenceProposal(db, id, reviewerId)
    } catch {
      result = 'FAILED: validation or database write'
    }
    results[result] = (results[result] || 0) + 1
  }
  return results
}
export async function eligibleCadenceProposals(
  db: PrismaClient,
  collectionId?: string
) {
  const rows = await db.careCadenceProposal.findMany({
    where: actionableCadenceWhere(collectionId),
    include: {
      job: { select: { status: true } },
      plantDefinition: { include: { careCadences: true, husbandryGuide: { include: { fertilizerRecipe: true } } } },
    },
  })
  return rows.filter((p) => isActionableCadenceProposal(p, p.plantDefinition))
}
export async function recoverLegacyCadences(db: PrismaClient) {
  let saved = 0
  const definitions = await db.plantDefinition.findMany({
    include: researchDefinitionInclude,
  })
  const archived = await db.aiCuratorSuggestion.findMany({
    where: { targetField: { in: ['husbandry', 'fertilizer', 'careCadences'] } },
    orderBy: { createdAt: 'asc' },
  })
  for (const d of definitions) {
    const g = d.husbandryGuide
    const values = [
      {
        activity: 'WATERING',
        value: explicitLegacyInterval(g?.wateringCadence),
        field: 'wateringCadence',
        original: g?.wateringCadence,
      },
      {
        activity: 'REPOTTING',
        value: explicitLegacyInterval(g?.repottingInterval),
        field: 'repottingInterval',
        original: g?.repottingInterval,
      },
      {
        activity: 'FERTILIZING',
        value: g?.fertilizationCadenceDays
          ? { interval: g.fertilizationCadenceDays, unit: 'DAY' }
          : explicitLegacyInterval(g?.fertilizationFrequency),
        field: 'fertilizationFrequency/fertilizationCadenceDays',
        original: String(
          g?.fertilizationCadenceDays || g?.fertilizationFrequency || ''
        ),
      },
    ]
    for (const old of archived.filter(
      (row) =>
        row.plantDefinitionId === d.id && row.collectionId === d.collectionId
    )) {
      const raw = old.suggestedValue as any
      const fields = raw?.fields || raw
      if (!fields || typeof fields !== 'object') continue
      for (const [activity, field] of [
        ['WATERING', 'wateringCadence'],
        ['REPOTTING', 'repottingInterval'],
        ['FERTILIZING', 'fertilizationFrequency'],
      ]) {
        const value =
          activity === 'FERTILIZING' &&
          Number.isInteger(fields.fertilizationCadenceDays)
            ? { interval: fields.fertilizationCadenceDays, unit: 'DAY' }
            : explicitLegacyInterval(fields[field])
        values.push({
          activity,
          value,
          field: `AiCuratorSuggestion ${old.id}: ${field}`,
          original: String(
            fields[field] || fields.fertilizationCadenceDays || ''
          ),
        })
      }
    }
    for (const item of values) {
      if (
        !item.value ||
        d.careCadences.some((c) => c.activity === item.activity) ||
        (item.activity === 'FERTILIZING' &&
          (!definitionHasRecipe(d) || g?.fertilizationPaused))
      )
        continue
      try {
        validateCadence(item.value.interval, item.value.unit)
      } catch {
        continue
      }
      const recoveryKey = createHash('sha256')
        .update(JSON.stringify([d.id, item.activity, item.original]))
        .digest('hex')
      saved += await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
        if (
          (await tx.plantDefinitionCareCadence.findUnique({
            where: {
              plantDefinitionId_activity: {
                plantDefinitionId: d.id,
                activity: item.activity,
              },
            },
          })) ||
          (await tx.careCadenceProposal.findFirst({
            where: {
              plantDefinitionId: d.id,
              activity: item.activity,
              OR: [{ status: 'PENDING' }, { recoveryKey }],
            },
          }))
        )
          return 0
        const current = await tx.plantDefinition.findUniqueOrThrow({
          where: { id: d.id },
          include: researchDefinitionInclude,
        })
        if (
          item.activity === 'FERTILIZING' &&
          (!definitionHasRecipe(current) ||
            current.husbandryGuide?.fertilizationPaused)
        )
          return 0
        const created = await tx.careCadenceProposal.createMany({
          data: {
            plantDefinitionId: d.id,
            activity: item.activity,
            interval: item.value!.interval,
            unit: item.value!.unit,
            confidence: 'LOW',
            rationale: `Recovered from previous cadence data: ${item.field}: ${item.original}. Review historical seasonal and environmental assumptions.`,
            applicability: 'RECOMMENDED',
            sourceReferences: [],
            source: 'LEGACY_RECOVERY',
            recoveryKey,
          },
          skipDuplicates: true,
        })
        return created.count
      })
    }
  }
  return saved
}
