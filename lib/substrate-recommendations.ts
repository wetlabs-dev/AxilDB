const qualitativeScore: Record<string, number> = {
  VERY_LOW: 0,
  LOW: 0.25,
  MODERATE: 0.5,
  HIGH: 0.75,
  VERY_HIGH: 1,
}

const suitabilityScore: Record<string, number> = {
  PREFERRED: 1,
  RECOMMENDED: 0.78,
  ACCEPTABLE: 0.56,
  SPECIAL_PURPOSE: 0.38,
}

type ComponentProfile = {
  percentByVolume: number
  component: { waterRetention?: string | null; aeration?: string | null; drainage?: string | null }
}

export type SubstratePhysicalProfile = {
  waterRetention: number | null
  aeration: number | null
  drainage: number | null
}

export function substrateRecipePhysicalProfile(components: ComponentProfile[]): SubstratePhysicalProfile {
  const profile = (field: 'waterRetention' | 'aeration' | 'drainage') => {
    const known = components.flatMap((row) => {
      const score = qualitativeScore[String(row.component[field] || '')]
      return score === undefined ? [] : [{ score, weight: Number(row.percentByVolume) || 0 }]
    })
    const totalWeight = known.reduce((sum, item) => sum + item.weight, 0)
    return totalWeight ? known.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight : null
  }
  return { waterRetention: profile('waterRetention'), aeration: profile('aeration'), drainage: profile('drainage') }
}

function targetProfile(raw: any): SubstratePhysicalProfile | null {
  const profile = raw?.substrateTargetProfile
  if (!profile || typeof profile !== 'object') return null
  const value = (field: string) => qualitativeScore[String(profile[field] || '').toUpperCase()] ?? null
  const result = { waterRetention: value('waterRetention'), aeration: value('aeration'), drainage: value('drainage') }
  return Object.values(result).some((item) => item !== null) ? result : null
}

function physicalFit(recipe: SubstratePhysicalProfile, target: SubstratePhysicalProfile | null) {
  if (!target) return null
  const scores = (['waterRetention', 'aeration', 'drainage'] as const).flatMap((field) =>
    recipe[field] === null || target[field] === null ? [] : [1 - Math.abs(recipe[field] - target[field])],
  )
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null
}

export function normalizeAndRankSubstrateRecommendations(
  raw: any,
  recipes: Map<string, SubstratePhysicalProfile>,
) {
  const seen = new Set<string>()
  const target = targetProfile(raw)
  return (Array.isArray(raw?.substrateRecommendations) ? raw.substrateRecommendations : [])
    .map((item: any, index: number) => {
      const recipeVersionId = String(item?.recipeVersionId || '')
      const suitability = suitabilityScore[item?.suitability] === undefined ? 'RECOMMENDED' : item.suitability
      const confidence = Number.isFinite(Number(item?.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : 0.5
      const fit = recipes.has(recipeVersionId) ? physicalFit(recipes.get(recipeVersionId)!, target) : null
      const aiScore = suitabilityScore[suitability] * 0.65 + confidence * 0.35
      return {
        recipeVersionId,
        suitability,
        confidence,
        reason: String(item?.reason || '').trim().slice(0, 500) || null,
        originalIndex: index,
        score: fit === null ? aiScore : fit * 0.75 + aiScore * 0.25,
      }
    })
    .filter((item: any) => recipes.has(item.recipeVersionId) && !seen.has(item.recipeVersionId) && seen.add(item.recipeVersionId))
    .sort((left: any, right: any) => right.score - left.score || left.originalIndex - right.originalIndex)
    .slice(0, 4)
    .map((item: any, index: number) => ({
      recipeVersionId: item.recipeVersionId,
      rank: index + 1,
      suitability: index === 0 && item.suitability === 'RECOMMENDED' ? 'PREFERRED' : item.suitability,
      confidence: item.confidence,
      reason: item.reason,
    }))
}
