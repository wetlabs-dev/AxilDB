'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { PlantTagChip, type PlantTagSummary } from './PlantTagChip'
import { tagCategoryLabel } from '@/lib/plant-tags'

type PickerTag = PlantTagSummary & { category?: string | null; description?: string | null }

export function PlantTagPicker({ tags, selectedIds = [] }: { tags: PickerTag[]; selectedIds?: string[] }) {
  const [query, setQuery] = useState('')
  const [availableTags, setAvailableTags] = useState(tags)
  const [selected, setSelected] = useState(() => new Set(selectedIds))
  const [magicFillSelected, setMagicFillSelected] = useState(() => new Set<string>())
  const rootRef = useRef<HTMLFieldSetElement>(null)
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.form && rootRef.current?.closest('form') !== detail.form) return
      const nextIds = Array.isArray(detail?.tagIds) ? detail.tagIds.map(String) : []
      const createdTags = Array.isArray(detail?.tags) ? detail.tags : []
      if (createdTags.length) setAvailableTags((current) => {
        const known = new Set(current.map((tag) => tag.id))
        return [...current, ...createdTags.filter((tag: PickerTag) => tag?.id && !known.has(tag.id))]
      })
      setSelected((current) => new Set([...current, ...nextIds]))
      if (detail?.source === 'MAGIC_FILL') setMagicFillSelected((current) => new Set([...current, ...nextIds]))
    }
    window.addEventListener('axildb:add-plant-tags', listener)
    return () => window.removeEventListener('axildb:add-plant-tags', listener)
  }, [])
  const visible = useMemo(() => availableTags.filter((tag) => `${tag.name} ${tag.description || ''} ${tag.category || ''}`.toLowerCase().includes(query.toLowerCase())), [query, availableTags])
  const grouped = visible.reduce<Map<string, PickerTag[]>>((groups, tag) => {
    const category = tagCategoryLabel(tag.category)
    groups.set(category, [...(groups.get(category) || []), tag])
    return groups
  }, new Map())
  return <fieldset ref={rootRef} className="grid gap-2 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 lg:col-span-4">
    {Array.from(magicFillSelected).filter((id) => selected.has(id)).map((id) => <input key={id} type="hidden" name="magicFillPlantTagIds" value={id} />)}
    <legend className="px-1 font-semibold">Plant tags</legend>
    <label className="relative block max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--ax-muted)]" aria-hidden="true" />
      <input className="w-full rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-input-bg)] py-2 pl-8 pr-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a reusable tag" />
    </label>
    {Array.from(grouped.entries()).map(([category, entries]) => <div key={category}>
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--ax-muted)]">{category}</p>
      <div className="flex flex-wrap gap-1.5">{entries.map((tag) => <label key={tag.id} className="cursor-pointer">
        <input className="peer sr-only" type="checkbox" name="plantTagIds" value={tag.id} checked={selected.has(tag.id)} onChange={(event) => {
          setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(tag.id) : next.delete(tag.id); return next })
          if (!event.target.checked) setMagicFillSelected((current) => { const next = new Set(current); next.delete(tag.id); return next })
        }} />
        <PlantTagChip tag={tag} className="peer-focus-visible:ring-2 peer-focus-visible:ring-[#2f6b45] peer-checked:ring-2 peer-checked:ring-[#2f6b45]" />
      </label>)}</div>
    </div>)}
    {!visible.length && <p className="text-sm text-[var(--ax-muted)]">No matching active tags. Create one from Plant Tags.</p>}
  </fieldset>
}
