import { Button, Field, TextArea } from '@/components/ui'

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
}: {
  action: (formData: FormData) => void | Promise<void>
  collectionSlug: string
  plantDefinitionId?: string
  plantInstanceId?: string
  values?: any
  inheritedLabel?: string
}) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-4">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      {plantDefinitionId && <input type="hidden" name="plantDefinitionId" value={plantDefinitionId} />}
      {plantInstanceId && <input type="hidden" name="plantInstanceId" value={plantInstanceId} />}
      {inheritedLabel && <p className="rounded-md border border-[#d6dfc9] bg-[#f5f4e8] px-3 py-2 text-sm text-stone-700 md:col-span-4">Blank fields use {inheritedLabel}.</p>}
      <Field label="Temperature minimum (C)" name="environmentTemperatureMinC" type="number" step="0.1" defaultValue={values?.environmentTemperatureMinC ?? ''} />
      <Field label="Temperature maximum (C)" name="environmentTemperatureMaxC" type="number" step="0.1" defaultValue={values?.environmentTemperatureMaxC ?? ''} />
      <Field label="Night minimum (C)" name="environmentNightTemperatureMinC" type="number" step="0.1" defaultValue={values?.environmentNightTemperatureMinC ?? ''} />
      <Field label="Night maximum (C)" name="environmentNightTemperatureMaxC" type="number" step="0.1" defaultValue={values?.environmentNightTemperatureMaxC ?? ''} />
      <Field label="Humidity minimum (%)" name="environmentHumidityMinPercent" type="number" step="1" min="0" max="100" defaultValue={values?.environmentHumidityMinPercent ?? ''} />
      <Field label="Humidity maximum (%)" name="environmentHumidityMaxPercent" type="number" step="1" min="0" max="100" defaultValue={values?.environmentHumidityMaxPercent ?? ''} />
      <EnvironmentSelect name="environmentLightLevel" title="Preferred light level" values={lightLevels} defaultValue={values?.environmentLightLevel} />
      <EnvironmentSelect name="environmentLightExposure" title="Preferred exposure" values={lightExposures} defaultValue={values?.environmentLightExposure} />
      <Field label="Minimum lux" name="environmentLightMinLux" type="number" min="0" defaultValue={values?.environmentLightMinLux ?? ''} />
      <Field label="Maximum lux" name="environmentLightMaxLux" type="number" min="0" defaultValue={values?.environmentLightMaxLux ?? ''} />
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
