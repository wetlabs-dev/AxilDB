export const husbandryFieldNames = [
  'summaryWater',
  'summaryLight',
  'summaryToxicity',
  'summaryCare',
  'wateringCadence',
  'wateringMoistureLevel',
  'wateringDroughtTolerance',
  'wateringCycleNotes',
  'wateringSeasonalAdjustments',
  'lightIntensity',
  'lightDuration',
  'temperatureUsdaZone',
  'temperatureColdTolerance',
  'temperatureHeatTolerance',
  'temperatureFrostSensitivity',
  'temperatureOverwinterInstructions',
  'humidityRange',
  'humidityDryAirTolerance',
  'humidityMistingNotes',
  'mediumPreferred',
  'mediumPh',
  'mediumDrainage',
  'mediumHabit',
  'mediumRecipeNotes',
  'fertilizationType',
  'fertilizationStrength',
  'fertilizationFrequency',
  'fertilizationSeasonalSchedule',
  'fertilizationMicronutrientNotes',
  'repottingInterval',
  'repottingPotType',
  'repottingRootSensitivity',
  'repottingDormancyConsideration',
  'repottingDivisionGuidance',
  'propagationMethods',
  'propagationDifficulty',
  'propagationExpectedSuccess',
  'propagationOptimalTiming',
  'propagationRootingHormoneNotes',
  'propagationTissueCultureNotes',
  'pestsCommon',
  'diseasesCommon',
  'treatmentNotes',
  'susceptibilityLevel',
  'preventativePractices',
  'toxicityPets',
  'toxicityHumans',
  'toxicitySapIrritant',
  'toxicityEdible',
  'dormancyBehavior',
  'bloomSeason',
  'bloomDuration',
  'bloomFragrance',
  'bloomRebloomTendency',
  'bloomTriggers',
  'bloomPollinatorNotes',
  'growthHabit',
  'rarity',
  'conservationStatus',
  'conservationLinks',
  'protectedSpeciesNotes',
  'collectionRestrictions',
  'importExportConcerns',
  'invasiveness',
  'nativeRangeNotes',
] as const

export type HusbandryFieldName = (typeof husbandryFieldNames)[number]
export type HusbandryValues = Partial<Record<HusbandryFieldName, string | null>>
export type HusbandrySummaryField = 'summaryWater' | 'summaryLight' | 'summaryToxicity'
export type HusbandrySummaryTone = 'blue' | 'green' | 'red' | 'yellow'

export const husbandrySummaryChoices: Record<
  HusbandrySummaryField,
  Array<{ value: string; label: string; description: string; tone: HusbandrySummaryTone }>
> = {
  summaryWater: [
    {
      value: 'Water frequently',
      label: 'Water frequently',
      description: 'Consistently moist or high-demand plants.',
      tone: 'blue',
    },
    {
      value: 'Keep evenly moist',
      label: 'Keep evenly moist',
      description: 'Do not let the medium fully dry.',
      tone: 'blue',
    },
    {
      value: 'Moderate water',
      label: 'Moderate water',
      description: 'Regular watering with some drying between.',
      tone: 'green',
    },
    {
      value: 'Dry before watering',
      label: 'Dry before watering',
      description: 'Let the medium dry down first.',
      tone: 'red',
    },
    {
      value: 'Water sparingly',
      label: 'Water sparingly',
      description: 'Low-water or drought-tolerant care.',
      tone: 'red',
    },
  ],
  summaryLight: [
    {
      value: 'Full sun',
      label: 'Full sun',
      description: 'Bright direct sun for much of the day.',
      tone: 'yellow',
    },
    {
      value: 'Bright direct light',
      label: 'Bright direct light',
      description: 'Strong direct window or outdoor light.',
      tone: 'yellow',
    },
    {
      value: 'Bright indirect light',
      label: 'Bright indirect light',
      description: 'Bright filtered light without harsh direct sun.',
      tone: 'green',
    },
    {
      value: 'Moderate indirect light',
      label: 'Moderate indirect light',
      description: 'Steady room light or part shade.',
      tone: 'green',
    },
    {
      value: 'Low light',
      label: 'Low light',
      description: 'Tolerates lower light, usually slower growth.',
      tone: 'red',
    },
  ],
  summaryToxicity: [
    {
      value: 'Extremely toxic',
      label: 'Extremely toxic',
      description: 'Keep away from pets and people.',
      tone: 'red',
    },
    {
      value: 'Toxic if ingested',
      label: 'Toxic if ingested',
      description: 'Unsafe to eat; keep out of reach.',
      tone: 'red',
    },
    {
      value: 'Mildly toxic / irritant',
      label: 'Mildly toxic / irritant',
      description: 'May irritate skin, mouth, or stomach.',
      tone: 'yellow',
    },
    {
      value: 'Unknown / verify',
      label: 'Unknown / verify',
      description: 'Treat cautiously until confirmed.',
      tone: 'yellow',
    },
    {
      value: 'Generally regarded safe',
      label: 'Generally regarded safe',
      description: 'No common toxicity concern known.',
      tone: 'green',
    },
  ],
}

export function isHusbandrySummaryChoiceField(field: HusbandryFieldName): field is HusbandrySummaryField {
  return field === 'summaryWater' || field === 'summaryLight' || field === 'summaryToxicity'
}

export const husbandrySections: Array<{
  key: string
  title: string
  fields: Array<[HusbandryFieldName, string, string?]>
}> = [
  {
    key: 'summary',
    title: 'Quick summary',
    fields: [
      ['summaryWater', 'Water'],
      ['summaryLight', 'Light'],
      ['summaryToxicity', 'Toxicity'],
      ['summaryCare', 'Care notes'],
    ],
  },
  {
    key: 'watering',
    title: 'Watering',
    fields: [
      ['wateringCadence', 'Cadence'],
      ['wateringMoistureLevel', 'Moisture level'],
      ['wateringDroughtTolerance', 'Drought tolerance'],
      ['wateringCycleNotes', 'Wet/dry cycle notes'],
      ['wateringSeasonalAdjustments', 'Seasonal adjustments'],
    ],
  },
  {
    key: 'light',
    title: 'Light',
    fields: [
      ['lightIntensity', 'Intensity'],
      ['lightDuration', 'Duration'],
    ],
  },
  {
    key: 'temperature',
    title: 'Temperature and hardiness',
    fields: [
      ['temperatureUsdaZone', 'USDA zone'],
      ['temperatureColdTolerance', 'Cold tolerance'],
      ['temperatureHeatTolerance', 'Heat tolerance'],
      ['temperatureFrostSensitivity', 'Frost sensitivity'],
      ['temperatureOverwinterInstructions', 'Overwinter instructions'],
    ],
  },
  {
    key: 'humidity',
    title: 'Humidity',
    fields: [
      ['humidityRange', 'Range'],
      ['humidityDryAirTolerance', 'Dry air tolerance'],
      ['humidityMistingNotes', 'Misting notes'],
    ],
  },
  {
    key: 'medium',
    title: 'Soil and medium',
    fields: [
      ['mediumPreferred', 'Preferred medium'],
      ['mediumPh', 'pH preference'],
      ['mediumDrainage', 'Drainage needs'],
      ['mediumHabit', 'Growth substrate habit'],
      ['mediumRecipeNotes', 'Substrate recipe notes'],
    ],
  },
  {
    key: 'fertilization',
    title: 'Fertilization',
    fields: [
      ['fertilizationType', 'Type'],
      ['fertilizationStrength', 'Strength'],
      ['fertilizationFrequency', 'Frequency'],
      ['fertilizationSeasonalSchedule', 'Seasonal schedule'],
      ['fertilizationMicronutrientNotes', 'Micronutrient notes'],
    ],
  },
  {
    key: 'repotting',
    title: 'Repotting',
    fields: [
      ['repottingInterval', 'Interval'],
      ['repottingPotType', 'Pot type'],
      ['repottingRootSensitivity', 'Root sensitivity'],
      ['repottingDormancyConsideration', 'Dormancy consideration'],
      ['repottingDivisionGuidance', 'Division guidance'],
    ],
  },
  {
    key: 'propagation',
    title: 'Propagation',
    fields: [
      ['propagationMethods', 'Preferred methods'],
      ['propagationDifficulty', 'Difficulty'],
      ['propagationExpectedSuccess', 'Expected success'],
      ['propagationOptimalTiming', 'Optimal timing'],
      ['propagationRootingHormoneNotes', 'Rooting hormone notes'],
      ['propagationTissueCultureNotes', 'Tissue culture notes'],
    ],
  },
  {
    key: 'pests',
    title: 'Pests and disease',
    fields: [
      ['pestsCommon', 'Common pests'],
      ['diseasesCommon', 'Common diseases'],
      ['treatmentNotes', 'Treatment notes'],
      ['susceptibilityLevel', 'Susceptibility level'],
      ['preventativePractices', 'Preventative practices'],
    ],
  },
  {
    key: 'toxicity',
    title: 'Toxicity',
    fields: [
      ['toxicityPets', 'Pets'],
      ['toxicityHumans', 'Humans'],
      ['toxicitySapIrritant', 'Sap irritant'],
      ['toxicityEdible', 'Edible?'],
    ],
  },
  {
    key: 'bloom',
    title: 'Dormancy and blooms',
    fields: [
      ['dormancyBehavior', 'Dormancy behavior'],
      ['bloomSeason', 'Typical bloom season'],
      ['bloomDuration', 'Bloom duration'],
      ['bloomFragrance', 'Fragrance'],
      ['bloomRebloomTendency', 'Rebloom tendency'],
      ['bloomTriggers', 'Bloom triggers'],
      ['bloomPollinatorNotes', 'Pollinator notes'],
    ],
  },
  {
    key: 'growth',
    title: 'Growth habit',
    fields: [['growthHabit', 'Growth habit']],
  },
  {
    key: 'conservation',
    title: 'Conservation and collection status',
    fields: [
      ['rarity', 'Rarity'],
      ['conservationStatus', 'Conservation status'],
      ['conservationLinks', 'Reference links'],
      ['protectedSpeciesNotes', 'Protected species notes'],
      ['collectionRestrictions', 'Collection restrictions'],
      ['importExportConcerns', 'Import/export concerns'],
      ['invasiveness', 'Invasiveness'],
      ['nativeRangeNotes', 'Native range notes'],
    ],
  },
]

export function husbandryFormValues(formData: FormData) {
  return Object.fromEntries(
    husbandryFieldNames.map((field) => {
      const value = String(formData.get(field) || '').trim()
      return [field, value || null]
    }),
  ) as Record<HusbandryFieldName, string | null>
}

export function husbandrySummary(values?: HusbandryValues | null) {
  return husbandrySummaryItems(values).map((item) => item.label)
}

export function husbandrySummaryItems(values?: HusbandryValues | null) {
  if (!values) return []
  const items = [
    summaryItem('summaryWater', values.summaryWater || values.wateringCadence),
    summaryItem('summaryLight', values.summaryLight || values.lightIntensity),
    summaryItem('summaryToxicity', values.summaryToxicity || toxicitySummary(values)),
  ].filter(Boolean)
  return items as Array<{ field: HusbandrySummaryField; label: string; tone: HusbandrySummaryTone }>
}

function summaryItem(field: HusbandrySummaryField, value?: string | null) {
  const label = String(value || '').trim()
  if (!label) return null
  const choice = husbandrySummaryChoices[field].find((option) => option.value.toLowerCase() === label.toLowerCase())
  return {
    field,
    label: choice?.value || label,
    tone: choice?.tone || inferSummaryTone(field, label),
  }
}

function inferSummaryTone(field: HusbandrySummaryField, label: string): HusbandrySummaryTone {
  const value = label.toLowerCase()
  if (field === 'summaryWater') {
    if (/(sparingly|dry|drought|low water|let dry|dry down)/.test(value)) return 'red'
    if (/(frequent|heavy|moist|soggy|wet|evenly)/.test(value)) return 'blue'
    return 'green'
  }
  if (field === 'summaryLight') {
    if (/(full sun|direct|high light|bright direct)/.test(value)) return 'yellow'
    if (/(low|shade|dim)/.test(value)) return 'red'
    return 'green'
  }
  if (/(non-toxic|nontoxic|safe|regarded safe)/.test(value)) return 'green'
  if (/(mild|irritant|caution|unknown|verify|low known)/.test(value)) return 'yellow'
  if (/(toxic|poison|danger|fatal)/.test(value)) return 'red'
  return 'yellow'
}

export function toxicitySummary(values?: HusbandryValues | null) {
  if (!values) return null
  const parts = [
    values.toxicityPets ? `Pets: ${values.toxicityPets}` : null,
    values.toxicityHumans ? `Humans: ${values.toxicityHumans}` : null,
    values.toxicitySapIrritant ? `Sap: ${values.toxicitySapIrritant}` : null,
    values.toxicityEdible ? `Edible: ${values.toxicityEdible}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export function hasHusbandryData(values?: HusbandryValues | null) {
  return !!values && husbandryFieldNames.some((field) => Boolean(values[field]))
}

export function mergeHusbandryValues(base?: HusbandryValues | null, override?: HusbandryValues | null) {
  const merged: HusbandryValues = {}
  for (const field of husbandryFieldNames) merged[field] = override?.[field] || base?.[field] || null
  return merged
}

export function husbandryDifferences(base?: HusbandryValues | null, override?: HusbandryValues | null) {
  if (!base || !override) return new Set<string>()
  return new Set(
    husbandryFieldNames.filter((field) => {
      const local = String(override[field] || '').trim()
      if (!local) return false
      return local !== String(base[field] || '').trim()
    }),
  )
}
