import { addCalendarDays, dateInputValue, parseDateLocal } from '@/lib/time'

export const cadenceActivities = [
  { activity: 'WATERING', label: 'Watering', task: 'WATER', event: 'WATERED' },
  {
    activity: 'FERTILIZING',
    label: 'Fertilizing',
    task: 'FERTILIZE',
    event: 'FERTILIZED',
  },
  {
    activity: 'REPOTTING',
    label: 'Repotting',
    task: 'REPOT',
    event: 'REPOTTED',
  },
  {
    activity: 'PEST_INSPECTION',
    label: 'Pest inspection',
    task: 'PEST_CHECK',
    event: 'PEST_CHECK',
  },
  {
    activity: 'GENERAL_INSPECTION',
    label: 'General inspection',
    task: 'HEALTH_CHECK',
    event: 'HEALTH_CHECK',
  },
  { activity: 'PRUNING', label: 'Pruning', task: 'PRUNE', event: 'PRUNED' },
] as const
export const cadenceUnits = ['DAY', 'WEEK', 'MONTH', 'YEAR'] as const
export type CareCadenceStatus = 'SCHEDULED' | 'NOT_APPLICABLE' | 'NOT_SCHEDULED'
export type Cadence = {
  activity: string
  status?: string
  interval: number | null
  unit: string | null
}
export const supportsNotApplicable = (activity: string) =>
  ['FERTILIZING', 'REPOTTING', 'PRUNING'].includes(activity)
export function validateCadenceState(
  activity: string,
  status: string,
  interval?: number | null,
  unit?: string | null
) {
  if (!cadenceActivities.some((a) => a.activity === activity))
    throw new Error('Invalid care activity.')
  if (status === 'SCHEDULED') return validateCadence(interval!, unit!)
  if (!['NOT_APPLICABLE', 'NOT_SCHEDULED'].includes(status))
    throw new Error('Invalid cadence state.')
  if (status === 'NOT_APPLICABLE' && !supportsNotApplicable(activity))
    throw new Error(
      'This activity requires a scheduled cadence; N/A is not allowed.'
    )
  if (interval != null || unit != null)
    throw new Error('Unscheduled decisions cannot retain an interval or unit.')
}
export type CadenceOverride = {
  activity: string
  mode: string
  interval: number | null
  unit: string | null
}
export function validateCadence(interval: number, unit: string) {
  if (
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 3650 ||
    !cadenceUnits.includes(unit as any)
  ) {
    throw new Error(
      'Choose a whole interval between 1 and 3650 and a supported unit.'
    )
  }
}
export function resolveCadence(
  activity: string,
  defaults: Cadence[],
  overrides: CadenceOverride[] = []
) {
  const override = overrides.find((row) => row.activity === activity)
  const definition = defaults.find((row) => row.activity === activity)
  const source = override
    ? override.mode === 'DISABLED'
      ? 'Disabled'
      : 'Custom'
    : definition
      ? 'From definition'
      : 'Not scheduled'
  const state = override
    ? override.mode === 'NOT_APPLICABLE'
      ? 'NOT_APPLICABLE'
      : override.mode === 'OVERRIDE'
        ? 'SCHEDULED'
        : 'NOT_SCHEDULED'
    : definition?.status || (definition ? 'SCHEDULED' : 'NOT_SCHEDULED')
  const value = override || definition
  const cadence =
    state === 'SCHEDULED' && value?.interval && value.unit
      ? { activity, interval: value.interval, unit: value.unit }
      : null
  return { cadence, status: state as CareCadenceStatus, source }
}
export function evaluateCareScheduleCompleteness(
  defaults: Cadence[],
  overrides: CadenceOverride[] = [],
  hasRecipe = true
) {
  const unresolved: string[] = [],
    invalid: string[] = []
  let resolved = 0
  for (const { activity } of cadenceActivities) {
    const result = resolveCadence(activity, defaults, overrides)
    const decision =
      overrides.find((row) => row.activity === activity) ||
      defaults.find((row) => row.activity === activity)
    try {
      validateCadenceState(
        activity,
        result.status,
        decision?.interval,
        decision?.unit
      )
      if (
        result.status === 'SCHEDULED' &&
        activity === 'FERTILIZING' &&
        !hasRecipe
      )
        throw new Error('Recipe required')
      if (result.status === 'NOT_SCHEDULED') unresolved.push(activity)
      else resolved++
    } catch {
      invalid.push(activity)
    }
  }
  return {
    complete: resolved === cadenceActivities.length,
    resolved,
    total: cadenceActivities.length,
    unresolved,
    invalid,
  }
}
export function cadenceLabel(
  cadence?: Pick<Cadence, 'interval' | 'unit' | 'status'> | null
): string {
  if (cadence?.status === 'NOT_APPLICABLE') return 'Not applicable'
  if (!cadence || !cadence.interval || !cadence.unit) return 'Not scheduled'
  return `Every ${cadence.interval} ${cadence.unit.toLowerCase()}${cadence.interval === 1 ? '' : 's'}`
}
// Calendar intervals clamp to the final day of the destination month, in the user's timezone.
export function cadenceDueAt(
  last: Date | null | undefined,
  cadence: Cadence | null,
  timezone?: string
): Date | null {
  if (
    !last ||
    !cadence ||
    cadence.status === 'NOT_APPLICABLE' ||
    cadence.status === 'NOT_SCHEDULED'
  )
    return null
  const interval = cadence.interval!,
    unit = cadence.unit!
  validateCadence(interval, unit)
  if (unit === 'DAY' || unit === 'WEEK')
    return addCalendarDays(last, interval * (unit === 'WEEK' ? 7 : 1), timezone)
  const [year, month, day] = dateInputValue(last, timezone)
    .split('-')
    .map(Number)
  const target = new Date(
    Date.UTC(year, month - 1 + interval * (unit === 'YEAR' ? 12 : 1), 1)
  )
  const finalDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  return (
    parseDateLocal(
      `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, finalDay)).padStart(2, '0')}`,
      timezone
    ) || null
  )
}
