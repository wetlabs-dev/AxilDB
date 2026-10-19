'use client'

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bug,
  ClipboardCheck,
  Droplets,
  Pencil,
  Scissors,
  Shovel,
  Sprout,
  type LucideIcon,
} from 'lucide-react'
import { saveCareCadences } from '@/app/care-cadence-actions'
import {
  cadenceActivities,
  supportsNotApplicable,
  evaluateCareScheduleCompleteness,
  cadenceLabel,
  cadenceUnits,
  resolveCadence,
  type Cadence,
  type CadenceOverride,
} from '@/lib/care-cadences'

type Props = {
  collectionSlug: string
  definitionId: string
  instanceId?: string
  defaults: Cadence[]
  overrides?: CadenceOverride[]
  canEdit: boolean
  hasRecipe: boolean
  recipeHref: string
  dueLabels?: Record<string, string>
}
const icons: Record<string, LucideIcon> = {
  WATERING: Droplets,
  FERTILIZING: Sprout,
  REPOTTING: Shovel,
  PEST_INSPECTION: Bug,
  GENERAL_INSPECTION: ClipboardCheck,
  PRUNING: Scissors,
}
const control =
  'min-h-11 min-w-0 max-w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900'

export function CareCadences(props: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  const opener = useRef<HTMLButtonElement | null>(null)
  const titleId = useId()
  const completeness = evaluateCareScheduleCompleteness(
    props.defaults,
    props.overrides,
    props.hasRecipe
  )
  function edit(activity: string, button: HTMLButtonElement) {
    opener.current = button
    setSaved('')
    setEditing(activity)
  }
  function close() {
    setEditing(null)
    requestAnimationFrame(() => opener.current?.focus())
  }
  return (
    <section
      id="care-cadences"
      aria-labelledby={titleId}
      className="care-cadences-module"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-xl font-bold">
            Care Cadences
          </h3>
          <p className="care-cadences-description">
            {props.instanceId
              ? 'Live definition defaults with your instance care settings.'
              : 'Default care intervals inherited by plant instances.'}
          </p>
        </div>
        {props.canEdit && (
          <button
            type="button"
            aria-label="Edit all care cadences"
            className="care-cadences-edit-all"
            onClick={(event) => edit('ALL', event.currentTarget)}
          >
            Edit all
          </button>
        )}
      </div>
      <p className="care-cadences-description" role="status">
        {completeness.complete
          ? 'Complete care schedule'
          : `${completeness.resolved} of ${completeness.total} care decisions resolved`}
      </p>
      <div className="care-cadences-grid">
        {cadenceActivities.map(({ activity, label }) => (
          <CareCadenceTile
            key={activity}
            {...props}
            activity={activity}
            label={label}
            onEdit={(button) => edit(activity, button)}
          />
        ))}
      </div>
      <span role="status" className="sr-only">
        {saved}
      </span>
      {editing && (
        <CadenceDialog
          key={editing}
          {...props}
          activity={editing}
          onClose={close}
          onSaved={() => {
            setSaved('Care cadences saved.')
            close()
          }}
        />
      )}
    </section>
  )
}

function CareCadenceTile({
  activity,
  label,
  onEdit,
  ...props
}: Props & {
  activity: string
  label: string
  onEdit: (button: HTMLButtonElement) => void
}) {
  const result = resolveCadence(activity, props.defaults, props.overrides)
  const blocked =
    activity === 'FERTILIZING' &&
    !props.hasRecipe &&
    result.status === 'SCHEDULED'
  const Icon = icons[activity]
  const value =
    result.status === 'NOT_APPLICABLE'
      ? 'Not applicable'
      : blocked
        ? 'Recipe required'
        : result.source === 'Disabled'
          ? 'Disabled for this instance'
          : cadenceLabel(result.cadence)
  const contents = (
    <>
      <span className="care-cadence-tile-heading">
        <Icon aria-hidden="true" size={17} strokeWidth={1.75} />
        <span>{label}</span>
        {props.canEdit && (
          <Pencil
            aria-hidden="true"
            size={14}
            className="care-cadence-pencil"
          />
        )}
      </span>
      <span
        className={`care-cadence-value${result.status === 'NOT_APPLICABLE' ? ' care-cadence-value-resolved' : blocked || !result.cadence ? ' care-cadence-value-muted' : ''}`}
      >
        {value}
      </span>
      {!blocked && props.instanceId && result.source !== 'Not scheduled' && (
        <span className="care-cadence-context">{result.source}</span>
      )}
      {!blocked &&
        props.instanceId &&
        ['Custom', 'Disabled'].includes(result.source) && (
          <span className="care-cadence-context">
            Definition default:{' '}
            {cadenceLabel(
              props.defaults.find((row) => row.activity === activity)
            )}
          </span>
        )}
      {!blocked &&
        result.status === 'SCHEDULED' &&
        result.cadence &&
        props.dueLabels?.[activity] && (
          <span className="care-cadence-context">
            {props.dueLabels[activity]}
          </span>
        )}
    </>
  )
  return props.canEdit ? (
    <button
      data-cadence-activity={activity}
      type="button"
      className="care-cadence-tile care-cadence-tile-editable"
      aria-label={`Edit ${label.toLowerCase()} cadence: ${value}`}
      onClick={(event) => onEdit(event.currentTarget)}
    >
      {contents}
    </button>
  ) : (
    <div data-cadence-activity={activity} className="care-cadence-tile">
      {contents}
    </div>
  )
}

function CadenceDialog({
  activity,
  onClose,
  onSaved,
  ...props
}: Props & { activity: string; onClose: () => void; onSaved: () => void }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const label = cadenceActivities.find(
    (row) => row.activity === activity
  )?.label
  const [error, action, pending] = useActionState(
    async (_: string, fd: FormData) => {
      try {
        await saveCareCadences(fd)
        router.refresh()
        onSaved()
        return ''
      } catch (error) {
        return error instanceof Error
          ? error.message
          : 'Could not save care cadences.'
      }
    },
    ''
  )
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="care-cadence-dialog"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onClose()
      }}
    >
      <h3 id={titleId} className="text-xl font-bold">
        {label ? `${label} cadence` : 'Edit all care cadences'}
      </h3>
      <p id={descriptionId} className="care-cadences-description">
        {props.instanceId
          ? 'Inherit the definition, schedule recurring care, or make an explicit care decision.'
          : 'Schedule recurring care, mark eligible activities not applicable, or leave a decision unresolved.'}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const fd = new FormData(event.currentTarget)
          startTransition(() => action(fd))
        }}
        className="mt-4 space-y-4"
      >
        <input
          type="hidden"
          name="collectionSlug"
          value={props.collectionSlug}
        />
        <input
          type="hidden"
          name="plantDefinitionId"
          value={props.definitionId}
        />
        <input
          type="hidden"
          name="plantInstanceId"
          value={props.instanceId || ''}
        />
        {activity !== 'ALL' && (
          <input type="hidden" name="activity" value={activity} />
        )}
        <fieldset disabled={pending} className="space-y-3">
          {cadenceActivities
            .filter((row) => activity === 'ALL' || row.activity === activity)
            .map((row) => (
              <CadenceEditor
                key={row.activity}
                {...props}
                activity={row.activity}
                label={row.label}
              />
            ))}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="care-cadence-dialog-actions">
          <button
            disabled={pending}
            className="min-h-11 rounded-md bg-[#2f6b45] px-4 py-2 text-white"
          >
            {pending
              ? 'Saving…'
              : activity === 'ALL'
                ? 'Save cadences'
                : 'Save cadence'}
          </button>
          <button
            type="button"
            disabled={pending}
            className={control}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  )
}

function CadenceEditor({
  activity,
  label,
  ...props
}: Props & { activity: string; label: string }) {
  const original = props.overrides?.find((row) => row.activity === activity)
  const definition = props.defaults.find((row) => row.activity === activity)
  const [mode, setMode] = useState(
    props.instanceId
      ? original?.mode || 'INHERIT'
      : definition
        ? definition.status === 'NOT_APPLICABLE'
          ? 'NOT_APPLICABLE'
          : 'OVERRIDE'
        : 'DISABLED'
  )
  const cadence = original?.mode === 'OVERRIDE' ? original : definition
  const blocked = activity === 'FERTILIZING' && !props.hasRecipe
  const [interval, setInterval] = useState(String(cadence?.interval || ''))
  const [unit, setUnit] = useState(cadence?.unit || 'DAY')
  const [initialDate, setInitialDate] = useState('')
  return (
    <fieldset className="min-w-0 rounded border border-stone-200 p-3">
      <legend className="px-1 font-semibold">{label}</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm">
          Schedule
          <select
            className={control}
            id={`${props.instanceId || props.definitionId}-${activity}`}
            name={`${activity}.mode`}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {props.instanceId && (
              <option value="INHERIT">Inherit from definition</option>
            )}
            <option value="OVERRIDE" disabled={blocked}>
              {props.instanceId ? 'Custom cadence' : 'Scheduled'}
            </option>
            {supportsNotApplicable(activity) && (
              <option value="NOT_APPLICABLE">Not applicable</option>
            )}
            <option value="DISABLED">Not scheduled</option>
          </select>
        </label>
        {mode === 'OVERRIDE' && (
          <>
            <label className="grid min-w-0 gap-1 text-sm">
              Every
              <input
                className={control}
                name={`${activity}.interval`}
                type="number"
                min="1"
                max="3650"
                step="1"
                required
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              Unit
              <select
                className={control}
                name={`${activity}.unit`}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              >
                {cadenceUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit.toLowerCase()}s
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {mode === 'NOT_APPLICABLE' && (
        <p className="care-cadence-context mt-2">
          No recurring schedule applies. Occasional care can still be logged
          manually.
        </p>
      )}
      {blocked && (
        <p className="care-cadence-context mt-2">
          Assign an active fertilizer recipe before scheduling.{' '}
          {props.canEdit && (
            <Link className="underline" href={props.recipeHref}>
              Assign recipe
            </Link>
          )}
        </p>
      )}
      {props.instanceId &&
        (mode === 'OVERRIDE' ||
          (mode === 'INHERIT' &&
            definition?.status !== 'NOT_APPLICABLE' &&
            definition)) && (
          <label className="mt-3 grid max-w-xs gap-1 text-sm">
            Set initial next due (optional)
            <input
              type="date"
              name={`${activity}.initialDate`}
              value={initialDate}
              onChange={(event) => setInitialDate(event.target.value)}
              className={control}
            />
            <span className="text-xs text-stone-600">
              Sets a due date without recording completed care.
            </span>
          </label>
        )}
      {props.instanceId && mode !== 'INHERIT' && (
        <button
          type="button"
          className="mt-2 min-h-11 text-sm underline"
          onClick={() => setMode('INHERIT')}
        >
          Reset to definition
        </button>
      )}
    </fieldset>
  )
}
