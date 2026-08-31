export const confidenceOptions = [
  ['CONFIRMED', 'Confirmed'],
  ['PROBABLE', 'Probable'],
  ['AI_DETERMINED', 'AI Determined'],
  ['UNCERTAIN', 'Uncertain'],
  ['TRADE_ASSUMED', 'Trade-assumed'],
  ['DISPUTED', 'Disputed'],
] as const

export const aliasTypeOptions = [
  ['SYNONYM', 'Synonym'],
  ['TRADE_NAME', 'Trade name'],
  ['OBSOLETE_TAXONOMY', 'Obsolete taxonomy'],
  ['COMMON_NAME', 'Common name'],
  ['MISAPPLIED_NAME', 'Misapplied name'],
  ['SHORTHAND', 'Shorthand'],
] as const

export const noSpeciesFilterToken = '__NONE__'

export type TaxonomyFilterDefinition = {
  genus?: string | null
  species?: string | null
}

export type TaxonomyFilterOption = {
  value: string
  label: string
  count: number
}

export function cleanTaxonomyFilter(value?: string | null) {
  return String(value || '').trim()
}

export function normalizeTaxonomyFilter(value?: string | null) {
  return cleanTaxonomyFilter(value).toLocaleLowerCase()
}

export function encodeSpeciesFilter(value?: string | null) {
  const clean = cleanTaxonomyFilter(value)
  return clean || noSpeciesFilterToken
}

export function decodeSpeciesFilter(value?: string | null) {
  const clean = cleanTaxonomyFilter(value)
  return clean === noSpeciesFilterToken ? noSpeciesFilterToken : clean
}

export function speciesFilterLabel(value: string) {
  if (value === noSpeciesFilterToken) return 'No species / genus-level cultivar'
  if (value.toLocaleLowerCase() === 'sp.') return 'sp. - species unknown'
  return value
}

function sortedOptions(options: TaxonomyFilterOption[]) {
  return options.sort((left, right) => left.label.localeCompare(right.label))
}

export function getAvailableGenera(definitions: TaxonomyFilterDefinition[]) {
  const options = new Map<string, TaxonomyFilterOption>()

  for (const definition of definitions) {
    const genus = cleanTaxonomyFilter(definition.genus)
    const key = normalizeTaxonomyFilter(genus)
    if (!key) continue
    const existing = options.get(key)
    if (existing) existing.count += 1
    else options.set(key, { value: genus, label: genus, count: 1 })
  }

  return sortedOptions([...options.values()])
}

export function getAvailableSpeciesForGenus(definitions: TaxonomyFilterDefinition[], genus: string) {
  const genusKey = normalizeTaxonomyFilter(genus)
  if (!genusKey) return []

  const options = new Map<string, TaxonomyFilterOption>()
  for (const definition of definitions) {
    if (normalizeTaxonomyFilter(definition.genus) !== genusKey) continue
    const value = encodeSpeciesFilter(definition.species)
    const existing = options.get(value)
    if (existing) existing.count += 1
    else options.set(value, { value, label: speciesFilterLabel(value), count: 1 })
  }

  return sortedOptions([...options.values()])
}

export function getSpeciesOptionsByGenus(definitions: TaxonomyFilterDefinition[]) {
  return Object.fromEntries(
    getAvailableGenera(definitions).map((genus) => [
      normalizeTaxonomyFilter(genus.value),
      getAvailableSpeciesForGenus(definitions, genus.value),
    ]),
  )
}

export function matchingRawGenera(definitions: TaxonomyFilterDefinition[], genus: string) {
  const genusKey = normalizeTaxonomyFilter(genus)
  const rawValues = new Set<string>()

  for (const definition of definitions) {
    if (!definition.genus) continue
    if (normalizeTaxonomyFilter(definition.genus) === genusKey) rawValues.add(definition.genus)
  }

  return [...rawValues]
}

export function matchingRawSpecies(definitions: TaxonomyFilterDefinition[], genus: string, species: string) {
  const genusKey = normalizeTaxonomyFilter(genus)
  const rawValues = new Set<string>()
  let includesNull = false

  for (const definition of definitions) {
    if (normalizeTaxonomyFilter(definition.genus) !== genusKey) continue
    if (encodeSpeciesFilter(definition.species) !== species) continue
    if (definition.species === null || definition.species === undefined) includesNull = true
    else rawValues.add(definition.species)
  }

  return { values: [...rawValues], includesNull }
}
