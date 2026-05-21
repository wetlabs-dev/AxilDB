export const LABEL_WIDTH_IN = 2.25
export const LABEL_HEIGHT_IN = 1.25
export const POINTS_PER_INCH = 72
export const LABEL_WIDTH_PT = LABEL_WIDTH_IN * POINTS_PER_INCH
export const LABEL_HEIGHT_PT = LABEL_HEIGHT_IN * POINTS_PER_INCH

type LabelDefinition = {
  genus: string | null
  species: string | null
  cultivarName?: string | null
}

export function plantLabelNameLines(definition: LabelDefinition) {
  const genus = (definition.genus || '').trim()
  const species = (definition.species || '').trim()
  const cultivar = (definition.cultivarName || '').trim()
  return [genus, species, cultivar ? `'${cultivar}'` : ''].filter(Boolean)
}

export function approximatePreviewFontSize(lines: string[], maxSize: number, minSize: number, maxChars: number) {
  const longest = Math.max(...lines.map((line) => line.length), 1)
  const charAdjusted = Math.floor(maxSize * Math.min(1, maxChars / longest))
  const lineAdjusted = lines.length >= 3 ? Math.min(charAdjusted, 22) : charAdjusted
  return Math.max(minSize, Math.min(maxSize, lineAdjusted))
}
