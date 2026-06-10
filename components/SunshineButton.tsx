'use client'

import { useState, useTransition } from 'react'
import { toggleSunshineInline } from '@/app/actions'
import { cn } from '@/lib/utils'

const WELL_LOVED_THRESHOLD = 5

type SunshineButtonProps = {
  collectionSlug: string
  targetId: string
  count: number
  active: boolean
  canToggle: boolean
  compact?: boolean
}

function SunshineIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="sunshine-inline-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="sunshine-inline-rays"
        d="M12 2.5v3M12 18.5v3M4.58 4.58l2.12 2.12M17.3 17.3l2.12 2.12M2.5 12h3M18.5 12h3M4.58 19.42l2.12-2.12M17.3 6.7l2.12-2.12"
      />
      <path
        className={cn('sunshine-inline-core', active ? 'sunshine-inline-core-active' : '')}
        d="M9.15 13.58c-1.9-1.9-1.9-4.72 0-6.62 1.9 1.9 4.72 1.9 6.62 0 1.9 1.9 1.9 4.72 0 6.62-1.9 1.9-4.72 1.9-6.62 0Z"
      />
      <path
        className={cn('sunshine-inline-leaf', active ? 'sunshine-inline-leaf-active' : '')}
        d="M8.55 14.35c2.75.08 5.08 1.35 6.9 3.8-3.2.4-5.7-.5-7.5-2.7l-1.4 1.4"
      />
    </svg>
  )
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
          <SunshineIcon active={state.active} />
          <span className="sunshine-inline-count">{state.count}</span>
        </button>
      ) : (
        <span
          className="sunshine-inline-control sunshine-inline-control-static"
          aria-label={`${state.count} sunshine`}
          title={`${state.count} sunshine`}
        >
          <SunshineIcon active={false} />
          <span className="sunshine-inline-count">{state.count}</span>
        </span>
      )}
      {error && <span className="text-xs text-[#9a3f35]" role="status">{error}</span>}
    </div>
  )
}
