import type { PrismaClient } from '@prisma/client'

export type LocationNode = {
  id: string
  parentLocationId?: string | null
  name: string
  code: string
  status: string
  sortOrder: number
  locationType: { name: string; abbreviation: string }
}

function normalizeAbbreviation(value?: string | null) {
  const text = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return text.slice(0, 8) || 'LOC'
}

export async function nextLocationCode(prisma: PrismaClient, collectionId: string, abbreviation: string) {
  const normalized = normalizeAbbreviation(abbreviation)
  const prefix = `LOC-${normalized}-`
  const existing = await prisma.location.findMany({
    where: { collectionId, code: { startsWith: prefix } },
    select: { code: true },
  })
  const max = existing.reduce((current, row) => {
    const suffix = Number(row.code.slice(prefix.length))
    return Number.isFinite(suffix) ? Math.max(current, suffix) : current
  }, 0)
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

export function locationLabel(location?: { name: string; code: string; locationType?: { name: string } | null } | null) {
  if (!location) return 'No location'
  return `${location.code} · ${location.name}${location.locationType?.name ? ` (${location.locationType.name})` : ''}`
}

export function locationPath(locationId: string | null | undefined, locations: LocationNode[]) {
  if (!locationId) return ''
  const byId = new Map(locations.map((location) => [location.id, location]))
  const path: LocationNode[] = []
  const seen = new Set<string>()
  let current = byId.get(locationId)
  while (current && !seen.has(current.id)) {
    path.unshift(current)
    seen.add(current.id)
    current = current.parentLocationId ? byId.get(current.parentLocationId) : undefined
  }
  return path.map((location) => location.name).join(' / ')
}

export function locationOptions(locations: LocationNode[], excludeId?: string) {
  return locations
    .filter((location) => location.status === 'ACTIVE' && location.id !== excludeId)
    .sort((left, right) => locationPath(left.id, locations).localeCompare(locationPath(right.id, locations)))
}

export function descendantLocationIds(locationId: string, locations: Array<{ id: string; parentLocationId?: string | null }>) {
  const childrenByParent = new Map<string, string[]>()
  for (const location of locations) {
    if (!location.parentLocationId) continue
    const children = childrenByParent.get(location.parentLocationId) || []
    children.push(location.id)
    childrenByParent.set(location.parentLocationId, children)
  }
  const result = new Set<string>()
  const stack = [...(childrenByParent.get(locationId) || [])]
  while (stack.length) {
    const id = stack.pop()!
    if (result.has(id)) continue
    result.add(id)
    stack.push(...(childrenByParent.get(id) || []))
  }
  return result
}

export async function assertLocationParentAllowed(prisma: PrismaClient, collectionId: string, locationId: string, parentLocationId?: string | null) {
  if (!parentLocationId) return
  if (locationId === parentLocationId) throw new Error('A location cannot be its own parent.')
  const locations = await prisma.location.findMany({
    where: { collectionId },
    select: { id: true, parentLocationId: true },
  })
  const descendants = descendantLocationIds(locationId, locations)
  if (descendants.has(parentLocationId)) throw new Error('That move would create a circular location hierarchy.')
}
