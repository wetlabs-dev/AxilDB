import type { EventVisibility } from './event-types'
import { collectionRoleAtLeast, isServerAdminRole } from '@/lib/roles'

export function allowedEventVisibilities(input: { siteRole?: string | null; collectionRole?: string | null; publicCollection?: boolean }) {
  if (isServerAdminRole(input.siteRole)) return ['PUBLIC', 'COLLECTION_MEMBER', 'STAFF', 'SERVER_ADMIN', 'INTERNAL'] satisfies EventVisibility[]
  const allowed: EventVisibility[] = []
  if (input.publicCollection) allowed.push('PUBLIC')
  if (input.collectionRole) allowed.push('COLLECTION_MEMBER')
  if (collectionRoleAtLeast(input.collectionRole, 'GARDENER')) allowed.push('STAFF')
  return allowed
}

export function canChooseManualVisibility(role: string | null | undefined, visibility: string): visibility is EventVisibility {
  if (!['PUBLIC', 'COLLECTION_MEMBER', 'STAFF'].includes(visibility)) return false
  return visibility !== 'STAFF' || collectionRoleAtLeast(role, 'GARDENER')
}
