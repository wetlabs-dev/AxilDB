export const LABEL_WIDTH_IN = 2.25
export const LABEL_HEIGHT_IN = 1.25
export const POINTS_PER_INCH = 72
export const LABEL_WIDTH_PT = LABEL_WIDTH_IN * POINTS_PER_INCH
export const LABEL_HEIGHT_PT = LABEL_HEIGHT_IN * POINTS_PER_INCH
export const LETTER_WIDTH_PT = 8.5 * POINTS_PER_INCH
export const LETTER_HEIGHT_PT = 11 * POINTS_PER_INCH
export const BROTHER_DK_2210_WIDTH_PT = (1 + 1 / 7) * POINTS_PER_INCH

export type LabelFormat = 'fixed' | 'sheet' | 'brother-dk-2210'
export type LabelOrientation = 'portrait' | 'landscape'

export function defaultLabelOrientation(format: LabelFormat): LabelOrientation {
  return format === 'fixed' ? 'landscape' : 'portrait'
}

export function labelOrientationFromValue(value: string | null, format: LabelFormat): LabelOrientation {
  if (value === 'portrait' || value === 'landscape') return value
  return defaultLabelOrientation(format)
}

export function orientSize(width: number, height: number, orientation: LabelOrientation): [number, number] {
  return orientation === 'landscape'
    ? [Math.max(width, height), Math.min(width, height)]
    : [Math.min(width, height), Math.max(width, height)]
}

type LabelDefinition = {
  genus: string | null
  hybridNotation?: string | null
  species: string | null
  cultivarName?: string | null
}

export function plantLabelNameLines(definition: LabelDefinition) {
  const genus = (definition.genus || '').trim()
  const hybrid = (definition.hybridNotation || '').trim()
  const species = (definition.species || '').trim()
  const cultivar = (definition.cultivarName || '').trim()
  return [genus, hybrid, species, cultivar ? `'${cultivar}'` : ''].filter(Boolean)
}

export function approximatePreviewFontSize(lines: string[], maxSize: number, minSize: number, maxChars: number) {
  const longest = Math.max(...lines.map((line) => line.length), 1)
  const charAdjusted = Math.floor(maxSize * Math.min(1, maxChars / longest))
  const lineAdjusted = lines.length >= 3 ? Math.min(charAdjusted, 22) : charAdjusted
  return Math.max(minSize, Math.min(maxSize, lineAdjusted))
}
