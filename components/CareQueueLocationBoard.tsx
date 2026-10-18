'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { startWorkflowRun } from '@/app/workflow-actions'
import { CareQueueItemCard } from '@/components/CareQueueItemCard'
import { Button } from '@/components/ui'
import type { CareQueueItem } from '@/lib/care-queue'
import type { CareQueueLocationSection } from '@/lib/care-queue-locations'

export function CareQueueLocationBoard({
  sections,
  visibleItems,
  collectionSlug,
  back,
  canAct,
  timezone,
  substrateVersions,
  workflowTemplates,
  bulkCarePath,
}: {
  sections: CareQueueLocationSection[]
  visibleItems: CareQueueItem[]
  collectionSlug: string
  back: string
  canAct: boolean
  timezone?: string
  substrateVersions: Array<{ id: string; label: string }>
  workflowTemplates: Array<{ id: string; name: string }>
  bulkCarePath: string
}) {
  const visibleByKey = new Map(visibleItems.map(item => [item.key, item]))
  const storageKey = `axildb:care-location-sections:${collectionSlug}`
  const initial = useMemo(() => Object.fromEntries(sections.map((section) => [section.id, true])), [sections])
  const [expanded, setExpanded] = useState<Record<string, boolean>>(initial)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) setExpanded((current) => ({ ...current, ...JSON.parse(saved) }))
    } catch { /* Session storage may be unavailable in hardened browsers. */ }
  }, [storageKey])

  function setAll(value: boolean) {
    const next = Object.fromEntries(sections.map((section) => [section.id, value]))
    setExpanded(next)
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = { ...current, [id]: !(current[id] ?? true) }
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" className="rounded-md border border-stone-300 bg-white/70 px-2.5 py-1.5 font-semibold" onClick={() => setAll(true)}>Expand all</button>
        <button type="button" className="rounded-md border border-stone-300 bg-white/70 px-2.5 py-1.5 font-semibold" onClick={() => setAll(false)}>Collapse all</button>
      </div>
      {sections.map((originalSection) => {
        const visible = originalSection.items.flatMap(item => visibleByKey.has(item.key) ? [visibleByKey.get(item.key)!] : [])
        const counts = new Map<string, number>()
        for (const item of visible) counts.set(item.taskType, (counts.get(item.taskType) || 0) + 1)
        const section = { ...originalSection, items: visible, overdue: visible.filter(item => item.overdueDays > 0).length, typeCounts: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, count]) => ({ type, count })) }
        const isExpanded = expanded[section.id] ?? true
        const bulkHref = section.locationId
          ? `${bulkCarePath}?locationId=${encodeURIComponent(section.locationId)}&includeNested=1`
          : bulkCarePath
        return (
          <section data-care-section key={section.id} className="rounded-lg border border-stone-200 bg-white/35 shadow-sm" style={{ display: visible.length ? undefined : 'none', marginLeft: section.depth ? `${Math.min(section.depth, 3) * 0.75}rem` : undefined }}>
            <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggle(section.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' && !isExpanded) { event.preventDefault(); toggle(section.id) }
                  if (event.key === 'ArrowLeft' && isExpanded) { event.preventDefault(); toggle(section.id) }
                }}
                aria-expanded={isExpanded}
                aria-controls={`care-location-${section.id}`}
                aria-label={`${section.label} section ${isExpanded ? 'expanded' : 'collapsed'}, ${section.items.length} care items`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="min-w-0">
                  <strong className="block truncate font-serif text-lg">{section.label}</strong>
                  <span className="block truncate text-xs text-stone-500">{section.path}</span>
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
                <span className="rounded-full border border-stone-200 bg-white/70 px-2 py-1">{section.items.length} due</span>
                {section.overdue > 0 && <span className="rounded-full border border-[#ddb3a7] bg-[#fff1ec] px-2 py-1 text-[#913e2d]">{section.overdue} overdue</span>}
                {section.typeCounts.map(({ type, count }) => <span key={type} className="hidden rounded-full border border-stone-200 bg-white/60 px-2 py-1 sm:inline">{count} {type.toLowerCase().replaceAll('_', ' ')}</span>)}
              </div>
              {canAct && section.locationId && (
                <div className="flex flex-wrap gap-1.5">
                  <Link href={bulkHref} className="rounded-md border border-[#c7d8bd] bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-[#2f6b45]">Complete visible care</Link>
                  {workflowTemplates.length > 0 && (
                    <form action={startWorkflowRun} className="flex gap-1.5">
                      <input type="hidden" name="collectionSlug" value={collectionSlug} />
                      <input type="hidden" name="scopeType" value="LOCATION" />
                      <input type="hidden" name="locationId" value={section.locationId} />
                      <input type="hidden" name="includeNestedLocations" value="1" />
                      <select name="templateId" aria-label={`Workflow for ${section.label}`} className="max-w-36 rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1 text-xs">
                        {workflowTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                      <Button className="px-2.5 py-1 text-xs">Start workflow</Button>
                    </form>
                  )}
                </div>
              )}
            </div>
            {isExpanded && (
              <div id={`care-location-${section.id}`} className="grid gap-3 p-3 xl:grid-cols-2">
                {originalSection.items.map((item) => (
                  <div key={item.key} data-care-key={item.key} tabIndex={-1} aria-label={item.title} style={{ display: visibleByKey.has(item.key) ? undefined : 'none' }}>
                  <CareQueueItemCard item={visibleByKey.get(item.key) || item} collectionSlug={collectionSlug} back={back} canAct={canAct} timezone={timezone} substrateVersions={substrateVersions} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
