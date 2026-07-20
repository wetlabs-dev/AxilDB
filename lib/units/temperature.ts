import type { TemperatureUnit } from './types'

export function celsiusToFahrenheit(valueC: number) {
  return valueC * 9 / 5 + 32
}

export function fahrenheitToCelsius(valueF: number) {
  return (valueF - 32) * 5 / 9
}

export function temperatureFromCanonical(valueC: number, unit: TemperatureUnit) {
  return unit === 'FAHRENHEIT' ? celsiusToFahrenheit(valueC) : valueC
}

export function temperatureToCanonical(value: number, unit: TemperatureUnit) {
  return unit === 'FAHRENHEIT' ? fahrenheitToCelsius(value) : value
}
