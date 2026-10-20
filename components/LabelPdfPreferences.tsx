'use client'

import { Button } from '@/components/ui'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { normalizeLabelPreferences, readLabelPreferences, saveLabelPreferences, type LabelCategory, type LabelCategorySettings, type LabelPdfPreferences, type LabelSort } from '@/lib/label-pdf-preferences'

const Context = createContext<{ settings: LabelCategorySettings; update: (patch: Partial<LabelCategorySettings>) => void } | null>(null)
export const useLabelPdfSettings = () => useContext(Context)

export function LabelPdfPreferences({ category, sort, explicitCategory, explicitSort, storageKey, path, children }: {
  category: LabelCategory; sort: LabelSort; explicitCategory: boolean; explicitSort: boolean; storageKey: string; path: string; children: ReactNode
}) {
  const [preferences, setPreferences] = useState<LabelPdfPreferences>(() => normalizeLabelPreferences(null))
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let saved = normalizeLabelPreferences(null)
    try { saved = readLabelPreferences(window.localStorage, storageKey) } catch {}
    const target = explicitCategory ? category : saved.lastCategory
    const appliedSort = explicitSort ? sort : saved.categories[target].sort || 'plant-id'
    if (target !== category || (target !== 'locations' && appliedSort !== sort)) {
      const url = new URL(path, window.location.origin)
      url.searchParams.set('target', target)
      if (target !== 'locations') url.searchParams.set('sort', appliedSort)
      window.location.replace(url)
      return
    }
    saved.lastCategory = category
    if (category !== 'locations') saved.categories[category].sort = sort
    try { window.localStorage.setItem(storageKey, JSON.stringify(saved)) } catch {}
    setPreferences(saved)
    setReady(true)
  }, [category, sort, explicitCategory, explicitSort, storageKey, path])

  const update = (patch: Partial<LabelCategorySettings>) => {
    let next = normalizeLabelPreferences({ ...preferences, categories: { ...preferences.categories, [category]: { ...preferences.categories[category], ...patch } } })
    next.lastCategory = category
    try { next = saveLabelPreferences(window.localStorage, storageKey, category, patch) } catch {}
    setPreferences(next)
  }
  return <Context.Provider value={{ settings: preferences.categories[category], update }}>
    {!ready && <p role="status" className="text-sm text-stone-600">Loading label settings…</p>}
    <div hidden={!ready} aria-busy={!ready}>
      <div className="mb-4 flex flex-wrap gap-2">
        {([['plants', 'Plants'], ['locations', 'Locations'], ['both', 'Plants + Locations']] as const).map(([value, label]) => <a key={value}
          onClick={event => {
            let latest = preferences
            try { latest = readLabelPreferences(window.localStorage, storageKey) } catch {}
            event.currentTarget.href = `${path}?target=${value}${value === 'locations' ? '' : `&sort=${latest.categories[value].sort}`}`
          }}
          href={`${path}?target=${value}${value === 'locations' ? '' : `&sort=${preferences.categories[value].sort}`}`}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${category === value ? 'border-[#2f6b45] bg-[#e8efdf] text-[#2f6b45]' : 'border-stone-300 bg-white/70 text-stone-700'}`}>
          {label}
        </a>)}
      </div>
      {category !== 'locations' && <form action={path} method="get" className="mb-4 flex flex-wrap items-end gap-2" onSubmit={event => {
        const applied = new FormData(event.currentTarget).get('sort') as LabelSort
        update({ sort: applied })
      }}>
        <input type="hidden" name="target" value={category} />
        <label className="grid min-w-52 gap-1 text-sm font-semibold">Sort plants by
          <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 font-normal" name="sort" defaultValue={sort}>
            <option value="plant-id">Plant ID</option>
            <option value="added-newest">Date added, newest first</option>
            <option value="added-oldest">Date added, oldest first</option>
          </select>
        </label>
        <Button>Sort</Button>
      </form>}
      {children}
    </div>
  </Context.Provider>
}
