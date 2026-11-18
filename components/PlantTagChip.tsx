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
  fern: 'semantic-chip semantic-color-fern',
  moss: 'semantic-chip semantic-color-moss',
  sage: 'semantic-chip semantic-color-sage',
  amber: 'semantic-chip semantic-color-amber',
  coral: 'semantic-chip semantic-color-coral',
  rose: 'semantic-chip semantic-color-rose',
  sky: 'semantic-chip semantic-color-sky',
  ocean: 'semantic-chip semantic-color-ocean',
  violet: 'semantic-chip semantic-color-violet',
  stone: 'semantic-chip semantic-color-stone',
}
export const plantTagColorSwatches: Record<string, string> = {
  fern: 'var(--palette-fern-swatch)',
  moss: 'var(--palette-moss-swatch)',
  sage: 'var(--palette-sage-swatch)',
  amber: 'var(--palette-amber-swatch)',
  coral: 'var(--palette-coral-swatch)',
  rose: 'var(--palette-rose-swatch)',
  sky: 'var(--palette-sky-swatch)',
  ocean: 'var(--palette-ocean-swatch)',
  violet: 'var(--palette-violet-swatch)',
  stone: 'var(--palette-stone-swatch)',
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
