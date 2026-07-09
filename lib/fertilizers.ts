import { plantName } from '@/lib/utils'

export const fertilizerProductTypes = [
  ['LIQUID', 'Liquid concentrate'],
  ['GRANULAR', 'Granular'],
  ['SLOW_RELEASE', 'Slow release'],
  ['ORGANIC', 'Organic'],
  ['MICRONUTRIENT', 'Micronutrient'],
  ['SUPPLEMENT', 'Supplement'],
  ['OTHER', 'Other'],
] as const

export const fertilizerApplicationMethods = [
  ['ROOT_DRENCH', 'Root drench'],
  ['FOLIAR', 'Foliar spray'],
  ['TOP_DRESS', 'Top dress'],
  ['SLOW_RELEASE', 'Slow release'],
  ['RESERVOIR', 'Reservoir'],
  ['OTHER', 'Other'],
] as const

export const fertilizerPrimaryNutrients = [
  ['nitrogen', 'Nitrogen (N)'],
  ['phosphorus', 'Phosphorus (P)'],
  ['potassium', 'Potassium (K)'],
] as const

export const fertilizerSecondaryNutrients = [
  ['calcium', 'Calcium (Ca)'],
  ['magnesium', 'Magnesium (Mg)'],
  ['sulfur', 'Sulfur (S)'],
] as const

export const fertilizerMicronutrients = [
  ['iron', 'Iron (Fe)'],
  ['manganese', 'Manganese (Mn)'],
  ['zinc', 'Zinc (Zn)'],
  ['copper', 'Copper (Cu)'],
  ['boron', 'Boron (B)'],
  ['molybdenum', 'Molybdenum (Mo)'],
  ['chlorine', 'Chlorine (Cl)'],
  ['nickel', 'Nickel (Ni)'],
  ['silicon', 'Silicon (Si)'],
] as const

export const fertilizerConfidenceOptions = [
  ['USER_ENTERED', 'User entered'],
  ['AI_DRAFT', 'AI draft'],
  ['VERIFIED', 'Verified'],
  ['UNCERTAIN', 'Uncertain'],
] as const

export function labelizeFertilizerValue(value?: string | null) {
  return (value || 'OTHER')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function npkLabel(item?: { nitrogen?: any; phosphorus?: any; potassium?: any } | null) {
  if (!item) return null
  const values = [item.nitrogen, item.phosphorus, item.potassium].map((value) => {
    if (value == null) return null
    const number = Number(value)
    if (!Number.isFinite(number)) return null
    return Number.isInteger(number) ? String(number) : String(number).replace(/\.0+$/, '')
  })
  return values.every(Boolean) ? `${values[0]}-${values[1]}-${values[2]}` : null
}

export function percentLabel(value: any) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return `${Number.isInteger(number) ? number : String(number).replace(/\.0+$/, '')}%`
}

export function guaranteedAnalysisSummary(product?: any | null) {
  if (!product) return ''
  const nutrients = [
    ['N', product.nitrogen],
    ['P', product.phosphorus],
    ['K', product.potassium],
    ['Ca', product.calcium],
    ['Mg', product.magnesium],
    ['S', product.sulfur],
    ['Fe', product.iron],
    ['Mn', product.manganese],
    ['Zn', product.zinc],
    ['Cu', product.copper],
    ['B', product.boron],
    ['Mo', product.molybdenum],
    ['Cl', product.chlorine],
    ['Ni', product.nickel],
    ['Si', product.silicon],
  ]
    .map(([label, value]) => percentLabel(value) ? `${label} ${percentLabel(value)}` : null)
    .filter(Boolean)
  return nutrients.join(' · ')
}

export function manufacturerFeedRateLabel(product?: any | null) {
  if (!product) return ''
  const amount = [product.manufacturerFeedAmount, product.manufacturerFeedUnit].filter(Boolean).join(' ')
  const water = [product.manufacturerFeedWaterVolume, product.manufacturerFeedWaterUnit].filter(Boolean).join(' ')
  const ratio = amount && water ? `${amount} per ${water}` : product.defaultDilution || ''
  return [ratio, product.manufacturerFeedNotes].filter(Boolean).join(' · ')
}

export function recipeNpkLabel(recipe?: { declaredNpk?: string | null; calculatedNpk?: string | null } | null) {
  return recipe?.declaredNpk || recipe?.calculatedNpk || null
}

export function fertilizerRecipeSummary(recipe?: any | null) {
  if (!recipe) return ''
  return [
    recipeNpkLabel(recipe),
    recipe.applicationMethod ? labelizeFertilizerValue(recipe.applicationMethod) : null,
    recipe.strengthLabel,
    recipe.dilutionInstructions,
    recipe.frequencyDays ? `every ${recipe.frequencyDays} days` : recipe.frequencyNotes,
  ].filter(Boolean).join(' · ')
}

export function parseFertilizationCadenceDays(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
    const text = String(value || '').toLowerCase()
    if (!text) continue
    const dayMatch = text.match(/(?:every|each|q)\s*(\d{1,3})\s*(?:day|d)\b/)
    if (dayMatch) return Math.max(1, Math.min(365, Number(dayMatch[1])))
    const weekMatch = text.match(/(?:every|each|q)\s*(\d{1,2})\s*(?:week|wk|w)\b/)
    if (weekMatch) return Math.max(1, Math.min(365, Number(weekMatch[1]) * 7))
    if (text.includes('weekly')) return 7
    if (text.includes('biweekly') || text.includes('every other week')) return 14
    if (text.includes('monthly')) return 30
    if (text.includes('quarterly')) return 90
    if (text.includes('seasonally')) return 120
  }
  return null
}

export function effectiveFertilizerAssignment(base?: any | null, override?: any | null) {
  if (override?.fertilizationPaused) {
    return { paused: true, recipe: null, cadenceDays: null, source: 'override' as const }
  }
  const overrideHasRecipe = Boolean(override?.fertilizerRecipe)
  const recipe = overrideHasRecipe ? override.fertilizerRecipe : base?.fertilizerRecipe || null
  const cadenceDays = parseFertilizationCadenceDays(
    override?.fertilizationCadenceDays,
    override?.fertilizationFrequency,
    base?.fertilizationCadenceDays,
    recipe?.frequencyDays,
    base?.fertilizationFrequency,
    recipe?.frequencyNotes,
  )
  return {
    paused: Boolean(base?.fertilizationPaused),
    recipe,
    cadenceDays,
    source: overrideHasRecipe || override?.fertilizationCadenceDays || override?.fertilizationFrequency ? 'override' as const : 'definition' as const,
  }
}

export function recipeAiContext(recipe: any) {
  return {
    id: recipe.id,
    name: recipe.name,
    npk: recipeNpkLabel(recipe),
    products: (recipe.products || []).map((row: any) => ({
      name: row.product?.name,
      brand: row.product?.brand,
      npk: npkLabel(row.product),
      guaranteedAnalysis: guaranteedAnalysisSummary(row.product),
      manufacturerFeedRate: manufacturerFeedRateLabel(row.product),
      amount: row.amount,
      unit: row.unit,
      notes: row.notes,
    })).filter((row: any) => row.name),
    applicationMethod: recipe.applicationMethod,
    dilutionOrStrength: [recipe.dilutionInstructions, recipe.strengthLabel].filter(Boolean).join(' · ') || null,
    frequency: recipe.frequencyDays ? `Every ${recipe.frequencyDays} days` : recipe.frequencyNotes,
    seasonalNotes: recipe.seasonalNotes,
    notes: recipe.notes,
  }
}

export function plantFertilizerDisplayName(definition: any) {
  return plantName(definition)
}
