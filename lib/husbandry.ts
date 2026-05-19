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
  if (!values) return []
  return [
    values.summaryWater || values.wateringCadence,
    values.summaryLight || values.lightIntensity,
    values.summaryToxicity || toxicitySummary(values),
  ].filter(Boolean) as string[]
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
