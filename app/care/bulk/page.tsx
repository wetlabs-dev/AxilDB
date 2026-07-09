import { randomUUID } from 'crypto'
import Link from 'next/link'
import { completeBulkCare } from '@/app/actions'
import { BulkCareSelectionControls } from '@/components/BulkCareSelectionControls'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { careTaskLabel, getCareQueue } from '@/lib/care-queue'
import { collectionPath, requireCollectionLogger } from '@/lib/collections'
import { descendantLocationIds, locationPathWithCodes } from '@/lib/locations'
import { prisma } from '@/lib/prisma'
import { formatDate, parseDateLocal } from '@/lib/time'
import { plantName } from '@/lib/utils'

const careTypes = [
  ['WATERING', 'Watering'],
  ['FERTILIZING', 'Fertilizing'],
  ['REPOTTING', 'Repotting'],
  ['PEST_CHECK', 'Pest check'],
  ['HEALTH_CHECK', 'Health check'],
  ['PROPAGATION_CHECK', 'Propagation check'],
  ['BLOOM_CHECK', 'Bloom check'],
  ['OTHER', 'Other'],
] as const

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function allParams(value?: string | string[]) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function queueTaskForCareType(careType: string) {
  if (careType === 'WATERING') return 'WATER'
  if (careType === 'FERTILIZING') return 'FERTILIZE'
  if (['PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK'].includes(careType)) return careType
  if (careType === 'OTHER') return 'REMINDER'
  return null
}

function inputDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

export default async function BulkCarePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const context = await requireCollectionLogger()
  const [locations, fertilizerRecipes] = await Promise.all([
    prisma.location.findMany({
      where: { collectionId: context.collection.id, status: 'ACTIVE' },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.fertilizerRecipe.findMany({
      where: { collectionId: context.collection.id, active: true },
      orderBy: [{ draft: 'asc' }, { name: 'asc' }],
    }),
  ])
  const locationId = firstParam(params.locationId) || locations[0]?.id || ''
  const includeNested = firstParam(params.includeNested) === '1' || firstParam(params.includeNested) === 'on'
  const includeArchived = firstParam(params.includeArchived) === '1' || firstParam(params.includeArchived) === 'on'
  const dueOnly = firstParam(params.dueOnly) === '1' || firstParam(params.dueOnly) === 'on'
  const overdueOnly = firstParam(params.overdueOnly) === '1' || firstParam(params.overdueOnly) === 'on'
  const activeIssuesOnly = firstParam(params.activeIssuesOnly) === '1' || firstParam(params.activeIssuesOnly) === 'on'
  const quarantineOnly = firstParam(params.quarantineOnly) === '1' || firstParam(params.quarantineOnly) === 'on'
  const review = firstParam(params.review) === '1'
  const careType = firstParam(params.careType) || 'WATERING'
  const search = (firstParam(params.q) || '').toLowerCase().trim()
  const selectedIds = new Set(allParams(params.plantInstanceId))
  const location = locations.find((item) => item.id === locationId)
  const locationIds = location
    ? includeNested
      ? [location.id, ...Array.from(descendantLocationIds(location.id, locations))]
      : [location.id]
    : []
  const locationNodes = locations.map((item) => ({
    id: item.id,
    parentLocationId: item.parentLocationId,
    name: item.name,
    code: item.code,
    status: item.status,
    sortOrder: item.sortOrder,
    locationType: item.locationType,
  }))

  const [plants, queueItems] = locationIds.length
    ? await Promise.all([
        prisma.plantInstance.findMany({
          where: {
            collectionId: context.collection.id,
            currentLocationId: { in: locationIds },
            ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
          },
          include: {
            plantDefinition: true,
            currentLocation: { include: { locationType: true } },
            conditions: { where: { status: { in: ['OPEN', 'IMPROVING'] } }, orderBy: [{ severity: 'desc' }, { observedAt: 'desc' }] },
            quarantines: { where: { status: 'ACTIVE' } },
          },
          orderBy: { plantId: 'asc' },
        }),
        getCareQueue(prisma, {
          collectionId: context.collection.id,
          collectionSlug: context.collection.slug,
          userId: context.user.id,
        }),
      ])
    : [[], []]

  const now = new Date()
  const queueTaskType = queueTaskForCareType(careType)
  const dueByPlant = new Map<string, typeof queueItems>()
  for (const item of queueItems) {
    if (!item.plantInstanceId || item.completedAt) continue
    if (queueTaskType && item.taskType !== queueTaskType) continue
    if (item.dueAt > now) continue
    const rows = dueByPlant.get(item.plantInstanceId) || []
    rows.push(item)
    dueByPlant.set(item.plantInstanceId, rows)
  }
  const filteredPlants = plants.filter((plant) => {
    const haystack = `${plant.plantId} ${plantName(plant.plantDefinition)} ${plant.currentLocation?.name || ''} ${plant.currentLocation?.code || ''}`.toLowerCase()
    const dueItems = dueByPlant.get(plant.id) || []
    if (search && !haystack.includes(search)) return false
    if (dueOnly && dueItems.length === 0) return false
    if (overdueOnly && !dueItems.some((item) => item.overdueDays > 0)) return false
    if (activeIssuesOnly && plant.conditions.length === 0) return false
    if (quarantineOnly && plant.quarantines.length === 0) return false
    return true
  })
  const selectedPlants = filteredPlants.filter((plant) => selectedIds.has(plant.id))
  const selectedMatchingQueueItems = selectedPlants.flatMap((plant) => dueByPlant.get(plant.id) || [])
  const sharedNote = firstParam(params.sharedNote) || ''
  const sharedResult = firstParam(params.sharedResult) || ''
  const fertilizerRecipeId = firstParam(params.fertilizerRecipeId)
  const fertilizerStrength = firstParam(params.fertilizerStrength)
  const fertilizerDose = firstParam(params.fertilizerDose)
  const fertilizerWaterVolume = firstParam(params.fertilizerWaterVolume)
  const performedAt = firstParam(params.performedAt) || inputDateTimeValue()
  const success = firstParam(params.bulk) === 'success'
  const duplicate = firstParam(params.bulk) === 'duplicate'
  const error = firstParam(params.error)
  const formId = 'bulk-care-form'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Bulk care by location</h2>
          <p className="text-sm text-stone-600">Record one care event per selected plant, scoped to a location or location tree.</p>
        </div>
        <Link href={collectionPath(context.collection.slug, '/care')} className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold">
          Care Queue
        </Link>
      </div>

      {success && (
        <Card className="border-[#c7d8bd] bg-[#f5fbf0]">
          <p className="font-semibold text-[#2f6b45]">Bulk care recorded.</p>
          <p className="mt-1 text-sm text-stone-700">
            {firstParam(params.events) || '0'} care event(s) created · {firstParam(params.completed) || '0'} matching queue item(s) completed · {firstParam(params.skipped) || '0'} skipped.
          </p>
        </Card>
      )}
      {duplicate && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">This bulk care batch was already submitted, so no duplicate events were created.</Card>}
      {error && <Card className="border-red-200 bg-red-50 text-sm text-red-900">Bulk care was not submitted: {error.replaceAll('-', ' ')}.</Card>}

      <Card>
        <form method="get" action={collectionPath(context.collection.slug, '/care/bulk')} className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-stone-800 md:col-span-2">
            Location
            <select className={selectClass} name="locationId" defaultValue={locationId} required>
              {locations.map((item) => <option key={item.id} value={item.id}>{item.code} · {locationPathWithCodes(item.id, locationNodes)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-stone-800">
            Care task
            <select className={selectClass} name="careType" defaultValue={careType}>
              {careTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <Field label="Search" name="q" defaultValue={firstParam(params.q) || ''} />
          <div className="flex flex-wrap gap-3 text-sm md:col-span-4">
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="includeNested" value="1" defaultChecked={includeNested} /> Include child locations</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="includeArchived" value="1" defaultChecked={includeArchived} /> Include archived plants</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="dueOnly" value="1" defaultChecked={dueOnly} /> Due only</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="overdueOnly" value="1" defaultChecked={overdueOnly} /> Overdue only</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="activeIssuesOnly" value="1" defaultChecked={activeIssuesOnly} /> Active issues</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="quarantineOnly" value="1" defaultChecked={quarantineOnly} /> Quarantine</label>
          </div>
          <Button className="justify-self-start md:col-span-4">Refresh plant list</Button>
        </form>
      </Card>

      <form id={formId} method={review ? 'post' : 'get'} action={review ? completeBulkCare : collectionPath(context.collection.slug, '/care/bulk')} className="space-y-4">
        <input type="hidden" name="collectionSlug" value={context.collection.slug} />
        <input type="hidden" name="locationId" value={locationId} />
        <input type="hidden" name="careType" value={careType} />
        {review && fertilizerRecipeId && <input type="hidden" name="fertilizerRecipeId" value={fertilizerRecipeId} />}
        {review && fertilizerStrength && <input type="hidden" name="fertilizerStrength" value={fertilizerStrength} />}
        {review && fertilizerDose && <input type="hidden" name="fertilizerDose" value={fertilizerDose} />}
        {review && fertilizerWaterVolume && <input type="hidden" name="fertilizerWaterVolume" value={fertilizerWaterVolume} />}
        <input type="hidden" name="q" value={firstParam(params.q) || ''} />
        <input type="hidden" name="bulkCareBatchId" value={firstParam(params.bulkCareBatchId) || randomUUID()} />
        {includeNested && <input type="hidden" name="includeNested" value="on" />}
        {includeArchived && <input type="hidden" name="includeArchived" value="on" />}
        {dueOnly && <input type="hidden" name="dueOnly" value="1" />}
        {overdueOnly && <input type="hidden" name="overdueOnly" value="1" />}
        {activeIssuesOnly && <input type="hidden" name="activeIssuesOnly" value="1" />}
        {quarantineOnly && <input type="hidden" name="quarantineOnly" value="1" />}

        <Card className="grid gap-3 md:grid-cols-2">
          <Field label="Performed date/time" name="performedAt" type="datetime-local" defaultValue={performedAt} required />
          <Field label="Shared result/status" name="sharedResult" defaultValue={sharedResult} placeholder="Optional, e.g. completed, clear, monitor" />
          {careType === 'FERTILIZING' && (
            <>
              <label className="grid gap-1 text-sm font-medium text-stone-800">
                Fertilizer recipe
                <select className={selectClass} name="fertilizerRecipeId" defaultValue={fertilizerRecipeId}>
                  <option value="">No recipe / ad hoc</option>
                  {fertilizerRecipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}{recipe.draft ? ' (draft)' : ''}</option>)}
                </select>
              </label>
              <Field label="Strength" name="fertilizerStrength" defaultValue={fertilizerStrength} placeholder="e.g. quarter strength" />
              <Field label="Dose" name="fertilizerDose" defaultValue={fertilizerDose} placeholder="e.g. 2 ml" />
              <Field label="Water volume" name="fertilizerWaterVolume" defaultValue={fertilizerWaterVolume} placeholder="e.g. 1 L" />
            </>
          )}
          <TextArea label="Shared note" name="sharedNote" defaultValue={sharedNote} wrapperClassName="md:col-span-2" className="min-h-20" />
        </Card>

        {review ? (
          <Card className="space-y-3 border-[#c7d8bd] bg-[#f5fbf0]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f6b45]">Review before submit</p>
            <h3 className="font-serif text-2xl font-semibold">{careTypes.find(([value]) => value === careType)?.[1] || careType} for {selectedPlants.length} plant(s)</h3>
            <p className="text-sm text-stone-700">
              Location: {location ? `${location.code} · ${locationPathWithCodes(location.id, locationNodes)}` : 'No location selected'} · {includeNested ? 'direct and nested plants' : 'direct plants only'}
            </p>
            <p className="text-sm text-stone-700">
              Matching due queue items that will be advanced: {selectedMatchingQueueItems.length}
            </p>
            {sharedNote && <p className="whitespace-pre-wrap text-sm text-stone-700">Shared note: {sharedNote}</p>}
            {sharedResult && <p className="text-sm text-stone-700">Shared result: {sharedResult}</p>}
            {careType === 'FERTILIZING' && (
              <p className="text-sm text-stone-700">
                Recipe: {fertilizerRecipes.find((recipe) => recipe.id === fertilizerRecipeId)?.name || 'Ad hoc'}{fertilizerStrength ? ` · ${fertilizerStrength}` : ''}{fertilizerDose ? ` · ${fertilizerDose}` : ''}{fertilizerWaterVolume ? ` in ${fertilizerWaterVolume}` : ''}
              </p>
            )}
            <div className="grid gap-2">
              {selectedPlants.map((plant) => {
                const skipped = firstParam(params[`skip:${plant.id}`]) === 'on'
                return (
                  <div key={plant.id} className="rounded-md border border-[#c7d8bd] bg-white/70 p-3 text-sm">
                    <p className="font-semibold">{plant.plantId} · {plantName(plant.plantDefinition)}{skipped ? ' · skipped' : ''}</p>
                    {firstParam(params[`note:${plant.id}`]) && <p className="text-stone-600">Note: {firstParam(params[`note:${plant.id}`])}</p>}
                    {firstParam(params[`result:${plant.id}`]) && <p className="text-stone-600">Result: {firstParam(params[`result:${plant.id}`])}</p>}
                    {firstParam(params[`skipReason:${plant.id}`]) && <p className="text-stone-600">Skip reason: {firstParam(params[`skipReason:${plant.id}`])}</p>}
                  </div>
                )
              })}
            </div>
            {selectedPlants.map((plant) => (
              <div key={plant.id}>
                <input type="hidden" name="plantInstanceId" value={plant.id} />
                {firstParam(params[`note:${plant.id}`]) && <input type="hidden" name={`note:${plant.id}`} value={firstParam(params[`note:${plant.id}`])} />}
                {firstParam(params[`result:${plant.id}`]) && <input type="hidden" name={`result:${plant.id}`} value={firstParam(params[`result:${plant.id}`])} />}
                {firstParam(params[`skip:${plant.id}`]) === 'on' && <input type="hidden" name={`skip:${plant.id}`} value="on" />}
                {firstParam(params[`skipReason:${plant.id}`]) && <input type="hidden" name={`skipReason:${plant.id}`} value={firstParam(params[`skipReason:${plant.id}`])} />}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button>Submit bulk care</Button>
              <Link href={collectionPath(context.collection.slug, `/care/bulk?locationId=${encodeURIComponent(locationId)}&includeNested=${includeNested ? '1' : '0'}&careType=${encodeURIComponent(careType)}`)} className="rounded-md border border-stone-300 bg-white/80 px-4 py-2 text-sm font-semibold">
                Back to edit
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{filteredPlants.length} eligible plant(s)</p>
                <p className="text-sm text-stone-600">{location ? `${location.code} · ${locationPathWithCodes(location.id, locationNodes)}` : 'Choose a location'} · {includeNested ? 'direct and nested' : 'direct only'}</p>
              </div>
              <BulkCareSelectionControls formId={formId} />
            </Card>
            <div className="grid gap-3">
              {filteredPlants.length === 0 && <Card className="py-8 text-center text-sm text-stone-600">No plants match this location and filter set.</Card>}
              {filteredPlants.map((plant) => {
                const direct = plant.currentLocationId === locationId
                const dueItems = dueByPlant.get(plant.id) || []
                return (
                  <Card key={plant.id} className="grid gap-3">
                    <label className="flex flex-wrap items-start gap-3">
                      <input className="mt-1" type="checkbox" name="plantInstanceId" value={plant.id} defaultChecked={selectedIds.size ? selectedIds.has(plant.id) : true} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-semibold text-[#2f6b45]">{plant.plantId}</span>
                        <span className="block font-serif text-xl font-semibold">{plantName(plant.plantDefinition)}</span>
                        <span className="block text-sm text-stone-600">{plant.currentLocation ? `${plant.currentLocation.code} · ${locationPathWithCodes(plant.currentLocation.id, locationNodes)}` : 'No location set'}</span>
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${direct ? 'bg-[#e8efdf] text-[#2f6b45]' : 'bg-stone-100 text-stone-600'}`}>{direct ? 'Direct' : 'Nested'}</span>
                    </label>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {dueItems.map((item) => <span key={item.key} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">{careTaskLabel(item.taskType)} {item.overdueDays > 0 ? `${item.overdueDays}d overdue` : 'due'}</span>)}
                      {plant.conditions.length > 0 && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-800">{plant.conditions.length} active issue(s)</span>}
                      {plant.quarantines.length > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">Quarantine</span>}
                      {plant.status === 'ARCHIVED' && <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-1 text-stone-600">Archived</span>}
                    </div>
                    <details className="rounded-md border border-stone-200 bg-white/55 p-3 text-sm">
                      <summary className="cursor-pointer font-semibold">Per-plant overrides</summary>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <TextArea label="Plant note" name={`note:${plant.id}`} defaultValue={firstParam(params[`note:${plant.id}`])} className="min-h-16" />
                        <TextArea label="Plant result/status" name={`result:${plant.id}`} defaultValue={firstParam(params[`result:${plant.id}`])} className="min-h-16" />
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" name={`skip:${plant.id}`} defaultChecked={firstParam(params[`skip:${plant.id}`]) === 'on'} /> Skip this selected plant
                        </label>
                        <Field label="Skip reason" name={`skipReason:${plant.id}`} defaultValue={firstParam(params[`skipReason:${plant.id}`]) || ''} />
                      </div>
                    </details>
                  </Card>
                )
              })}
            </div>
            <input type="hidden" name="review" value="1" />
            <Button className="w-full sm:w-auto">Review bulk care</Button>
          </>
        )}
      </form>
    </div>
  )
}
