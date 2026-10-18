'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveCareCadences } from '@/app/care-cadence-actions'
import { cadenceActivities, cadenceLabel, cadenceUnits, resolveCadence, type Cadence, type CadenceOverride } from '@/lib/care-cadences'

type Props = { collectionSlug: string; definitionId: string; instanceId?: string; defaults: Cadence[]; overrides?: CadenceOverride[]; canEdit: boolean; hasRecipe: boolean; recipeHref: string; dueLabels?: Record<string, string> }
const control = 'min-h-11 min-w-0 max-w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900'
export function CareCadences(props: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, action, pending] = useActionState(async (_: string, fd: FormData) => {
    try { await saveCareCadences(fd); router.refresh(); setEditing(false); return '' } catch (error) { return error instanceof Error ? error.message : 'Could not save care cadences.' }
  }, '')
  return <section id="care-cadences" className="min-w-0 rounded-lg border border-stone-200 bg-white/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">Care Cadences</h3>{props.canEdit && !editing && <button className={control} onClick={() => setEditing(true)}>Edit care cadences</button>}</div>
    <p className="mt-2 text-sm text-stone-600">{props.instanceId ? 'Inherit live defaults, customize an interval, or disable care for this instance.' : 'Defaults automatically apply to instances that have not customized their schedules.'}</p>
    {editing ? <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="collectionSlug" value={props.collectionSlug} /><input type="hidden" name="plantDefinitionId" value={props.definitionId} /><input type="hidden" name="plantInstanceId" value={props.instanceId || ''} />
      {cadenceActivities.map(({ activity, label }) => <CadenceEditor key={activity} activity={activity} label={label} {...props} />)}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3"><button disabled={pending} className="min-h-11 rounded-md bg-[#2f6b45] px-4 py-2 text-white">{pending ? 'Saving…' : 'Save cadences'}</button><button type="button" disabled={pending} className={control} onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : <dl className="mt-4 divide-y divide-stone-200">{cadenceActivities.map(({ activity, label }) => {
      const result = resolveCadence(activity, props.defaults, props.overrides)
      const source = props.instanceId ? result.source : ''
      return <div key={activity} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt className="font-semibold">{label}{props.canEdit && <button type="button" aria-label={`Edit ${label.toLowerCase()} cadence`} className="ml-2 min-h-11 px-2 font-normal underline" onClick={() => { setEditing(true); requestAnimationFrame(() => document.getElementById(`${props.instanceId || props.definitionId}-${activity}`)?.focus()) }}>Edit</button>}</dt><dd className="min-w-0 text-right"><p>{result.source === 'Disabled' ? 'Disabled for this instance' : cadenceLabel(result.cadence)}</p>{source && source !== 'Not scheduled' && <p className="text-xs text-stone-600">{source}</p>}{props.instanceId && (source === 'Custom' || source === 'Disabled') && <p className="text-xs text-stone-600">Definition default: {cadenceLabel(props.defaults.find(row => row.activity === activity))}</p>}{result.cadence && props.dueLabels?.[activity] && <p>{props.dueLabels[activity]}</p>}</dd></div>
    })}</dl>}
    {!props.hasRecipe && <p className="mt-3 text-sm">Assign a fertilizer recipe to the definition to enable scheduled fertilizing. <Link className="underline" href={props.recipeHref}>Manage fertilizer recipes</Link></p>}
  </section>
}
function CadenceEditor({ activity, label, ...props }: Props & { activity: string; label: string }) {
  const original = props.overrides?.find(row => row.activity === activity)
  const definition = props.defaults.find(row => row.activity === activity)
  const [mode, setMode] = useState(props.instanceId ? original?.mode || 'INHERIT' : definition ? 'OVERRIDE' : 'DISABLED')
  const cadence = original?.mode === 'OVERRIDE' ? original : definition
  return <fieldset className="min-w-0 rounded border border-stone-200 p-3"><legend className="px-1 font-semibold">{label}</legend>
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      <label className="grid min-w-0 gap-1 text-sm">Schedule<select className={control} id={`${props.instanceId || props.definitionId}-${activity}`} name={`${activity}.mode`} value={mode} onChange={e => setMode(e.target.value)}>
        {props.instanceId && <option value="INHERIT">Inherit from definition</option>}<option value="OVERRIDE" disabled={activity === 'FERTILIZING' && !props.hasRecipe}>{props.instanceId ? 'Custom cadence' : 'Scheduled'}</option><option value="DISABLED">{props.instanceId ? 'Disabled for this instance' : 'Not scheduled'}</option>
      </select></label>
      {mode === 'OVERRIDE' && <><label className="grid min-w-0 gap-1 text-sm">Every<input className={control} name={`${activity}.interval`} type="number" min="1" max="3650" step="1" required defaultValue={cadence?.interval || ''} /></label><label className="grid min-w-0 gap-1 text-sm">Unit<select className={control} name={`${activity}.unit`} defaultValue={cadence?.unit || 'DAY'}>{cadenceUnits.map(unit => <option key={unit} value={unit}>{unit.toLowerCase()}s</option>)}</select></label></>}
    </div>
    {props.instanceId && mode !== 'DISABLED' && <label className="mt-3 grid max-w-xs gap-1 text-sm">Set initial next due (optional)<input type="date" name={`${activity}.initialDate`} className={control} /><span className="text-xs text-stone-600">Sets a due date without recording completed care.</span></label>}
    {props.instanceId && mode !== 'INHERIT' && <button type="button" className="mt-2 min-h-11 text-sm underline" onClick={() => setMode('INHERIT')}>Reset to definition</button>}
  </fieldset>
}
