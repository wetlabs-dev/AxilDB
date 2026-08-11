'use client'

import { useState } from 'react'
import { SubstrateCompositionBar, type SubstrateCompositionItem } from '@/components/SubstrateCompositionBar'

type Version = { id: string; name: string; components: SubstrateCompositionItem[] }

export function SubstrateRecipeComparison({ versions }: { versions: Version[] }) {
  const [selected, setSelected] = useState<string[]>(versions.slice(0, 2).map((version) => version.id))
  const shown = selected.map((id) => versions.find((version) => version.id === id)).filter(Boolean) as Version[]

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 4 ? [...current, id] : current)
  }

  return <details className="mt-4 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)]">
    <summary className="cursor-pointer p-3 font-semibold">Compare recipe versions</summary>
    <div className="grid gap-4 border-t border-[color:var(--ax-border)] p-3">
      <div className="flex flex-wrap gap-2">{versions.map((version) => <label key={version.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${selected.includes(version.id) ? 'border-[#2f6b45] bg-[#e8f1e4] text-[#244f35]' : 'border-[color:var(--ax-border)] bg-[var(--ax-surface)]'}`}><input type="checkbox" checked={selected.includes(version.id)} onChange={() => toggle(version.id)} disabled={!selected.includes(version.id) && selected.length >= 4} />{version.name}</label>)}</div>
      {shown.length < 2 ? <p className="text-sm text-[var(--ax-muted)]">Select two to four versions.</p> : <div className="grid gap-3 lg:grid-cols-2">{shown.map((version) => <article key={version.id} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] p-3"><h4 className="mb-2 font-semibold">{version.name}</h4><SubstrateCompositionBar items={version.components} mode="compact" /></article>)}</div>}
    </div>
  </details>
}
