import { cadenceActivities, validateCadence } from '@/lib/care-cadences'

export type CadenceRecommendation = {
  activity: string
  recommendedInterval: number | null
  recommendedUnit: string | null
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  rationale: string
  sourceReferences: Array<{ title?: string; url?: string }>
  applicability:
    | 'RECOMMENDED'
    | 'NOT_APPLICABLE'
    | 'INSUFFICIENT_INFORMATION'
    | 'BLOCKED_BY_DEPENDENCY'
}
export const cadenceResearchInstructions = `Return careCadenceRecommendations using the shared shape below, only for missing eligible activities listed in context. Give botanically informed conservative starting intervals, never a generic schedule for every plant. Consider taxonomy/family, growth habit, habitat, dormancy, root sensitivity, existing husbandry and assigned recipe. Fixed watering intervals are inspection starting points: explain substrate, pot, light, temperature, humidity and seasonal uncertainty and require checking moisture before watering. Pruning and repotting may be condition based: use NOT_APPLICABLE or INSUFFICIENT_INFORMATION when a fixed interval is unjustified. General pest inspections are a practical precaution, not a species-specific scientific finding. Never fabricate citations: sourceReferences must be empty unless genuine references are known. FERTILIZING without an active assigned recipe must be BLOCKED_BY_DEPENDENCY with null interval and unit. Never replace configured cadences. Confidence must reflect uncertainty. RECOMMENDED requires a positive integer interval <=3650 and unit DAY|WEEK|MONTH|YEAR. All other applicability states require null interval and unit.`
export const cadenceRecommendationShape = [
  {
    activity: cadenceActivities.map((a) => a.activity).join('|'),
    recommendedInterval: 'positive integer|null',
    recommendedUnit: 'DAY|WEEK|MONTH|YEAR|null',
    confidence: 'HIGH|MEDIUM|LOW',
    rationale: 'string',
    sourceReferences: [{ title: 'string', url: 'genuine public https URL' }],
    applicability:
      'RECOMMENDED|NOT_APPLICABLE|INSUFFICIENT_INFORMATION|BLOCKED_BY_DEPENDENCY',
  },
]

export function validateRecommendations(
  raw: unknown,
  hasRecipe: boolean
): CadenceRecommendation[] {
  if (!Array.isArray(raw) || raw.length > 6)
    throw new Error('Expected at most six cadence recommendations.')
  const seen = new Set<string>()
  return raw.map((row) => {
    if (
      !row ||
      !cadenceActivities.some((a) => a.activity === row.activity) ||
      seen.has(row.activity)
    )
      throw new Error('Invalid or duplicate cadence activity.')
    seen.add(row.activity)
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(row.confidence))
      throw new Error('Invalid cadence confidence.')
    if (
      ![
        'RECOMMENDED',
        'NOT_APPLICABLE',
        'INSUFFICIENT_INFORMATION',
        'BLOCKED_BY_DEPENDENCY',
      ].includes(row.applicability)
    )
      throw new Error('Invalid cadence applicability.')
    if (typeof row.rationale !== 'string' || !row.rationale.trim())
      throw new Error('Cadence rationale is required.')
    if (row.applicability === 'RECOMMENDED')
      validateCadence(row.recommendedInterval, row.recommendedUnit)
    else if (row.recommendedInterval != null || row.recommendedUnit != null)
      throw new Error('Non-actionable recommendations cannot have intervals.')
    const sourceReferences = (
      Array.isArray(row.sourceReferences) ? row.sourceReferences : []
    )
      .slice(0, 10)
      .map((ref: any) => {
        if (ref.url && !/^https?:\/\//i.test(ref.url))
          throw new Error('Invalid source URL.')
        return {
          ...(ref.title ? { title: String(ref.title).slice(0, 300) } : {}),
          ...(ref.url ? { url: String(ref.url).slice(0, 2000) } : {}),
        }
      })
    return {
      activity: row.activity,
      recommendedInterval: row.recommendedInterval ?? null,
      recommendedUnit: row.recommendedUnit ?? null,
      confidence: row.confidence,
      rationale: row.rationale.slice(0, 4000),
      sourceReferences,
      applicability: row.applicability,
      ...(!hasRecipe && row.activity === 'FERTILIZING'
        ? {
            recommendedInterval: null,
            recommendedUnit: null,
            applicability: 'BLOCKED_BY_DEPENDENCY' as const,
            rationale:
              'Assign an active fertilizer recipe before researching a fertilizing cadence.',
          }
        : {}),
    }
  })
}

// Recover explicit values only. Broad care categories and ambiguous ranges were runtime guesses, not historical intervals.
export function explicitLegacyInterval(
  text: unknown
): { interval: number; unit: string } | null {
  if (
    typeof text !== 'string' ||
    /\d\s*(?:-|–|to)\s*\d|\d[.,]\d|\b(?:not|never)\b/i.test(text)
  )
    return null
  const match = text.match(
    /\b(?:every\s+)?(\d+)\s*(days?|weeks?|months?|years?)\b/i
  )
  if (!match) return null
  const value = {
    interval: Number(match[1]),
    unit: match[2].replace(/s$/i, '').toUpperCase(),
  }
  try {
    validateCadence(value.interval, value.unit)
    return value
  } catch {
    return null
  }
}
