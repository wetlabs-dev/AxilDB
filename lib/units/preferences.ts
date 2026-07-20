import type { PrismaClient } from '@prisma/client'
import { defaultUnitPreferences, lightUnits, temperatureUnits, type LightUnit, type TemperatureUnit, type UnitPreferences } from './types'

export function resolveUnitPreferences(preference?: { temperatureUnit?: string | null; lightUnit?: string | null } | null): UnitPreferences {
  return {
    temperatureUnit: temperatureUnits.includes(preference?.temperatureUnit as TemperatureUnit)
      ? preference!.temperatureUnit as TemperatureUnit
      : defaultUnitPreferences.temperatureUnit,
    lightUnit: lightUnits.includes(preference?.lightUnit as LightUnit)
      ? preference!.lightUnit as LightUnit
      : defaultUnitPreferences.lightUnit,
  }
}

export async function getUserUnitPreferences(client: PrismaClient, userId?: string | null) {
  if (!userId) return defaultUnitPreferences
  const preference = await client.emailPreference.findUnique({
    where: { userId },
    select: { temperatureUnit: true, lightUnit: true },
  })
  return resolveUnitPreferences(preference)
}
