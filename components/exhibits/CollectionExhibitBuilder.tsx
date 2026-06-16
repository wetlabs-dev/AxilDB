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
import { GripVertical, Plus, Search, Star, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  addPlantToCollectionExhibit,
  removePlantFromCollectionExhibit,
  reorderCollectionExhibitPlants,
  updateCollectionExhibitPlantMetadata,
} from '@/app/exhibit-actions'
import { PlantImage, type PlantImageFrame } from '@/components/PlantImage'
import { cn } from '@/lib/utils'

export type ExhibitBuilderPlant = {
  id: string
  plantId: string
  scientificName: string
  cultivarName: string | null
  acquisitionLabel: string | null
  locationPath: string | null
  status: string
  createdAt: string
  updatedAt: string
  acquisitionDate: string | null
  plantDefinitionId: string
  plantDefinitionLabel: string
  sunshineCount: number
  coverPhoto: PlantImageFrame | null
}

export type ExhibitBuilderSelection = {
  plantInstanceId: string
  sortOrder: number
  featured: boolean
  customCaption: string | null
}

type SortMode = 'plantId' | 'scientificName' | 'dateAdded' | 'location' | 'sunshine' | 'recentlyUpdated'
type GroupMode = 'none' | 'location' | 'definition'

function arrayMove<T>(items: T[], from: number, to: number) {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

function statusLabel(value: string) {
  return value.toLowerCase().replaceAll('_', ' ')
}

function searchText(plant: ExhibitBuilderPlant) {
  return [
    plant.plantId,
    plant.scientificName,
    plant.cultivarName,
    plant.acquisitionLabel,
    plant.locationPath,
    plant.status,
  ].filter(Boolean).join(' ').toLowerCase()
}

function sortPlants(plants: ExhibitBuilderPlant[], sortMode: SortMode) {
  const copy = [...plants]
  return copy.sort((left, right) => {
    if (sortMode === 'scientificName') return left.scientificName.localeCompare(right.scientificName) || left.plantId.localeCompare(right.plantId)
    if (sortMode === 'dateAdded') return (left.acquisitionDate || left.createdAt).localeCompare(right.acquisitionDate || right.createdAt) || left.plantId.localeCompare(right.plantId)
    if (sortMode === 'location') return (left.locationPath || '').localeCompare(right.locationPath || '') || left.plantId.localeCompare(right.plantId)
    if (sortMode === 'sunshine') return right.sunshineCount - left.sunshineCount || left.plantId.localeCompare(right.plantId)
    if (sortMode === 'recentlyUpdated') return right.updatedAt.localeCompare(left.updatedAt) || left.plantId.localeCompare(right.plantId)
    return left.plantId.localeCompare(right.plantId)
  })
}

function groupedPlants(plants: ExhibitBuilderPlant[], groupMode: GroupMode) {
  if (groupMode === 'none') return [{ key: 'all', label: '', plants }]
  const groups = new Map<string, ExhibitBuilderPlant[]>()
  for (const plant of plants) {
    const label = groupMode === 'location' ? plant.locationPath || 'No location set' : plant.plantDefinitionLabel || 'Unknown definition'
    groups.set(label, [...(groups.get(label) || []), plant])
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([label, groupPlants]) => ({
    key: label,
    label,
    plants: groupPlants,
  }))
}

function PlantThumb({ plant, className = '' }: { plant: ExhibitBuilderPlant; className?: string }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-md border border-stone-200 bg-[#eef3e7]', className)}>
      <PlantImage src={plant.coverPhoto} alt="" />
    </div>
  )
}

function AvailablePlantCard({ plant, onAdd }: { plant: ExhibitBuilderPlant; onAdd: (plantId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `available:${plant.id}`,
    data: { type: 'available', plantId: plant.id },
  })
  const style = { transform: CSS.Transform.toString(transform) }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('rounded-lg border border-stone-200 bg-white/70 p-2 text-sm shadow-sm transition dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-solid)]', isDragging && 'opacity-45')}
    >
      <div className="flex min-w-0 gap-2">
        <PlantThumb plant={plant} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-bold text-[#2f6b45] dark:text-[color:var(--ax-primary)]">{plant.plantId}</p>
          <p className="truncate font-semibold text-stone-900 dark:text-[color:var(--ax-heading)]">{plant.scientificName}</p>
          {plant.cultivarName && <p className="truncate text-xs text-stone-600 dark:text-[color:var(--ax-muted-strong)]">{plant.cultivarName}</p>}
          <p className="truncate text-xs text-stone-500 dark:text-[color:var(--ax-muted)]">{plant.locationPath || 'No location set'} · {statusLabel(plant.status)}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => onAdd(plant.id)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b45] text-white transition hover:bg-[#255537]"
            aria-label={`Add ${plant.plantId} to exhibit`}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md border border-stone-300 bg-white/80 text-stone-600 active:cursor-grabbing dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-muted-strong)]"
            aria-label={`Drag ${plant.plantId}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ExhibitPlantCard({
  plant,
  selection,
  onRemove,
  onFeatured,
  onCaption,
}: {
  plant: ExhibitBuilderPlant
  selection: ExhibitBuilderSelection
  onRemove: (plantId: string) => void
  onFeatured: (plantId: string, featured: boolean) => void
  onCaption: (plantId: string, caption: string) => void
}) {
  const [caption, setCaption] = useState(selection.customCaption || '')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `selected:${plant.id}`,
    data: { type: 'selected', plantId: plant.id },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('relative rounded-xl border border-[#d8deca] bg-[#fffdf7] p-3 text-sm shadow-sm transition dark:border-[color:var(--ax-border-strong)] dark:bg-[color:var(--ax-surface-solid)]', isDragging && 'opacity-45')}
    >
      <button
        type="button"
        onClick={() => onRemove(plant.id)}
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-300 bg-white/90 text-stone-600 transition hover:border-[#9a3f35] hover:text-[#9a3f35] dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-muted-strong)] dark:hover:border-[color:var(--ax-danger)] dark:hover:text-[color:var(--ax-danger-strong)]"
        aria-label={`Remove ${plant.plantId} from exhibit`}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 gap-3 pr-8">
        <PlantThumb plant={plant} className="h-24 w-24" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-bold text-[#2f6b45] dark:text-[color:var(--ax-primary)]">{plant.plantId}</p>
          <p className="font-serif text-xl font-semibold leading-tight text-stone-950 dark:text-[color:var(--ax-heading)]">{plant.scientificName}</p>
          {plant.cultivarName && <p className="text-sm text-stone-700 dark:text-[color:var(--ax-muted-strong)]">{plant.cultivarName}</p>}
          <p className="mt-1 text-xs text-stone-600 dark:text-[color:var(--ax-muted)]">{plant.locationPath || 'No location set'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onFeatured(plant.id, !selection.featured)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition',
                selection.featured
                  ? 'border-[#2f6b45]/30 bg-[#e8efdf] text-[#2f6b45] dark:border-[color:var(--ax-primary)]/40 dark:bg-[color:var(--ax-primary-soft)] dark:text-[color:var(--ax-primary-strong)]'
                  : 'border-stone-300 bg-white/70 text-stone-600 hover:border-[#8fa58f] dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-muted-strong)] dark:hover:border-[color:var(--ax-primary)]',
              )}
              aria-pressed={selection.featured}
            >
              <Star className={cn('h-3.5 w-3.5', selection.featured && 'fill-current')} />
              Featured
            </button>
            <button
              type="button"
              className="inline-flex cursor-grab items-center gap-1 rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs font-semibold text-stone-600 active:cursor-grabbing dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-muted-strong)]"
              aria-label={`Drag ${plant.plantId}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
              Drag
            </button>
          </div>
        </div>
      </div>
      <label className="mt-3 grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-[color:var(--ax-muted-strong)]">
        Caption
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          onBlur={() => onCaption(plant.id, caption)}
          className="min-h-16 rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm font-normal normal-case tracking-normal text-stone-900 outline-none transition placeholder:text-stone-500 focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-text)] dark:placeholder:text-[color:var(--ax-muted)] dark:focus:border-[color:var(--ax-primary)]"
          placeholder="Optional exhibit caption"
        />
      </label>
    </div>
  )
}

function DropPanel({ id, children, className = '' }: { id: string; children: React.ReactNode; className?: string }) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && 'ring-2 ring-[#8fa58f] ring-offset-2 ring-offset-[#fffaf0] dark:ring-[color:var(--ax-primary)] dark:ring-offset-[color:var(--ax-bg)]')}>
      {children}
    </div>
  )
}

export function CollectionExhibitBuilder({
  collectionSlug,
  exhibitId,
  plants,
  selections,
}: {
  collectionSlug: string
  exhibitId: string
  plants: ExhibitBuilderPlant[]
  selections: ExhibitBuilderSelection[]
}) {
  const router = useRouter()
  const [selectedRows, setSelectedRows] = useState(() => [...selections].sort((left, right) => left.sortOrder - right.sortOrder))
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('plantId')
  const [groupMode, setGroupMode] = useState<GroupMode>('none')
  const [activeLabel, setActiveLabel] = useState('')
  const [status, setStatus] = useState('Changes save automatically.')
  const [isPending, startTransition] = useTransition()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const plantById = useMemo(() => new Map(plants.map((plant) => [plant.id, plant])), [plants])
  const selectedIds = selectedRows.map((row) => row.plantInstanceId)
  const selectedIdSet = new Set(selectedIds)
  const selectedPlants = selectedRows.map((row) => plantById.get(row.plantInstanceId)).filter(Boolean) as ExhibitBuilderPlant[]
  const availablePlants = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = plants.filter((plant) => !selectedIdSet.has(plant.id) && (!normalized || searchText(plant).includes(normalized)))
    return sortPlants(filtered, sortMode)
  }, [plants, query, selectedRows, sortMode])
  const groups = useMemo(() => groupedPlants(availablePlants, groupMode), [availablePlants, groupMode])
  const representedDefinitions = new Set(selectedPlants.map((plant) => plant.plantDefinitionId)).size
  const featuredCount = selectedRows.filter((row) => row.featured).length
  const estimatedPages = Math.max(1, Math.ceil(selectedRows.length / 3 + representedDefinitions * 0.4))

  const refreshAfter = async (task: () => Promise<void>, success: string, rollback?: () => void) => {
    startTransition(async () => {
      try {
        setStatus('Saving...')
        await task()
        setStatus(success)
        router.refresh()
      } catch (error) {
        rollback?.()
        setStatus(error instanceof Error ? error.message : 'That exhibit update could not be saved.')
      }
    })
  }

  const addPlant = (plantId: string, beforePlantInstanceId?: string | null) => {
    if (selectedIdSet.has(plantId)) return
    const previous = selectedRows
    const next = [...selectedRows]
    const index = beforePlantInstanceId ? next.findIndex((row) => row.plantInstanceId === beforePlantInstanceId) : -1
    next.splice(index >= 0 ? index : next.length, 0, { plantInstanceId: plantId, sortOrder: index >= 0 ? index : next.length, featured: false, customCaption: null })
    setSelectedRows(next.map((row, rowIndex) => ({ ...row, sortOrder: rowIndex })))
    refreshAfter(
      () => addPlantToCollectionExhibit({ collectionSlug, exhibitId, plantInstanceId: plantId, beforePlantInstanceId }),
      'Plant added to exhibit.',
      () => setSelectedRows(previous),
    )
  }

  const removePlant = (plantId: string) => {
    const previous = selectedRows
    setSelectedRows(selectedRows.filter((row) => row.plantInstanceId !== plantId).map((row, index) => ({ ...row, sortOrder: index })))
    refreshAfter(
      () => removePlantFromCollectionExhibit({ collectionSlug, exhibitId, plantInstanceId: plantId }),
      'Plant removed from exhibit.',
      () => setSelectedRows(previous),
    )
  }

  const reorder = (orderedIds: string[]) => {
    const previous = selectedRows
    const byId = new Map(selectedRows.map((row) => [row.plantInstanceId, row]))
    const next = orderedIds.map((plantId, index) => ({ ...byId.get(plantId)!, sortOrder: index }))
    setSelectedRows(next)
    refreshAfter(
      () => reorderCollectionExhibitPlants({ collectionSlug, exhibitId, orderedPlantInstanceIds: orderedIds }),
      'Exhibit order saved.',
      () => setSelectedRows(previous),
    )
  }

  const updateFeatured = (plantId: string, featured: boolean) => {
    const previous = selectedRows
    setSelectedRows(selectedRows.map((row) => row.plantInstanceId === plantId ? { ...row, featured } : row))
    refreshAfter(
      () => updateCollectionExhibitPlantMetadata({ collectionSlug, exhibitId, plantInstanceId: plantId, featured }),
      featured ? 'Plant marked featured.' : 'Featured mark removed.',
      () => setSelectedRows(previous),
    )
  }

  const updateCaption = (plantId: string, caption: string) => {
    const current = selectedRows.find((row) => row.plantInstanceId === plantId)
    if ((current?.customCaption || '') === caption.trim()) return
    const previous = selectedRows
    setSelectedRows(selectedRows.map((row) => row.plantInstanceId === plantId ? { ...row, customCaption: caption.trim() || null } : row))
    refreshAfter(
      () => updateCollectionExhibitPlantMetadata({ collectionSlug, exhibitId, plantInstanceId: plantId, customCaption: caption }),
      'Caption saved.',
      () => setSelectedRows(previous),
    )
  }

  const handleDragStart = (event: DragStartEvent) => {
    const plantId = String(event.active.data.current?.plantId || '')
    const plant = plantById.get(plantId)
    setActiveLabel(plant ? `${plant.plantId} ${plant.scientificName}` : 'Plant')
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLabel('')
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ''
    if (!overId) return
    const activePlantId = String(event.active.data.current?.plantId || '')
    if (!activePlantId) return

    if (activeId.startsWith('available:') && (overId === 'exhibit-drop' || overId.startsWith('selected:'))) {
      addPlant(activePlantId, overId.startsWith('selected:') ? overId.slice('selected:'.length) : null)
      return
    }

    if (activeId.startsWith('selected:') && overId === 'available-drop') {
      removePlant(activePlantId)
      return
    }

    if (activeId.startsWith('selected:') && overId.startsWith('selected:')) {
      const overPlantId = overId.slice('selected:'.length)
      if (activePlantId === overPlantId) return
      const oldIndex = selectedIds.indexOf(activePlantId)
      const newIndex = selectedIds.indexOf(overPlantId)
      if (oldIndex < 0 || newIndex < 0) return
      reorder(arrayMove(selectedIds, oldIndex, newIndex))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-serif text-2xl font-bold">Exhibit builder</h3>
        <p className="text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">Search, add, and arrange specimens as a curated exhibit. Plant membership changes save automatically.</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(22rem,1.1fr)]">
          <DropPanel id="available-drop" className="min-w-0 rounded-xl border border-stone-200 bg-white/45 p-3 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-serif text-xl font-semibold">Available plants</h4>
                <p className="text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">{availablePlants.length} eligible specimen{availablePlants.length === 1 ? '' : 's'}</p>
              </div>
              <div className="text-xs text-stone-500 dark:text-[color:var(--ax-muted)]">{isPending ? 'Saving...' : status}</div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-[#fffdf7] py-2 pl-8 pr-3 text-sm outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-text)] dark:placeholder:text-[color:var(--ax-muted)]"
                  placeholder="Search plants"
                />
              </label>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-2 text-sm dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-text)]">
                <option value="plantId">Plant ID</option>
                <option value="scientificName">Scientific name</option>
                <option value="dateAdded">Date added</option>
                <option value="location">Location</option>
                <option value="sunshine">Sunshine</option>
                <option value="recentlyUpdated">Recently updated</option>
              </select>
              <select value={groupMode} onChange={(event) => setGroupMode(event.target.value as GroupMode)} className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-2 text-sm dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-field)] dark:text-[color:var(--ax-text)]">
                <option value="none">No grouping</option>
                <option value="location">By location</option>
                <option value="definition">By plant definition</option>
              </select>
            </div>
            <div className="mt-3 grid max-h-[42rem] gap-3 overflow-auto pr-1">
              {availablePlants.length === 0 && <p className="rounded-lg border border-dashed border-stone-300 bg-white/55 p-4 text-sm text-stone-600 dark:border-[color:var(--ax-border)] dark:bg-[color:var(--ax-surface-muted)] dark:text-[color:var(--ax-muted)]">No additional plants available.</p>}
              {groups.map((group) => (
                <div key={group.key} className="grid gap-2">
                  {group.label && <p className="sticky top-0 z-10 rounded-md bg-[#f5f0e2]/95 px-2 py-1 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 dark:bg-[color:var(--ax-surface-solid)] dark:text-[color:var(--ax-muted-strong)]">{group.label}</p>}
                  {group.plants.map((plant) => <AvailablePlantCard key={plant.id} plant={plant} onAdd={addPlant} />)}
                </div>
              ))}
            </div>
          </DropPanel>

          <DropPanel id="exhibit-drop" className="min-w-0 rounded-xl border border-[#cfd8c2] bg-[#f8f3e7]/70 p-3 dark:border-[color:var(--ax-border-strong)] dark:bg-[color:var(--ax-surface)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-serif text-xl font-semibold">Exhibit plants</h4>
                <p className="text-sm text-stone-600 dark:text-[color:var(--ax-muted)]">Drag cards to set the public presentation order.</p>
              </div>
              <div className="rounded-full border border-[#8fa58f]/40 bg-[#e8efdf] px-3 py-1 text-sm font-semibold text-[#2f6b45] dark:border-[color:var(--ax-primary)]/40 dark:bg-[color:var(--ax-primary-soft)] dark:text-[color:var(--ax-primary-strong)]">
                {selectedRows.length} specimens · {representedDefinitions} plant definitions · {featuredCount} featured · about {estimatedPages} page{estimatedPages === 1 ? '' : 's'}
              </div>
            </div>
            <SortableContext items={selectedIds.map((id) => `selected:${id}`)} strategy={verticalListSortingStrategy}>
              <div className="mt-3 grid max-h-[46rem] gap-3 overflow-auto pr-1">
                {selectedRows.length === 0 && <p className="rounded-lg border border-dashed border-[#8fa58f] bg-white/60 p-6 text-center text-sm text-stone-600 dark:border-[color:var(--ax-primary)] dark:bg-[color:var(--ax-surface-muted)] dark:text-[color:var(--ax-muted)]">Drag plants here to build the exhibit.</p>}
                {selectedRows.map((selection) => {
                  const plant = plantById.get(selection.plantInstanceId)
                  if (!plant) return null
                  return (
                    <ExhibitPlantCard
                      key={selection.plantInstanceId}
                      plant={plant}
                      selection={selection}
                      onRemove={removePlant}
                      onFeatured={updateFeatured}
                      onCaption={updateCaption}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DropPanel>
        </div>
        <DragOverlay>
          {activeLabel ? <div className="rounded-lg border border-[#8fa58f] bg-[#fffdf7] px-3 py-2 text-sm font-semibold shadow-lg dark:border-[color:var(--ax-primary)] dark:bg-[color:var(--ax-surface-solid)] dark:text-[color:var(--ax-heading)]">{activeLabel}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
