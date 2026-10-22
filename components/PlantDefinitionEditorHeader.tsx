'use client'

import { useEffect, useRef, useState } from 'react'
import { plantName, type BotanicalNameInput } from '@/lib/utils'

type Identity = BotanicalNameInput & { provisionalTaxon?: string | null; identificationStatus?: string | null }
const sections = [
  ['definition-fields', 'Plant Definition'], ['definition-readiness', 'Definition Readiness'],
  ['care-cadences', 'Care Cadences'], ['repotting-windows', 'Repotting Windows'],
  ['acquisition-information', 'Acquisition'], ['husbandry', 'Plant Husbandry'],
  ['definition-photos', 'Images'], ['validation-administration', 'Validation and Administration'],
] as const

export function PlantDefinitionEditorHeader({ identity, formId }: { identity: Identity; formId: string }) {
  const [name, setName] = useState(plantName(identity) || 'Untitled Plant Definition')
  const [compact, setCompact] = useState(false)
  const heading = useRef<HTMLElement>(null)
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const read = () => {
      const values = new FormData(form)
      const value = (key: string) => String(values.get(key) || '')
      const provisionalTaxon = value('provisionalTaxon')
      setName(plantName({ genus: value('genus'), species: value('species'), hybridNotation: value('hybridNotation'), cultivarName: value('cultivarName'), provisionalTaxon, identificationStatus: provisionalTaxon.trim() ? 'PROVISIONAL' : 'IDENTIFIED' }) || 'Untitled Plant Definition')
    }
    const changed = (event: Event) => {
      const control = event.target
      if (control instanceof HTMLInputElement && control.form === form && ['genus', 'species', 'hybridNotation', 'cultivarName', 'provisionalTaxon'].includes(control.name)) read()
    }
    const reset = () => queueMicrotask(read)
    read()
    document.addEventListener('input', changed)
    document.addEventListener('change', changed)
    form.addEventListener('reset', reset)
    return () => { document.removeEventListener('input', changed); document.removeEventListener('change', changed); form.removeEventListener('reset', reset) }
  }, [formId, identity])
  useEffect(() => {
    const primary = heading.current
    const page = primary?.closest<HTMLElement>('[data-definition-editor]')
    const appHeader = document.querySelector<HTMLElement>('[data-app-mobile-header]')
    if (!primary || !page) return
    let intersection: IntersectionObserver | undefined
    const observe = () => {
      const offset = appHeader?.getBoundingClientRect().height || 0
      page.style.setProperty('--definition-header-offset', `${offset}px`)
      intersection?.disconnect()
      const update = () => setCompact(primary.getBoundingClientRect().bottom <= offset)
      update()
      intersection = new IntersectionObserver(update, { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 })
      intersection.observe(primary)
    }
    observe()
    const resize = new ResizeObserver(observe)
    if (appHeader) resize.observe(appHeader)
    return () => { resize.disconnect(); intersection?.disconnect() }
  }, [])
  return <>
    <header ref={heading} className="space-y-3">
      <p className="text-sm font-semibold text-stone-600">Edit Plant Definition</p>
      <h1 className="break-words font-serif text-3xl font-bold sm:text-4xl">{name}</h1>
      <nav aria-label="Jump to section" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {sections.map(([id, label]) => <a key={id} className="rounded text-[#2f6b45] underline underline-offset-2 focus-visible:outline focus-visible:outline-2" href={`#${id}`}>{label}</a>)}
      </nav>
    </header>
    <div className="definition-editor-sticky no-print" aria-hidden="true">
      <div data-compact-definition-title hidden={!compact} className="flex min-w-0 items-center gap-3 rounded-b-lg border border-[color:var(--ax-border)] bg-[color:var(--ax-surface-solid)] px-3 py-2 shadow-sm">
        <span title={name} className="min-w-0 flex-1 truncate font-serif font-semibold">{name}</span><span className="shrink-0 text-xs text-stone-600">Editing</span>
      </div>
    </div>
  </>
}
