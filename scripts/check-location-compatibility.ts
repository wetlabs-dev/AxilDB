import assert from 'node:assert/strict'
import {
  evaluatePlantLocationCompatibility,
  getEffectiveLocationEnvironment,
  getEffectivePlantEnvironmentRequirements,
  type EffectiveLocationEnvironment,
  type PlantEnvironmentRequirements,
} from '../lib/location-compatibility'

const baseRequirements: PlantEnvironmentRequirements = {
  source: 'LOCAL_DEFINITION',
  sourceLabel: 'Test guide',
  temperatureMinC: 18,
  temperatureMaxC: 24,
  nighttimeTemperatureMinC: 16,
  nighttimeTemperatureMaxC: 20,
  humidityMinPercent: 60,
  humidityMaxPercent: 80,
  lightLevel: 'MODERATE',
  lightExposure: 'INDIRECT',
  lightMinLux: null,
  lightMaxLux: null,
  photoperiodMinHours: 10,
  photoperiodMaxHours: 14,
  airflowLevel: 'MODERATE',
  environmentStability: 'STABLE',
  avoidDrafts: true,
  seasonalNotes: null,
}

function environment(values: Record<string, unknown>): EffectiveLocationEnvironment {
  return {
    locationId: 'shelf',
    locationName: 'Shelf',
    values: Object.fromEntries(Object.entries(values).map(([field, value]) => [field, {
      value, sourceLocationId: 'shelf', sourceLocationName: 'Shelf', sourceLocationCode: 'LOC-SH-01', inherited: false,
    }])),
    localProfile: values,
    completeness: 'PARTIAL',
    measuredAt: null,
    stale: false,
  }
}

async function run() {
  let scopedCollectionId = ''
  const hierarchyClient = {
    location: {
      findMany: async ({ where }: any) => {
        scopedCollectionId = where.collectionId
        return [
          { id: 'room', parentLocationId: null, name: 'Room', code: 'LOC-RM-01', environmentProfile: { humidityMinPercent: 40, humidityMaxPercent: 55 } },
          { id: 'cabinet', parentLocationId: 'room', name: 'Cabinet', code: 'LOC-CAB-01', environmentProfile: { temperatureMinC: 20, temperatureMaxC: 25, humidityMinPercent: 70, humidityMaxPercent: 80 } },
          { id: 'shelf', parentLocationId: 'cabinet', name: 'Shelf', code: 'LOC-SH-01', environmentProfile: { lightLevel: 'BRIGHT', lightExposure: 'INDIRECT' } },
        ]
      },
    },
  } as any
  const effective = await getEffectiveLocationEnvironment(hierarchyClient, 'collection-a', 'shelf')
  assert.equal(scopedCollectionId, 'collection-a', 'environment resolution must remain collection scoped')
  assert.equal(effective.values.temperatureMinC?.sourceLocationId, 'cabinet')
  assert.equal(effective.values.humidityMinPercent?.value, 70, 'nearest ancestor must override a more distant ancestor')
  assert.equal(effective.values.lightLevel?.sourceLocationId, 'shelf')
  assert.equal(effective.values.lightLevel?.inherited, false)

  const good = evaluatePlantLocationCompatibility({ plantRequirements: baseRequirements, locationEnvironment: environment({
    temperatureMinC: 19, temperatureMaxC: 23, nighttimeTemperatureMinC: 17, nighttimeTemperatureMaxC: 19,
    humidityMinPercent: 65, humidityMaxPercent: 75, lightLevel: 'MODERATE', lightExposure: 'INDIRECT',
    photoperiodHours: 12, airflowLevel: 'MODERATE', environmentStability: 'STABLE',
  }) })
  assert.equal(good.overallStatus, 'GOOD_MATCH')

  const conflicts = evaluatePlantLocationCompatibility({ plantRequirements: baseRequirements, locationEnvironment: environment({
    temperatureMinC: 30, temperatureMaxC: 34, humidityMinPercent: 25, humidityMaxPercent: 35,
    lightLevel: 'VERY_BRIGHT', lightExposure: 'FULL_DIRECT', photoperiodHours: 8,
    airflowLevel: 'DRAFTY', environmentStability: 'HIGHLY_VARIABLE',
  }) })
  assert.equal(conflicts.overallStatus, 'POOR_MATCH')
  assert.equal(conflicts.checks.find((check) => check.category === 'Humidity')?.status, 'CONFLICT')
  assert.equal(conflicts.checks.find((check) => check.category === 'Light exposure')?.status, 'CONFLICT')
  assert.equal(conflicts.checks.find((check) => check.category === 'Airflow')?.status, 'CAUTION')

  const unknown = evaluatePlantLocationCompatibility({ plantRequirements: { ...baseRequirements, temperatureMinC: null, temperatureMaxC: null, nighttimeTemperatureMinC: null, nighttimeTemperatureMaxC: null, humidityMinPercent: null, humidityMaxPercent: null, lightLevel: null, lightExposure: null, photoperiodMinHours: null, photoperiodMaxHours: null, airflowLevel: null, environmentStability: null, avoidDrafts: null }, locationEnvironment: environment({}) })
  assert.equal(unknown.overallStatus, 'INSUFFICIENT_DATA')

  const requirementClient = {
    plantInstance: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.collectionId, 'collection-a')
        return {
          husbandryOverride: { environmentHumidityMinPercent: 75 },
          plantDefinition: { husbandryGuide: { environmentHumidityMinPercent: 50, environmentHumidityMaxPercent: 70, sourcePlantDefinitionId: null }, validatedPlantDefinition: null },
        }
      },
    },
    plantDefinition: { findFirst: async () => null },
    plantHusbandryGuide: { findFirst: async () => null },
  } as any
  const specimenRequirements = await getEffectivePlantEnvironmentRequirements(requirementClient, 'collection-a', { plantInstanceId: 'plant-a' })
  assert.equal(specimenRequirements.source, 'INSTANCE_OVERRIDE')
  assert.equal(specimenRequirements.humidityMinPercent, 75)
  assert.equal(specimenRequirements.humidityMaxPercent, 70, 'blank override fields must retain definition fallback')

  const validatedClient = {
    plantInstance: { findFirst: async () => null },
    plantDefinition: {
      findFirst: async () => ({ husbandryGuide: { summaryCare: 'Readable local notes without structured environment.', sourcePlantDefinitionId: null }, validatedPlantDefinition: { husbandryGuide: { environmentLightLevel: 'BRIGHT' } } }),
    },
    plantHusbandryGuide: { findFirst: async () => null },
  } as any
  const validatedRequirements = await getEffectivePlantEnvironmentRequirements(validatedClient, 'collection-a', { plantDefinitionId: 'definition-a' })
  assert.equal(validatedRequirements.source, 'VALIDATED_DEFINITION')
  assert.equal(validatedRequirements.lightLevel, 'BRIGHT')

  console.log('Location compatibility checks passed.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
