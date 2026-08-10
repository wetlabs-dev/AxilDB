export const DOMAIN_EVENT_TYPES = [
  'plant.created', 'plant.updated', 'plant.archived', 'plant.restored', 'plant.location_moved', 'plant.photo_added', 'plant.historical_observation_added',
  'care.watered', 'care.fertilized', 'care.repotting_completed', 'care.pest_checked', 'care.health_checked', 'care.schedule_synced', 'care.quiet_day_adjusted', 'care.bulk_batch_completed',
  'condition.opened', 'condition.updated', 'condition.resolved', 'condition.reopened', 'condition.treatment_linked', 'condition.resolved_after_treatment', 'condition.recurred',
  'bloom.started', 'bloom.peaked', 'bloom.closed', 'bloom.photo_added',
  'propagation.started', 'propagation.updated', 'propagation.succeeded', 'propagation.failed', 'propagation.child_created',
  'location.created', 'location.updated', 'location.reparented', 'location.archived', 'location.environment_updated', 'location.batch_move_completed',
  'plant.location_compatibility_warning_acknowledged',
  'quarantine.started', 'quarantine.updated', 'quarantine.released', 'quarantine.cancelled',
  'workflow.run_started', 'workflow.step_completed', 'workflow.run_completed', 'workflow.run_cancelled',
  'exhibit.created', 'exhibit.published', 'exhibit.updated', 'exhibit.unpublished',
  'definition.created', 'definition.updated', 'definition.validated', 'definition.disputed', 'definition.detached', 'definition.husbandry_updated',
  'tag.created', 'tag.updated', 'tag.archived', 'tag.restored', 'tag.merged', 'plant_definition.tag_added', 'plant_definition.tag_removed',
  'acquisition.intent_updated', 'acquisition.research_added', 'acquisition.observation_added', 'acquisition.recorded', 'acquisition.batch_created', 'acquisition.batch_completed', 'acquisition.instance_created',
  'wishlist.added', 'wishlist.status_changed', 'wishlist.fulfilled', 'wishlist.reactivated',
  'seller.created', 'seller.updated', 'seller.archived', 'seller.restored', 'seller.merged',
  'seller.storefront_created', 'seller.storefront_updated', 'seller.storefront_archived', 'seller.storefront_restored',
  'distributor.outlet_created', 'distributor.outlet_updated', 'distributor.outlet_archived', 'distributor.outlet_restored',
  'provenance.marketplace_migrated', 'provenance.reconciliation_resolved',
  'exhibit.wishlist_item_added', 'exhibit.wishlist_item_removed',
  'fertilizer.product_created', 'fertilizer.product_updated', 'fertilizer.recipe_created', 'fertilizer.recipe_updated', 'fertilizer.assigned',
  'treatment.definition_created', 'treatment.definition_updated', 'treatment.definition_archived', 'treatment.product_created', 'treatment.product_updated',
  'treatment.plan_started', 'treatment.plan_step_completed', 'treatment.applied', 'treatment.batch_applied', 'treatment.application_corrected', 'treatment.outcome_recorded', 'treatment.application_outcome_recorded', 'treatment.adverse_reaction_recorded', 'treatment.plan_completed', 'treatment.plan_cancelled',
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
  if (type.startsWith('condition.') || type.startsWith('quarantine.') || type.startsWith('workflow.') || type.startsWith('treatment.') || type.startsWith('seller.') || type.startsWith('provenance.') || type.startsWith('distributor.outlet')) return 'STAFF'
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
  if (type.startsWith('tag.')) return 'PlantTag'
  if (type.startsWith('plant_definition.')) return 'PlantDefinition'
  if (type.startsWith('acquisition.')) return 'PlantDefinition'
  if (type.startsWith('seller.storefront')) return 'SellerStorefront'
  if (type.startsWith('seller.')) return 'Seller'
  if (type.startsWith('distributor.outlet')) return 'DistributorOutlet'
  if (type.startsWith('provenance.')) return 'ProvenanceReconciliationItem'
  if (type.startsWith('fertilizer.product')) return 'FertilizerProduct'
  if (type.startsWith('fertilizer.recipe') || type === 'fertilizer.assigned') return 'FertilizerRecipe'
  if (type.startsWith('treatment.definition')) return 'TreatmentDefinition'
  if (type.startsWith('treatment.product')) return 'TreatmentProduct'
  if (type.startsWith('treatment.plan')) return 'TreatmentPlan'
  if (type.startsWith('treatment.')) return 'TreatmentApplication'
  if (type.startsWith('membership.')) return 'CollectionMembership'
  if (type.startsWith('collection.')) return 'Collection'
  return 'DomainEvent'
}

const timelineTypes = new Set<DomainEventType>(DOMAIN_EVENT_TYPES.filter((type) =>
  /^(plant|care|condition|bloom|propagation|quarantine|workflow|acquisition|treatment)\./.test(type),
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
