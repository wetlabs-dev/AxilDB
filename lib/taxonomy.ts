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
