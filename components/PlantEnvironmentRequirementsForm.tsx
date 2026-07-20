import { Button, Field, TextArea } from '@/components/ui'
import { defaultUnitPreferences, lightInputValue, lightSymbol, temperatureInputValue, temperatureSymbol, type UnitPreferences } from '@/lib/units'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

const lightLevels = ['VERY_LOW', 'LOW', 'MODERATE', 'BRIGHT', 'VERY_BRIGHT']
const lightExposures = ['INDIRECT', 'FILTERED', 'MORNING_DIRECT', 'AFTERNOON_DIRECT', 'FULL_DIRECT', 'ARTIFICIAL_ONLY', 'MIXED', 'UNKNOWN']
const airflowLevels = ['STILL', 'LOW', 'MODERATE', 'HIGH', 'DRAFTY', 'UNKNOWN']
const stabilityLevels = ['STABLE', 'MODERATELY_VARIABLE', 'HIGHLY_VARIABLE', 'SEASONAL', 'UNKNOWN']

function label(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (character) => character.toUpperCase())
}

function EnvironmentSelect({ name, title, values, defaultValue }: { name: string; title: string; values: string[]; defaultValue?: string | null }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-800">
      {title}
      <select className={selectClass} name={name} defaultValue={defaultValue || ''}>
        <option value="">Not specified / inherit</option>
        {values.map((value) => <option key={value} value={value}>{label(value)}</option>)}
      </select>
    </label>
  )
}

export function PlantEnvironmentRequirementsForm({
  action,
  collectionSlug,
  plantDefinitionId,
  plantInstanceId,
  values,
  inheritedLabel,
  unitPreferences = defaultUnitPreferences,
}: {
  action: (formData: FormData) => void | Promise<void>
  collectionSlug: string
  plantDefinitionId?: string
  plantInstanceId?: string
  values?: any
  inheritedLabel?: string
  unitPreferences?: UnitPreferences
}) {
  const temperatureUnit = temperatureSymbol(unitPreferences.temperatureUnit)
  const measuredLightUnit = lightSymbol(unitPreferences.lightUnit)
  return (
    <form action={action} className="grid gap-3 md:grid-cols-4">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      {plantDefinitionId && <input type="hidden" name="plantDefinitionId" value={plantDefinitionId} />}
      {plantInstanceId && <input type="hidden" name="plantInstanceId" value={plantInstanceId} />}
      {inheritedLabel && <p className="rounded-md border border-[#d6dfc9] bg-[#f5f4e8] px-3 py-2 text-sm text-stone-700 md:col-span-4">Blank fields use {inheritedLabel}.</p>}
      <Field label={`Temperature minimum (${temperatureUnit})`} name="environmentTemperatureMinC" type="number" step="any" defaultValue={temperatureInputValue(values?.environmentTemperatureMinC, unitPreferences.temperatureUnit)} />
      <Field label={`Temperature maximum (${temperatureUnit})`} name="environmentTemperatureMaxC" type="number" step="any" defaultValue={temperatureInputValue(values?.environmentTemperatureMaxC, unitPreferences.temperatureUnit)} />
      <Field label={`Night minimum (${temperatureUnit})`} name="environmentNightTemperatureMinC" type="number" step="any" defaultValue={temperatureInputValue(values?.environmentNightTemperatureMinC, unitPreferences.temperatureUnit)} />
      <Field label={`Night maximum (${temperatureUnit})`} name="environmentNightTemperatureMaxC" type="number" step="any" defaultValue={temperatureInputValue(values?.environmentNightTemperatureMaxC, unitPreferences.temperatureUnit)} />
      <Field label="Humidity minimum (%)" name="environmentHumidityMinPercent" type="number" step="1" min="0" max="100" defaultValue={values?.environmentHumidityMinPercent ?? ''} />
      <Field label="Humidity maximum (%)" name="environmentHumidityMaxPercent" type="number" step="1" min="0" max="100" defaultValue={values?.environmentHumidityMaxPercent ?? ''} />
      <EnvironmentSelect name="environmentLightLevel" title="Preferred light level" values={lightLevels} defaultValue={values?.environmentLightLevel} />
      <EnvironmentSelect name="environmentLightExposure" title="Preferred exposure" values={lightExposures} defaultValue={values?.environmentLightExposure} />
      <Field label={`Minimum measured light (${measuredLightUnit})`} name="environmentLightMinLux" type="number" step="any" min="0" defaultValue={lightInputValue(values?.environmentLightMinLux, unitPreferences.lightUnit)} />
      <Field label={`Maximum measured light (${measuredLightUnit})`} name="environmentLightMaxLux" type="number" step="any" min="0" defaultValue={lightInputValue(values?.environmentLightMaxLux, unitPreferences.lightUnit)} />
      <Field label="Photoperiod minimum (hours)" name="environmentPhotoperiodMinHours" type="number" step="0.5" min="0" max="24" defaultValue={values?.environmentPhotoperiodMinHours ?? ''} />
      <Field label="Photoperiod maximum (hours)" name="environmentPhotoperiodMaxHours" type="number" step="0.5" min="0" max="24" defaultValue={values?.environmentPhotoperiodMaxHours ?? ''} />
      <EnvironmentSelect name="environmentAirflowLevel" title="Preferred airflow" values={airflowLevels} defaultValue={values?.environmentAirflowLevel} />
      <EnvironmentSelect name="environmentStability" title="Preferred stability" values={stabilityLevels} defaultValue={values?.environmentStability} />
      <label className="grid gap-1 text-sm font-medium text-stone-800">
        Draft sensitivity
        <select className={selectClass} name="environmentAvoidDrafts" defaultValue={values?.environmentAvoidDrafts == null ? '' : String(values.environmentAvoidDrafts)}>
          <option value="">Not specified / inherit</option>
          <option value="true">Avoid drafts</option>
          <option value="false">Not draft-sensitive</option>
        </select>
      </label>
      <TextArea label="Seasonal or dormancy notes" name="environmentSeasonalNotes" defaultValue={values?.environmentSeasonalNotes} wrapperClassName="md:col-span-3" />
      <Button className="w-fit md:col-span-4">Save environmental requirements</Button>
    </form>
  )
}
