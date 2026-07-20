import type { CompatibilityResult, EffectiveLocationEnvironment } from '@/lib/location-compatibility'
import { defaultUnitPreferences, formatLightRange, formatTemperatureRange, type UnitPreferences } from '@/lib/units'
import { cn } from '@/lib/utils'

const statusLabels = {
  GOOD_MATCH: 'Good match',
  CAUTION: 'Review recommended',
  POOR_MATCH: 'Poor match',
  INSUFFICIENT_DATA: 'Not enough information',
} as const

const statusClasses = {
  GOOD_MATCH: 'border-[#a8c49a] bg-[#edf3e6] text-[#285d3b]',
  CAUTION: 'border-[#d8bb72] bg-[#fff7dc] text-[#71551b]',
  POOR_MATCH: 'border-[#c98b74] bg-[#fff0e8] text-[#873f2b]',
  INSUFFICIENT_DATA: 'border-stone-300 bg-stone-100/80 text-stone-700',
} as const

function display(value: unknown) {
  if (value == null || value === '') return 'Unknown'
  if (value instanceof Date) return value.toLocaleDateString()
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value).replaceAll('_', ' ').toLowerCase()
}

export function EffectiveEnvironmentSummary({ environment, unitPreferences = defaultUnitPreferences }: { environment: EffectiveLocationEnvironment; unitPreferences?: UnitPreferences }) {
  const rows = [
    ['Temperature', 'temperatureMinC', 'temperatureMaxC', (min: number | null, max: number | null) => formatTemperatureRange(min, max, unitPreferences.temperatureUnit)],
    ['Humidity', 'humidityMinPercent', 'humidityMaxPercent', (min: number | null, max: number | null) => min != null && max != null ? `${min}–${max}%` : min != null ? `at least ${min}%` : max != null ? `up to ${max}%` : 'Unknown'],
    ['Measured light', 'lightMinLux', 'lightMaxLux', (min: number | null, max: number | null) => formatLightRange(min, max, unitPreferences.lightUnit)],
  ] as const
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, minField, maxField, formatter]) => {
        const min = environment.values[minField]
        const max = environment.values[maxField]
        const source = min || max
        return (
          <div key={label} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-2.5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{label}</p>
            <p className="font-semibold">{min || max ? formatter(min?.value == null ? null : Number(min.value), max?.value == null ? null : Number(max.value)) : 'Not configured'}</p>
            {source && <p className="text-xs text-stone-600">{source.inherited ? `Inherited from ${source.sourceLocationCode} ${source.sourceLocationName}` : 'Set locally'}</p>}
          </div>
        )
      })}
      {(['lightLevel', 'lightExposure', 'photoperiodHours', 'airflowLevel', 'environmentStability'] as const).map((field) => {
        const entry = environment.values[field]
        return (
          <div key={field} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-2.5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{field.replaceAll(/([A-Z])/g, ' $1')}</p>
            <p className="font-semibold capitalize">{display(entry?.value)}</p>
            {entry && <p className="text-xs text-stone-600">{entry.inherited ? `Inherited from ${entry.sourceLocationCode} ${entry.sourceLocationName}` : 'Set locally'}</p>}
          </div>
        )
      })}
    </div>
  )
}

function preferredCheckRange(check: CompatibilityResult['checks'][number], side: 'plant' | 'location', unitPreferences: UnitPreferences) {
  if (!check.measurement) return side === 'plant' ? check.plantRequirement : check.locationValue
  const min = check.measurement[side === 'plant' ? 'plantMin' : 'locationMin']
  const max = check.measurement[side === 'plant' ? 'plantMax' : 'locationMax']
  if (check.measurement.dimension === 'TEMPERATURE') return formatTemperatureRange(min, max, unitPreferences.temperatureUnit)
  if (check.measurement.dimension === 'LIGHT') return formatLightRange(min, max, unitPreferences.lightUnit)
  return side === 'plant' ? check.plantRequirement : check.locationValue
}

export function PlantLocationCompatibilityPanel({ result, title = 'Location compatibility', compact = false, unitPreferences = defaultUnitPreferences }: { result: CompatibilityResult; title?: string; compact?: boolean; unitPreferences?: UnitPreferences }) {
  const visibleChecks = compact ? result.checks.filter((check) => check.status === 'CAUTION' || check.status === 'CONFLICT') : result.checks
  return (
    <section className={cn('rounded-lg border p-3', statusClasses[result.overallStatus])} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em]">{title}</p>
          <p className="mt-1 font-serif text-xl font-semibold">{statusLabels[result.overallStatus]}</p>
        </div>
        <span className="rounded-full border border-current/20 bg-white/40 px-2.5 py-1 text-xs font-semibold">Advisory</span>
      </div>
      <p className="mt-2 text-sm">{result.summary}</p>
      {visibleChecks.length > 0 && (
        <div className="mt-3 grid gap-2">
          {visibleChecks.map((check) => (
            <div key={check.category} className="rounded-md border border-current/15 bg-white/45 p-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{check.category}</strong>
                <span className="text-xs font-bold uppercase tracking-[0.12em]">{check.status.toLowerCase()}</span>
              </div>
              <p className="mt-1">{check.explanation}</p>
              <p className="mt-1 text-xs opacity-80">Plant: {preferredCheckRange(check, 'plant', unitPreferences)} · Location: {preferredCheckRange(check, 'location', unitPreferences)}</p>
            </div>
          ))}
        </div>
      )}
      {result.missingData.length > 0 && <p className="mt-2 text-xs opacity-80">Missing comparison data: {result.missingData.join(', ')}.</p>}
    </section>
  )
}
