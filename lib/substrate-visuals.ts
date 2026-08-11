import type { CSSProperties } from 'react'

export const substrateDisplayPatterns = [
  'NONE', 'DIAGONAL', 'DIAGONAL_REVERSE', 'DOTS', 'CROSSHATCH',
  'VERTICAL', 'HORIZONTAL', 'GRID', 'WAVES', 'SPECKLED',
] as const

export type SubstrateDisplayPattern = typeof substrateDisplayPatterns[number]

export type SubstrateVisualSource = {
  id?: string | null
  slug?: string | null
  starterKey?: string | null
  name: string
  displayColor?: string | null
  displayPattern?: string | null
  shortLabel?: string | null
  visualFamily?: string | null
}

export type SubstrateVisual = { color: string; pattern: SubstrateDisplayPattern; shortLabel: string; family: string }

const palette = ['#6F8F72', '#A56E58', '#668D98', '#A68A4B', '#796F9B', '#7F786B', '#A56F86', '#5F887F']
const fallbackPatterns: SubstrateDisplayPattern[] = ['DIAGONAL', 'DOTS', 'CROSSHATCH', 'VERTICAL', 'GRID', 'SPECKLED']

export const starterSubstrateVisuals: Record<string, SubstrateVisual> = {
  'coco-coir': { color: '#9A7252', pattern: 'HORIZONTAL', shortLabel: 'Coco', family: 'COIR' },
  'sphagnum-bulk': { color: '#7D8956', pattern: 'DIAGONAL', shortLabel: 'Bulk sphagnum', family: 'SPHAGNUM' },
  'sphagnum-premium': { color: '#7D8956', pattern: 'CROSSHATCH', shortLabel: 'Premium sphagnum', family: 'SPHAGNUM' },
  'perlite-fine': { color: '#C7CBC4', pattern: 'DOTS', shortLabel: 'Fine perlite', family: 'PERLITE' },
  'perlite-coarse': { color: '#C7CBC4', pattern: 'DIAGONAL', shortLabel: 'Coarse perlite', family: 'PERLITE' },
  pumice: { color: '#7D9095', pattern: 'SPECKLED', shortLabel: 'Pumice', family: 'PUMICE' },
  'lava-crushed': { color: '#835348', pattern: 'SPECKLED', shortLabel: 'Crushed lava', family: 'LAVA_ROCK' },
  'lava-chunky': { color: '#835348', pattern: 'GRID', shortLabel: 'Chunky lava', family: 'LAVA_ROCK' },
  'succulent-mix': { color: '#9A8A6D', pattern: 'CROSSHATCH', shortLabel: 'Succulent mix', family: 'SOIL_MIX' },
  'african-violet-mix': { color: '#82718D', pattern: 'DOTS', shortLabel: 'Violet mix', family: 'SOIL_MIX' },
  'orchid-bark-medium': { color: '#78553D', pattern: 'DIAGONAL', shortLabel: 'Medium bark', family: 'BARK' },
  'orchid-bark-fine': { color: '#78553D', pattern: 'DOTS', shortLabel: 'Fine bark', family: 'BARK' },
  'worm-castings': { color: '#51463D', pattern: 'SPECKLED', shortLabel: 'Castings', family: 'AMENDMENT' },
  'silica-sand-coarse': { color: '#B79A5F', pattern: 'HORIZONTAL', shortLabel: 'Coarse sand', family: 'SAND' },
  leca: { color: '#AD6849', pattern: 'GRID', shortLabel: 'LECA', family: 'SEMI_HYDRO' },
}

function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  return result >>> 0
}

export function substrateVisualDefaults(source: SubstrateVisualSource): SubstrateVisual {
  const starter = source.starterKey ? starterSubstrateVisuals[source.starterKey] : undefined
  if (starter) return starter
  const value = hash(source.slug || source.id || source.name.toLowerCase())
  return {
    color: palette[value % palette.length],
    pattern: fallbackPatterns[Math.floor(value / palette.length) % fallbackPatterns.length],
    shortLabel: source.name.length > 22 ? `${source.name.slice(0, 20).trim()}...` : source.name,
    family: 'CUSTOM',
  }
}

export function resolveSubstrateVisual(source: SubstrateVisualSource): SubstrateVisual {
  const fallback = substrateVisualDefaults(source)
  return {
    color: /^#[0-9a-f]{6}$/i.test(source.displayColor || '') ? source.displayColor!.toUpperCase() : fallback.color,
    pattern: substrateDisplayPatterns.includes(source.displayPattern as SubstrateDisplayPattern) ? source.displayPattern as SubstrateDisplayPattern : fallback.pattern,
    shortLabel: source.shortLabel?.trim() || fallback.shortLabel,
    family: source.visualFamily?.trim() || fallback.family,
  }
}

export function substratePatternStyle(color: string, pattern: SubstrateDisplayPattern) {
  const light = 'rgba(255,255,255,.38)'
  const dark = 'rgba(24,32,26,.24)'
  const styles: Record<SubstrateDisplayPattern, CSSProperties> = {
    NONE: { backgroundColor: color },
    DIAGONAL: { backgroundColor: color, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 6px, ${light} 6px 8px)`, backgroundSize: '12px 12px' },
    DIAGONAL_REVERSE: { backgroundColor: color, backgroundImage: `repeating-linear-gradient(-45deg, transparent 0 6px, ${light} 6px 8px)`, backgroundSize: '12px 12px' },
    DOTS: { backgroundColor: color, backgroundImage: `radial-gradient(${dark} 1.5px, transparent 1.5px)`, backgroundSize: '7px 7px' },
    CROSSHATCH: { backgroundColor: color, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 7px, ${light} 7px 8px), repeating-linear-gradient(-45deg, transparent 0 7px, ${dark} 7px 8px)`, backgroundSize: '12px 12px' },
    VERTICAL: { backgroundColor: color, backgroundImage: `repeating-linear-gradient(90deg, transparent 0 6px, ${light} 6px 8px)`, backgroundSize: '12px 12px' },
    HORIZONTAL: { backgroundColor: color, backgroundImage: `repeating-linear-gradient(0deg, transparent 0 6px, ${light} 6px 8px)`, backgroundSize: '12px 12px' },
    GRID: { backgroundColor: color, backgroundImage: `linear-gradient(${light} 1px, transparent 1px), linear-gradient(90deg, ${dark} 1px, transparent 1px)`, backgroundSize: '8px 8px' },
    WAVES: { backgroundColor: color, backgroundImage: `repeating-radial-gradient(ellipse at 0 0, transparent 0 5px, ${light} 6px 7px, transparent 8px 12px)`, backgroundSize: '18px 12px' },
    SPECKLED: { backgroundColor: color, backgroundImage: `radial-gradient(${light} 1px, transparent 1px), radial-gradient(${dark} 1px, transparent 1px)`, backgroundPosition: '0 0, 4px 5px', backgroundSize: '9px 9px' },
  }
  return styles[pattern]
}

export const substrateNeutralVisuals = {
  RECEIVED_SUBSTRATE: { color: '#A79A83', pattern: 'DIAGONAL' as const, label: 'Received Substrate' },
  UNKNOWN: { color: '#8A8D89', pattern: 'CROSSHATCH' as const, label: 'Unknown' },
  CUSTOM_MIX: { color: '#778087', pattern: 'SPECKLED' as const, label: 'Custom / Unknown Mix' },
}
