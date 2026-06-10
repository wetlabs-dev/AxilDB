'use client'

import { useState, useTransition } from 'react'
import { toggleSunshineInline } from '@/app/actions'
import { cn } from '@/lib/utils'
import { Sun } from 'lucide-react'

const WELL_LOVED_THRESHOLD = 5

type SunshineButtonProps = {
  collectionSlug: string
  targetId: string
  count: number
  active: boolean
  canToggle: boolean
  compact?: boolean
}

export function SunshineButton({
  collectionSlug,
  targetId,
  count,
  active,
  canToggle,
  compact = false,
}: SunshineButtonProps) {
  const [state, setState] = useState({ count, active })
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const title = state.active ? 'Remove Sunshine' : 'Give Sunshine'

  function toggle() {
    if (!canToggle || isPending) return
    const optimistic = {
      active: !state.active,
      count: Math.max(0, state.count + (state.active ? -1 : 1)),
    }
    const previous = state
    setState(optimistic)
    setError('')

    startTransition(async () => {
      try {
        const result = await toggleSunshineInline({ collectionSlug, targetId })
        setState(result)
      } catch {
        setState(previous)
        setError('Sunshine could not be updated. Please try again.')
      }
    })
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs', compact ? 'justify-end' : '')}>
      {state.count >= WELL_LOVED_THRESHOLD && (
        <span className="well-loved-badge">Well Loved</span>
      )}
      {canToggle ? (
        <button
          type="button"
          className={cn(
            'sunshine-inline-control',
            state.active ? 'sunshine-inline-control-active' : '',
            isPending ? 'sunshine-inline-control-pending' : '',
          )}
          aria-label={`${title}. ${state.count} sunshine`}
          title={title}
          aria-pressed={state.active}
          disabled={isPending}
          onClick={toggle}
        >
          <Sun className="sunshine-inline-icon" aria-hidden="true" />
          <span className="sunshine-inline-count">{state.count}</span>
        </button>
      ) : (
        <span
          className="sunshine-inline-control sunshine-inline-control-static"
          aria-label={`${state.count} sunshine`}
          title={`${state.count} sunshine`}
        >
          <Sun className="sunshine-inline-icon" aria-hidden="true" />
          <span className="sunshine-inline-count">{state.count}</span>
        </span>
      )}
      {error && <span className="text-xs text-[#9a3f35]" role="status">{error}</span>}
    </div>
  )
}
