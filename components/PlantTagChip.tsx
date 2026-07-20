import { Droplets, Feather, Leaf, Moon, Palette, Shapes, ShieldCheck, Sparkles, Sprout, Sun, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

const icons = { tag: Tag, sparkles: Sparkles, moon: Moon, feather: Feather, palette: Palette, shapes: Shapes, sprout: Sprout, leaf: Leaf, 'shield-check': ShieldCheck, sun: Sun, droplets: Droplets }
const colors: Record<string, string> = {
  fern: 'border-[#9fbea1] bg-[#eaf2e4] text-[#285d3b]', moss: 'border-[#a9b48e] bg-[#f0f2df] text-[#4c5d31]',
  sage: 'border-[#b7c6ae] bg-[#f2f5ec] text-[#486044]', amber: 'border-[#dcc88b] bg-[#fff5d8] text-[#71551b]',
  rose: 'border-[#d8aaa0] bg-[#fff0eb] text-[#7b4437]', sky: 'border-[#a8c8cc] bg-[#ebf5f5] text-[#315f64]',
  violet: 'border-[#bdb1cf] bg-[#f3eef8] text-[#5d4b75]', stone: 'border-stone-300 bg-stone-100 text-stone-700',
}

export type PlantTagSummary = { id: string; name: string; icon?: string | null; colorToken?: string | null; publicVisible?: boolean; active?: boolean }

export function PlantTagChip({ tag, compact = false, className }: { tag: PlantTagSummary; compact?: boolean; className?: string }) {
  const Icon = icons[(tag.icon || 'tag') as keyof typeof icons] || Tag
  return <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full border font-semibold', compact ? 'px-2 py-0.5 text-[0.7rem]' : 'px-2.5 py-1 text-xs', colors[tag.colorToken || 'fern'] || colors.fern, !tag.active && 'opacity-60', className)}>
    <Icon className={compact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} aria-hidden="true" />
    <span className="truncate">{tag.name}</span>
  </span>
}

export function PlantTagRow({ tags, limit = 5, compact = true }: { tags: PlantTagSummary[]; limit?: number; compact?: boolean }) {
  if (!tags.length) return null
  return <div className="flex min-w-0 flex-wrap gap-1" aria-label="Plant tags">
    {tags.slice(0, limit).map((tag) => <PlantTagChip key={tag.id} tag={tag} compact={compact} />)}
    {tags.length > limit && <span className="rounded-full border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-2 py-0.5 text-[0.7rem] font-semibold text-[var(--ax-muted)]">+{tags.length - limit} more</span>}
  </div>
}
