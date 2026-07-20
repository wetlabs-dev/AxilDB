'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionAdmin, requireCollectionGardener, requireCollectionLogger, requireCollectionManager, requireCollectionViewer } from '@/lib/collections'
import { emitDomainEvent } from '@/lib/events/emit'
import {
  compactCompatibilityResult,
  evaluatePlantLocationCompatibility,
  getEffectiveLocationEnvironment,
  getEffectivePlantEnvironmentRequirements,
} from '@/lib/location-compatibility'
import { prisma } from '@/lib/prisma'
import {
  getUserUnitPreferences,
  lightInputValue,
  parseLightInput,
  parseTemperatureInput,
  temperatureInputValue,
  type UnitPreferences,
} from '@/lib/units'

const text = (fd: FormData, key: string) => String(fd.get(key) || '').trim() || null
const number = (fd: FormData, key: string, min: number, max: number) => {
  const value = text(fd, key)
  if (value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${key} must be between ${min} and ${max}.`)
  return parsed
}
const integer = (fd: FormData, key: string, min: number, max: number) => {
  const value = number(fd, key, min, max)
  return value == null ? null : Math.round(value)
}
const optionalBoolean = (fd: FormData, key: string) => {
  const value = text(fd, key)
  if (value == null) return null
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Invalid ${key} value.`)
}

const allowed = (value: string | null, values: string[]) => value && values.includes(value) ? value : null

function preferredTemperature(fd: FormData, key: string, preferences: UnitPreferences, existing?: number | null) {
  const value = text(fd, key)
  if (value == null) return null
  if (existing != null && value === temperatureInputValue(existing, preferences.temperatureUnit)) return existing
  const canonical = parseTemperatureInput(value, preferences.temperatureUnit)
  if (canonical < -60 || canonical > 80) throw new Error(`${key} is outside the supported temperature range.`)
  return canonical
}

function preferredLight(fd: FormData, key: string, preferences: UnitPreferences, existing?: number | null) {
  const value = text(fd, key)
  if (value == null) return null
  if (existing != null && value === lightInputValue(existing, preferences.lightUnit)) return existing
  const canonical = Math.round(parseLightInput(value, preferences.lightUnit))
  if (canonical < 0 || canonical > 500000) throw new Error(`${key} is outside the supported measured-light range.`)
  return canonical
}

function husbandryEnvironmentData(fd: FormData, preferences: UnitPreferences, existing?: Record<string, any> | null) {
  const temperatureMinC = preferredTemperature(fd, 'environmentTemperatureMinC', preferences, existing?.environmentTemperatureMinC)
  const temperatureMaxC = preferredTemperature(fd, 'environmentTemperatureMaxC', preferences, existing?.environmentTemperatureMaxC)
  const nighttimeTemperatureMinC = preferredTemperature(fd, 'environmentNightTemperatureMinC', preferences, existing?.environmentNightTemperatureMinC)
  const nighttimeTemperatureMaxC = preferredTemperature(fd, 'environmentNightTemperatureMaxC', preferences, existing?.environmentNightTemperatureMaxC)
  const humidityMinPercent = number(fd, 'environmentHumidityMinPercent', 0, 100)
  const humidityMaxPercent = number(fd, 'environmentHumidityMaxPercent', 0, 100)
  const lightMinLux = preferredLight(fd, 'environmentLightMinLux', preferences, existing?.environmentLightMinLux)
  const lightMaxLux = preferredLight(fd, 'environmentLightMaxLux', preferences, existing?.environmentLightMaxLux)
  const photoperiodMinHours = number(fd, 'environmentPhotoperiodMinHours', 0, 24)
  const photoperiodMaxHours = number(fd, 'environmentPhotoperiodMaxHours', 0, 24)
  if (temperatureMinC != null && temperatureMaxC != null && temperatureMinC > temperatureMaxC) throw new Error('Minimum temperature cannot exceed maximum temperature.')
  if (nighttimeTemperatureMinC != null && nighttimeTemperatureMaxC != null && nighttimeTemperatureMinC > nighttimeTemperatureMaxC) throw new Error('Minimum nighttime temperature cannot exceed maximum nighttime temperature.')
  if (humidityMinPercent != null && humidityMaxPercent != null && humidityMinPercent > humidityMaxPercent) throw new Error('Minimum humidity cannot exceed maximum humidity.')
  if (lightMinLux != null && lightMaxLux != null && lightMinLux > lightMaxLux) throw new Error('Minimum measured light cannot exceed maximum measured light.')
  if (photoperiodMinHours != null && photoperiodMaxHours != null && photoperiodMinHours > photoperiodMaxHours) throw new Error('Minimum photoperiod cannot exceed maximum photoperiod.')
  return {
    environmentTemperatureMinC: temperatureMinC,
    environmentTemperatureMaxC: temperatureMaxC,
    environmentNightTemperatureMinC: nighttimeTemperatureMinC,
    environmentNightTemperatureMaxC: nighttimeTemperatureMaxC,
    environmentHumidityMinPercent: humidityMinPercent,
    environmentHumidityMaxPercent: humidityMaxPercent,
    environmentLightLevel: allowed(text(fd, 'environmentLightLevel'), ['VERY_LOW', 'LOW', 'MODERATE', 'BRIGHT', 'VERY_BRIGHT']),
    environmentLightExposure: allowed(text(fd, 'environmentLightExposure'), ['INDIRECT', 'FILTERED', 'MORNING_DIRECT', 'AFTERNOON_DIRECT', 'FULL_DIRECT', 'ARTIFICIAL_ONLY', 'MIXED', 'UNKNOWN']),
    environmentLightMinLux: lightMinLux,
    environmentLightMaxLux: lightMaxLux,
    environmentPhotoperiodMinHours: photoperiodMinHours,
    environmentPhotoperiodMaxHours: photoperiodMaxHours,
    environmentAirflowLevel: allowed(text(fd, 'environmentAirflowLevel'), ['STILL', 'LOW', 'MODERATE', 'HIGH', 'DRAFTY', 'UNKNOWN']),
    environmentStability: allowed(text(fd, 'environmentStability'), ['STABLE', 'MODERATELY_VARIABLE', 'HIGHLY_VARIABLE', 'SEASONAL', 'UNKNOWN']),
    environmentAvoidDrafts: optionalBoolean(fd, 'environmentAvoidDrafts'),
    environmentSeasonalNotes: text(fd, 'environmentSeasonalNotes'),
  }
}

export async function savePlantDefinitionEnvironmentRequirements(fd: FormData) {
  const collectionSlug = String(fd.get('collectionSlug') || '')
  const { user, collection } = await requireCollectionAdmin(collectionSlug)
  const plantDefinitionId = String(fd.get('plantDefinitionId') || '')
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId: collection.id } })
  const existing = await prisma.plantHusbandryGuide.findFirst({ where: { plantDefinitionId, collectionId: collection.id } })
  if (existing?.sourcePlantDefinitionId) throw new Error('Make a local husbandry copy before editing environmental requirements.')
  const preferences = await getUserUnitPreferences(prisma, user.id)
  const data = husbandryEnvironmentData(fd, preferences, existing)
  const guide = await prisma.plantHusbandryGuide.upsert({
    where: { plantDefinitionId },
    update: data,
    create: { collectionId: collection.id, plantDefinitionId, ...data },
  })
  await audit(user, 'UPDATE', 'PLANT_HUSBANDRY_GUIDE', guide.id, 'Updated structured environmental requirements', undefined, collection.id)
  redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#environment-requirements`))
}

export async function savePlantInstanceEnvironmentRequirements(fd: FormData) {
  const collectionSlug = String(fd.get('collectionSlug') || '')
  const { user, collection } = await requireCollectionLogger(collectionSlug)
  const plantInstanceId = String(fd.get('plantInstanceId') || '')
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id } })
  const existing = await prisma.plantHusbandryOverride.findUnique({ where: { plantInstanceId } })
  const preferences = await getUserUnitPreferences(prisma, user.id)
  const data = husbandryEnvironmentData(fd, preferences, existing)
  const override = await prisma.plantHusbandryOverride.upsert({
    where: { plantInstanceId },
    update: data,
    create: { collectionId: collection.id, plantInstanceId, ...data },
  })
  await audit(user, 'UPDATE', 'PLANT_HUSBANDRY_OVERRIDE', override.id, 'Updated specimen environmental requirements', undefined, collection.id)
  redirect(collectionPath(collection.slug, `/instances/${plantInstanceId}#environment-compatibility`))
}

export async function saveLocationEnvironmentProfile(fd: FormData) {
  const collectionSlug = String(fd.get('collectionSlug') || '')
  const { user, collection } = await requireCollectionManager(collectionSlug)
  const locationId = String(fd.get('locationId') || '')
  const location = await prisma.location.findFirstOrThrow({ where: { id: locationId, collectionId: collection.id }, include: { environmentProfile: true } })
  const preferences = await getUserUnitPreferences(prisma, user.id)
  const temperatureMinC = preferredTemperature(fd, 'temperatureMinC', preferences, location.environmentProfile?.temperatureMinC)
  const temperatureMaxC = preferredTemperature(fd, 'temperatureMaxC', preferences, location.environmentProfile?.temperatureMaxC)
  const nighttimeTemperatureMinC = preferredTemperature(fd, 'nighttimeTemperatureMinC', preferences, location.environmentProfile?.nighttimeTemperatureMinC)
  const nighttimeTemperatureMaxC = preferredTemperature(fd, 'nighttimeTemperatureMaxC', preferences, location.environmentProfile?.nighttimeTemperatureMaxC)
  const humidityMinPercent = number(fd, 'humidityMinPercent', 0, 100)
  const humidityMaxPercent = number(fd, 'humidityMaxPercent', 0, 100)
  const lightMinLux = preferredLight(fd, 'lightMinLux', preferences, location.environmentProfile?.lightMinLux)
  const lightMaxLux = preferredLight(fd, 'lightMaxLux', preferences, location.environmentProfile?.lightMaxLux)
  if (temperatureMinC != null && temperatureMaxC != null && temperatureMinC > temperatureMaxC) throw new Error('Minimum temperature cannot exceed maximum temperature.')
  if (nighttimeTemperatureMinC != null && nighttimeTemperatureMaxC != null && nighttimeTemperatureMinC > nighttimeTemperatureMaxC) throw new Error('Minimum nighttime temperature cannot exceed maximum nighttime temperature.')
  if (humidityMinPercent != null && humidityMaxPercent != null && humidityMinPercent > humidityMaxPercent) throw new Error('Minimum humidity cannot exceed maximum humidity.')
  if (lightMinLux != null && lightMaxLux != null && lightMinLux > lightMaxLux) throw new Error('Minimum measured light cannot exceed maximum measured light.')

  const data = {
    temperatureMinC,
    temperatureMaxC,
    nighttimeTemperatureMinC,
    nighttimeTemperatureMaxC,
    humidityMinPercent,
    humidityMaxPercent,
    lightLevel: allowed(text(fd, 'lightLevel'), ['VERY_LOW', 'LOW', 'MODERATE', 'BRIGHT', 'VERY_BRIGHT']),
    lightExposure: allowed(text(fd, 'lightExposure'), ['INDIRECT', 'FILTERED', 'MORNING_DIRECT', 'AFTERNOON_DIRECT', 'FULL_DIRECT', 'ARTIFICIAL_ONLY', 'MIXED', 'UNKNOWN']),
    lightMinLux,
    lightMaxLux,
    photoperiodHours: number(fd, 'photoperiodHours', 0, 24),
    airflowLevel: allowed(text(fd, 'airflowLevel'), ['STILL', 'LOW', 'MODERATE', 'HIGH', 'DRAFTY', 'UNKNOWN']),
    environmentStability: allowed(text(fd, 'environmentStability'), ['STABLE', 'MODERATELY_VARIABLE', 'HIGHLY_VARIABLE', 'SEASONAL', 'UNKNOWN']),
    supplementalLight: optionalBoolean(fd, 'supplementalLight'),
    supplementalLightType: text(fd, 'supplementalLightType'),
    supplementalHeat: optionalBoolean(fd, 'supplementalHeat'),
    humidification: optionalBoolean(fd, 'humidification'),
    dehumidification: optionalBoolean(fd, 'dehumidification'),
    activeAirflow: optionalBoolean(fd, 'activeAirflow'),
    nearWindow: optionalBoolean(fd, 'nearWindow'),
    nearHvacVent: optionalBoolean(fd, 'nearHvacVent'),
    enclosed: optionalBoolean(fd, 'enclosed'),
    seasonalVariationNotes: text(fd, 'seasonalVariationNotes'),
    measurementSource: allowed(text(fd, 'measurementSource'), ['ESTIMATED', 'MANUAL_MEASUREMENT', 'SENSOR', 'UNKNOWN']),
    measuredAt: text(fd, 'measuredAt') ? new Date(String(fd.get('measuredAt'))) : null,
    confidence: allowed(text(fd, 'confidence'), ['LOW', 'MEDIUM', 'HIGH']),
    notes: text(fd, 'notes'),
  }
  const profile = await prisma.$transaction(async (tx) => {
    const saved = await tx.locationEnvironmentProfile.upsert({
      where: { locationId },
      update: data,
      create: { collectionId: collection.id, locationId, ...data },
    })
    await emitDomainEvent(tx, {
      eventType: 'location.environment_updated',
      collectionId: collection.id,
      aggregateId: locationId,
      actor: { id: user.id, role: user.role },
      idempotencyKey: `location:${locationId}:environment:${saved.updatedAt.toISOString()}`,
      payload: { subjectId: locationId, displayName: location.name, code: location.code, measurementSource: saved.measurementSource },
    })
    return saved
  })
  await audit(user, 'UPDATE', 'LOCATION_ENVIRONMENT', profile.id, `Updated environment profile for ${location.code} ${location.name}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, `/locations/${locationId}#environment`))
}

export async function previewPlantLocationCompatibility(input: {
  collectionSlug: string
  locationId: string
  plantInstanceIds: string[]
}) {
  const { collection } = await requireCollectionGardener(input.collectionSlug)
  const location = await prisma.location.findFirstOrThrow({ where: { id: input.locationId, collectionId: collection.id, status: 'ACTIVE' } })
  const locationEnvironment = await getEffectiveLocationEnvironment(prisma, collection.id, location.id)
  const ids = Array.from(new Set(input.plantInstanceIds))
  const plants = await prisma.plantInstance.findMany({ where: { id: { in: ids }, collectionId: collection.id, status: 'ACTIVE' }, select: { id: true, plantId: true } })
  const results = await Promise.all(plants.map(async (plant) => {
    const requirements = await getEffectivePlantEnvironmentRequirements(prisma, collection.id, { plantInstanceId: plant.id })
    const result = compactCompatibilityResult(evaluatePlantLocationCompatibility({ plantRequirements: requirements, locationEnvironment }))
    return { plantInstanceId: plant.id, plantId: plant.plantId, ...result }
  }))
  const counts = { GOOD_MATCH: 0, CAUTION: 0, POOR_MATCH: 0, INSUFFICIENT_DATA: 0 }
  for (const result of results) counts[result.overallStatus] += 1
  return { locationId: location.id, locationName: location.name, counts, results }
}

export async function previewDefinitionLocationCompatibility(input: {
  collectionSlug: string
  locationId: string
  plantDefinitionId: string
}) {
  const { collection } = await requireCollectionViewer(input.collectionSlug)
  const location = await prisma.location.findFirstOrThrow({ where: { id: input.locationId, collectionId: collection.id, status: 'ACTIVE' } })
  const [locationEnvironment, plantRequirements] = await Promise.all([
    getEffectiveLocationEnvironment(prisma, collection.id, location.id),
    getEffectivePlantEnvironmentRequirements(prisma, collection.id, { plantDefinitionId: input.plantDefinitionId }),
  ])
  return compactCompatibilityResult(evaluatePlantLocationCompatibility({ plantRequirements, locationEnvironment }))
}
