import {
  cadenceLabel,
  resolveCadence,
  type Cadence,
  type CadenceOverride,
} from '@/lib/care-cadences'
export function repottingCadenceLabel(
  defaults: Cadence[],
  overrides: CadenceOverride[] = []
) {
  const c = resolveCadence('REPOTTING', defaults, overrides)
  return c.status === 'NOT_APPLICABLE'
    ? 'Not applicable'
    : c.cadence
      ? cadenceLabel(c.cadence)
      : 'Not scheduled'
}
