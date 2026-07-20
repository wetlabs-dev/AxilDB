'use client'

import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PlantTagChip, PlantTagIcon, plantTagColorSwatches } from '@/components/PlantTagChip'
import { plantTagCategories, plantTagColors, plantTagIcons, tagCategoryLabel } from '@/lib/plant-tags'

const control = 'min-w-0 w-full rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-input-bg)] px-2.5 py-2 text-left text-sm outline-none transition focus:border-[var(--ax-primary)] focus:ring-2 focus:ring-[var(--ax-focus)]'

function optionLabel(value: string) {
  return value.replaceAll('-', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  return <div className="grid min-w-0 gap-1 text-sm font-medium text-[var(--ax-heading)]">
    <span>Themed icon</span>
    <input type="hidden" name="icon" value={value} />
    <details ref={detailsRef} className="group relative min-w-0">
      <summary className={`${control} flex cursor-pointer list-none items-center justify-between gap-2`}>
        <span className="flex min-w-0 items-center gap-2"><PlantTagIcon icon={value} /><span>{optionLabel(value)}</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ax-muted)] transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 right-0 z-30 mt-1 grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-[color:var(--ax-border-strong)] bg-[var(--ax-surface-solid)] p-1.5 shadow-xl sm:grid-cols-3">
        {plantTagIcons.map((icon) => <button key={icon} type="button" aria-pressed={value === icon} onClick={() => { onChange(icon); if (detailsRef.current) detailsRef.current.open = false }} className="flex min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-sm text-[var(--ax-text)] hover:bg-[var(--ax-primary-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ax-focus)] aria-pressed:bg-[var(--ax-primary-wash)] aria-pressed:font-semibold">
          <PlantTagIcon icon={icon} className="h-4 w-4 shrink-0 text-[var(--ax-primary)]" /><span className="truncate">{optionLabel(icon)}</span>
        </button>)}
      </div>
    </details>
  </div>
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  return <div className="grid min-w-0 gap-1 text-sm font-medium text-[var(--ax-heading)]">
    <span>Color</span>
    <input type="hidden" name="colorToken" value={value} />
    <details ref={detailsRef} className="group relative min-w-0">
      <summary className={`${control} flex cursor-pointer list-none items-center justify-between gap-2`}>
        <span className="flex min-w-0 items-center gap-2"><span className="h-4 w-4 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: plantTagColorSwatches[value] }} /><span>{optionLabel(value)}</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ax-muted)] transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 right-0 z-30 mt-1 grid grid-cols-2 gap-1 rounded-md border border-[color:var(--ax-border-strong)] bg-[var(--ax-surface-solid)] p-1.5 shadow-xl sm:grid-cols-4">
        {plantTagColors.map((color) => <button key={color} type="button" aria-pressed={value === color} onClick={() => { onChange(color); if (detailsRef.current) detailsRef.current.open = false }} className="flex min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-sm text-[var(--ax-text)] hover:bg-[var(--ax-primary-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ax-focus)] aria-pressed:bg-[var(--ax-primary-wash)] aria-pressed:font-semibold">
          <span className="h-4 w-4 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: plantTagColorSwatches[color] }} /><span className="truncate">{optionLabel(color)}</span>
        </button>)}
      </div>
    </details>
  </div>
}

export function PlantTagFields({ tag }: { tag?: { id?: string; name?: string | null; category?: string | null; icon?: string | null; colorToken?: string | null; description?: string | null; publicVisible?: boolean } }) {
  const [name, setName] = useState(tag?.name || '')
  const [icon, setIcon] = useState(tag?.icon || 'tag')
  const [color, setColor] = useState(tag?.colorToken || 'fern')
  return <>
    <label className="grid min-w-0 gap-1 text-sm font-medium text-[var(--ax-heading)]">Name<input className={control} name="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
    <label className="grid min-w-0 gap-1 text-sm font-medium text-[var(--ax-heading)]">Category<select className={control} name="category" defaultValue={tag?.category || 'OTHER'}>{plantTagCategories.map((item) => <option key={item} value={item}>{tagCategoryLabel(item)}</option>)}</select></label>
    <IconPicker value={icon} onChange={setIcon} />
    <ColorPicker value={color} onChange={setColor} />
    <label className="grid min-w-0 gap-1 text-sm font-medium text-[var(--ax-heading)] md:col-span-4">Description<textarea className={`${control} min-h-20`} name="description" defaultValue={tag?.description || ''} /></label>
    <div className="grid gap-1 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 md:col-span-4">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ax-muted)]">Preview</span>
      <div><PlantTagChip tag={{ id: tag?.id || 'preview', name: name.trim() || 'Tag name', icon, colorToken: color, active: true }} compact={false} /></div>
    </div>
    <label className="flex items-center gap-2 text-sm font-medium text-[var(--ax-heading)] md:col-span-4"><input type="checkbox" name="publicVisible" defaultChecked={tag?.publicVisible} /> Visible on enabled public pages and exhibits</label>
  </>
}
