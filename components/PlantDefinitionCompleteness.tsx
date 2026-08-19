import Link from 'next/link'
import type { PlantDefinitionCompleteness, PlantDefinitionCompletenessItem } from '@/lib/plant-definition-completeness'

function barTone(score: number) {
  if (score >= 90) return 'bg-[#477653]'
  if (score >= 50) return 'bg-[#b58a3a]'
  return 'bg-[#8d8373]'
}

function itemMark(item: PlantDefinitionCompletenessItem) {
  if (item.state === 'COMPLETE') return 'Complete:'
  if (item.state === 'INHERITED') return 'Inherited:'
  if (item.state === 'NOT_APPLICABLE') return 'Not applicable:'
  if (item.state === 'PARTIAL') return 'Partial:'
  return 'Missing:'
}

export function PlantDefinitionCompletenessBar({ result, className = '' }: { result: PlantDefinitionCompleteness; className?: string }) {
  const breakdown = result.categories.map((category) => `${category.label}: ${category.score}%`).join(' · ')
  return (
    <div className={className} title={`${result.overallScore}% complete · ${breakdown}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-stone-600">
        <span>{result.statusLabel}</span>
        <span>{result.overallScore}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-label={`Plant definition completeness: ${result.overallScore} percent, ${result.statusLabel.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={result.overallScore}
      >
        <div className={`h-full rounded-full ${barTone(result.overallScore)}`} style={{ width: `${result.overallScore}%` }} />
      </div>
    </div>
  )
}

function ChecklistGroup({
  title,
  items,
  baseHref,
}: {
  title: string
  items: PlantDefinitionCompletenessItem[]
  baseHref: string
}) {
  if (!items.length) return null
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{title}</h4>
      <div className="mt-2 grid gap-2">
        {items.map((entry) => (
          <div key={entry.key} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-2 text-sm">
            <div className="min-w-0">
              <p><span className="sr-only">{itemMark(entry)} </span><span aria-hidden="true">{entry.state === 'COMPLETE' ? 'OK' : entry.state === 'INHERITED' ? 'Linked' : entry.state === 'NOT_APPLICABLE' ? 'N/A' : entry.state === 'PARTIAL' ? 'Partial' : 'Missing'}</span> · <strong>{entry.label}</strong></p>
              {entry.detail && <p className="mt-0.5 text-xs text-stone-600">{entry.detail}</p>}
            </div>
            {entry.actionLabel && entry.actionHash && <Link className="shrink-0 text-xs font-semibold text-[#2f6b45] underline" href={`${baseHref}#${entry.actionHash}`}>{entry.actionLabel}</Link>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PlantDefinitionReadinessPanel({ result, baseHref }: { result: PlantDefinitionCompleteness; baseHref: string }) {
  const needsAttention = result.checklist.filter((entry) => entry.level === 'NEEDS_ATTENTION' && !['COMPLETE', 'INHERITED', 'NOT_APPLICABLE'].includes(entry.state))
  const recommended = result.checklist.filter((entry) => entry.level === 'RECOMMENDED' && !['COMPLETE', 'INHERITED', 'NOT_APPLICABLE'].includes(entry.state))
  const optional = result.checklist.filter((entry) => entry.level === 'OPTIONAL' && !['COMPLETE', 'INHERITED', 'NOT_APPLICABLE'].includes(entry.state))
  const remaining = needsAttention.length + recommended.length
  return (
    <section className="rounded-lg border border-[#cdd8c3] bg-[#f7f4e8]/80 p-4" aria-labelledby="definition-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="definition-readiness-title" className="font-serif text-xl font-semibold">Definition Readiness</h3>
          <p className="mt-1 text-xs text-stone-600">Completeness measures populated, applicable AxilDB metadata. It does not guarantee taxonomic correctness.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{result.overallScore}%</p>
          <p className="text-xs font-semibold text-stone-600">{result.statusLabel} · {result.validationLabel}</p>
        </div>
      </div>
      <PlantDefinitionCompletenessBar result={result} className="mt-3" />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {result.categories.map((category) => (
          <div key={category.key} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] px-2 py-1.5 text-xs">
            <span className="block truncate text-stone-600">{category.label}</span>
            <strong>{category.score}%</strong>
          </div>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">{remaining ? `${remaining} important item${remaining === 1 ? '' : 's'} remaining` : 'View readiness checklist'}</summary>
        <div className="mt-3 grid gap-4">
          {result.provisional && <p className="rounded-md border border-[#dfcc87] bg-[#fff8dc] px-3 py-2 text-sm text-[#6f541f]">This definition can be complete for its current knowledge, but the taxon remains provisional until its identity is reviewed.</p>}
          <ChecklistGroup title="Needs attention" items={needsAttention} baseHref={baseHref} />
          <ChecklistGroup title="Recommended" items={recommended} baseHref={baseHref} />
          <ChecklistGroup title="Optional enhancements" items={optional} baseHref={baseHref} />
          {result.categories.map((category) => (
            <details key={category.key} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold">{category.label}: {category.score}%</summary>
              <div className="mt-2 grid gap-1 text-xs text-stone-600">
                {category.items.map((entry) => <p key={entry.key}>{itemMark(entry)} {entry.label}{entry.detail ? ` — ${entry.detail}` : ''}</p>)}
              </div>
            </details>
          ))}
        </div>
      </details>
    </section>
  )
}
