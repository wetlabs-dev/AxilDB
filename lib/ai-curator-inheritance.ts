import type { PrismaClient } from '@prisma/client'

export const linkedCareFields = ['husbandry', 'fertilizer', 'substrate']
export const localOverrideConfidence = 0.9

// Resolve only inside the collection, and fail closed on broken links/cycles.
export async function curatorInheritance(
  db: PrismaClient,
  definitionId: string,
  collectionId: string
) {
  const local = await db.plantHusbandryGuide.findFirst({
    where: { plantDefinitionId: definitionId, collectionId },
  })
  if (!local?.sourcePlantDefinitionId) return null
  const sourceId = local.sourcePlantDefinitionId
  const visited = new Set([definitionId])
  let id = sourceId
  const sources: Array<{
    id: string
    name: string
    guide: unknown
    substrates: unknown
  }> = []
  while (!visited.has(id) && sources.length < 20) {
    visited.add(id)
    const source = await db.plantDefinition.findFirst({
      where: { id, collectionId },
      include: { husbandryGuide: true, substrateRecommendations: true },
    })
    if (!source?.husbandryGuide)
      return {
        sourcePlantDefinitionId: sourceId,
        resolved: false,
        sources,
        effectiveGuide: null,
      }
    sources.push({
      id,
      name: [source.genus, source.species, source.cultivarName]
        .filter(Boolean)
        .join(' '),
      guide: source.husbandryGuide,
      substrates: source.substrateRecommendations,
    })
    if (!source.husbandryGuide.sourcePlantDefinitionId)
      return {
        sourcePlantDefinitionId: sourceId,
        resolved: true,
        sources,
        effectiveGuide: source.husbandryGuide,
      }
    id = source.husbandryGuide.sourcePlantDefinitionId
  }
  return {
    sourcePlantDefinitionId: sourceId,
    resolved: false,
    sources,
    effectiveGuide: null,
  }
}

export function linkedCarePolicy(
  targetField: string | null | undefined,
  value: any,
  confidence: unknown,
  inheritance: any
) {
  if (
    !linkedCareFields.includes(targetField || '') ||
    !inheritance?.sourcePlantDefinitionId
  )
    return true
  const override = value?.localOverride
  return Boolean(
    inheritance.resolved &&
    override?.sourcePlantDefinitionId === inheritance.sourcePlantDefinitionId &&
    override?.intent === 'LOCAL_OVERRIDE' &&
    Number(confidence) >= localOverrideConfidence &&
    Number(confidence) <= 1 &&
    typeof override.reason === 'string' &&
    override.reason.trim().length >= 30 &&
    typeof override.evidence === 'string' &&
    override.evidence.trim().length >= 30
  )
}

// Use live link state for old pending suggestions as well as newly generated work.
export function visibleLinkedCareSuggestion(suggestion: any) {
  const source =
    suggestion.plantDefinition?.husbandryGuide?.sourcePlantDefinitionId
  return linkedCarePolicy(
    suggestion.targetField,
    suggestion.suggestedValue,
    suggestion.confidence,
    source ? { sourcePlantDefinitionId: source, resolved: true } : null
  )
}
