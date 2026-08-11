'use client'

import { useEffect, useRef, useState } from 'react'
import { SubstrateSwatch } from '@/components/SubstrateCompositionBar'
import { substrateDisplayPatterns, substrateVisualDefaults, type SubstrateVisualSource } from '@/lib/substrate-visuals'

const control = 'rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] px-3 py-2 text-sm font-normal text-[var(--ax-text)]'

export function SubstrateVisualIdentityEditor({ component, isNew = false }: { component: SubstrateVisualSource; isNew?: boolean }) {
  const rootRef = useRef<HTMLFieldSetElement>(null)
  const [sourceName, setSourceName] = useState(component.name)
  const source = { ...component, name: sourceName, slug: isNew ? sourceName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') : component.slug }
  const defaults = substrateVisualDefaults(source)
  const [automatic, setAutomatic] = useState(isNew)
  const [color, setColor] = useState(component.displayColor || defaults.color)
  const [pattern, setPattern] = useState(component.displayPattern || defaults.pattern)
  const [shortLabel, setShortLabel] = useState(component.shortLabel || defaults.shortLabel)
  const [family, setFamily] = useState(component.visualFamily || defaults.family)
  const preview = { ...source, displayColor: color, displayPattern: pattern, shortLabel, visualFamily: family }

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    const nameInput = form?.elements.namedItem('name') as HTMLInputElement | null
    if (!nameInput) return
    const sync = () => setSourceName(nameInput.value || 'New component')
    nameInput.addEventListener('input', sync)
    return () => nameInput.removeEventListener('input', sync)
  }, [])

  useEffect(() => {
    if (!automatic) return
    setColor(defaults.color); setPattern(defaults.pattern); setShortLabel(defaults.shortLabel); setFamily(defaults.family)
  }, [automatic, defaults.color, defaults.family, defaults.pattern, defaults.shortLabel])

  function reset() {
    setColor(defaults.color); setPattern(defaults.pattern); setShortLabel(defaults.shortLabel); setFamily(defaults.family); setAutomatic(isNew)
  }

  return <fieldset ref={rootRef} className="grid gap-3 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3 md:col-span-4 md:grid-cols-4">
    <legend className="px-1 text-sm font-semibold">Visual identity</legend>
    <input type="hidden" name="visualIdentityAuto" value={automatic ? 'true' : 'false'} />
    <label className="grid gap-1 text-sm font-semibold">Color<span className="flex items-center gap-2"><input className="h-10 w-14 rounded-md border border-[color:var(--ax-border)] bg-transparent p-1" type="color" name="displayColor" value={color} onChange={(event) => { setAutomatic(false); setColor(event.target.value.toUpperCase()) }} /><code className="text-xs">{color}</code></span></label>
    <label className="grid gap-1 text-sm font-semibold">Pattern<select className={control} name="displayPattern" value={pattern} onChange={(event) => { setAutomatic(false); setPattern(event.target.value) }}>{substrateDisplayPatterns.map((value) => <option key={value} value={value}>{value.toLowerCase().replaceAll('_', ' ')}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold">Short label<input className={control} name="shortLabel" maxLength={40} value={shortLabel} onChange={(event) => { setAutomatic(false); setShortLabel(event.target.value) }} /></label>
    <label className="grid gap-1 text-sm font-semibold">Visual family<input className={control} name="visualFamily" maxLength={40} value={family} onChange={(event) => { setAutomatic(false); setFamily(event.target.value.toUpperCase()) }} /></label>
    <div className="flex flex-wrap items-center gap-3 md:col-span-4">
      <span className="inline-flex items-center gap-2 rounded-md border border-[color:var(--ax-border)] bg-[var(--ax-surface)] px-3 py-2 text-sm font-semibold"><SubstrateSwatch component={preview} className="h-7 w-12" />{shortLabel || sourceName}</span>
      <button type="button" onClick={reset} className="rounded-md border border-[color:var(--ax-border)] px-3 py-2 text-xs font-semibold">Reset to default visual</button>
      <span className="text-xs text-[var(--ax-muted)]">Patterns keep components distinguishable in dark mode and monochrome print.</span>
    </div>
  </fieldset>
}
