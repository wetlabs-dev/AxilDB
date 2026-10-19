import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import {
  husbandryFieldNames,
  environmentalHusbandryFields,
} from '@/lib/husbandry'
import { plantName } from '@/lib/utils'

type Db = Prisma.TransactionClient
export const husbandryLinkTarget = 'husbandryLink'
export const compatibilityDimensions = {
  light: ['summaryLight', 'lightIntensity', 'environmentLightLevel'],
  watering: [
    'summaryWater',
    'wateringMoistureLevel',
    'wateringDroughtTolerance',
  ],
  substrate: ['mediumPreferred', 'mediumDrainage', 'mediumRecipeNotes'],
  humidity: [
    'humidityRange',
    'environmentHumidityMinPercent',
    'environmentHumidityMaxPercent',
  ],
  temperature: [
    'temperatureColdTolerance',
    'temperatureHeatTolerance',
    'environmentTemperatureMinC',
    'environmentTemperatureMaxC',
  ],
  dormancy: ['dormancyBehavior', 'repottingDormancyConsideration'],
  fertilization: [
    'fertilizationType',
    'fertilizationStrength',
    'fertilizationSeasonalSchedule',
  ],
  repotting: [
    'repottingRootSensitivity',
    'repottingPotType',
    'repottingDivisionGuidance',
  ],
  pruning: ['growthHabit', 'summaryCare'],
  growthHabit: ['growthHabit'],
  roots: ['repottingRootSensitivity', 'mediumHabit'],
  specialRequirements: [
    'summaryCare',
    'treatmentNotes',
    'protectedSpeciesNotes',
  ],
} as const
export function linkConfidenceThreshold() {
  const value = Number(process.env.AXILDB_HUSBANDRY_LINK_MIN_CONFIDENCE || 0.9)
  if (!Number.isFinite(value) || value < 0.8 || value > 1)
    throw new Error(
      'Husbandry link minimum confidence must be between 0.8 and 1.'
    )
  return value
}
export function guideQuality(guide: any) {
  const covered = Object.entries(compatibilityDimensions)
    .filter(([, fields]) =>
      fields.some((f) => guide?.[f] != null && String(guide[f]).trim() !== '')
    )
    .map(([key]) => key)
  const minimum = Number(process.env.AXILDB_HUSBANDRY_LINK_MIN_DIMENSIONS || 8)
  if (!Number.isInteger(minimum) || minimum < 5 || minimum > 12)
    throw new Error(
      'Husbandry source minimum dimensions must be between 5 and 12.'
    )
  return {
    covered,
    score: covered.length / 12,
    adequate:
      !['CONFLICTED', 'DISPUTED', 'REJECTED'].includes(guide?.reviewStatus) &&
      covered.length >= minimum &&
      ['light', 'watering', 'substrate', 'humidity', 'temperature'].every(
        (key) => covered.includes(key)
      ),
  }
}
const guideFields = [
  ...husbandryFieldNames,
  ...environmentalHusbandryFields,
  'fertilizerRecipeId',
  'fertilizationCadenceDays',
  'fertilizationPaused',
  'reviewStatus',
  'reviewNotes',
  'aiModel',
  'aiGeneratedAt',
  'sourcePlantDefinitionId',
]
export function husbandrySnapshot(definition: any) {
  return {
    identity: {
      id: definition.id,
      genus: definition.genus,
      species: definition.species,
      cultivarName: definition.cultivarName,
      hybridNotation: definition.hybridNotation,
    },
    guide: definition.husbandryGuide
      ? Object.fromEntries(
          guideFields.map((field) => [
            field,
            definition.husbandryGuide[field] ?? null,
          ])
        )
      : null,
  }
}
function boundedResearchSnapshot(definition: any) {
  const snapshot = husbandrySnapshot(definition)
  const fields = new Set<string>([
    ...Object.values(compatibilityDimensions).flat(),
    'reviewStatus',
    'reviewNotes',
    'fertilizerRecipeId',
    'aiModel',
    'aiGeneratedAt',
  ])
  let truncated = false
  if (snapshot.guide)
    snapshot.guide = Object.fromEntries(
      Object.entries(snapshot.guide)
        .filter(([field]) => fields.has(field))
        .map(([field, value]) => {
          if (typeof value === 'string' && value.length > 800) {
            truncated = true
            return [field, value.slice(0, 800)]
          }
          return [field, value]
        })
    )
  return { ...snapshot, truncated }
}
export function husbandryFingerprint(definition: any) {
  return createHash('sha256')
    .update(JSON.stringify(husbandrySnapshot(definition)))
    .digest('hex')
}
export const activeLinkWhere = (
  collectionId?: string
): Prisma.AiCuratorSuggestionWhereInput => ({
  ...(collectionId ? { collectionId } : {}),
  targetField: husbandryLinkTarget,
  status: 'PENDING',
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
})
export async function lockHusbandryGraph(tx: Db, collectionId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${collectionId}), 7613)`
}
async function lockGuidePair(tx: Db, targetId: string, sourceId: string) {
  await tx.$queryRaw`SELECT id FROM "PlantDefinition" WHERE id IN (${targetId}, ${sourceId}) ORDER BY id FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "PlantHusbandryGuide" WHERE "plantDefinitionId" IN (${targetId}, ${sourceId}) ORDER BY id FOR UPDATE`
}
export type LinkValidation = {
  valid: boolean
  reason?: string
  conflictingSuggestionIds?: string[]
  conflictingPlantDefinitionIds?: string[]
}
export async function validateHusbandryLinkProposal(
  tx: Db,
  input: {
    collectionId: string
    targetId: string
    sourceId: string
    ignoreSuggestionId?: string
  }
): Promise<LinkValidation> {
  const { collectionId, targetId, sourceId, ignoreSuggestionId } = input
  if (targetId === sourceId)
    return { valid: false, reason: 'A definition cannot link to itself.' }
  const [target, source, pending] = await Promise.all([
    tx.plantDefinition.findFirst({
      where: { id: targetId, collectionId },
      include: { husbandryGuide: true },
    }),
    tx.plantDefinition.findFirst({
      where: { id: sourceId, collectionId },
      include: { husbandryGuide: true },
    }),
    tx.aiCuratorSuggestion.findMany({
      where: {
        ...activeLinkWhere(collectionId),
        ...(ignoreSuggestionId ? { id: { not: ignoreSuggestionId } } : {}),
      },
      select: { id: true, plantDefinitionId: true, suggestedValue: true },
    }),
  ])
  if (!target || !source)
    return {
      valid: false,
      reason: 'Both definitions must still exist in this collection.',
    }
  if (!source.husbandryGuide || source.husbandryGuide.sourcePlantDefinitionId)
    return {
      valid: false,
      reason: 'The source must have an independent husbandry guide.',
      conflictingPlantDefinitionIds: [sourceId],
    }
  if (
    await tx.plantHusbandryGuide.count({
      where: { sourcePlantDefinitionId: targetId },
    })
  )
    return {
      valid: false,
      reason:
        'This definition already supplies husbandry to consumers; it cannot become a consumer.',
      conflictingPlantDefinitionIds: [targetId],
    }
  const conflicts = pending.filter(
    (p) =>
      p.plantDefinitionId === targetId ||
      p.plantDefinitionId === sourceId ||
      (p.suggestedValue as any)?.sourcePlantDefinitionId === targetId
  )
  if (conflicts.length)
    return {
      valid: false,
      reason:
        'Pending recommendations reserve this definition as a future source or consumer. Resolve those recommendations first.',
      conflictingSuggestionIds: conflicts.map((p) => p.id),
    }
  return { valid: true }
}
function rangeConflict(a: any, b: any, min: string, max: string) {
  return (
    a?.[min] != null &&
    a?.[max] != null &&
    b?.[min] != null &&
    b?.[max] != null &&
    (Number(a[max]) < Number(b[min]) || Number(b[max]) < Number(a[min]))
  )
}
export function criticalGuideConflicts(a: any, b: any) {
  const issues: string[] = []
  for (const [name, min, max] of [
    ['temperature', 'environmentTemperatureMinC', 'environmentTemperatureMaxC'],
    [
      'humidity',
      'environmentHumidityMinPercent',
      'environmentHumidityMaxPercent',
    ],
  ])
    if (rangeConflict(a, b, min, max))
      issues.push(`Non-overlapping ${name} ranges`)
  const water = (g: any) =>
    [g?.summaryWater, g?.wateringMoistureLevel, g?.wateringDroughtTolerance]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  const moist = (s: string) =>
      /consistently moist|never dry|always moist/.test(s),
    dry = (s: string) => /dry completely|dry out completely|fully dry/.test(s)
  if ((moist(water(a)) && dry(water(b))) || (moist(water(b)) && dry(water(a))))
    issues.push('Conflicting moisture requirements')
  return issues
}
export async function consolidationContext(
  db: Db,
  collectionId: string,
  targetId: string
) {
  const target = await db.plantDefinition.findFirstOrThrow({
    where: { id: targetId, collectionId },
    include: { husbandryGuide: true },
  })
  if (
    target.husbandryGuide?.sourcePlantDefinitionId ||
    (await db.plantHusbandryGuide.count({
      where: { sourcePlantDefinitionId: targetId },
    }))
  )
    return {
      target: boundedResearchSnapshot(target),
      targetFingerprint: husbandryFingerprint(target),
      candidates: [],
      minimumConfidence: linkConfidenceThreshold(),
    }
  // Taxonomy only narrows discovery; it never establishes compatibility.
  const candidates = await db.plantDefinition.findMany({
    where: {
      collectionId,
      genus: { equals: target.genus, mode: 'insensitive' },
      id: { not: targetId },
      husbandryGuide: { is: { sourcePlantDefinitionId: null } },
    },
    include: {
      husbandryGuide: true,
      _count: { select: { husbandrySourceFor: true } },
    },
    orderBy: { id: 'asc' },
    take: 60,
  })
  const pending = await db.aiCuratorSuggestion.findMany({
    where: activeLinkWhere(collectionId),
    select: { plantDefinitionId: true, suggestedValue: true },
  })
  const reserved = new Set(pending.map((p) => p.plantDefinitionId))
  if (
    reserved.has(targetId) ||
    pending.some(
      (p) => (p.suggestedValue as any)?.sourcePlantDefinitionId === targetId
    )
  )
    return {
      target: boundedResearchSnapshot(target),
      targetFingerprint: husbandryFingerprint(target),
      candidates: [],
      minimumConfidence: linkConfidenceThreshold(),
    }
  const eligible = []
  for (const source of candidates) {
    const quality = guideQuality(source.husbandryGuide)
    if (
      !quality.adequate ||
      criticalGuideConflicts(source.husbandryGuide, source.husbandryGuide)
        .length ||
      criticalGuideConflicts(target.husbandryGuide, source.husbandryGuide)
        .length
    )
      continue
    if (reserved.has(source.id)) continue
    eligible.push({
      id: source.id,
      name: plantName(source),
      snapshot: boundedResearchSnapshot(source),
      fingerprint: husbandryFingerprint(source),
      quality,
      consumers: source._count.husbandrySourceFor,
      reviewStatus: source.husbandryGuide?.reviewStatus,
    })
  }
  eligible.sort(
    (a, b) =>
      b.quality.score - a.quality.score ||
      Number(b.reviewStatus === 'REVIEWED') -
        Number(a.reviewStatus === 'REVIEWED') ||
      b.consumers - a.consumers ||
      a.id.localeCompare(b.id)
  )
  return {
    target: boundedResearchSnapshot(target),
    targetFingerprint: husbandryFingerprint(target),
    candidates: eligible.slice(0, 6),
    minimumConfidence: linkConfidenceThreshold(),
  }
}
export function validCompatibilityAssessment(
  value: any,
  targetId: string,
  candidates: any[]
) {
  if (
    value?.shouldRecommendLink !== true ||
    value?.compatible !== true ||
    value?.targetPlantDefinitionId !== targetId ||
    !candidates.some((c) => c.id === value.sourcePlantDefinitionId)
  )
    return false
  if (
    !Number.isFinite(value.confidence) ||
    value.confidence < linkConfidenceThreshold() ||
    value.confidence > 1 ||
    value.evidenceSufficient !== true
  )
    return false
  if (
    !Array.isArray(value.criticalDifferences) ||
    value.criticalDifferences.length ||
    !Array.isArray(value.compatibleDimensions) ||
    !Object.keys(compatibilityDimensions).every((k) =>
      value.compatibleDimensions.includes(k)
    )
  )
    return false
  return (
    [
      'botanicalReasoning',
      'sourceQualityAssessment',
      'evidenceLimitations',
    ].every(
      (k) => typeof value[k] === 'string' && value[k].trim().length >= 15
    ) &&
    ['similarities', 'minorDifferences'].every(
      (k) =>
        Array.isArray(value[k]) &&
        value[k].every((s: any) => typeof s === 'string')
    ) &&
    value.similarities.length > 0
  )
}
export async function applyHusbandryLink(
  tx: Db,
  input: {
    collectionId: string
    targetId: string
    sourceId: string
    userId: string
    suggestionId?: string
  }
) {
  await lockHusbandryGraph(tx, input.collectionId)
  await lockGuidePair(tx, input.targetId, input.sourceId)
  const validation = await validateHusbandryLinkProposal(tx, {
    ...input,
    ignoreSuggestionId: input.suggestionId,
  })
  if (!validation.valid) throw new Error(validation.reason)
  const previousGuide = await tx.plantHusbandryGuide.findUnique({
    where: { plantDefinitionId: input.targetId },
  })
  // Keep all independent fields and recipe associations intact underneath the link.
  const guide = await tx.plantHusbandryGuide.upsert({
    where: { plantDefinitionId: input.targetId },
    create: {
      collectionId: input.collectionId,
      plantDefinitionId: input.targetId,
      sourcePlantDefinitionId: input.sourceId,
      reviewStatus: 'LINKED',
    },
    update: { sourcePlantDefinitionId: input.sourceId },
  })
  await tx.auditLog.create({
    data: {
      collectionId: input.collectionId,
      userId: input.userId,
      action: 'LINK',
      entityType: 'PLANT_HUSBANDRY_GUIDE',
      entityId: guide.id,
      summary: 'Linked husbandry with independent guide preserved',
      metadata: JSON.stringify({
        sourcePlantDefinitionId: input.sourceId,
        targetPlantDefinitionId: input.targetId,
        suggestionId: input.suggestionId,
        previousGuide,
      }),
    },
  })
  return guide
}
export async function reviewHusbandryLink(
  db: PrismaClient,
  id: string,
  userId: string,
  action: 'ACCEPT' | 'REJECT'
) {
  return db.$transaction(
    async (tx) => {
      const initial = await tx.aiCuratorSuggestion.findUniqueOrThrow({
        where: { id },
      })
      await lockHusbandryGraph(tx, initial.collectionId)
      const suggestion = await tx.aiCuratorSuggestion.findUniqueOrThrow({
        where: { id },
      })
      if (
        suggestion.targetField !== husbandryLinkTarget ||
        !['PENDING', 'STALE'].includes(suggestion.status)
      )
        return { status: 'UNCHANGED' }
      if (action === 'REJECT') {
        await tx.aiCuratorSuggestion.update({
          where: { id },
          data: {
            status: 'REJECTED',
            reviewedAt: new Date(),
            reviewedByUserId: userId,
          },
        })
        await tx.auditLog.create({
          data: {
            collectionId: suggestion.collectionId,
            userId,
            action: 'REJECT',
            entityType: 'AI_CURATOR_SUGGESTION',
            entityId: id,
            summary:
              'Rejected husbandry consolidation; independent guide unchanged',
          },
        })
        return { status: 'REJECTED' }
      }
      if (suggestion.status !== 'PENDING') return { status: 'STALE' }
      const value = suggestion.suggestedValue as any,
        context = (suggestion.currentValue as any)?.consolidation
      await lockGuidePair(
        tx,
        suggestion.plantDefinitionId!,
        value?.sourcePlantDefinitionId || ''
      )
      const [target, source] = await Promise.all([
        tx.plantDefinition.findFirst({
          where: {
            id: suggestion.plantDefinitionId!,
            collectionId: suggestion.collectionId,
          },
          include: { husbandryGuide: true },
        }),
        tx.plantDefinition.findFirst({
          where: {
            id: value?.sourcePlantDefinitionId || '',
            collectionId: suggestion.collectionId,
          },
          include: { husbandryGuide: true },
        }),
      ])
      const candidate = context?.candidates?.find(
        (c: any) => c.id === value?.sourcePlantDefinitionId
      )
      const validation = await validateHusbandryLinkProposal(tx, {
        collectionId: suggestion.collectionId,
        targetId: suggestion.plantDefinitionId!,
        sourceId: value?.sourcePlantDefinitionId || '',
        ignoreSuggestionId: id,
      })
      const stale =
        !target ||
        !source ||
        !context ||
        !candidate ||
        (suggestion.expiresAt && suggestion.expiresAt <= new Date()) ||
        !validCompatibilityAssessment(
          value,
          target?.id || '',
          context?.candidates || []
        ) ||
        !guideQuality(source?.husbandryGuide).adequate ||
        criticalGuideConflicts(target?.husbandryGuide, source?.husbandryGuide)
          .length ||
        target.husbandryGuide?.sourcePlantDefinitionId ||
        husbandryFingerprint(target) !== context.targetFingerprint ||
        husbandryFingerprint(source) !== candidate.fingerprint
      if (stale || !validation.valid) {
        const reason = validation.valid
          ? 'Source, target, evidence or confidence changed since research. Refresh the comparison.'
          : validation.reason!
        await tx.aiCuratorSuggestion.update({
          where: { id },
          data: { status: 'STALE', reviewNote: reason },
        })
        await tx.auditLog.create({
          data: {
            collectionId: suggestion.collectionId,
            userId,
            action: 'STALE',
            entityType: 'AI_CURATOR_SUGGESTION',
            entityId: id,
            summary: reason,
          },
        })
        return { status: 'STALE', reason }
      }
      await applyHusbandryLink(tx, {
        collectionId: suggestion.collectionId,
        targetId: target!.id,
        sourceId: source!.id,
        userId,
        suggestionId: id,
      })
      await tx.aiCuratorSuggestion.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          reviewedAt: new Date(),
          reviewedByUserId: userId,
          reviewNote:
            'Approved shared husbandry; original independent fields and audit snapshot retained.',
        },
      })
      return { status: 'ACCEPTED' }
    },
    { timeout: 30000 }
  )
}

export async function husbandryGraphIssues(tx: Db, collectionId: string) {
  const [guides, pending] = await Promise.all([
    tx.plantHusbandryGuide.findMany({
      where: { collectionId },
      select: { plantDefinitionId: true, sourcePlantDefinitionId: true },
    }),
    tx.aiCuratorSuggestion.findMany({
      where: activeLinkWhere(collectionId),
      select: { id: true, plantDefinitionId: true, suggestedValue: true },
    }),
  ])
  const outgoing: Array<[string, string]> = []
  for (const guide of guides)
    if (guide.sourcePlantDefinitionId)
      outgoing.push([guide.plantDefinitionId, guide.sourcePlantDefinitionId])
  for (const p of pending) {
    const source = (p.suggestedValue as any)?.sourcePlantDefinitionId
    if (p.plantDefinitionId && typeof source === 'string')
      outgoing.push([p.plantDefinitionId, source])
  }
  const targets = new Set(outgoing.map(([target]) => target))
  return [...outgoing]
    .filter(([target, source]) => target === source || targets.has(source))
    .map(
      ([target, source]) =>
        `${target} → ${source}: source is also a consumer (existing or pending)`
    )
}
export async function restoreIndependentHusbandry(
  tx: Db,
  input: { collectionId: string; targetId: string; userId: string }
) {
  await lockHusbandryGraph(tx, input.collectionId)
  const guide = await tx.plantHusbandryGuide.findFirstOrThrow({
    where: {
      collectionId: input.collectionId,
      plantDefinitionId: input.targetId,
    },
  })
  if (!guide.sourcePlantDefinitionId) return guide
  // Old links may have erased their local fields; never fabricate a restoration.
  const history = await tx.auditLog.findFirst({
    where: {
      collectionId: input.collectionId,
      entityType: 'PLANT_HUSBANDRY_GUIDE',
      entityId: guide.id,
      action: 'LINK',
    },
    orderBy: { createdAt: 'desc' },
  })
  let saved: any = null
  try {
    saved = JSON.parse(history?.metadata || 'null')?.previousGuide
  } catch {}
  if (!saved || saved.sourcePlantDefinitionId)
    throw new Error(
      'No preserved independent guide is available for this link. Use Make local copy to fork current source care instead.'
    )
  const data = Object.fromEntries(
    guideFields
      .filter((f) => !['sourcePlantDefinitionId'].includes(f))
      .map((f) => [f, saved[f] ?? null])
  )
  if (data.aiGeneratedAt)
    data.aiGeneratedAt = new Date(data.aiGeneratedAt as string)
  const restored = await tx.plantHusbandryGuide.update({
    where: { id: guide.id },
    data: {
      ...data,
      sourcePlantDefinitionId: null,
      reviewNotes: `Restored independent guide preserved at linking (${history!.createdAt.toISOString()}). Review for currency. Previous notes: ${saved.reviewNotes || 'none'}`,
    } as any,
  })
  await tx.auditLog.create({
    data: {
      collectionId: input.collectionId,
      userId: input.userId,
      action: 'RESTORE',
      entityType: 'PLANT_HUSBANDRY_GUIDE',
      entityId: guide.id,
      summary: 'Explicitly restored preserved independent husbandry',
      metadata: JSON.stringify({
        fromSource: guide.sourcePlantDefinitionId,
        archiveAuditId: history!.id,
      }),
    },
  })
  return restored
}
