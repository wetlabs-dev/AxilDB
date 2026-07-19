import { saveLocationEnvironmentProfile } from '@/app/location-environment-actions'
import { Button, Field, TextArea } from '@/components/ui'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

function Select({ label, name, values, defaultValue }: { label: string; name: string; values: string[]; defaultValue?: string | null }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-800">
      {label}
      <select className={selectClass} name={name} defaultValue={defaultValue || ''}>
        <option value="">Use inherited / unknown</option>
        {values.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ').toLowerCase()}</option>)}
      </select>
    </label>
  )
}

function BooleanSelect({ label, name, defaultValue }: { label: string; name: string; defaultValue?: boolean | null }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-800">
      {label}
      <select className={selectClass} name={name} defaultValue={defaultValue == null ? '' : String(defaultValue)}>
        <option value="">Use inherited / unknown</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  )
}

export function LocationEnvironmentForm({ collectionSlug, locationId, profile }: { collectionSlug: string; locationId: string; profile?: any }) {
  return (
    <form action={saveLocationEnvironmentProfile} className="grid gap-3 md:grid-cols-4">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      <input type="hidden" name="locationId" value={locationId} />
      <Field label="Day minimum (C)" name="temperatureMinC" type="number" step="0.1" defaultValue={profile?.temperatureMinC ?? ''} />
      <Field label="Day maximum (C)" name="temperatureMaxC" type="number" step="0.1" defaultValue={profile?.temperatureMaxC ?? ''} />
      <Field label="Night minimum (C)" name="nighttimeTemperatureMinC" type="number" step="0.1" defaultValue={profile?.nighttimeTemperatureMinC ?? ''} />
      <Field label="Night maximum (C)" name="nighttimeTemperatureMaxC" type="number" step="0.1" defaultValue={profile?.nighttimeTemperatureMaxC ?? ''} />
      <Field label="Humidity minimum (%)" name="humidityMinPercent" type="number" min="0" max="100" defaultValue={profile?.humidityMinPercent ?? ''} />
      <Field label="Humidity maximum (%)" name="humidityMaxPercent" type="number" min="0" max="100" defaultValue={profile?.humidityMaxPercent ?? ''} />
      <Select label="Light level" name="lightLevel" values={['VERY_LOW', 'LOW', 'MODERATE', 'BRIGHT', 'VERY_BRIGHT']} defaultValue={profile?.lightLevel} />
      <Select label="Light exposure" name="lightExposure" values={['INDIRECT', 'FILTERED', 'MORNING_DIRECT', 'AFTERNOON_DIRECT', 'FULL_DIRECT', 'ARTIFICIAL_ONLY', 'MIXED', 'UNKNOWN']} defaultValue={profile?.lightExposure} />
      <Field label="Minimum lux" name="lightMinLux" type="number" min="0" defaultValue={profile?.lightMinLux ?? ''} />
      <Field label="Maximum lux" name="lightMaxLux" type="number" min="0" defaultValue={profile?.lightMaxLux ?? ''} />
      <Field label="Photoperiod (hours)" name="photoperiodHours" type="number" step="0.5" min="0" max="24" defaultValue={profile?.photoperiodHours ?? ''} />
      <Select label="Airflow" name="airflowLevel" values={['STILL', 'LOW', 'MODERATE', 'HIGH', 'DRAFTY', 'UNKNOWN']} defaultValue={profile?.airflowLevel} />
      <Select label="Environment stability" name="environmentStability" values={['STABLE', 'MODERATELY_VARIABLE', 'HIGHLY_VARIABLE', 'SEASONAL', 'UNKNOWN']} defaultValue={profile?.environmentStability} />
      <Select label="Measurement source" name="measurementSource" values={['ESTIMATED', 'MANUAL_MEASUREMENT', 'SENSOR', 'UNKNOWN']} defaultValue={profile?.measurementSource} />
      <Field label="Measured on" name="measuredAt" type="date" defaultValue={profile?.measuredAt ? new Date(profile.measuredAt).toISOString().slice(0, 10) : ''} />
      <Select label="Confidence" name="confidence" values={['LOW', 'MEDIUM', 'HIGH']} defaultValue={profile?.confidence} />
      <BooleanSelect label="Supplemental light" name="supplementalLight" defaultValue={profile?.supplementalLight} />
      <Field label="Grow-light details" name="supplementalLightType" defaultValue={profile?.supplementalLightType} />
      <BooleanSelect label="Supplemental heat" name="supplementalHeat" defaultValue={profile?.supplementalHeat} />
      <BooleanSelect label="Humidifier" name="humidification" defaultValue={profile?.humidification} />
      <BooleanSelect label="Dehumidifier" name="dehumidification" defaultValue={profile?.dehumidification} />
      <BooleanSelect label="Fan / active airflow" name="activeAirflow" defaultValue={profile?.activeAirflow} />
      <BooleanSelect label="Near window" name="nearWindow" defaultValue={profile?.nearWindow} />
      <BooleanSelect label="Near HVAC vent / draft" name="nearHvacVent" defaultValue={profile?.nearHvacVent} />
      <BooleanSelect label="Enclosed cabinet / terrarium" name="enclosed" defaultValue={profile?.enclosed} />
      <TextArea label="Seasonal variation" name="seasonalVariationNotes" defaultValue={profile?.seasonalVariationNotes} wrapperClassName="md:col-span-2" />
      <TextArea label="Environmental notes" name="notes" defaultValue={profile?.notes} wrapperClassName="md:col-span-2" />
      <p className="text-xs text-stone-600 md:col-span-4">Blank fields inherit the nearest configured ancestor. Existing measurements are never guessed from a location name or type.</p>
      <Button className="w-fit md:col-span-4">Save environment profile</Button>
    </form>
  )
}
