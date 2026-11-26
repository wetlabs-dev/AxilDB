'use client'
import { Search, X, Check } from 'lucide-react'
import { CareQueueFeedback } from '@/components/CareQueueFeedback'
import { CareCategoryBadge } from '@/components/CareCategoryBadge'
import { AttentionHelp } from '@/components/AttentionHelp'
import { useEffect, useState } from 'react'
import { CareQueueViewSettings } from '@/components/CareQueueViewSettings'
import type { CarePresentation, CareViewPreference } from '@/lib/care-view'
import { normalizeTypographySearch } from '@/lib/typography'
import Link from 'next/link'
import { careFilterPresentation, careFilterTaskType } from '@/lib/care-category-presentation'
import { CareForecast } from '@/components/CareForecast'
import { formatDate } from '@/lib/time'
import { CheckCircle2 } from 'lucide-react'
import { startWorkflowRun } from '@/app/workflow-actions'
import { CareQueueLocationBoard } from '@/components/CareQueueLocationBoard'
import { useCareQueue } from '@/components/CareQueueOptimistic'
import { Button, Card } from '@/components/ui'
import { collectionPath } from '@/lib/collection-path'
import { careQueueSummary, filterCareQueue } from '@/lib/care-queue-view'
import { careQueueLocationFilters, careQueueLocationSections, type CareQueueGroupingMode, type CareQueueLocationSort } from '@/lib/care-queue-locations'
import { descendantLocationIds, type LocationNode } from '@/lib/locations'

const filters = [
  ['today', 'Today'],
  ['overdue', 'Overdue'],
  ['water', 'Water'],
  ['fertilize', 'Fertilizer'],
  ['repot', 'Repot'],
  ['treatment', 'Treatments'],
  ['propagation', 'Propagation'],
  ['health', 'Health'],
  ['pest', 'Pest'],
  ['bloom', 'Bloom'],
  ['custom', 'Custom'],
  ['completed', 'Completed'],
] as const

export function CareQueueView({ collectionSlug, canAct, timezone, filter, search, grouping: initialGrouping, locationSort: initialSort, initialPreference, canRemember, selectedLocationParam, locations, substrateVersions, workflowTemplates }: {
 initialPreference: CareViewPreference; canRemember: boolean; collectionSlug: string; canAct: boolean; timezone?: string; filter: string; search: string; grouping: CareQueueGroupingMode; locationSort: CareQueueLocationSort; selectedLocationParam?: string; locations: LocationNode[]; substrateVersions: Array<{ id: string; label: string }>; workflowTemplates: Array<{ id: string; name: string }>
}) {
 const [view,setView] = useState<CarePresentation>({grouping:initialGrouping,locationSort:initialSort})
 const [conflicts,setConflicts] = useState(0)
 useEffect(()=>setView({grouping:initialGrouping,locationSort:initialSort}),[initialGrouping,initialSort])
 const {grouping,locationSort}=view
 function applyView(next:CarePresentation){setView(next);const params=new URLSearchParams(window.location.search);params.set('grouping',next.grouping);params.set('locationSort',next.locationSort);window.history.replaceState(null,'',`${window.location.pathname}?${params}`)}
 const { items: allItems, authoritativeItems } = useCareQueue()
 const context = { collection: { slug: collectionSlug } }
 const params = { location: selectedLocationParam }
  const summary = careQueueSummary(allItems, new Date(), timezone)
  const careTypeItems = filterCareQueue(allItems, filter, new Date(), timezone)
  const filteredItems = search
    ? careTypeItems.filter((item) => normalizeTypographySearch(`${item.plantId || ''} ${item.plantName || ''} ${item.title} ${item.reason} ${item.locationPath || ''}`).toLowerCase().includes(normalizeTypographySearch(search).toLowerCase()))
    : careTypeItems
  const locationFilters = careQueueLocationFilters(filteredItems, locations, grouping)
  const selectedLocation = locations.some((location) => location.id === params.location) ? params.location! : ''
  const selectedLocationIds = selectedLocation ? new Set([selectedLocation, ...descendantLocationIds(selectedLocation, locations)]) : null
  const items = selectedLocationIds ? filteredItems.filter((item) => item.locationId && selectedLocationIds.has(item.locationId)) : filteredItems
  const renderFiltered = filterCareQueue(authoritativeItems, filter, new Date(), timezone).filter(item => !search || normalizeTypographySearch(`${item.plantId || ''} ${item.plantName || ''} ${item.title} ${item.reason} ${item.locationPath || ''}`).toLowerCase().includes(normalizeTypographySearch(search).toLowerCase()))
  const renderItems = selectedLocationIds ? renderFiltered.filter(item => item.locationId && selectedLocationIds.has(item.locationId)) : renderFiltered
  const sections = careQueueLocationSections(renderItems, locations, grouping, locationSort)
  const locationCount = new Set(items.map((item) => item.locationId).filter(Boolean)).size
  const query = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams({ filter, grouping, locationSort })
    if (search) next.set('q', search)
    if (selectedLocation) next.set('location', selectedLocation)
    for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key)
    return `${collectionPath(context.collection.slug, '/care')}?${next.toString()}`
  }
  const back = query({})
  const continuation = `queueView=${grouping}:${locationSort}`
  return (
    <div className="space-y-3" data-care-queue-root>
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-3xl font-bold">Today’s Care</h2><p className="text-sm ax-text-muted">{formatDate(new Date(), timezone)} · Calendar-day care, available from local midnight.</p></div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs"><div className="rounded border px-3 py-1"><b data-care-summary="today" className="block text-base">{summary.today}</b> due today</div><div className="rounded border px-3 py-1"><b data-care-summary="overdue" className="block text-base">{summary.overdue}</b> overdue</div><AttentionHelp count={summary.health}/><div className="rounded border px-3 py-1"><b className="block text-base">{summary.propagation}</b> props</div></div>
        </div>
        <nav aria-label="Care actions" className="care-primary-actions flex flex-wrap items-center gap-2 text-sm">
          <Link className="min-h-11 rounded border px-3 py-2" href={`${collectionPath(collectionSlug,'/care/bulk')}?${continuation}`}>Bulk care by location</Link>
          {canAct&&<Link className="min-h-11 rounded border px-3 py-2" href={`${collectionPath(collectionSlug,'/care/sync')}?${continuation}`}>Sync care schedules</Link>}
          <Link className="min-h-11 rounded border px-3 py-2" href={`${collectionPath(collectionSlug,'/care/checklist')}?${continuation}`}>Weekly checklist</Link>
          {canAct&&workflowTemplates.length>0&&<details data-care-workflow className="care-workflow-menu" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}><summary className="min-h-11 cursor-pointer rounded border px-3 py-2">Start workflow</summary><form action={startWorkflowRun} className="care-view-popover space-y-2 rounded border p-3"><input type="hidden" name="collectionSlug" value={collectionSlug}/><input type="hidden" name="scopeType" value="COLLECTION"/><p>Scope: this collection</p><label className="grid gap-1">Workflow<select name="templateId" className="ax-control min-h-11 max-w-full rounded border p-2">{workflowTemplates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label><Button>Start workflow</Button></form></details>}
          <a className="min-h-11 px-2 py-2 underline" href="#care-forecast">Forecast{conflicts>0?` · ${conflicts} scheduling conflict${conflicts===1?'':'s'}`:''}</a>
        </nav>
      </header>
      <section aria-label="Care filters and view" className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            aria-current={filter===value?'page':undefined}
            data-semantic-color={careFilterPresentation(value)?.color}
            href={query({ filter: value, location: undefined })}
            className={`care-category-filter inline-flex min-h-11 items-center shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${filter === value ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f]' : 'border-stone-200 bg-white/60 text-stone-700'}`}
          >
            {careFilterPresentation(value)?<CareCategoryBadge type={careFilterTaskType(value)!} label={label}/>:label}{filter===value&&<Check className="ml-1 h-3 w-3" aria-hidden="true"/>}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter care by location">
          <Link href={query({ location: undefined })} className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${!selectedLocation ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f]' : 'border-stone-200 bg-white/60 text-stone-700'}`}>All locations ({filteredItems.length})</Link>
          {locationFilters.map((location) => (
            <Link key={location.id} title={location.path} href={query({ location: location.id })} className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${selectedLocation === location.id ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f]' : 'border-stone-200 bg-white/60 text-stone-700'}`}>
              {location.label} ({location.count})
            </Link>
          ))}
        </div>
        <div className="care-search-toolbar flex items-center gap-2">
          <form className="care-search-form relative flex min-w-0 flex-1 items-center">
            <input type="hidden" name="grouping" value={grouping}/><input type="hidden" name="locationSort" value={locationSort}/>
            <input type="hidden" name="filter" value={filter}/>{selectedLocation&&<input type="hidden" name="location" value={selectedLocation}/>}
            <label className="sr-only" htmlFor="care-search">Search</label><input id="care-search" type="search" enterKeyHint="search" name="q" key={search} defaultValue={search} placeholder="Plant, task, or location" className="ax-control min-h-11 w-full min-w-0 rounded border py-2 pl-10 pr-8 text-sm"/>
            <button type="submit" aria-label="Search care" className="absolute left-0 min-h-11 px-2"><Search className="h-5 w-5" aria-hidden="true"/></button>
            {search&&<Link href={query({q:undefined})} aria-label="Clear search" className="absolute right-0 flex min-h-11 items-center px-2"><X className="h-4 w-4"/></Link>}
          </form>
          <CareQueueViewSettings collectionSlug={collectionSlug} view={view} onChange={applyView} initialPreference={initialPreference} canRemember={canRemember}/>
        </div>
      </div>

      </section>

      {items.length === 0 ? (
        <Card className="p-3 text-center">
          <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-[#2f6b45]" />
          <h3 data-care-empty-focus tabIndex={-1} className="font-serif text-2xl font-bold">{filter==='today'&&!search&&!selectedLocation ? conflicts>0?'Care needs a scheduling decision.':'No care due today.':'No tasks match this view.'}</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600">{conflicts>0?'Review scheduling conflicts in the forecast below.':search||selectedLocation||filter!=='today'?'Try another filter or location to see other care.':'The forecast below shows upcoming care.'}</p>
        </Card>
      ) : null}
      {sections.length > 0 && (
        <CareQueueLocationBoard visibleItems={items} sections={sections} collectionSlug={context.collection.slug} back={back} canAct={canAct} timezone={timezone} substrateVersions={substrateVersions} workflowTemplates={workflowTemplates.map((template) => ({ id: template.id, name: template.name }))} resultsSummary={`${locationCount} location${locationCount===1?'':'s'} with visible care`} />
      )}
      <section id="care-forecast" className="care-forecast-section" aria-label="Care planning"><CareForecast collectionSlug={collectionSlug} onConflictCount={setConflicts}/></section><CareQueueFeedback/>
    </div>
  )
}
