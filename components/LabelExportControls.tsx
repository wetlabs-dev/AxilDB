'use client'

import { useState } from 'react'
import { defaultLabelOrientation, type LabelFormat, type LabelOrientation } from '@/lib/plant-labels'

const controlClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

const formatOptions: Array<{ value: LabelFormat; label: string }> = [
  { value: 'fixed', label: '2.25 x 1.25 inch label, one per page' },
  { value: 'sheet', label: 'Legacy print sheet, ganged labels' },
  { value: 'brother-dk-2210', label: 'Brother DK-2210 continuous 1 1/7 inch label' },
]

const orientationOptions: Array<{ value: LabelOrientation; label: string }> = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
]

export function LabelExportControls() {
  const [format, setFormat] = useState<LabelFormat>('fixed')
  const [orientation, setOrientation] = useState<LabelOrientation>(defaultLabelOrientation('fixed'))

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(16rem,1fr)_minmax(12rem,16rem)]">
      <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
        <span className="min-w-0 truncate">Print format</span>
        <select
          className={controlClass}
          name="format"
          value={format}
          onChange={(event) => {
            const nextFormat = event.target.value as LabelFormat
            setFormat(nextFormat)
            setOrientation(defaultLabelOrientation(nextFormat))
          }}
        >
          {formatOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-800">
        <span className="min-w-0 truncate">Orientation</span>
        <select
          className={controlClass}
          name="orientation"
          value={orientation}
          onChange={(event) => setOrientation(event.target.value as LabelOrientation)}
        >
          {orientationOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
