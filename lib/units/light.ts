import type { LightUnit } from './types'

const LUX_PER_FOOT_CANDLE = 10.7639

export function luxToFootCandles(valueLux: number) {
  return valueLux / LUX_PER_FOOT_CANDLE
}

export function footCandlesToLux(valueFootCandles: number) {
  return valueFootCandles * LUX_PER_FOOT_CANDLE
}

export function lightFromCanonical(valueLux: number, unit: LightUnit) {
  return unit === 'FOOT_CANDLE' ? luxToFootCandles(valueLux) : valueLux
}

export function lightToCanonical(value: number, unit: LightUnit) {
  return unit === 'FOOT_CANDLE' ? footCandlesToLux(value) : value
}
