export const temperatureUnits = ['CELSIUS', 'FAHRENHEIT'] as const
export const lightUnits = ['LUX', 'FOOT_CANDLE'] as const

export type TemperatureUnit = typeof temperatureUnits[number]
export type LightUnit = typeof lightUnits[number]

export type UnitPreferences = {
  temperatureUnit: TemperatureUnit
  lightUnit: LightUnit
}

export const defaultUnitPreferences: UnitPreferences = {
  temperatureUnit: 'CELSIUS',
  lightUnit: 'LUX',
}
