import type { CareQueueItem } from '@/lib/care-queue'
import { locationAncestors, locationPathWithCodes, locationTreeOrder, type LocationNode } from '@/lib/locations'

export type CareQueueGroupingMode = 'parent' | 'flat' | 'hierarchy'
export type CareQueueLocationSort = 'tree' | 'alphabetical' | 'items' | 'overdue'

export type CareQueueLocationSection = {
  id: string
  locationId: string | null
  label: string
  path: string
  depth: number
  items: CareQueueItem[]
  overdue: number
  typeCounts: Array<{ type: string; count: number }>
}

function sectionLocation(item: CareQueueItem, locations: LocationNode[], mode: CareQueueGroupingMode) {
  if (!item.locationId) return null
  const path = locationAncestors(item.locationId, locations)
  if (!path.length) return null
  return mode === 'parent' ? path[0] : path[path.length - 1]
}

export function careQueueLocationSections(
  items: CareQueueItem[],
  locations: LocationNode[],
  mode: CareQueueGroupingMode,
  sort: CareQueueLocationSort,
) {
  const byLocation = new Map<string, CareQueueItem[]>()
  for (const item of items) {
    const location = sectionLocation(item, locations, mode)
    const key = location?.id || 'unassigned'
    byLocation.set(key, [...(byLocation.get(key) || []), item])
  }
  const byId = new Map(locations.map((location) => [location.id, location]))
  const treeIndex = new Map(locationTreeOrder(locations).map((location, index) => [location.id, index]))
  const sections: CareQueueLocationSection[] = Array.from(byLocation.entries()).map(([id, sectionItems]) => {
    const location = byId.get(id)
    const path = location ? locationAncestors(location.id, locations) : []
    const counts = new Map<string, number>()
    for (const item of sectionItems) counts.set(item.taskType, (counts.get(item.taskType) || 0) + 1)
    return {
      id,
      locationId: location?.id || null,
      label: location?.name || 'No location',
      path: location ? locationPathWithCodes(location.id, locations) : 'Plants awaiting a Location assignment',
      depth: mode === 'hierarchy' ? Math.max(0, path.length - 1) : 0,
      items: sectionItems,
      overdue: sectionItems.filter((item) => item.overdueDays > 0).length,
      typeCounts: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, count]) => ({ type, count })),
    }
  })
  return sections.sort((a, b) => {
    if (a.locationId === null) return 1
    if (b.locationId === null) return -1
    if (sort === 'alphabetical') return a.path.localeCompare(b.path)
    if (sort === 'items') return b.items.length - a.items.length || a.path.localeCompare(b.path)
    if (sort === 'overdue') return b.overdue - a.overdue || b.items.length - a.items.length || a.path.localeCompare(b.path)
    return (treeIndex.get(a.locationId) ?? Number.MAX_SAFE_INTEGER) - (treeIndex.get(b.locationId) ?? Number.MAX_SAFE_INTEGER)
  })
}

export function careQueueLocationFilters(items: CareQueueItem[], locations: LocationNode[], mode: CareQueueGroupingMode = 'flat') {
  const counts = new Map<string, number>()
  for (const item of items) {
    const location = sectionLocation(item, locations, mode === 'parent' ? 'parent' : 'flat')
    if (location) counts.set(location.id, (counts.get(location.id) || 0) + 1)
  }
  return locationTreeOrder(locations)
    .filter((location) => counts.has(location.id))
    .map((location) => ({ id: location.id, label: location.name, path: locationPathWithCodes(location.id, locations), count: counts.get(location.id) || 0 }))
}
