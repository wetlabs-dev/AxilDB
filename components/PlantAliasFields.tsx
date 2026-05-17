'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { aliasTypeOptions, confidenceOptions } from '@/lib/taxonomy'
import { Button, HelpTooltip, SuggestionDatalist } from '@/components/ui'

type Alias = {
  id?: string
  name?: string | null
  aliasType?: string | null
  source?: string | null
  confidence?: string | null
  notes?: string | null
}

type AliasRow = Alias & { rowKey: string }

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

function createRow(alias: Alias = {}): AliasRow {
  return {
    ...alias,
    rowKey: alias.id || globalThis.crypto?.randomUUID?.() || `alias-${Date.now()}-${Math.random()}`,
  }
}

export function ConfidenceSelect({
  name,
  label = 'Confidence',
  help = 'How certain this identification or name relationship is. Use confirmed when verified from reliable evidence, probable when likely, and uncertain when the record still needs checking.',
  defaultValue = 'UNCERTAIN',
}: {
  name: string
  label?: string
  help?: string
  defaultValue?: string | null
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-800">
      <span className="flex items-center gap-1.5">
        <span>{label}</span>
        {help && <HelpTooltip>{help}</HelpTooltip>}
      </span>
      <select className={control} name={name} defaultValue={defaultValue || 'UNCERTAIN'}>
        {confidenceOptions.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PlantAliasFields({
  aliases = [],
  submitLabel = 'Save changes',
  sourceSuggestions = [],
}: {
  aliases?: Alias[]
  submitLabel?: string
  sourceSuggestions?: string[]
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState<AliasRow[]>(() => (aliases.length > 0 ? aliases.map(createRow) : [createRow()]))

  function addAliasRow() {
    setRows((current) => [...current, createRow()])
  }

  function removeAliasRow(index: number) {
    setRows((current) => {
      const nextRows = current.filter((_, rowIndex) => rowIndex !== index)
      return nextRows.length > 0 ? nextRows : [createRow()]
    })
  }

  useEffect(() => {
    function replaceAliases(event: Event) {
      const detail = (event as CustomEvent<{ aliases?: Alias[]; form?: HTMLFormElement }>).detail
      if (detail?.form && rootRef.current && !detail.form.contains(rootRef.current)) return
      const nextRows = detail?.aliases?.filter((alias) => alias.name?.trim()) || []
      setRows(nextRows.length > 0 ? nextRows.map(createRow) : [createRow()])
    }

    window.addEventListener('axildb:replace-aliases', replaceAliases)
    return () => window.removeEventListener('axildb:replace-aliases', replaceAliases)
  }, [])

  return (
    <div ref={rootRef} className="lg:col-span-4">
      <SuggestionDatalist id="alias-source-suggestions" suggestions={sourceSuggestions} />
      <div className="mb-2">
        <h3 className="font-serif text-lg font-semibold">Aliases and alternate names</h3>
        <p className="text-sm text-stone-600">
          Use aliases for synonyms, old taxonomy, trade names, common names, shorthand, and misapplied labels.
        </p>
      </div>
      <div className="grid gap-2">
        {rows.map((alias, index) => (
          <div key={alias.rowKey} className="grid gap-2 rounded-lg border border-stone-200 bg-[#fffdf7]/70 p-2.5 lg:grid-cols-[minmax(13rem,1.6fr)_minmax(8rem,.9fr)_minmax(8rem,.9fr)_minmax(11rem,1fr)]">
            <div className="flex items-center justify-between gap-2 lg:col-span-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Alias {index + 1}</span>
              <button
                type="button"
                onClick={() => removeAliasRow(index)}
                className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-white"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            </div>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Name
              <input className={control} name="aliasName" defaultValue={alias.name || ''} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span className="flex items-center gap-1.5">
                <span>Type</span>
                <HelpTooltip>What kind of alternate name this is, such as a synonym, common name, obsolete taxonomy, trade name, or misapplied label.</HelpTooltip>
              </span>
              <select className={control} name="aliasType" defaultValue={alias.aliasType || 'SYNONYM'}>
                {aliasTypeOptions.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <ConfidenceSelect name="aliasConfidence" defaultValue={alias.confidence || 'UNCERTAIN'} />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span className="flex items-center gap-1.5">
                <span>Source</span>
                <HelpTooltip>Where this alternate name came from: a seller label, registry, publication, website, grower note, or your own observation.</HelpTooltip>
              </span>
              <input className={control} name="aliasSource" defaultValue={alias.source || ''} list="alias-source-suggestions" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800 lg:col-span-4">
              Notes
              <input className={control} name="aliasNotes" defaultValue={alias.notes || ''} />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button className="px-3 py-1.5" type="button" onClick={addAliasRow}>
          Add another alias
        </Button>
        <Button>{submitLabel}</Button>
      </div>
    </div>
  )
}
