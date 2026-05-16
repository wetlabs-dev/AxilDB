'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function HelpTooltip({ children }: { children: string }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 16, top: 16, width: 256 })
  const ref = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)

  const updatePosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return

    const margin = 12
    const rect = button.getBoundingClientRect()
    const width = Math.min(320, window.innerWidth - margin * 2)
    const tooltipHeight = tooltipRef.current?.offsetHeight || 112
    const preferredTop = rect.bottom + 10
    const top = preferredTop + tooltipHeight + margin > window.innerHeight
      ? Math.max(margin, rect.top - tooltipHeight - 10)
      : preferredTop
    const left = Math.min(
      window.innerWidth - width - margin,
      Math.max(margin, rect.left + rect.width / 2 - width / 2),
    )

    setPosition({ left, top, width })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()

    function closeIfOutside(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (open) updatePosition()
  }, [open, children, updatePosition])

  return (
    <span ref={ref} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Field help"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-[#8fa58f]/50 bg-white/70 text-[0.65rem] font-bold leading-none text-[#2f6b45] shadow-sm transition hover:bg-[#d6dfc9]/70 focus:outline-none focus:ring-2 focus:ring-[#8fa58f]/30"
      >
        ?
      </button>
      {open && (
        <span
          ref={tooltipRef}
          className="help-tooltip fixed z-50 rounded-lg border border-[#8fa58f]/50 bg-[#edf3e6] p-3 text-xs font-normal leading-5 text-[#233429] shadow-[0_14px_38px_rgba(47,38,24,0.22)]"
          style={{ left: position.left, top: position.top, width: position.width }}
        >
          {children}
        </span>
      )}
    </span>
  )
}
