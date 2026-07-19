export const DOMAIN_EVENT_TYPES = [
  'plant.created', 'plant.updated', 'plant.archived', 'plant.restored', 'plant.location_moved', 'plant.photo_added', 'plant.historical_observation_added',
  'care.watered', 'care.fertilized', 'care.repotting_completed', 'care.pest_checked', 'care.health_checked', 'care.schedule_synced', 'care.quiet_day_adjusted', 'care.bulk_batch_completed',
  'condition.opened', 'condition.updated', 'condition.resolved', 'condition.reopened',
  'bloom.started', 'bloom.peaked', 'bloom.closed', 'bloom.photo_added',
  'propagation.started', 'propagation.updated', 'propagation.succeeded', 'propagation.failed', 'propagation.child_created',
  'location.created', 'location.updated', 'location.reparented', 'location.archived', 'location.environment_updated', 'location.batch_move_completed',
  'plant.location_compatibility_warning_acknowledged',
  'quarantine.started', 'quarantine.updated', 'quarantine.released', 'quarantine.cancelled',
  'workflow.run_started', 'workflow.step_completed', 'workflow.run_completed', 'workflow.run_cancelled',
  'exhibit.created', 'exhibit.published', 'exhibit.updated', 'exhibit.unpublished',
  'definition.created', 'definition.updated', 'definition.validated', 'definition.disputed', 'definition.detached', 'definition.husbandry_updated',
  'acquisition.intent_updated', 'acquisition.research_added', 'acquisition.observation_added', 'acquisition.recorded', 'acquisition.batch_created', 'acquisition.batch_completed', 'acquisition.instance_created',
  'wishlist.added', 'wishlist.status_changed', 'wishlist.fulfilled', 'wishlist.reactivated',
  'exhibit.wishlist_item_added', 'exhibit.wishlist_item_removed',
  'fertilizer.product_created', 'fertilizer.product_updated', 'fertilizer.recipe_created', 'fertilizer.recipe_updated', 'fertilizer.assigned',
  'collection.created', 'collection.updated', 'collection.archived',
  'membership.requested', 'membership.approved', 'membership.role_changed', 'membership.removed',
  'event.corrected', 'event.redacted',
] as const

export type DomainEventType = typeof DOMAIN_EVENT_TYPES[number]
export type EventVisibility = 'PUBLIC' | 'COLLECTION_MEMBER' | 'STAFF' | 'SERVER_ADMIN' | 'INTERNAL'
export type EventSource = 'APPLICATION' | 'WORKER' | 'BACKFILL' | 'MANUAL' | 'IMPORT' | 'SYSTEM'
export type EventPayload = {
  subjectId: string
  displayName?: string
  title?: string
  summary?: string
  plantInstanceId?: string
  plantId?: string
  recordType?: string
  recordId?: string
  [key: string]: unknown
}

export type EventDefinition = {
  version: 1
  aggregateType: string
  defaultVisibility: EventVisibility
  timeline: boolean
  dashboard: boolean
  requiredPayloadKeys?: string[]
}

const visibilityFor = (type: DomainEventType): EventVisibility => {
  if (['bloom.started', 'bloom.peaked', 'exhibit.published'].includes(type)) return 'PUBLIC'
  if (type.startsWith('condition.') || type.startsWith('quarantine.') || type.startsWith('workflow.')) return 'STAFF'
  if (type.startsWith('collection.') || type.startsWith('membership.') || type === 'event.redacted') return 'SERVER_ADMIN'
  if (type === 'event.corrected') return 'STAFF'
  return 'COLLECTION_MEMBER'
}

const aggregateFor = (type: DomainEventType) => {
  if (type.startsWith('plant.')) return 'PlantInstance'
  if (type.startsWith('care.')) return 'PlantCareEvent'
  if (type.startsWith('condition.')) return 'PlantCondition'
  if (type.startsWith('bloom.')) return 'BloomEvent'
  if (type.startsWith('propagation.')) return 'PropagationEvent'
  if (type.startsWith('location.')) return 'Location'
  if (type.startsWith('quarantine.')) return 'PlantQuarantine'
  if (type.startsWith('workflow.')) return 'WorkflowRun'
  if (type.startsWith('exhibit.')) return 'CollectionExhibit'
  if (type.startsWith('definition.')) return 'PlantDefinition'
  if (type.startsWith('acquisition.')) return 'PlantDefinition'
  if (type.startsWith('fertilizer.product')) return 'FertilizerProduct'
  if (type.startsWith('fertilizer.recipe') || type === 'fertilizer.assigned') return 'FertilizerRecipe'
  if (type.startsWith('membership.')) return 'CollectionMembership'
  if (type.startsWith('collection.')) return 'Collection'
  return 'DomainEvent'
}

const timelineTypes = new Set<DomainEventType>(DOMAIN_EVENT_TYPES.filter((type) =>
  /^(plant|care|condition|bloom|propagation|quarantine|workflow|acquisition)\./.test(type),
))
const dashboardTypes = new Set<DomainEventType>([
  'plant.created', 'plant.archived', 'plant.restored', 'plant.location_moved',
  'condition.resolved', 'bloom.started', 'bloom.peaked', 'propagation.started',
  'propagation.succeeded', 'workflow.run_completed', 'exhibit.published',
])

export const EVENT_REGISTRY = Object.fromEntries(DOMAIN_EVENT_TYPES.map((type) => [type, {
  version: 1,
  aggregateType: aggregateFor(type),
  defaultVisibility: visibilityFor(type),
  timeline: timelineTypes.has(type),
  dashboard: dashboardTypes.has(type),
  requiredPayloadKeys: type.startsWith('event.') ? ['targetEventId'] : [],
}])) as Record<DomainEventType, EventDefinition>

export function isDomainEventType(value: string): value is DomainEventType {
  return Object.prototype.hasOwnProperty.call(EVENT_REGISTRY, value)
}

export function eventTitle(type: DomainEventType) {
  return type.split('.').map((part) => part.replaceAll('_', ' ')).join(' · ').replace(/\b\w/g, (char) => char.toUpperCase())
}
