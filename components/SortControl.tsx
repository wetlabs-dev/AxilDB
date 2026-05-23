import { saveSortPreference } from '@/app/actions'
import type { SortOption } from '@/lib/sort-preferences'

type SortControlProps = {
  section: string
  value: string
  options: SortOption[]
  back: string
  disabled?: boolean
}

export function SortControl({ section, value, options, back, disabled = false }: SortControlProps) {
  return (
    <form action={saveSortPreference} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="back" value={back} />
      <label className="text-sm font-semibold text-stone-700" htmlFor={`${section}-sort`}>Sort</label>
      <select
        id={`${section}-sort`}
        name="sortKey"
        defaultValue={value}
        disabled={disabled}
        className="min-w-0 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md border border-[#2f6b45] bg-[#2f6b45] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#245737] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Apply
      </button>
    </form>
  )
}
