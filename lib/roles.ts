export const globalRoles = ['USER', 'SERVER_ADMIN'] as const
export type GlobalRole = typeof globalRoles[number]

export const collectionRoles = ['VIEWER', 'LOGGER', 'GARDENER', 'MANAGER'] as const
export type CollectionRole = typeof collectionRoles[number]

export const collectionRoleRank: Record<CollectionRole, number> = {
  VIEWER: 1,
  LOGGER: 2,
  GARDENER: 3,
  MANAGER: 4,
}

export function normalizeGlobalRole(role?: string | null): GlobalRole {
  return role === 'SERVER_ADMIN' ? 'SERVER_ADMIN' : 'USER'
}

export function normalizeCollectionRole(role?: string | null): CollectionRole | null {
  if (role === 'OWNER' || role === 'MANAGER') return 'MANAGER'
  if (role === 'ADMIN' || role === 'GARDENER') return 'GARDENER'
  if (role === 'LOGGER') return 'LOGGER'
  if (role === 'VIEWER') return 'VIEWER'
  return null
}

export function collectionRoleAtLeast(role: string | null | undefined, minimum: CollectionRole) {
  const normalized = normalizeCollectionRole(role)
  return Boolean(normalized && collectionRoleRank[normalized] >= collectionRoleRank[minimum])
}

export function collectionRoleLabel(role: string | null | undefined) {
  const normalized = normalizeCollectionRole(role)
  if (!normalized) return 'Unknown'
  return normalized.toLowerCase().replace('_', ' ')
}

export function isServerAdminRole(role?: string | null) {
  return normalizeGlobalRole(role) === 'SERVER_ADMIN'
}
