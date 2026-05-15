import { aliasTypeOptions, confidenceOptions } from '@/lib/taxonomy'

type Alias = {
  id?: string
  name?: string | null
  aliasType?: string | null
  source?: string | null
  confidence?: string | null
  notes?: string | null
}

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export function ConfidenceSelect({
  name,
  label = 'Confidence',
  defaultValue = 'UNCERTAIN',
}: {
  name: string
  label?: string
  defaultValue?: string | null
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-800">
      {label}
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

export function PlantAliasFields({ aliases = [] }: { aliases?: Alias[] }) {
  const rows = [
    ...aliases,
    ...Array.from({ length: Math.max(2, 3 - aliases.length) }, () => ({} as Alias)),
  ]

  return (
    <div className="lg:col-span-4">
      <div className="mb-2">
        <h3 className="font-serif text-lg font-semibold">Aliases and alternate names</h3>
        <p className="text-sm text-stone-600">
          Use aliases for synonyms, old taxonomy, trade names, common names, shorthand, and misapplied labels.
        </p>
      </div>
      <div className="grid gap-2">
        {rows.map((alias, index) => (
          <div key={alias.id || index} className="grid gap-2 rounded-lg border border-stone-200 bg-[#fffdf7]/70 p-2.5 lg:grid-cols-[minmax(13rem,1.6fr)_minmax(8rem,.9fr)_minmax(8rem,.9fr)_minmax(11rem,1fr)]">
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Name
              <input className={control} name="aliasName" defaultValue={alias.name || ''} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Type
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
              Source
              <input className={control} name="aliasSource" defaultValue={alias.source || ''} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800 lg:col-span-4">
              Notes
              <input className={control} name="aliasNotes" defaultValue={alias.notes || ''} />
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
