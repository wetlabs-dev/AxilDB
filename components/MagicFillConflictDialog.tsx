'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { MagicFillApplyMode } from '@/lib/magic-fill'

export function MagicFillConflictDialog({
  open,
  populatedCount,
  emptyCount,
  onChoose,
  onCancel,
  returnFocusRef,
}: {
  open: boolean
  populatedCount: number
  emptyCount: number
  onChoose: (mode: MagicFillApplyMode) => void
  onCancel: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const missingButtonRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    missingButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      returnFocusRef?.current?.focus()
    }
  }, [open, returnFocusRef])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto bg-stone-950/45 p-4 backdrop-blur-[1px]" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="magic-fill-conflict-title"
        aria-describedby="magic-fill-conflict-description"
        className="my-auto w-full max-w-lg rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-solid)] p-5 text-[var(--ax-text)] shadow-2xl"
      >
        <h2 id="magic-fill-conflict-title" className="font-serif text-2xl font-semibold text-[var(--ax-heading)]">Existing information found</h2>
        <p id="magic-fill-conflict-description" className="mt-2 text-sm leading-6 text-[var(--ax-muted-strong)]">
          Some fields already contain information. Choose how Magic Fill should apply the new draft.
        </p>
        <p className="mt-3 text-xs font-semibold text-[var(--ax-muted)]">
          {populatedCount} field{populatedCount === 1 ? '' : 's'} populated · {emptyCount} empty
        </p>
        <div className="mt-5 grid gap-2">
          <button ref={missingButtonRef} type="button" onClick={() => onChoose('FILL_MISSING')} className="rounded-md bg-[#2f6b45] px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-[#28593b]">
            <span className="block">Fill Missing Only</span>
            <span className="mt-0.5 block text-xs font-normal text-white/85">Keeps everything you entered and fills only blank fields.</span>
          </button>
          <button type="button" onClick={() => onChoose('REPLACE_ALL')} className="rounded-md border border-[color:var(--ax-danger)] bg-[var(--ax-danger-soft)] px-4 py-3 text-left text-sm font-semibold text-[var(--ax-danger)] shadow-sm transition hover:border-[color:var(--ax-danger-strong)]">
            <span className="block">Replace All Fields</span>
            <span className="mt-0.5 block text-xs font-normal">This replaces all fields managed by Magic Fill. You can still review the draft before saving.</span>
          </button>
          <button type="button" onClick={onCancel} className="rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--ax-text)] transition hover:bg-[var(--ax-primary-wash)]">Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
