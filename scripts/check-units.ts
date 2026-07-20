import assert from 'node:assert/strict'
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  footCandlesToLux,
  formatLightRange,
  formatTemperatureRange,
  lightInputValue,
  luxToFootCandles,
  parseLightInput,
  parseMeasurementInput,
  parseTemperatureInput,
  resolveUnitPreferences,
  temperatureInputValue,
} from '../lib/units'

function close(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`)
}

assert.equal(celsiusToFahrenheit(0), 32)
assert.equal(celsiusToFahrenheit(100), 212)
assert.equal(celsiusToFahrenheit(20), 68)
assert.equal(fahrenheitToCelsius(32), 0)
close(fahrenheitToCelsius(celsiusToFahrenheit(-17.25)), -17.25)
close(parseTemperatureInput(temperatureInputValue(21.375, 'FAHRENHEIT'), 'FAHRENHEIT'), 21.375, 1e-6)

close(footCandlesToLux(luxToFootCandles(12_345.67)), 12_345.67)
close(parseLightInput(lightInputValue(8_500, 'FOOT_CANDLE'), 'FOOT_CANDLE'), 8_500, 0.00001)

assert.equal(temperatureInputValue(null, 'CELSIUS'), '')
assert.equal(lightInputValue(undefined, 'LUX'), '')
assert.equal(formatTemperatureRange(18, 24, 'FAHRENHEIT'), '64.4 °F–75.2 °F')
assert.equal(formatTemperatureRange(18, null, 'CELSIUS'), 'at least 18 °C')
assert.equal(formatLightRange(null, 10_000, 'FOOT_CANDLE'), 'up to 929 fc')

for (const invalid of ['', '1,5', 'NaN', 'Infinity', '12 C', '--2']) {
  assert.throws(() => parseMeasurementInput(invalid))
}

assert.deepEqual(resolveUnitPreferences(null), { temperatureUnit: 'CELSIUS', lightUnit: 'LUX' })
assert.deepEqual(resolveUnitPreferences({ temperatureUnit: 'FAHRENHEIT', lightUnit: 'invalid' }), { temperatureUnit: 'FAHRENHEIT', lightUnit: 'LUX' })
assert.deepEqual(resolveUnitPreferences({ temperatureUnit: 'invalid', lightUnit: 'FOOT_CANDLE' }), { temperatureUnit: 'CELSIUS', lightUnit: 'FOOT_CANDLE' })

console.log('Measurement unit checks passed.')
