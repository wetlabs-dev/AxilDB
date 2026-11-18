import { cadenceActivities } from '@/lib/care-cadences'
export const calibrationDefaults = {
  enabled: true, batchSize: 6, halfLifeDays: 75, relativeDeviation: .2, maxRatio: 3,
  appliedDays: 30, stableDays: 180, insufficientDays: 30, inconclusiveDays: 60, rejectedDays: 180, manualDays: 30,
  minNewIntervals: 3, manualRateLimitHours: 24, maxInstances: 500, maxEvents: 10000,
  categories: Object.fromEntries(cadenceActivities.map(({activity}) => [activity, {
    minIntervals: ({ WATERING: 5, FERTILIZING: 4, REPOTTING: 2, PEST_INSPECTION: 4, GENERAL_INSPECTION: 4, PRUNING: 3 } as Record<string,number>)[activity],
    minSpanDays: ({ WATERING: 30, FERTILIZING: 60, REPOTTING: 180, PEST_INSPECTION: 30, GENERAL_INSPECTION: 30, PRUNING: 90 } as Record<string,number>)[activity],
    windowDays: activity === 'REPOTTING' ? 3650 : activity === 'PRUNING' ? 730 : activity === 'FERTILIZING' ? 365 : 180,
  }])) as Record<string,{ minIntervals: number; minSpanDays: number; windowDays: number }>,
}
export type CalibrationPolicy = typeof calibrationDefaults
export function calibrationPolicy(input: unknown): CalibrationPolicy {
  if (input == null) return structuredClone(calibrationDefaults)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Calibration policy must be an object.')
  const raw = input as Record<string,unknown>, policy = structuredClone(calibrationDefaults)
  for (const [key,value] of Object.entries(raw)) {
    if (!(key in policy)) throw new Error(`Unknown calibration setting: ${key}`)
    if (key === 'enabled') { if (typeof value !== 'boolean') throw new Error('enabled must be true or false.'); policy.enabled = value; continue }
    if (key === 'categories') {
      if (!value || typeof value !== 'object') throw new Error('Invalid category policy.')
      for (const [activity, thresholds] of Object.entries(value)) {
        if (!(activity in policy.categories) || !thresholds || typeof thresholds !== 'object') throw new Error('Invalid category policy.')
        for (const [name,n] of Object.entries(thresholds)) {
          if (!['minIntervals','minSpanDays','windowDays'].includes(name) || !Number.isInteger(n) || Number(n) < 1 || Number(n) > 36500) throw new Error('Invalid evidence threshold.')
          Object.assign(policy.categories[activity], { [name]: n })
        }
      }
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000) throw new Error(`Invalid calibration setting: ${key}`)
      if (!['relativeDeviation','maxRatio'].includes(key) && !Number.isInteger(value)) throw new Error(`Calibration setting must be a whole number: ${key}`)
      Object.assign(policy, { [key]: value })
    }
  }
  if (policy.batchSize > 25 || !Number.isInteger(policy.batchSize) || policy.relativeDeviation > 1 || policy.maxRatio < 1 || policy.maxEvents > 10000 || policy.maxInstances > 500) throw new Error('Calibration policy exceeds bounded processing limits.')
  return policy
}
