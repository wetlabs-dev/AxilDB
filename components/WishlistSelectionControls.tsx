'use client'

import { useEffect, useRef, useState } from 'react'

export function WishlistSelectionControls() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(0)

  function boxes() {
    return Array.from(rootRef.current?.closest('form')?.querySelectorAll<HTMLInputElement>('input[name="definition"]') || [])
  }

  function updateCount() {
    setCount(boxes().filter((box) => box.checked).length)
  }

  function setAll(checked: boolean) {
    boxes().forEach((box) => { box.checked = checked })
    updateCount()
  }

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    form?.addEventListener('change', updateCount)
    return () => form?.removeEventListener('change', updateCount)
  }, [])

  return (
    <div ref={rootRef} className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#b7caa9] bg-[#edf3e6] px-4 py-3">
      <div><p className="text-sm font-semibold text-[#255537]">{count} selected</p><p className="text-xs text-stone-600">Record one purchase, gift, trade, or order.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAll(true)} className="rounded-md border border-[#8fa58f] bg-white px-3 py-2 text-xs font-semibold text-[#255537]">Select all visible</button>
        <button type="button" onClick={() => setAll(false)} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700">Deselect all</button>
        <button disabled={count === 0} className="rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Acquire selected</button>
      </div>
    </div>
  )
}
