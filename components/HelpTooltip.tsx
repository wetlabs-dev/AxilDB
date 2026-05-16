'use client'

import { useEffect, useRef, useState } from 'react'

export function HelpTooltip({ children }: { children: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return

    function closeIfOutside(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label="Field help"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-[#8fa58f]/50 bg-white/70 text-[0.65rem] font-bold leading-none text-[#2f6b45] shadow-sm transition hover:bg-[#d6dfc9]/70 focus:outline-none focus:ring-2 focus:ring-[#8fa58f]/30"
      >
        ?
      </button>
      {open && (
        <span className="help-tooltip absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-md border border-stone-200 bg-[#fffaf0] p-3 text-xs font-normal leading-5 text-stone-700 shadow-xl">
          {children}
        </span>
      )}
    </span>
  )
}
