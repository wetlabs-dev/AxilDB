import {
  Bug, CircleDot, CloudSun, Droplets, Eye, Feather, Flame, Flower2, Gem, Heart,
  House, Leaf, Moon, Mountain, Palette, PawPrint, Shapes, ShieldAlert, ShieldCheck,
  Snowflake, Sparkles, Sprout, Sun, Tag, Thermometer, TriangleAlert, Waves, Wind,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const icons = {
  tag: Tag, sparkles: Sparkles, gem: Gem, moon: Moon, sun: Sun, 'cloud-sun': CloudSun,
  snowflake: Snowflake, flame: Flame, droplets: Droplets, waves: Waves, wind: Wind,
  thermometer: Thermometer, mountain: Mountain, house: House, feather: Feather,
  palette: Palette, shapes: Shapes, 'circle-dot': CircleDot, eye: Eye, heart: Heart,
  sprout: Sprout, leaf: Leaf, 'flower-2': Flower2, bug: Bug, 'paw-print': PawPrint,
  'shield-check': ShieldCheck, 'shield-alert': ShieldAlert, 'triangle-alert': TriangleAlert,
}
export const plantTagColorClassNames: Record<string, string> = {
  fern: 'border-[#9fbea1] bg-[#eaf2e4] text-[#285d3b]', moss: 'border-[#a9b48e] bg-[#f0f2df] text-[#4c5d31]',
  sage: 'border-[#b7c6ae] bg-[#f2f5ec] text-[#486044]', amber: 'border-[#dcc88b] bg-[#fff5d8] text-[#71551b]',
  rose: 'border-[#d8aaa0] bg-[#fff0eb] text-[#7b4437]', sky: 'border-[#a8c8cc] bg-[#ebf5f5] text-[#315f64]',
  coral: 'border-[#d9a08d] bg-[#fff0e8] text-[#824837]', ocean: 'border-[#91abc4] bg-[#edf3fa] text-[#34536f]',
  violet: 'border-[#bdb1cf] bg-[#f3eef8] text-[#5d4b75]', stone: 'border-stone-300 bg-stone-100 text-stone-700',
}
export const plantTagColorSwatches: Record<string, string> = {
  fern: '#4f835d', moss: '#899466', sage: '#9eae99', amber: '#c09c43',
  coral: '#c87860', rose: '#b96f83', sky: '#6fa9b2', ocean: '#527da7',
  violet: '#8d78a8', stone: '#8c8276',
}

export type PlantTagSummary = { id: string; name: string; icon?: string | null; colorToken?: string | null; publicVisible?: boolean; active?: boolean }

export function PlantTagIcon({ icon, className = 'h-4 w-4' }: { icon?: string | null; className?: string }) {
  const Icon = icons[(icon || 'tag') as keyof typeof icons] || Tag
  return <Icon className={className} aria-hidden="true" />
}

export function PlantTagChip({ tag, compact = false, className }: { tag: PlantTagSummary; compact?: boolean; className?: string }) {
  return <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full border font-semibold', compact ? 'px-2 py-0.5 text-[0.7rem]' : 'px-2.5 py-1 text-xs', plantTagColorClassNames[tag.colorToken || 'fern'] || plantTagColorClassNames.fern, !tag.active && 'opacity-60', className)}>
    <PlantTagIcon icon={tag.icon} className={compact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
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
