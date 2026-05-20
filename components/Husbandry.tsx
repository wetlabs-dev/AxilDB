import Link from 'next/link'
import { Droplets, PencilLine, Skull, Sparkles, Sun } from 'lucide-react'
import {
  husbandryDifferences,
  husbandryFieldNames,
  husbandrySections,
  husbandrySummaryChoices,
  husbandrySummaryItems,
  isHusbandrySummaryChoiceField,
  type HusbandryFieldName,
  type HusbandrySummaryTone,
  type HusbandryValues,
} from '@/lib/husbandry'
import { cn } from '@/lib/utils'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { HusbandryMagicFillButton } from '@/components/HusbandryMagicFillButton'

const textareaClass = 'min-h-16'
const summaryToneClasses: Record<HusbandrySummaryTone, string> = {
  blue: 'border-sky-300 bg-sky-50 text-sky-800',
  green: 'border-[#b8c9ad] bg-[#eef4e8] text-[#2f6b45]',
  red: 'border-[#c47a5a]/40 bg-[#fff1e8] text-[#8a4b32]',
  yellow: 'border-[#d8bd72]/50 bg-[#fff8dc] text-[#735a1b]',
}
const summaryIcons = {
  summaryWater: Droplets,
  summaryLight: Sun,
  summaryToxicity: Skull,
}

function HusbandrySummaryControl({
  field,
  label,
  name,
  defaultValue,
}: {
  field: HusbandryFieldName
  label: string
  name: string
  defaultValue?: string | null
}) {
  if (!isHusbandrySummaryChoiceField(field)) {
    return null
  }

  return (
    <select
      name={name}
      defaultValue={defaultValue || ''}
      aria-label={label}
      className="rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30"
    >
      <option value="">Clear this field</option>
      {husbandrySummaryChoices[field].map((option) => (
        <option key={option.value} value={option.value}>
          {option.label} - {option.description}
        </option>
      ))}
    </select>
  )
}

export function HusbandryBadges({
  values,
  href,
  className = '',
}: {
  values?: HusbandryValues | null
  href?: string
  className?: string
}) {
  const badges = husbandrySummaryItems(values)
  if (badges.length === 0 && !href) return null

  return (
    <div className={cn('mt-2 flex flex-wrap gap-1.5 text-xs', className)}>
      {badges.slice(0, 3).map((badge) => {
        const Icon = summaryIcons[badge.field]
        return (
          <span key={`${badge.field}-${badge.label}`} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-1', summaryToneClasses[badge.tone])}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {badge.label}
          </span>
        )
      })}
      {href && (
        <Link className="rounded-full border border-stone-300 bg-white/70 px-2 py-1 text-stone-700 underline" href={href}>
          See full husbandry
        </Link>
      )}
    </div>
  )
}

export function HusbandryGuideView({
  values,
  baseValues,
  overrideValues,
  overrideAction,
  editAction,
  collectionSlug,
  plantInstanceId,
  plantDefinitionId,
  canOverride = false,
  canEdit = false,
  showEmptyFields = false,
  title = 'Plant husbandry',
  sourceLabel,
}: {
  values?: HusbandryValues | null
  baseValues?: HusbandryValues | null
  overrideValues?: HusbandryValues | null
  overrideAction?: any
  editAction?: any
  collectionSlug?: string
  plantInstanceId?: string
  plantDefinitionId?: string
  canOverride?: boolean
  canEdit?: boolean
  showEmptyFields?: boolean
  title?: string
  sourceLabel?: string
}) {
  const differences = husbandryDifferences(baseValues, values)
  const hasAny = husbandryFieldNames.some((field) => values?.[field])
  const canEditFields = canEdit && editAction && collectionSlug && plantDefinitionId

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-serif text-2xl font-semibold">{title}</h3>
        {sourceLabel && <p className="mt-1 text-sm text-stone-600">{sourceLabel}</p>}
        {!hasAny && <p className="mt-2 text-sm text-stone-600">No husbandry guide has been added yet.</p>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {husbandrySections.map((section) => {
          const rows = showEmptyFields ? section.fields : section.fields.filter(([field]) => values?.[field])
          if (rows.length === 0) return null
          return (
            <Card key={section.key} className="bg-white/55">
              <h4 className="font-serif text-lg font-semibold">{section.title}</h4>
              <dl className="mt-3 grid gap-2 text-sm">
                {rows.map(([field, label]) => (
                  <div key={field} className="grid gap-1 border-t border-stone-200 pt-2 first:border-t-0 first:pt-0">
                    <dt className="flex flex-wrap items-center gap-2 font-semibold text-stone-800">
                      <span>{label}</span>
                      {differences.has(field) && <span className="rounded-full border border-[#c4a86a]/40 bg-[#fff5d6] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-[#6f541f]">Local adjustment</span>}
                      {canEditFields && (
                        <details className="relative inline-block max-w-full">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full border border-[#b8c9ad] bg-[#eef4e8] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#2f6b45] hover:bg-[#dfead7]">
                            <PencilLine className="h-3 w-3" />
                            Edit
                          </summary>
                          <form action={editAction} className="absolute right-0 z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-lg border border-[#b8c9ad] bg-[#f3f7ed] p-3 text-sm normal-case tracking-normal shadow-xl sm:left-0 sm:right-auto">
                            <input type="hidden" name="collectionSlug" value={collectionSlug} />
                            <input type="hidden" name="plantDefinitionId" value={plantDefinitionId} />
                            <input type="hidden" name="fieldName" value={field} />
                            <label className="grid gap-1 font-medium text-stone-800">
                              {label}
                              {isHusbandrySummaryChoiceField(field) ? (
                                <HusbandrySummaryControl field={field} label={label} name="fieldValue" defaultValue={values?.[field]} />
                              ) : (
                                <textarea
                                  name="fieldValue"
                                  defaultValue={values?.[field] || ''}
                                  className="min-h-24 rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30"
                                  placeholder="Leave blank if this does not apply yet."
                                />
                              )}
                            </label>
                            <p className="text-xs font-normal text-stone-600">Leave blank and save to clear this field.</p>
                            <Button className="w-fit px-3 py-1.5 text-xs">Save field</Button>
                          </form>
                        </details>
                      )}
                      {canOverride && overrideAction && collectionSlug && plantInstanceId && (
                        <details className="relative inline-block max-w-full">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full border border-[#b8c9ad] bg-[#eef4e8] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#2f6b45] hover:bg-[#dfead7]">
                            <PencilLine className="h-3 w-3" />
                            Override
                          </summary>
                          <form action={overrideAction} className="absolute right-0 z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-lg border border-[#b8c9ad] bg-[#f3f7ed] p-3 text-sm normal-case tracking-normal shadow-xl sm:left-0 sm:right-auto">
                            <input type="hidden" name="collectionSlug" value={collectionSlug} />
                            <input type="hidden" name="plantInstanceId" value={plantInstanceId} />
                            <input type="hidden" name="fieldName" value={field} />
                            <label className="grid gap-1 font-medium text-stone-800">
                              Local {label.toLowerCase()}
                              {isHusbandrySummaryChoiceField(field) ? (
                                <HusbandrySummaryControl field={field} label={`Local ${label.toLowerCase()}`} name="fieldValue" defaultValue={overrideValues?.[field]} />
                              ) : (
                                <textarea
                                  name="fieldValue"
                                  defaultValue={overrideValues?.[field] || ''}
                                  className="min-h-24 rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30"
                                  placeholder={String(baseValues?.[field] || values?.[field] || '')}
                                />
                              )}
                            </label>
                            <p className="text-xs font-normal text-stone-600">Leave blank and save to remove this local adjustment.</p>
                            <Button className="w-fit px-3 py-1.5 text-xs">Save override</Button>
                          </form>
                        </details>
                      )}
                    </dt>
                    <dd className={cn('text-stone-700', !values?.[field] && 'text-stone-400')}>{values?.[field] || '—'}</dd>
                    {differences.has(field) && baseValues?.[field] && <dd className="text-xs text-stone-500">Inherited: {baseValues[field]}</dd>}
                  </div>
                ))}
              </dl>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export function HusbandryGuideForm({
  values,
  plant,
  collectionSlug,
  action,
  submitLabel,
  includeMagicFill = false,
}: {
  values?: HusbandryValues | null
  plant?: any
  collectionSlug: string
  action: any
  submitLabel: string
  includeMagicFill?: boolean
}) {
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      {plant?.id && <input type="hidden" name="plantDefinitionId" value={plant.id} />}
      {(values as any)?.aiGeneratedAt && <input type="hidden" name="existingAiGeneratedAt" value={String((values as any).aiGeneratedAt)} />}
      {includeMagicFill && plant && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 px-3 py-2 text-sm text-stone-700">
          <span className="min-w-0">Draft a complete care guide from the plant definition, then review before saving.</span>
          <HusbandryMagicFillButton plant={plant} />
        </div>
      )}
      <div className="grid gap-4">
        {husbandrySections.map((section) => (
          <div key={section.key} className="rounded-lg border border-stone-200 bg-white/50 p-3">
            <h4 className="font-serif text-lg font-semibold">{section.title}</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {section.fields.map(([field, label]) => (
                isHusbandrySummaryChoiceField(field) ? (
                  <label key={field} className="grid gap-1 text-sm font-medium text-stone-800">
                    <span>{label}</span>
                    <HusbandrySummaryControl field={field} label={label} name={field} defaultValue={values?.[field]} />
                  </label>
                ) : (
                  <TextArea
                    key={field}
                    label={label}
                    name={field}
                    defaultValue={values?.[field] || ''}
                    className={textareaClass}
                    wrapperClassName={section.key === 'summary' ? '' : undefined}
                  />
                )
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Review status" name="reviewStatus" defaultValue={(values as any)?.reviewStatus || 'DRAFT'}>
          <option value="DRAFT">Draft</option>
          <option value="REVIEWED">Reviewed</option>
        </Select>
        <Field label="AI model" name="aiModel" defaultValue={(values as any)?.aiModel || ''} />
        <TextArea label="Review notes" name="reviewNotes" defaultValue={(values as any)?.reviewNotes || ''} wrapperClassName="md:col-span-2" />
      </div>
      <Button className="w-fit">{submitLabel}</Button>
    </form>
  )
}

export function HusbandryOverrideForm({
  values,
  collectionSlug,
  plantInstanceId,
  action,
}: {
  values?: HusbandryValues | null
  collectionSlug: string
  plantInstanceId: string
  action: any
}) {
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="collectionSlug" value={collectionSlug} />
      <input type="hidden" name="plantInstanceId" value={plantInstanceId} />
      <div className="rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 px-3 py-2 text-sm text-stone-700">
        Fill only fields that are different for this specific specimen. Blank fields inherit from the plant definition guide.
      </div>
      <div className="grid gap-4">
        {husbandrySections.map((section) => (
          <div key={section.key} className="rounded-lg border border-stone-200 bg-white/50 p-3">
            <h4 className="font-serif text-lg font-semibold">{section.title}</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {section.fields.map(([field, label]) => (
                isHusbandrySummaryChoiceField(field) ? (
                  <label key={field} className="grid gap-1 text-sm font-medium text-stone-800">
                    <span>{label}</span>
                    <HusbandrySummaryControl field={field} label={label} name={field} defaultValue={values?.[field]} />
                  </label>
                ) : (
                  <TextArea key={field} label={label} name={field} defaultValue={values?.[field] || ''} className={textareaClass} />
                )
              ))}
            </div>
          </div>
        ))}
      </div>
      <TextArea label="Override notes" name="overrideNotes" defaultValue={(values as any)?.overrideNotes || ''} />
      <Button className="w-fit">Save local husbandry adjustments</Button>
    </form>
  )
}

export function HusbandryEmptyPrompt() {
  return (
    <div className="rounded-lg border border-dashed border-[#b8c9ad] bg-[#f7f4e8]/70 p-4 text-sm text-stone-700">
      <div className="flex items-center gap-2 font-semibold text-[#2f6b45]">
        <Sparkles className="h-4 w-4" />
        Husbandry-ready
      </div>
      <p className="mt-1">Add a guide manually, link one from a similar plant, or let AI draft a starting point.</p>
    </div>
  )
}
