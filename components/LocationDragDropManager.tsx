'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { batchMovePlantsToLocation, moveLocation, reorderLocations } from '@/app/actions'
import { previewPlantLocationCompatibility } from '@/app/location-environment-actions'
import { descendantLocationIds, isQuarantineLocation, locationPathWithCodes } from '@/lib/locations'

type LocationItem = {
  id: string
  parentLocationId: string | null
  name: string
  code: string
  sortOrder: number
  status: string
  locationType: { name: string; abbreviation: string }
  directPlantCount: number
  nestedPlantCount: number
  childLocationCount: number
}

type PlantItem = {
  id: string
  plantId: string
  name: string
  currentLocationId: string | null
}

type PendingQuarantineMove = {
  plantIds: string[]
  toLocationId: string
  toLocationLabel: string
}

function locationRows(locations: LocationItem[], parentId: string | null = null, depth = 0): Array<LocationItem & { depth: number }> {
  return locations
    .filter((location) => (location.parentLocationId || null) === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    .flatMap((location) => [{ ...location, depth }, ...locationRows(locations, location.id, depth + 1)])
}

function arrayMove<T>(items: T[], from: number, to: number) {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

function DropZone({ id, label, disabled }: { id: string; label: string; disabled?: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-dashed px-3 py-2 text-sm transition ${isOver ? 'border-[#2f6b45] bg-[#edf5e9]' : 'border-stone-300 bg-white/40'} ${disabled ? 'opacity-50' : ''}`}
    >
      {label}
    </div>
  )
}

function SortableLocationRow({
  location,
  depth,
  canManage,
  canMovePlants,
  selected,
  onSelect,
}: {
  location: LocationItem
  depth: number
  canManage: boolean
  canMovePlants: boolean
  selected?: boolean
  onSelect: (locationId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `loc:${location.id}`,
    disabled: !canManage,
    data: { type: 'location', locationId: location.id, parentLocationId: location.parentLocationId },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginLeft: `${Math.min(depth, 5) * 1.25}rem`,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(location.id)}
      className={`rounded-lg border p-3 text-sm transition ${isOver && canMovePlants ? 'border-[#2f6b45] bg-[#edf5e9]' : 'border-stone-200 bg-white/55'} ${isDragging ? 'opacity-50' : ''} ${selected ? 'ring-2 ring-[#8fa58f]' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-lg font-semibold">{location.name}</p>
          <p className="text-stone-600">
            {location.code} · {location.locationType.name} · {location.directPlantCount} direct plant(s) · {location.nestedPlantCount} nested plant(s) · {location.childLocationCount} child location(s)
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="cursor-grab rounded-md border border-stone-300 bg-white/80 px-2 py-1 text-xs font-semibold active:cursor-grabbing"
            aria-label={`Drag ${location.name}`}
            {...attributes}
            {...listeners}
          >
            Drag
          </button>
        )}
      </div>
    </div>
  )
}

function DraggablePlant({
  plant,
  checked,
  onToggle,
  canMovePlants,
}: {
  plant: PlantItem
  checked: boolean
  onToggle: (plantId: string) => void
  canMovePlants: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `plant:${plant.id}`,
    disabled: !canMovePlants,
    data: { type: 'plant', plantId: plant.id },
  })
  const style = { transform: CSS.Transform.toString(transform) }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-stone-200 bg-white/60 p-2 text-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        {canMovePlants && <input type="checkbox" checked={checked} onChange={() => onToggle(plant.id)} aria-label={`Select ${plant.plantId}`} />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{plant.plantId}</p>
          <p className="truncate text-xs text-stone-600">{plant.name}</p>
        </div>
        {canMovePlants && (
          <button
            type="button"
            className="cursor-grab rounded-md border border-stone-300 bg-white/80 px-2 py-1 text-xs font-semibold active:cursor-grabbing"
            aria-label={`Drag ${plant.plantId}`}
            {...attributes}
            {...listeners}
          >
            Drag
          </button>
        )}
      </div>
    </div>
  )
}

export function LocationDragDropManager({
  collectionSlug,
  locations,
  plants,
  canManage,
  canMovePlants,
}: {
  collectionSlug: string
  locations: LocationItem[]
  plants: PlantItem[]
  canManage: boolean
  canMovePlants: boolean
}) {
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || '')
  const [activeLabel, setActiveLabel] = useState('')
  const [status, setStatus] = useState('')
  const [pendingQuarantineMove, setPendingQuarantineMove] = useState<PendingQuarantineMove | null>(null)
  const [isPending, startTransition] = useTransition()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const rows = useMemo(() => locationRows(locations), [locations])
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations])
  const plantById = useMemo(() => new Map(plants.map((plant) => [plant.id, plant])), [plants])
  const unassignedPlants = plants.filter((plant) => !plant.currentLocationId)
  const selectedLocation = selectedLocationId ? locationById.get(selectedLocationId) : null
  const selectedDescendantIds = selectedLocation ? descendantLocationIds(selectedLocation.id, locations) : new Set<string>()
  const selectedDirectPlants = selectedLocation ? plants.filter((plant) => plant.currentLocationId === selectedLocation.id) : []
  const selectedNestedPlants = selectedLocation ? plants.filter((plant) => plant.currentLocationId && selectedDescendantIds.has(plant.currentLocationId)) : []

  const togglePlant = (plantId: string) => {
    setSelectedPlantIds((current) => current.includes(plantId) ? current.filter((id) => id !== plantId) : [...current, plantId])
  }

  const movePlants = (plantIds: string[], toLocationId: string, startQuarantine = false, quarantine?: { reason: string; riskLevel: string; targetReleaseDate: string }) => {
    startTransition(async () => {
      try {
        let compatibilityAcknowledged = false
        let compatibilityNote: string | null = null
        if (!startQuarantine) {
          setStatus('Checking location compatibility...')
          const preview = await previewPlantLocationCompatibility({ collectionSlug, locationId: toLocationId, plantInstanceIds: plantIds })
          const warnings = preview.results.filter((result) => result.overallStatus === 'CAUTION' || result.overallStatus === 'POOR_MATCH')
          if (warnings.length) {
            const details = warnings.slice(0, 5).map((result) => {
              const mismatches = result.checks.map((check) => check.category).join(', ')
              return `${result.plantId}: ${result.overallStatus === 'POOR_MATCH' ? 'poor match' : 'review'}${mismatches ? ` (${mismatches})` : ''}`
            }).join('\n')
            const proceed = window.confirm(`${warnings.length} plant${warnings.length === 1 ? '' : 's'} need review before moving to ${preview.locationName}:\n\n${details}\n\nCompatibility guidance is advisory. Move anyway?`)
            if (!proceed) {
              setStatus('Move cancelled. Choose another location or review the plant requirements.')
              return
            }
            compatibilityAcknowledged = true
            compatibilityNote = 'Compatibility warning acknowledged during drag/drop move.'
          }
        }
        setStatus('Moving plants...')
        await batchMovePlantsToLocation({
          collectionSlug,
          plantInstanceIds: plantIds,
          destinationLocationId: toLocationId,
          note: startQuarantine ? 'Moved via drag/drop and started quarantine.' : 'Moved via drag/drop.',
          startQuarantine,
          quarantineReason: quarantine?.reason,
          quarantineRiskLevel: quarantine?.riskLevel,
          quarantineTargetReleaseDate: quarantine?.targetReleaseDate,
          compatibilityAcknowledged,
          compatibilityNote,
        })
        setSelectedPlantIds([])
        setPendingQuarantineMove(null)
        setStatus(`Moved ${plantIds.length} plant${plantIds.length === 1 ? '' : 's'}.`)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Move failed.')
      }
    })
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    if (id.startsWith('loc:')) {
      const location = locationById.get(id.slice(4))
      setActiveLabel(location ? `${location.code} ${location.name}` : 'Location')
    } else if (id.startsWith('plant:')) {
      const plant = plantById.get(id.slice(6))
      setActiveLabel(plant ? `${plant.plantId} ${plant.name}` : 'Plant')
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLabel('')
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ''
    if (!overId) return

    if (activeId.startsWith('plant:') && overId.startsWith('loc:') && canMovePlants) {
      const plantId = activeId.slice(6)
      const toLocationId = overId.slice(4)
      const target = locationById.get(toLocationId)
      const movedPlantIds = selectedPlantIds.includes(plantId) ? selectedPlantIds : [plantId]
      if (!target) return
      if (movedPlantIds.every((id) => plantById.get(id)?.currentLocationId === toLocationId)) return
      if (isQuarantineLocation(target)) {
        setPendingQuarantineMove({ plantIds: movedPlantIds, toLocationId, toLocationLabel: `${target.code} ${target.name}` })
        setStatus('Choose whether to start quarantine before applying this move.')
        return
      }
      movePlants(movedPlantIds, toLocationId)
      return
    }

    if (activeId.startsWith('loc:') && canManage) {
      const locationId = activeId.slice(4)
      const dragged = locationById.get(locationId)
      if (!dragged) return
      if (overId === 'top-level-drop') {
        if (dragged.parentLocationId === null) return
        const contains = dragged.directPlantCount > 0 || dragged.childLocationCount > 0
        if (contains && !window.confirm('Move this location to top level? Child locations and assigned plants will remain inside it.')) return
        startTransition(async () => {
          try {
            setStatus('Moving location...')
            await moveLocation({ collectionSlug, locationId, newParentLocationId: null, newSortOrder: 9999, confirmContained: contains })
            setStatus('Location moved.')
          } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Location move failed.')
          }
        })
        return
      }
      if (!overId.startsWith('loc:')) return
      const overLocationId = overId.slice(4)
      if (overLocationId === locationId) return
      const target = locationById.get(overLocationId)
      if (!target) return
      if (dragged.parentLocationId === target.parentLocationId) {
        const siblings = locations
          .filter((location) => (location.parentLocationId || null) === (dragged.parentLocationId || null))
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
        const oldIndex = siblings.findIndex((location) => location.id === locationId)
        const newIndex = siblings.findIndex((location) => location.id === overLocationId)
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
        const ordered = arrayMove(siblings, oldIndex, newIndex).map((location) => location.id)
        startTransition(async () => {
          try {
            setStatus('Reordering locations...')
            await reorderLocations({ collectionSlug, parentLocationId: dragged.parentLocationId, orderedLocationIds: ordered })
            setStatus('Locations reordered.')
          } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Location reorder failed.')
          }
        })
        return
      }
      const descendants = descendantLocationIds(locationId, locations)
      if (descendants.has(overLocationId)) {
        setStatus('Cannot move a location inside one of its child locations.')
        return
      }
      const contains = dragged.directPlantCount > 0 || dragged.childLocationCount > 0
      if (contains && !window.confirm(`Move ${dragged.name} under ${target.name}? Child locations and assigned plants will move with it.`)) return
      startTransition(async () => {
        try {
          setStatus('Moving location...')
          await moveLocation({ collectionSlug, locationId, newParentLocationId: target.id, newSortOrder: 9999, confirmContained: contains })
          setStatus('Location moved.')
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Location move failed.')
        }
      })
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="min-w-0 rounded-lg border border-stone-200 bg-white/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-serif text-xl font-semibold">Drag/drop location tree</h3>
              <p className="text-sm text-stone-600">
                {canManage ? 'Drag locations to reorder siblings or drop onto another location to reparent.' : 'Location tree is read-only for your role.'}
                {' '}
                {canMovePlants ? 'Drag plants onto a location to move them.' : ''}
              </p>
            </div>
            {canManage && <DropZone id="top-level-drop" label="Drop location here for top level" />}
          </div>
          <SortableContext items={rows.map((location) => `loc:${location.id}`)} strategy={verticalListSortingStrategy}>
            <div className="mt-4 grid gap-2">
              {rows.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No locations yet.</p>}
              {rows.map((location) => (
                <SortableLocationRow
                  key={location.id}
                  location={location}
                  depth={location.depth}
                  canManage={canManage}
                  canMovePlants={canMovePlants}
                  selected={selectedLocationId === location.id}
                  onSelect={setSelectedLocationId}
                />
              ))}
            </div>
          </SortableContext>
        </div>

        <div className="min-w-0 rounded-lg border border-stone-200 bg-white/45 p-3">
          {selectedLocation && (
            <div className="mb-4 rounded-lg border border-stone-200 bg-white/60 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Selected location</p>
              <h3 className="mt-1 font-serif text-xl font-semibold">{selectedLocation.name}</h3>
              <p className="text-sm text-stone-600">{locationPathWithCodes(selectedLocation.id, locations)}</p>
              <div className="mt-2 grid gap-2 text-sm">
                <div>
                  <p className="font-semibold">Direct plants</p>
                  {selectedDirectPlants.length === 0 && <p className="text-stone-600">None assigned directly.</p>}
                  {selectedDirectPlants.slice(0, 6).map((plant) => <p key={plant.id}>{plant.plantId} · {plant.name}</p>)}
                  {selectedDirectPlants.length > 6 && <p className="text-xs text-stone-500">+ {selectedDirectPlants.length - 6} more</p>}
                </div>
                <div>
                  <p className="font-semibold">Nested plants</p>
                  {selectedNestedPlants.length === 0 && <p className="text-stone-600">None in child locations.</p>}
                  {selectedNestedPlants.slice(0, 6).map((plant) => <p key={plant.id}>{plant.plantId} · {plant.name}</p>)}
                  {selectedNestedPlants.length > 6 && <p className="text-xs text-stone-500">+ {selectedNestedPlants.length - 6} more</p>}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-serif text-xl font-semibold">Plants</h3>
              <p className="text-sm text-stone-600">Select multiple plants, then drag one selected plant to move the group.</p>
            </div>
            {selectedPlantIds.length > 0 && (
              <button type="button" className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs font-semibold" onClick={() => setSelectedPlantIds([])}>
                Clear
              </button>
            )}
          </div>
          <div className="mt-3 grid max-h-[32rem] gap-2 overflow-auto pr-1">
            {plants.map((plant) => (
              <DraggablePlant
                key={plant.id}
                plant={plant}
                checked={selectedPlantIds.includes(plant.id)}
                onToggle={togglePlant}
                canMovePlants={canMovePlants}
              />
            ))}
          </div>
          {unassignedPlants.length > 0 && (
            <p className="mt-3 text-xs text-stone-600">{unassignedPlants.length} active plant{unassignedPlants.length === 1 ? '' : 's'} currently have no structured location.</p>
          )}
        </div>
        <DragOverlay>
          {activeLabel ? <div className="rounded-lg border border-[#8fa58f] bg-[#fffdf7] px-3 py-2 text-sm font-semibold shadow-lg">{activeLabel}</div> : null}
        </DragOverlay>
      </DndContext>

      {pendingQuarantineMove && (
        <div className="xl:col-span-2 rounded-lg border border-[#c9a15b] bg-[#fff8e4] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[#6f4b12]">Start quarantine workflow?</h3>
              <p className="text-sm text-[#6f4b12]">
                You are moving {pendingQuarantineMove.plantIds.length} plant{pendingQuarantineMove.plantIds.length === 1 ? '' : 's'} into {pendingQuarantineMove.toLocationLabel}.
              </p>
            </div>
            <button type="button" className="rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-sm font-semibold" onClick={() => setPendingQuarantineMove(null)}>
              Cancel move
            </button>
          </div>
          <form
            className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_10rem_12rem_auto_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              movePlants(pendingQuarantineMove.plantIds, pendingQuarantineMove.toLocationId, true, {
                reason: String(form.get('reason') || 'Quarantine after location move'),
                riskLevel: String(form.get('riskLevel') || 'UNKNOWN'),
                targetReleaseDate: String(form.get('targetReleaseDate') || ''),
              })
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              Reason
              <input name="reason" className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" defaultValue="Quarantine after location move" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Risk
              <select name="riskLevel" className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" defaultValue="UNKNOWN">
                {['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH'].map((level) => <option key={level}>{level}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Target release
              <input name="targetReleaseDate" type="date" className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" />
            </label>
            <button className="self-end rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white" disabled={isPending}>Start quarantine</button>
            <button type="button" className="self-end rounded-md border border-stone-300 bg-white/80 px-3 py-2 text-sm font-semibold" disabled={isPending} onClick={() => movePlants(pendingQuarantineMove.plantIds, pendingQuarantineMove.toLocationId)}>
              Move only
            </button>
          </form>
        </div>
      )}

      {status && (
        <p className={`xl:col-span-2 rounded-lg border px-3 py-2 text-sm ${status.includes('failed') || status.includes('Cannot') || status.includes('Confirm') ? 'border-[#c98278] bg-[#fff1ef] text-[#7d3028]' : 'border-[#c7d8bd] bg-[#f5fbf0] text-[#255537]'}`}>
          {isPending ? 'Working... ' : ''}{status}
        </p>
      )}
    </div>
  )
}
