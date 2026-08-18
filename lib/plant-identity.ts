function text(value?: string | null) {
  return String(value || '').trim()
}

function provisionalParts(provisionalTaxon: string) {
  const words = provisionalTaxon
    .replace(/[×'"()[\],]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z.-]/g, ''))
    .filter(Boolean)
  const genus = words[0] && /^[A-Za-z]/.test(words[0])
    ? words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase()
    : 'Unidentified'
  const possibleSpecies = words[1]?.toLowerCase()
  const species = possibleSpecies && /^[a-z][a-z.-]+$/.test(possibleSpecies) ? possibleSpecies : 'sp.'
  return { genus, species }
}

function placeholderIdentity(genus: string, species: string) {
  return genus.toLowerCase() === 'unidentified' || ['sp', 'sp.', 'unknown', 'unidentified'].includes(species.toLowerCase())
}

export function normalizePlantDefinitionIdentity(input: {
  genus?: string | null
  species?: string | null
  cultivarName?: string | null
  provisionalTaxon?: string | null
}) {
  const provisionalTaxon = text(input.provisionalTaxon) || null
  let genus = text(input.genus)
  let species = text(input.species).toLowerCase()
  const cultivarName = text(input.cultivarName)

  if (provisionalTaxon) {
    const fallback = provisionalParts(provisionalTaxon)
    genus ||= fallback.genus
    species ||= fallback.species
    return { genus, species, provisionalTaxon, identificationStatus: 'PROVISIONAL' as const }
  }

  if (genus.toLowerCase() !== 'unidentified' && ['sp', 'sp.'].includes(species) && cultivarName) {
    return { genus, species: 'sp.', provisionalTaxon: null, identificationStatus: 'PROVISIONAL' as const }
  }

  if (!genus || !species || placeholderIdentity(genus, species)) {
    throw new Error('Enter genus and species, use sp. with a named cultivar, or provide a provisional taxon that clearly marks this definition for identification review.')
  }
  return { genus, species, provisionalTaxon: null, identificationStatus: 'IDENTIFIED' as const }
}
