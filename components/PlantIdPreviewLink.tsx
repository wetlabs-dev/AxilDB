'use client'

import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Leaf } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { PlantImage } from '@/components/PlantImage'
import type { PlantInstancePreview } from '@/lib/plant-preview'
import { cn } from '@/lib/utils'

export const plantIdLinkClassName = 'inline-flex max-w-full items-center rounded border border-[color:var(--ax-border)] bg-[var(--ax-primary-wash)] px-1.5 py-0.5 font-mono text-[0.92em] font-semibold leading-snug text-[var(--ax-primary)] underline decoration-[color:var(--ax-primary)]/45 underline-offset-2 transition hover:text-[var(--ax-primary-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ax-focus)]'

type PreviewState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

type Position = {
  top: number
  left: number
}

const previewCache = new Map<string, Promise<PlantInstancePreview | null>>()

function fetchPreview(collectionSlug: string, plant: string) {
  const key = `${collectionSlug}:${plant}`
  const existing = previewCache.get(key)
  if (existing) return existing
  const request = fetch(`/api/plant-preview?collection=${encodeURIComponent(collectionSlug)}&plant=${encodeURIComponent(plant)}`)
    .then(async (response) => {
      if (response.status === 404) return null
      if (!response.ok) throw new Error('Unable to load plant preview.')
      return await response.json() as PlantInstancePreview
    })
  previewCache.set(key, request)
  return request
}

function formatRelativeDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 60) return `${days} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusLabel(status?: string | null) {
  if (!status) return null
  return status.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function stars(priority?: number | null) {
  const count = Math.max(0, Math.min(5, Number(priority || 0)))
  return count ? '★'.repeat(count) : null
}

function usePreviewPosition(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    function update() {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
      const preferredLeft = rect.left + rect.width / 2 - width / 2
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, preferredLeft))
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow > 260 ? rect.bottom + 8 : Math.max(12, rect.top - 268)
      setPosition({ top, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef, open])

  return position
}

function PreviewCard({
  id,
  href,
  state,
  preview,
  position,
  onMouseEnter,
  onMouseLeave,
}: {
  id: string
  href: string
  state: PreviewState
  preview: PlantInstancePreview | null
  position: Position
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  return (
    <div
      id={id}
      role="tooltip"
      className="fixed z-[1000] w-[min(22.5rem,calc(100vw-1.5rem))] rounded-lg border border-[color:var(--ax-border-strong)] bg-[var(--ax-surface-solid)] p-3 text-[var(--ax-text)] shadow-[0_18px_48px_var(--ax-shadow)]"
      style={{ top: position.top, left: position.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {state === 'loading' && (
        <div className="flex items-center gap-3 text-sm text-[var(--ax-muted)]">
          <Leaf className="h-5 w-5 animate-pulse text-[var(--ax-primary)]" />
          Loading plant preview...
        </div>
      )}
      {(state === 'error' || state === 'unavailable') && (
        <div className="text-sm">
          <p className="font-semibold text-[var(--ax-heading)]">Preview unavailable</p>
          <p className="mt-1 text-[var(--ax-muted)]">This plant may have moved, been deleted, or may not be visible from this collection.</p>
          <Link href={href} className="mt-3 inline-flex text-sm font-semibold text-[var(--ax-primary)] underline">Open plant</Link>
        </div>
      )}
      {state === 'ready' && preview && (
        <div className="grid gap-3">
          <div className="grid grid-cols-[5.5rem_1fr] gap-3">
            <div className="h-24 overflow-hidden rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-primary-wash)]">
              <PlantImage src={preview.coverPhotoUrl} alt="" />
            </div>
            <div className="min-w-0">
              <p className="break-words font-mono text-sm font-bold leading-snug text-[var(--ax-primary)]">{preview.plantId}</p>
              <p className="mt-1 line-clamp-2 font-serif text-lg font-semibold leading-tight text-[var(--ax-heading)]">{preview.displayName}</p>
              {preview.acquisitionLabel && <p className="mt-1 line-clamp-2 text-xs text-[var(--ax-muted)]">{preview.acquisitionLabel}</p>}
            </div>
          </div>
          <div className="grid gap-1.5 text-xs text-[var(--ax-muted-strong)]">
            <p><span className="font-semibold text-[var(--ax-heading)]">Location:</span> {preview.currentLocationPath || 'No location set'}</p>
            <p>
              <span className="font-semibold text-[var(--ax-heading)]">Status:</span>{' '}
              {[preview.status.toLowerCase(), preview.activeQuarantine ? 'quarantine' : null, preview.activeBloomCount ? 'blooming' : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p>
              <span className="font-semibold text-[var(--ax-heading)]">Recent:</span>{' '}
              {[
                preview.lastCareAt ? `care ${formatRelativeDate(preview.lastCareAt)}` : null,
                preview.lastPhotoAt ? `photo ${formatRelativeDate(preview.lastPhotoAt)}` : null,
                preview.lastObservedAt ? `observed ${formatRelativeDate(preview.lastObservedAt)}` : null,
              ].filter(Boolean).join(' · ') || 'No recent activity'}
            </p>
            {preview.activeConditionCount > 0 && (
              <p className="font-semibold text-[var(--ax-danger)]">{preview.activeConditionCount} open condition{preview.activeConditionCount === 1 ? '' : 's'}</p>
            )}
          </div>
          {preview.acquisitionStatus && (
            <div className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-primary-wash)] px-2.5 py-2 text-xs text-[var(--ax-muted-strong)]">
              <p className="font-semibold text-[var(--ax-primary)]">
                {statusLabel(preview.acquisitionStatus)}
                {stars(preview.acquisitionPriority) ? ` · ${stars(preview.acquisitionPriority)}` : ''}
              </p>
              <p className="mt-1">
                Desired: {preview.desiredLocationPath || 'No desired location'}
                {(preview.idealPurchasePrice || preview.maximumPurchasePrice) && ` · target ${preview.idealPurchasePrice || '—'} / max ${preview.maximumPurchasePrice || '—'}`}
              </p>
            </div>
          )}
          <Link href={preview.href || href} className="inline-flex justify-self-start rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-primary-wash)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ax-primary)] underline">
            Open plant
          </Link>
        </div>
      )}
    </div>
  )
}

export function PlantIdPreviewLink({
  collectionSlug,
  plantId,
  href,
  children,
  previewData,
  className = '',
}: {
  collectionSlug: string
  plantId: string
  href: string
  children?: ReactNode
  previewData?: PlantInstancePreview | null
  className?: string
}) {
  const tooltipId = useId()
  const anchorRef = useRef<HTMLAnchorElement | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<PreviewState>(previewData ? 'ready' : 'idle')
  const [preview, setPreview] = useState<PlantInstancePreview | null>(previewData || null)
  const position = usePreviewPosition(open, anchorRef)

  function clearCloseTimer() {
    if (!closeTimer.current) return
    clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  function requestClose(delay = 140) {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), delay)
  }

  function requestOpen() {
    clearCloseTimer()
    setOpen(true)
    if (preview || state === 'loading') return
    setState('loading')
    fetchPreview(collectionSlug, plantId)
      .then((result) => {
        setPreview(result)
        setState(result ? 'ready' : 'unavailable')
      })
      .catch(() => setState('error'))
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <Link
        ref={anchorRef}
        href={href}
        className={cn(plantIdLinkClassName, className)}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={requestOpen}
        onMouseLeave={() => requestClose()}
        onFocus={requestOpen}
        onBlur={() => requestClose()}
        onClick={(event) => {
          if (event.detail === 0) return
          if ('PointerEvent' in window && (event.nativeEvent as PointerEvent).pointerType) return
          if (!open && window.matchMedia('(pointer: coarse)').matches) {
            event.preventDefault()
            requestOpen()
          }
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch') return
          if (!open) {
            event.preventDefault()
            requestOpen()
          }
        }}
      >
        {children || plantId}
      </Link>
      {open && typeof document !== 'undefined' && createPortal(
        <PreviewCard
          id={tooltipId}
          href={href}
          state={state}
          preview={preview}
          position={position}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={() => requestClose()}
        />,
        document.body,
      )}
    </>
  )
}
