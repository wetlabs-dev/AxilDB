import { resolveSubstrateVisual, substrateNeutralVisuals, substratePatternStyle, type SubstrateVisualSource } from '@/lib/substrate-visuals'

export type SubstrateCompositionItem = {
  id?: string
  percentByVolume: number | string | { toString(): string }
  notes?: string | null
  component: SubstrateVisualSource & {
    category?: string | null
    waterRetention?: string | null
    aeration?: string | null
  }
}

function numberLabel(value: number) {
  return value.toFixed(3).replace(/\.000$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function SubstrateSwatch({ component, className = 'h-4 w-4' }: { component: SubstrateVisualSource; className?: string }) {
  const visual = resolveSubstrateVisual(component)
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-sm border border-black/20 ${className}`} style={substratePatternStyle(visual.color, visual.pattern)} />
}

export function SubstrateCompositionBar({ items, mode = 'compact', showLegend = mode !== 'tiny', allocation = false, className = '' }: {
  items: SubstrateCompositionItem[]
  mode?: 'full' | 'compact' | 'tiny'
  showLegend?: boolean
  allocation?: boolean
  className?: string
}) {
  const rows = items.map((item) => ({ ...item, percent: Math.max(0, Number(item.percentByVolume) || 0), visual: resolveSubstrateVisual(item.component) }))
  const total = rows.reduce((sum, row) => sum + row.percent, 0)
  const under = allocation && total < 99.999 ? 100 - total : 0
  const over = allocation && total > 100.001
  const height = mode === 'full' ? 'h-10' : mode === 'compact' ? 'h-6' : 'h-2.5'
  const label = rows.length ? rows.map((row) => `${row.component.name} ${numberLabel(row.percent)}%`).join(', ') : 'No recipe composition'

  return <div className={`min-w-0 ${className}`}>
    <div className={`substrate-composition-bar w-full overflow-x-auto rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] ${height}`} role="img" aria-label={`${label}. Total ${numberLabel(total)}%.`}>
      <div className="flex h-full min-w-full" style={over ? { width: `${total}%` } : undefined}>
        {rows.map((row, index) => <div
          key={row.id || `${row.component.id || row.component.slug || row.component.name}-${index}`}
          className="relative flex h-full shrink-0 items-center justify-center overflow-hidden border-r border-white/45 last:border-r-0"
          style={{ ...substratePatternStyle(row.visual.color, row.visual.pattern), width: over ? `${row.percent / total * 100}%` : `${row.percent}%`, minWidth: row.percent > 0 ? '2px' : undefined }}
          title={`${row.component.name}\n${numberLabel(row.percent)}% by volume${row.component.category ? `\n${row.component.category.toLowerCase().replaceAll('_', ' ')}` : ''}${row.component.aeration ? `\n${row.component.aeration.toLowerCase()} aeration` : ''}`}
        >
          {mode === 'full' && row.percent >= 14 && <span className="truncate px-2 text-xs font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{row.visual.shortLabel} {numberLabel(row.percent)}%</span>}
        </div>)}
        {under > 0 && <div className="flex h-full shrink-0 items-center justify-center bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(120,110,90,.16)_6px_8px)]" style={{ width: `${under}%` }} title={`${numberLabel(under)}% unallocated`}>{mode === 'full' && under >= 14 && <span className="px-2 text-xs font-semibold text-[var(--ax-muted)]">Unallocated {numberLabel(under)}%</span>}</div>}
      </div>
    </div>
    {showLegend && <SubstrateCompositionLegend items={rows} compact={mode === 'compact'} />}
  </div>
}

export function SubstrateCompositionLegend({ items, compact = false }: { items: SubstrateCompositionItem[]; compact?: boolean }) {
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Recipe composition legend">
    {items.map((item, index) => {
      const visual = resolveSubstrateVisual(item.component)
      return <span key={item.id || `${item.component.id || item.component.name}-${index}`} className="inline-flex min-w-0 items-center gap-1 text-xs text-[var(--ax-muted)]">
        <SubstrateSwatch component={item.component} />
        <span>{compact ? visual.shortLabel : item.component.name} <strong className="text-[var(--ax-text)]">{numberLabel(Number(item.percentByVolume) || 0)}%</strong></span>
      </span>
    })}
  </div>
}

export function SubstrateStateStrip({ mode, label }: { mode: string; label?: string }) {
  const visual = mode === 'RECEIVED_SUBSTRATE' ? substrateNeutralVisuals.RECEIVED_SUBSTRATE : mode === 'UNKNOWN' ? substrateNeutralVisuals.UNKNOWN : substrateNeutralVisuals.CUSTOM_MIX
  return <div className="min-w-0">
    <div className="h-2.5 w-full rounded-md border border-[color:var(--ax-border)]" style={substratePatternStyle(visual.color, visual.pattern)} role="img" aria-label={label || visual.label} />
    <p className="mt-1 text-xs text-[var(--ax-muted)]">{label || visual.label}</p>
  </div>
}
