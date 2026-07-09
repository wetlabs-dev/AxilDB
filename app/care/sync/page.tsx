import Link from 'next/link'
import { applyCareScheduleSync } from '@/app/care-schedule-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { canCreateInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { careScheduleLabel, normalizeCareTypes, parseTargetDueAt, resolveQuietDayShift } from '@/lib/care-scheduling'
import { getCareQueue } from '@/lib/care-queue'
import { descendantLocationIds, locationPathWithCodes } from '@/lib/locations'
import { prisma } from '@/lib/prisma'
import { formatDateTime, timeZoneForPreference } from '@/lib/time'
import { plantName } from '@/lib/utils'

const syncCareTypes = ['WATER', 'FERTILIZE', 'PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK', 'REMINDER'] as const

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function allParams(value?: string | string[]) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function checkedParam(value: string | string[] | undefined, defaultValue = false) {
  const values = allParams(value)
  if (values.length === 0) return defaultValue
  return values.some((item) => item === 'on' || item === '1' || item === 'true')
}

export default async function CareScheduleSyncPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await requireCollectionViewer()
  const canSync = canCreateInCollection(context.user, context)
  const params = await searchParams
  const preferences = context.user ? await prisma.emailPreference.findUnique({ where: { userId: context.user.id } }) : null
  const timezone = timeZoneForPreference(preferences)
  const definitionId = firstParam(params.definitionId)
  const locationId = firstParam(params.locationId)
  const includeNested = checkedParam(params.includeNested, true)
  const targetDate = firstParam(params.targetDate) || new Date().toISOString().slice(0, 10)
  const targetTime = firstParam(params.targetTime) || '09:00'
  const review = firstParam(params.review) === '1'
  const createMissing = checkedParam(params.createMissing, true)
  const syncCadence = checkedParam(params.syncCadence, false)
  const rawCadenceDays = Number(firstParam(params.cadenceDays) || '7')
  const cadenceDays = Number.isFinite(rawCadenceDays) ? Math.max(1, Math.min(365, Math.floor(rawCadenceDays))) : 7
  const selectedCareTypes = normalizeCareTypes(allParams(params.careType)).filter((type) => syncCareTypes.includes(type as any))
  const selectedPlantIds = new Set(allParams(params.plantInstanceId))

  const [definitions, locations, quietDays, quietRules, allItems] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: { OR: [{ collectionId: context.collection.id }, { collectionId: null, isValidated: true }] },
      orderBy: [{ isValidated: 'desc' }, { genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
    }),
    prisma.location.findMany({ where: { collectionId: context.collection.id, status: 'ACTIVE' }, include: { locationType: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.collectionQuietDay.findMany({ where: { collectionId: context.collection.id, active: true } }),
    prisma.collectionQuietDayShiftRule.findMany({ where: { collectionId: context.collection.id, active: true } }),
    getCareQueue(prisma, { collectionId: context.collection.id, collectionSlug: context.collection.slug, userId: context.user?.id, timezone }),
  ])
  const locationNodes = locations.map((location) => ({
    id: location.id,
    parentLocationId: location.parentLocationId,
    name: location.name,
    code: location.code,
    status: location.status,
    sortOrder: location.sortOrder,
    locationType: location.locationType,
  }))
  const selectedLocation = locationId ? locationNodes.find((location) => location.id === locationId) : null
  const selectedDefinition = definitionId ? definitions.find((definition) => definition.id === definitionId) : null
  const descendantIds = selectedLocation && includeNested ? Array.from(descendantLocationIds(selectedLocation.id, locationNodes)) : []
  const locationIds = selectedLocation ? [selectedLocation.id, ...descendantIds] : []
  const plants = await prisma.plantInstance.findMany({
    where: {
      collectionId: context.collection.id,
      status: 'ACTIVE',
      ...(selectedDefinition ? { plantDefinitionId: selectedDefinition.id } : {}),
      ...(locationIds.length ? { currentLocationId: { in: locationIds } } : {}),
    },
    include: { plantDefinition: true, currentLocation: { include: { locationType: true } }, quarantines: { where: { status: 'ACTIVE' }, take: 1 } },
    orderBy: { plantId: 'asc' },
    take: 500,
  })
  const existingAdjustments = await prisma.plantCareAdjustment.findMany({
    where: {
      collectionId: context.collection.id,
      plantInstanceId: { in: plants.map((plant) => plant.id) },
      taskType: { in: syncCareTypes as unknown as string[] },
    },
  })
  const adjustmentByPlantType = new Map(existingAdjustments.map((adjustment) => [`${adjustment.plantInstanceId}:${adjustment.taskType}`, adjustment]))
  const dueByPlantType = new Map<string, (typeof allItems)[number]>()
  for (const item of allItems) {
    if (!item.plantInstanceId) continue
    const key = `${item.plantInstanceId}:${item.taskType}`
    const existing = dueByPlantType.get(key)
    if (!existing || item.dueAt < existing.dueAt) dueByPlantType.set(key, item)
  }
  const ruleByType = new Map(quietRules.map((rule) => [rule.careType, rule]))
  const targetDueAt = parseTargetDueAt(targetDate, targetTime, timezone)

  const selectedPlants = plants.filter((plant) => selectedPlantIds.has(plant.id))
  const defaultSelectFilteredPlants = selectedPlantIds.size === 0 && !review && Boolean(selectedDefinition || selectedLocation)
  const proposedRows = review
      ? selectedPlants.flatMap((plant) => selectedCareTypes.map((careType) => {
        const current = dueByPlantType.get(`${plant.id}:${careType}`)
        const adjustment = adjustmentByPlantType.get(`${plant.id}:${careType}`)
        const shift = resolveQuietDayShift({
          dueAt: targetDueAt,
          careType,
          quietDays,
          rule: ruleByType.get(careType),
          timezone,
        })
        return {
          plant,
          careType,
          current,
          proposed: shift?.adjustedDueAt || targetDueAt,
          currentCadence: adjustment?.cadenceOverrideDays || null,
          proposedCadence: syncCadence ? cadenceDays : null,
          quietReason: shift?.adjustedDueAt.getTime() !== targetDueAt.getTime() ? shift?.reason : null,
          action: current ? 'UPDATED' : 'CREATED',
        }
      }))
    : []
  const updatedCount = proposedRows.filter((row) => row.action === 'UPDATED').length
  const createdCount = proposedRows.filter((row) => row.action === 'CREATED').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Care Schedule Sync</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-600">Align next due dates for selected care items without recording completed care or deleting history.</p>
        </div>
        <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold" href={collectionPath(context.collection.slug, '/care')}>Care queue</Link>
      </div>

      {params.synced && <Card className="border-green-200 bg-green-50 text-sm text-green-900">Care schedule sync applied. Updated care queue dates should now reflect the new schedule.</Card>}
      {params.error && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">Choose at least one eligible plant and care type before reviewing.</Card>}

      {!canSync ? (
        <Card className="text-sm text-stone-600">Viewer access can inspect care, but cannot sync care schedules.</Card>
      ) : (
        <Card>
          <form method="get" action={collectionPath(context.collection.slug, '/care/sync')} className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-5">
              <Select label="Definition filter" name="definitionId" defaultValue={selectedDefinition?.id || ''}>
                <option value="">All active definitions</option>
                {definitions.map((definition) => <option key={definition.id} value={definition.id}>{plantName(definition)}</option>)}
              </Select>
              <Select label="Location filter" name="locationId" defaultValue={locationId}>
                <option value="">All active plants</option>
                {locationNodes.map((location) => <option key={location.id} value={location.id}>{locationPathWithCodes(location.id, locationNodes)}</option>)}
              </Select>
              <label className="flex items-center gap-2 rounded-md border border-stone-200 bg-white/60 px-3 py-2 text-sm font-medium">
                <input type="hidden" name="includeNested" value="0" />
                <input type="checkbox" name="includeNested" value="1" defaultChecked={includeNested} />
                Include child locations
              </label>
              <Field label="Target date" name="targetDate" type="date" defaultValue={targetDate} />
              <Field label="Optional time" name="targetTime" type="time" defaultValue={targetTime} />
            </div>

            <div className="grid gap-3 rounded-lg border border-stone-200 bg-white/50 p-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
              <label className="flex items-start gap-2 text-sm">
                <input type="hidden" name="syncCadence" value="off" />
                <input className="mt-1" type="checkbox" name="syncCadence" value="on" defaultChecked={syncCadence} />
                <span>
                  <span className="font-medium">Sync cadence as well</span>
                  <span className="block text-stone-600">Set the selected care types to repeat on the same interval. Leave off to align only the next due date.</span>
                </span>
              </label>
              <Field label="Cadence days" name="cadenceDays" type="number" min="1" max="365" defaultValue={String(cadenceDays)} />
            </div>

            <fieldset className="rounded-lg border border-stone-200 bg-white/50 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Care types</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {syncCareTypes.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="careType" value={type} defaultChecked={selectedCareTypes.length ? selectedCareTypes.includes(type) : type === 'WATER'} />
                    {careScheduleLabel(type)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-stone-200 bg-white/50 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Plants</legend>
              <p className="mb-2 text-sm text-stone-600">
                {plants.length} active plant{plants.length === 1 ? '' : 's'} in scope
                {selectedDefinition ? ` for ${plantName(selectedDefinition)}` : ''}
                {selectedLocation ? ` at ${locationPathWithCodes(selectedLocation.id, locationNodes)}` : ''}.
                {' '}
                Select the specimens to synchronize.
              </p>
              <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
                {plants.map((plant) => (
                  <label key={plant.id} className="grid gap-1 rounded-md border border-stone-200 bg-white/65 p-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,0.7fr)]">
                    <input className="mt-1" type="checkbox" name="plantInstanceId" value={plant.id} defaultChecked={selectedPlantIds.has(plant.id) || defaultSelectFilteredPlants} />
                    <span>
                      <span className="block font-mono text-xs font-semibold text-[#2f6b45]">{plant.plantId}</span>
                      <span className="block font-medium">{plantName(plant.plantDefinition)}</span>
                      {plant.quarantines.length > 0 && <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-amber-900">Quarantine</span>}
                    </span>
                    <span className="text-xs text-stone-500">{plant.currentLocation ? locationPathWithCodes(plant.currentLocation.id, locationNodes) : plant.location || 'No location'}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="hidden" name="createMissing" value="off" />
              <input type="checkbox" name="createMissing" value="on" defaultChecked={createMissing} />
              Create missing schedule overrides for selected care types
            </label>
            <div className="flex flex-wrap gap-2">
              <button name="review" value="0" className="rounded-md border border-stone-300 bg-white/70 px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-[#f5f0e2]">
                Apply filters
              </button>
              <Button name="review" value="1">Review schedule sync</Button>
            </div>
          </form>
        </Card>
      )}

      {canSync && review && (
        <Card>
          <h3 className="font-serif text-2xl font-semibold">Review changes</h3>
          <p className="mt-1 text-sm text-stone-600">
            {selectedPlants.length} selected plant{selectedPlants.length === 1 ? '' : 's'} · {selectedCareTypes.length} care type{selectedCareTypes.length === 1 ? '' : 's'} · {updatedCount} update{updatedCount === 1 ? '' : 's'} · {createdCount} create{createdCount === 1 ? '' : 's'}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-stone-500">
                  <th className="border-b border-stone-200 px-3 py-2">Plant</th>
                  <th className="border-b border-stone-200 px-3 py-2">Care type</th>
                  <th className="border-b border-stone-200 px-3 py-2">Current next due</th>
                  <th className="border-b border-stone-200 px-3 py-2">Proposed next due</th>
                  {syncCadence && <th className="border-b border-stone-200 px-3 py-2">Cadence</th>}
                  <th className="border-b border-stone-200 px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {proposedRows.map((row) => (
                  <tr key={`${row.plant.id}-${row.careType}`} className="align-top">
                    <td className="border-b border-stone-200 px-3 py-2"><span className="font-mono text-xs font-semibold text-[#2f6b45]">{row.plant.plantId}</span><span className="block">{plantName(row.plant.plantDefinition)}</span></td>
                    <td className="border-b border-stone-200 px-3 py-2">{careScheduleLabel(row.careType)}</td>
                    <td className="border-b border-stone-200 px-3 py-2">{row.current ? formatDateTime(row.current.dueAt, timezone) : 'No current schedule/queue item'}</td>
                    <td className="border-b border-stone-200 px-3 py-2">
                      {formatDateTime(row.proposed, timezone)}
                      {row.quietReason && <span className="mt-1 block rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">{row.quietReason}</span>}
                    </td>
                    {syncCadence && (
                      <td className="border-b border-stone-200 px-3 py-2">
                        {row.currentCadence ? `${row.currentCadence}d` : 'Inferred/default'}
                        <span className="block font-semibold text-[#2f6b45]">→ {row.proposedCadence}d</span>
                      </td>
                    )}
                    <td className="border-b border-stone-200 px-3 py-2">{row.action.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={applyCareScheduleSync} className="mt-4 grid gap-3">
            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
            <input type="hidden" name="definitionId" value={selectedDefinition?.id || ''} />
            <input type="hidden" name="locationId" value={locationId} />
            <input type="hidden" name="includeNested" value={includeNested ? '1' : '0'} />
            <input type="hidden" name="targetDate" value={targetDate} />
            <input type="hidden" name="targetTime" value={targetTime} />
            <input type="hidden" name="timezone" value={timezone} />
            <input type="hidden" name="syncCadence" value={syncCadence ? 'on' : 'off'} />
            <input type="hidden" name="cadenceDays" value={String(cadenceDays)} />
            {selectedCareTypes.map((type) => <input key={type} type="hidden" name="careType" value={type} />)}
            {selectedPlants.map((plant) => <input key={plant.id} type="hidden" name="plantInstanceId" value={plant.id} />)}
            <input type="hidden" name="createMissing" value={createMissing ? 'on' : 'off'} />
            <TextArea label="Optional sync note" name="notes" />
            <Button className="w-fit">Confirm schedule sync</Button>
          </form>
        </Card>
      )}
    </div>
  )
}
