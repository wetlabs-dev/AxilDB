import { lightFromCanonical, lightToCanonical } from './light'
import { temperatureFromCanonical, temperatureToCanonical } from './temperature'
import type { LightUnit, TemperatureUnit } from './types'

const numericInput = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

function finite(value: number) {
  if (!Number.isFinite(value)) throw new Error('Measurement must be a finite number.')
  return value
}

function rounded(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function displayNumber(value: number, maximumFractionDigits: number) {
  return rounded(value, maximumFractionDigits).toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits,
  })
}

export function parseMeasurementInput(value: string) {
  const normalized = value.trim()
  if (!numericInput.test(normalized)) throw new Error('Enter a number using a period as the decimal separator.')
  return finite(Number(normalized))
}

export function temperatureSymbol(unit: TemperatureUnit) {
  return unit === 'FAHRENHEIT' ? '°F' : '°C'
}

export function lightSymbol(unit: LightUnit) {
  return unit === 'FOOT_CANDLE' ? 'fc' : 'lux'
}

export function temperatureInputValue(valueC: number | null | undefined, unit: TemperatureUnit) {
  if (valueC == null) return ''
  return displayNumber(temperatureFromCanonical(finite(valueC), unit), 6)
}

export function lightInputValue(valueLux: number | null | undefined, unit: LightUnit) {
  if (valueLux == null) return ''
  return displayNumber(lightFromCanonical(finite(valueLux), unit), 6)
}

export function parseTemperatureInput(value: string, unit: TemperatureUnit) {
  return finite(temperatureToCanonical(parseMeasurementInput(value), unit))
}

export function parseLightInput(value: string, unit: LightUnit) {
  return finite(lightToCanonical(parseMeasurementInput(value), unit))
}

export function formatTemperature(valueC: number | null | undefined, unit: TemperatureUnit) {
  if (valueC == null) return 'Unknown'
  return `${displayNumber(temperatureFromCanonical(finite(valueC), unit), 1)} ${temperatureSymbol(unit)}`
}

export function formatLight(valueLux: number | null | undefined, unit: LightUnit) {
  if (valueLux == null) return 'Unknown'
  return `${displayNumber(lightFromCanonical(finite(valueLux), unit), unit === 'FOOT_CANDLE' ? 1 : 0)} ${lightSymbol(unit)}`
}

function formatRange(
  min: number | null | undefined,
  max: number | null | undefined,
  format: (value: number) => string,
) {
  if (min == null && max == null) return 'Unknown'
  if (min != null && max != null) return `${format(min)}–${format(max)}`
  return min != null ? `at least ${format(min)}` : `up to ${format(max as number)}`
}

export function formatTemperatureRange(minC: number | null | undefined, maxC: number | null | undefined, unit: TemperatureUnit) {
  return formatRange(minC, maxC, (value) => formatTemperature(value, unit))
}

export function formatLightRange(minLux: number | null | undefined, maxLux: number | null | undefined, unit: LightUnit) {
  return formatRange(minLux, maxLux, (value) => formatLight(value, unit))
}
