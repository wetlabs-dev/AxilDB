'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PlantTagChip, type PlantTagSummary } from '@/components/PlantTagChip'
import { cn } from '@/lib/utils'

type MatchMode = 'any' | 'all'

export function PlantTagFilter({
  tags,
  selectedTagIds,
  matchMode,
}: {
  tags: PlantTagSummary[]
  selectedTagIds: string[]
  matchMode: MatchMode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selected, setSelected] = useState(() => new Set(selectedTagIds))
  const selectedRef = useRef(selected)
  const [mode, setMode] = useState<MatchMode>(matchMode)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const next = new Set(selectedTagIds)
    selectedRef.current = next
    setSelected(next)
    setMode(matchMode)
  }, [matchMode, selectedTagIds])

  function updateFilter(nextSelected: Set<string>, nextMode = mode) {
    selectedRef.current = nextSelected
    setSelected(nextSelected)
    setMode(nextMode)

    const params = new URLSearchParams(searchParams.toString())
    params.delete('tag')
    for (const tag of tags) {
      if (nextSelected.has(tag.id)) params.append('tag', tag.id)
    }
    if (nextSelected.size > 0) params.set('tagMode', nextMode)
    else params.delete('tagMode')

    const query = params.toString()
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    })
  }

  function toggleTag(tagId: string) {
    const next = new Set(selectedRef.current)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    updateFilter(next)
  }

  const allSelected = selected.size === tags.length

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-800">Filter by tags</p>
          <p className="text-xs text-stone-600">
            {selected.size === 0 ? 'Showing all plant definitions' : `${selected.size} tag${selected.size === 1 ? '' : 's'} active`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-stone-300 bg-[#fffdf7] p-0.5" aria-label="Tag selection">
            <button
              type="button"
              className={cn('rounded px-2.5 py-1 text-xs font-semibold transition', allSelected && 'bg-[#dce8d4] text-[#255537]')}
              onClick={() => updateFilter(new Set(tags.map((tag) => tag.id)))}
              aria-pressed={allSelected}
            >
              All
            </button>
            <button
              type="button"
              className={cn('rounded px-2.5 py-1 text-xs font-semibold transition', selected.size === 0 && 'bg-[#dce8d4] text-[#255537]')}
              onClick={() => updateFilter(new Set())}
              aria-pressed={selected.size === 0}
            >
              None
            </button>
          </div>
          <div className="flex rounded-md border border-stone-300 bg-[#fffdf7] p-0.5" aria-label="Tag matching mode">
            {(['any', 'all'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={cn('rounded px-2.5 py-1 text-xs font-semibold capitalize transition', mode === option && 'bg-[#2f6b45] text-white')}
                onClick={() => updateFilter(new Set(selectedRef.current), option)}
                aria-pressed={mode === option}
                disabled={selected.size === 0}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Available plant tags">
        {tags.map((tag) => {
          const active = selected.has(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              className={cn(
                'rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[#2f6b45] focus-visible:ring-offset-2',
                active ? 'ring-2 ring-[#2f6b45] ring-offset-1' : 'opacity-55 hover:opacity-90',
              )}
              onClick={() => toggleTag(tag.id)}
              aria-pressed={active}
              aria-label={`${active ? 'Remove' : 'Add'} ${tag.name} filter`}
            >
              <PlantTagChip tag={tag} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
