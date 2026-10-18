import { addCalendarDays, dateInputValue, parseDateLocal } from '@/lib/time'

export const cadenceActivities = [
  { activity: 'WATERING', label: 'Watering', task: 'WATER', event: 'WATERED' },
  { activity: 'FERTILIZING', label: 'Fertilizing', task: 'FERTILIZE', event: 'FERTILIZED' },
  { activity: 'REPOTTING', label: 'Repotting', task: 'REPOT', event: 'REPOTTED' },
  { activity: 'PEST_INSPECTION', label: 'Pest inspection', task: 'PEST_CHECK', event: 'PEST_CHECK' },
  { activity: 'GENERAL_INSPECTION', label: 'General inspection', task: 'HEALTH_CHECK', event: 'HEALTH_CHECK' },
  { activity: 'PRUNING', label: 'Pruning', task: 'PRUNE', event: 'PRUNED' },
] as const
export const cadenceUnits = ['DAY', 'WEEK', 'MONTH', 'YEAR'] as const
export type Cadence = { activity: string; interval: number; unit: string }
export type CadenceOverride = { activity: string; mode: string; interval: number | null; unit: string | null }
export function validateCadence(interval: number, unit: string) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 3650 || !cadenceUnits.includes(unit as any)) {
    throw new Error('Choose a whole interval between 1 and 3650 and a supported unit.')
  }
}
export function resolveCadence(activity: string, defaults: Cadence[], overrides: CadenceOverride[] = []) {
  const override = overrides.find(row => row.activity === activity)
  const definition = defaults.find(row => row.activity === activity)
  if (override?.mode === 'DISABLED') return { cadence: null, source: 'Disabled' }
  if (override?.mode === 'OVERRIDE' && override.interval && override.unit) {
    return { cadence: { activity, interval: override.interval, unit: override.unit }, source: 'Custom' }
  }
  return { cadence: definition || null, source: definition ? 'From definition' : 'Not scheduled' }
}
export function cadenceLabel(cadence?: Pick<Cadence, 'interval' | 'unit'> | null): string {
  if (!cadence) return 'Not scheduled'
  return `Every ${cadence.interval} ${cadence.unit.toLowerCase()}${cadence.interval === 1 ? '' : 's'}`
}
// Calendar intervals clamp to the final day of the destination month, in the user's timezone.
export function cadenceDueAt(last: Date | null | undefined, cadence: Cadence | null, timezone?: string): Date | null {
  if (!last || !cadence) return null
  validateCadence(cadence.interval, cadence.unit)
  if (cadence.unit === 'DAY' || cadence.unit === 'WEEK') return addCalendarDays(last, cadence.interval * (cadence.unit === 'WEEK' ? 7 : 1), timezone)
  const [year, month, day] = dateInputValue(last, timezone).split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + cadence.interval * (cadence.unit === 'YEAR' ? 12 : 1), 1))
  const finalDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return parseDateLocal(`${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, finalDay)).padStart(2, '0')}`, timezone) || null
}
