export const PLANT_INSTANCE_HISTORICAL_CONSTITUENT = 'HISTORICAL_CONSTITUENT'

export const plantInstanceMergeReasons = [
  ['POTTED_TOGETHER', 'Potted together'],
  ['BASKET_COMBINATION', 'Basket combination'],
  ['REHABILITATION', 'Rehabilitation'],
  ['DISPLAY_PLANTING', 'Display planting'],
  ['SPACE_SAVING', 'Space saving'],
  ['EXPERIMENT', 'Experiment'],
  ['OTHER', 'Other'],
] as const

export const plantInstanceMergeReasonValues = new Set(plantInstanceMergeReasons.map(([value]) => value))

export function plantInstanceMergeReasonLabel(value: string) {
  return plantInstanceMergeReasons.find(([reason]) => reason === value)?.[1]
    || value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
}

export function isHistoricalConstituent(status: string) {
  return status === PLANT_INSTANCE_HISTORICAL_CONSTITUENT
}
