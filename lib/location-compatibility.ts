import type { PrismaClient } from '@prisma/client'

export const locationEnvironmentFields = [
  'temperatureMinC', 'temperatureMaxC', 'nighttimeTemperatureMinC', 'nighttimeTemperatureMaxC',
  'humidityMinPercent', 'humidityMaxPercent', 'lightLevel', 'lightExposure', 'lightMinLux', 'lightMaxLux',
  'photoperiodHours', 'airflowLevel', 'environmentStability', 'supplementalLight', 'supplementalLightType',
  'supplementalHeat', 'humidification', 'dehumidification', 'activeAirflow', 'nearWindow', 'nearHvacVent',
  'enclosed', 'seasonalVariationNotes', 'measurementSource', 'measuredAt', 'confidence', 'notes',
] as const

export type LocationEnvironmentField = typeof locationEnvironmentFields[number]
export type CompatibilityStatus = 'GOOD_MATCH' | 'CAUTION' | 'POOR_MATCH' | 'INSUFFICIENT_DATA'
export type CheckStatus = 'MATCH' | 'CAUTION' | 'CONFLICT' | 'UNKNOWN'

export type EffectiveEnvironmentValue = {
  value: unknown
  sourceLocationId: string
  sourceLocationName: string
  sourceLocationCode: string
  inherited: boolean
}

export type EffectiveLocationEnvironment = {
  locationId: string
  locationName: string
  values: Partial<Record<LocationEnvironmentField, EffectiveEnvironmentValue>>
  localProfile: Record<string, unknown> | null
  completeness: 'COMPLETE' | 'PARTIAL' | 'NOT_CONFIGURED'
  measuredAt: Date | null
  stale: boolean
}

export type PlantEnvironmentRequirements = {
  source: 'INSTANCE_OVERRIDE' | 'LOCAL_DEFINITION' | 'LINKED_DEFINITION' | 'VALIDATED_DEFINITION' | 'UNKNOWN'
  sourceLabel: string
  temperatureMinC: number | null
  temperatureMaxC: number | null
  nighttimeTemperatureMinC: number | null
  nighttimeTemperatureMaxC: number | null
  humidityMinPercent: number | null
  humidityMaxPercent: number | null
  lightLevel: string | null
  lightExposure: string | null
  lightMinLux: number | null
  lightMaxLux: number | null
  photoperiodMinHours: number | null
  photoperiodMaxHours: number | null
  airflowLevel: string | null
  environmentStability: string | null
  avoidDrafts: boolean | null
  seasonalNotes: string | null
}

export type CompatibilityCheck = {
  category: string
  status: CheckStatus
  plantRequirement: string
  locationValue: string
  explanation: string
  severity: 'INFO' | 'WARNING' | 'HIGH'
}

export type CompatibilityResult = {
  overallStatus: CompatibilityStatus
  checks: CompatibilityCheck[]
  summary: string
  missingData: string[]
}

const requirementFields = [
  'environmentTemperatureMinC', 'environmentTemperatureMaxC', 'environmentNightTemperatureMinC',
  'environmentNightTemperatureMaxC', 'environmentHumidityMinPercent', 'environmentHumidityMaxPercent',
  'environmentLightLevel', 'environmentLightExposure', 'environmentLightMinLux', 'environmentLightMaxLux',
  'environmentPhotoperiodMinHours', 'environmentPhotoperiodMaxHours', 'environmentAirflowLevel',
  'environmentStability', 'environmentAvoidDrafts', 'environmentSeasonalNotes',
] as const

function numeric(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requirementValues(value: any, source: PlantEnvironmentRequirements['source'], sourceLabel: string): PlantEnvironmentRequirements {
  return {
    source,
    sourceLabel,
    temperatureMinC: numeric(value?.environmentTemperatureMinC),
    temperatureMaxC: numeric(value?.environmentTemperatureMaxC),
    nighttimeTemperatureMinC: numeric(value?.environmentNightTemperatureMinC),
    nighttimeTemperatureMaxC: numeric(value?.environmentNightTemperatureMaxC),
    humidityMinPercent: numeric(value?.environmentHumidityMinPercent),
    humidityMaxPercent: numeric(value?.environmentHumidityMaxPercent),
    lightLevel: value?.environmentLightLevel || null,
    lightExposure: value?.environmentLightExposure || null,
    lightMinLux: numeric(value?.environmentLightMinLux),
    lightMaxLux: numeric(value?.environmentLightMaxLux),
    photoperiodMinHours: numeric(value?.environmentPhotoperiodMinHours),
    photoperiodMaxHours: numeric(value?.environmentPhotoperiodMaxHours),
    airflowLevel: value?.environmentAirflowLevel || null,
    environmentStability: value?.environmentStability || null,
    avoidDrafts: value?.environmentAvoidDrafts ?? null,
    seasonalNotes: value?.environmentSeasonalNotes || null,
  }
}

function hasRequirements(value: any) {
  return requirementFields.some((field) => value?.[field] != null && value[field] !== '')
}

export async function getEffectiveLocationEnvironment(
  client: PrismaClient,
  collectionId: string,
  locationId: string,
): Promise<EffectiveLocationEnvironment> {
  const locations = await client.location.findMany({
    where: { collectionId },
    include: { environmentProfile: true },
  })
  const byId = new Map(locations.map((location) => [location.id, location]))
  const selected = byId.get(locationId)
  if (!selected) throw new Error('Location not found in this collection.')
  const chain: typeof locations = []
  const seen = new Set<string>()
  let current: typeof selected | undefined = selected
  while (current && !seen.has(current.id)) {
    chain.push(current)
    seen.add(current.id)
    current = current.parentLocationId ? byId.get(current.parentLocationId) : undefined
  }
  const values: EffectiveLocationEnvironment['values'] = {}
  for (const field of locationEnvironmentFields) {
    const source = chain.find((location) => {
      const value = (location.environmentProfile as any)?.[field]
      return value !== null && value !== undefined && value !== ''
    })
    if (!source) continue
    values[field] = {
      value: (source.environmentProfile as any)[field],
      sourceLocationId: source.id,
      sourceLocationName: source.name,
      sourceLocationCode: source.code,
      inherited: source.id !== selected.id,
    }
  }
  const keyConfigured = ['temperatureMinC', 'temperatureMaxC', 'humidityMinPercent', 'humidityMaxPercent', 'lightLevel']
    .filter((field) => values[field as LocationEnvironmentField]?.value != null).length
  const measuredAt = values.measuredAt?.value instanceof Date ? values.measuredAt.value : null
  return {
    locationId,
    locationName: selected.name,
    values,
    localProfile: selected.environmentProfile as any,
    completeness: keyConfigured === 0 ? 'NOT_CONFIGURED' : keyConfigured === 5 ? 'COMPLETE' : 'PARTIAL',
    measuredAt,
    stale: Boolean(measuredAt && Date.now() - measuredAt.getTime() > 1000 * 60 * 60 * 24 * 365),
  }
}

export async function getEffectivePlantEnvironmentRequirements(
  client: PrismaClient,
  collectionId: string,
  input: { plantInstanceId?: string; plantDefinitionId?: string },
): Promise<PlantEnvironmentRequirements> {
  const instance = input.plantInstanceId ? await client.plantInstance.findFirst({
    where: { id: input.plantInstanceId, collectionId },
    include: {
      husbandryOverride: true,
      plantDefinition: { include: { husbandryGuide: true, validatedPlantDefinition: { include: { husbandryGuide: true } } } },
    },
  }) : null
  const definition = instance?.plantDefinition || (input.plantDefinitionId ? await client.plantDefinition.findFirst({
    where: { id: input.plantDefinitionId, OR: [{ collectionId }, { collectionId: null, isValidated: true }] },
    include: { husbandryGuide: true, validatedPlantDefinition: { include: { husbandryGuide: true } } },
  }) : null)
  if (!definition) return requirementValues(null, 'UNKNOWN', 'No husbandry source')

  const localGuide = definition.husbandryGuide
  const linkedGuide = localGuide?.sourcePlantDefinitionId
    ? await client.plantHusbandryGuide.findFirst({ where: { plantDefinitionId: localGuide.sourcePlantDefinitionId, OR: [{ collectionId }, { collectionId: null }] } })
    : null
  const validatedGuide = definition.validatedPlantDefinition?.husbandryGuide || null
  const preferredGuide = linkedGuide || localGuide
  const merged = { ...(validatedGuide || {}) } as any
  for (const field of requirementFields) {
    const value = (preferredGuide as any)?.[field]
    if (value !== null && value !== undefined && value !== '') merged[field] = value
  }
  const baseSource: PlantEnvironmentRequirements['source'] = hasRequirements(preferredGuide)
    ? linkedGuide ? 'LINKED_DEFINITION' : 'LOCAL_DEFINITION'
    : hasRequirements(validatedGuide) ? 'VALIDATED_DEFINITION' : 'UNKNOWN'
  if (instance?.husbandryOverride) {
    for (const field of requirementFields) {
      const value = (instance.husbandryOverride as any)[field]
      if (value !== null && value !== undefined && value !== '') merged[field] = value
    }
  }
  if (instance?.husbandryOverride && hasRequirements(instance.husbandryOverride)) {
    return requirementValues(merged, 'INSTANCE_OVERRIDE', 'Specimen override with definition fallback')
  }
  if (!hasRequirements(merged)) return requirementValues(null, 'UNKNOWN', 'No structured environmental requirements')
  return requirementValues(merged, baseSource, baseSource === 'LINKED_DEFINITION' ? 'Linked definition husbandry' : baseSource === 'VALIDATED_DEFINITION' ? 'Validated definition husbandry' : 'Plant definition husbandry')
}

function environmentNumber(environment: EffectiveLocationEnvironment, field: LocationEnvironmentField) {
  return numeric(environment.values[field]?.value)
}

function displayRange(min: number | null, max: number | null, unit: string) {
  if (min == null && max == null) return 'Unknown'
  if (min != null && max != null) return `${min}-${max}${unit}`
  return min != null ? `at least ${min}${unit}` : `up to ${max}${unit}`
}

function rangeCheck(category: string, requirementMin: number | null, requirementMax: number | null, locationMin: number | null, locationMax: number | null, unit: string): CompatibilityCheck {
  const plantRequirement = displayRange(requirementMin, requirementMax, unit)
  const locationValue = displayRange(locationMin, locationMax, unit)
  if ((requirementMin == null && requirementMax == null) || (locationMin == null && locationMax == null)) {
    return { category, status: 'UNKNOWN', plantRequirement, locationValue, explanation: `There is not enough structured ${category.toLowerCase()} data to compare.`, severity: 'INFO' }
  }
  const reqMin = requirementMin ?? -Infinity
  const reqMax = requirementMax ?? Infinity
  const locMin = locationMin ?? locationMax ?? -Infinity
  const locMax = locationMax ?? locationMin ?? Infinity
  const overlap = Math.min(reqMax, locMax) - Math.max(reqMin, locMin)
  if (overlap < 0) {
    const gap = Math.max(reqMin - locMax, locMin - reqMax)
    const high = category.includes('Temperature') ? gap >= 5 : category === 'Humidity' ? gap >= 15 : false
    return { category, status: 'CONFLICT', plantRequirement, locationValue, explanation: `Recorded ${category.toLowerCase()} does not overlap the plant's preferred range${high ? ' and differs materially' : ''}.`, severity: high ? 'HIGH' : 'WARNING' }
  }
  if (locMin < reqMin || locMax > reqMax) {
    return { category, status: 'CAUTION', plantRequirement, locationValue, explanation: `The ranges overlap, but part of the recorded location range falls outside the plant's preference.`, severity: 'WARNING' }
  }
  return { category, status: 'MATCH', plantRequirement, locationValue, explanation: `The recorded location range sits within the plant's preferred range.`, severity: 'INFO' }
}

const lightRanks: Record<string, number> = { VERY_LOW: 0, LOW: 1, MODERATE: 2, BRIGHT: 3, VERY_BRIGHT: 4 }
const directExposure = new Set(['MORNING_DIRECT', 'AFTERNOON_DIRECT', 'FULL_DIRECT'])

export function evaluatePlantLocationCompatibility(input: {
  plantRequirements: PlantEnvironmentRequirements
  locationEnvironment: EffectiveLocationEnvironment
}): CompatibilityResult {
  const { plantRequirements: plant, locationEnvironment: location } = input
  const checks: CompatibilityCheck[] = [
    rangeCheck('Temperature', plant.temperatureMinC, plant.temperatureMaxC, environmentNumber(location, 'temperatureMinC'), environmentNumber(location, 'temperatureMaxC'), ' C'),
    rangeCheck('Nighttime temperature', plant.nighttimeTemperatureMinC, plant.nighttimeTemperatureMaxC, environmentNumber(location, 'nighttimeTemperatureMinC'), environmentNumber(location, 'nighttimeTemperatureMaxC'), ' C'),
    rangeCheck('Humidity', plant.humidityMinPercent, plant.humidityMaxPercent, environmentNumber(location, 'humidityMinPercent'), environmentNumber(location, 'humidityMaxPercent'), '%'),
    rangeCheck('Light measurement', plant.lightMinLux, plant.lightMaxLux, environmentNumber(location, 'lightMinLux'), environmentNumber(location, 'lightMaxLux'), ' lux'),
    rangeCheck('Photoperiod', plant.photoperiodMinHours, plant.photoperiodMaxHours, environmentNumber(location, 'photoperiodHours'), environmentNumber(location, 'photoperiodHours'), ' h'),
  ]

  const locationLight = String(location.values.lightLevel?.value || '')
  if (!plant.lightLevel || lightRanks[plant.lightLevel] == null || lightRanks[locationLight] == null) {
    checks.push({ category: 'Light intensity', status: 'UNKNOWN', plantRequirement: plant.lightLevel || 'Unknown', locationValue: locationLight || 'Unknown', explanation: 'Qualitative light data is incomplete.', severity: 'INFO' })
  } else {
    const difference = lightRanks[locationLight] - lightRanks[plant.lightLevel]
    checks.push({
      category: 'Light intensity',
      status: Math.abs(difference) === 0 ? 'MATCH' : Math.abs(difference) === 1 ? 'CAUTION' : 'CONFLICT',
      plantRequirement: plant.lightLevel.replaceAll('_', ' ').toLowerCase(),
      locationValue: locationLight.replaceAll('_', ' ').toLowerCase(),
      explanation: difference === 0 ? 'Recorded light intensity matches the structured preference.' : difference > 0 ? 'The location is recorded as brighter than the plant preference; scorch or stress may be worth monitoring.' : 'The location is recorded as dimmer than the plant preference; growth may be slower.',
      severity: Math.abs(difference) > 1 ? 'HIGH' : difference === 0 ? 'INFO' : 'WARNING',
    })
  }

  const locationExposure = String(location.values.lightExposure?.value || '')
  if (!plant.lightExposure || !locationExposure || plant.lightExposure === 'UNKNOWN' || locationExposure === 'UNKNOWN') {
    checks.push({ category: 'Light exposure', status: 'UNKNOWN', plantRequirement: plant.lightExposure || 'Unknown', locationValue: locationExposure || 'Unknown', explanation: 'Direct/indirect exposure data is incomplete.', severity: 'INFO' })
  } else {
    const conflict = ['INDIRECT', 'FILTERED', 'ARTIFICIAL_ONLY'].includes(plant.lightExposure) && directExposure.has(locationExposure)
    checks.push({ category: 'Light exposure', status: conflict ? 'CONFLICT' : plant.lightExposure === locationExposure || plant.lightExposure === 'MIXED' ? 'MATCH' : 'CAUTION', plantRequirement: plant.lightExposure.replaceAll('_', ' ').toLowerCase(), locationValue: locationExposure.replaceAll('_', ' ').toLowerCase(), explanation: conflict ? 'The plant prefers protected light while this location receives direct light; leaf scorch may be worth reviewing.' : 'Recorded exposure is reasonably compatible, though seasonal changes may matter.', severity: conflict ? 'HIGH' : 'INFO' })
  }

  const locationAirflow = String(location.values.airflowLevel?.value || '')
  if (!plant.airflowLevel && !plant.avoidDrafts) {
    checks.push({ category: 'Airflow', status: 'UNKNOWN', plantRequirement: 'Unknown', locationValue: locationAirflow || 'Unknown', explanation: 'No structured airflow requirement is recorded.', severity: 'INFO' })
  } else if (!locationAirflow) {
    checks.push({ category: 'Airflow', status: 'UNKNOWN', plantRequirement: plant.avoidDrafts ? 'Avoid drafts' : plant.airflowLevel || 'Unknown', locationValue: 'Unknown', explanation: 'The location airflow is not configured.', severity: 'INFO' })
  } else {
    const draftConflict = Boolean(plant.avoidDrafts && locationAirflow === 'DRAFTY')
    const stillConflict = plant.airflowLevel === 'MODERATE' && locationAirflow === 'STILL'
    checks.push({ category: 'Airflow', status: draftConflict || stillConflict ? 'CAUTION' : 'MATCH', plantRequirement: plant.avoidDrafts ? 'Avoid drafts' : String(plant.airflowLevel).toLowerCase(), locationValue: locationAirflow.toLowerCase(), explanation: draftConflict ? 'This plant is marked draft-sensitive and the location is recorded as drafty.' : stillConflict ? 'The plant prefers air movement and the location is recorded as still.' : 'No clear airflow conflict is recorded.', severity: draftConflict || stillConflict ? 'WARNING' : 'INFO' })
  }

  const locationStability = String(location.values.environmentStability?.value || '')
  if (!plant.environmentStability || !locationStability) {
    checks.push({ category: 'Stability', status: 'UNKNOWN', plantRequirement: plant.environmentStability || 'Unknown', locationValue: locationStability || 'Unknown', explanation: 'Environmental stability data is incomplete.', severity: 'INFO' })
  } else {
    const conflict = plant.environmentStability === 'STABLE' && ['HIGHLY_VARIABLE', 'SEASONAL'].includes(locationStability)
    checks.push({ category: 'Stability', status: conflict ? 'CAUTION' : 'MATCH', plantRequirement: plant.environmentStability.toLowerCase(), locationValue: locationStability.toLowerCase(), explanation: conflict ? 'This plant prefers stability while the location is recorded as variable; seasonal monitoring is worthwhile.' : 'No clear stability conflict is recorded.', severity: conflict ? 'WARNING' : 'INFO' })
  }

  const conflicts = checks.filter((check) => check.status === 'CONFLICT')
  const cautions = checks.filter((check) => check.status === 'CAUTION')
  const matches = checks.filter((check) => check.status === 'MATCH')
  const missingData = checks.filter((check) => check.status === 'UNKNOWN').map((check) => check.category)
  const overallStatus: CompatibilityStatus = conflicts.some((check) => check.severity === 'HIGH')
    ? 'POOR_MATCH'
    : conflicts.length || cautions.length ? 'CAUTION' : matches.length ? 'GOOD_MATCH' : 'INSUFFICIENT_DATA'
  const summary = overallStatus === 'GOOD_MATCH'
    ? 'Recorded conditions appear compatible with the structured husbandry requirements.'
    : overallStatus === 'POOR_MATCH'
      ? 'One or more recorded conditions may be a poor fit. Review the details before proceeding.'
      : overallStatus === 'CAUTION'
        ? 'Some recorded conditions are worth reviewing. You can still use this location.'
        : 'There is not enough structured data for a reliable comparison.'
  return { overallStatus, checks, summary, missingData }
}

export function compactCompatibilityResult(result: CompatibilityResult) {
  return {
    overallStatus: result.overallStatus,
    summary: result.summary,
    checks: result.checks.filter((check) => check.status === 'CONFLICT' || check.status === 'CAUTION'),
    missingData: result.missingData,
  }
}
