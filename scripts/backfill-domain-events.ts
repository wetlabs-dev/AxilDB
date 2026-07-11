import { prisma } from '../lib/prisma'
import { emitDomainEvent, type EmitDomainEventInput } from '../lib/events/emit'
import type { DomainEventType } from '../lib/events/event-types'

const dryRun = process.argv.includes('--dry-run')
const counts = new Map<string, number>()
let existing = 0
let skippedAmbiguous = 0

function count(type: string) {
  counts.set(type, (counts.get(type) || 0) + 1)
}

async function add(input: EmitDomainEventInput<DomainEventType>) {
  const duplicate = await prisma.domainEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } })
  if (duplicate) {
    existing += 1
    return
  }
  count(input.eventType)
  if (!dryRun) await prisma.$transaction((tx) => emitDomainEvent(tx, { ...input, source: 'BACKFILL', reconstructed: true }))
}

async function main() {
  const [plants, care, conditions, blooms, propagations, photos, moves, quarantines, workflows, exhibits] = await Promise.all([
    prisma.plantInstance.findMany({ select: { id: true, collectionId: true, plantId: true, acquisitionDate: true, createdAt: true, archiveDate: true, archiveReason: true } }),
    prisma.plantCareEvent.findMany({ include: { plantInstance: { select: { plantId: true } } } }),
    prisma.plantCondition.findMany({ include: { plantInstance: { select: { plantId: true } } } }),
    prisma.bloomEvent.findMany({ include: { plantInstance: { select: { plantId: true } } } }),
    prisma.propagationEvent.findMany({ include: { parents: { include: { parentPlantInstance: { select: { plantId: true } } } }, children: { include: { childPlantInstance: { select: { id: true, plantId: true } } } } } }),
    prisma.photo.findMany({ where: { entityType: { in: ['PLANT_INSTANCE', 'BLOOM_EVENT'] } }, select: { id: true, collectionId: true, entityType: true, entityId: true, caption: true, createdAt: true } }),
    prisma.plantLocationMove.findMany({ include: { plantInstance: { select: { plantId: true } }, fromLocation: true, toLocation: true } }),
    prisma.plantQuarantine.findMany({ include: { plantInstance: { select: { plantId: true } }, quarantineLocation: true } }),
    prisma.workflowRun.findMany({ include: { plants: { select: { plantInstanceId: true } } } }),
    prisma.collectionExhibit.findMany(),
  ])
  const plantById = new Map(plants.map((plant) => [plant.id, plant]))
  const bloomById = new Map(blooms.map((bloom) => [bloom.id, bloom]))

  for (const plant of plants) {
    const occurredAt = plant.acquisitionDate || plant.createdAt
    await add({ eventType: 'plant.created', collectionId: plant.collectionId, aggregateId: plant.id, occurredAt, payload: { subjectId: plant.id, plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, summary: 'Plant entered the collection.' }, idempotencyKey: `backfill:plant:${plant.id}:created` })
    if (plant.archiveDate) await add({ eventType: 'plant.archived', collectionId: plant.collectionId, aggregateId: plant.id, occurredAt: plant.archiveDate, payload: { subjectId: plant.id, plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, summary: plant.archiveReason || 'Plant archived.' }, idempotencyKey: `backfill:plant:${plant.id}:archived` })
  }
  for (const record of care) {
    const mapping: Record<string, DomainEventType> = { WATERED: 'care.watered', FERTILIZED: 'care.fertilized', REPOTTED: 'care.repotting_completed', PEST_CHECK: 'care.pest_checked', HEALTH_CHECK: 'care.health_checked' }
    const eventType = mapping[record.eventType]
    if (!eventType) { skippedAmbiguous += 1; continue }
    await add({ eventType, collectionId: record.collectionId, aggregateId: record.id, occurredAt: record.performedAt, actor: record.userId ? { id: record.userId } : null, payload: { subjectId: record.id, recordId: record.id, recordType: 'PlantCareEvent', plantInstanceId: record.plantInstanceId, plantId: record.plantInstance.plantId, displayName: record.plantInstance.plantId, summary: record.notes || undefined }, idempotencyKey: `backfill:care:${record.id}:created` })
  }
  for (const record of conditions) {
    const common = { collectionId: record.collectionId, aggregateId: record.id, actor: record.userId ? { id: record.userId } : null, payload: { subjectId: record.id, recordId: record.id, recordType: 'PlantCondition', plantInstanceId: record.plantInstanceId, plantId: record.plantInstance.plantId, displayName: record.plantInstance.plantId, category: record.category, severity: record.severity } }
    await add({ eventType: 'condition.opened', ...common, occurredAt: record.observedAt, idempotencyKey: `backfill:condition:${record.id}:opened` })
    if (record.resolvedAt) await add({ eventType: 'condition.resolved', ...common, occurredAt: record.resolvedAt, idempotencyKey: `backfill:condition:${record.id}:resolved` })
  }
  for (const record of blooms) {
    const common = { collectionId: record.collectionId, aggregateId: record.id, payload: { subjectId: record.id, recordId: record.id, recordType: 'BloomEvent', plantInstanceId: record.plantInstanceId, plantId: record.plantInstance.plantId, displayName: record.plantInstance.plantId, flowerCount: record.flowerCount, firstBloom: record.firstBloom } }
    await add({ eventType: 'bloom.started', ...common, occurredAt: record.bloomStartDate, idempotencyKey: `backfill:bloom:${record.id}:started` })
    if (record.peakBloomDate) await add({ eventType: 'bloom.peaked', ...common, occurredAt: record.peakBloomDate, idempotencyKey: `backfill:bloom:${record.id}:peaked` })
    if (record.bloomEndDate) await add({ eventType: 'bloom.closed', ...common, occurredAt: record.bloomEndDate, idempotencyKey: `backfill:bloom:${record.id}:closed` })
  }
  for (const record of propagations) {
    const parent = record.parents[0]?.parentPlantInstance
    await add({ eventType: 'propagation.started', collectionId: record.collectionId, aggregateId: record.id, occurredAt: record.date, payload: { subjectId: record.id, recordId: record.id, recordType: 'PropagationEvent', plantId: parent?.plantId, displayName: parent?.plantId || record.method, method: record.method, status: record.successStatus }, idempotencyKey: `backfill:propagation:${record.id}:started` })
    if (record.successStatus === 'SUCCESS' || record.successStatus === 'SUCCEEDED') await add({ eventType: 'propagation.succeeded', collectionId: record.collectionId, aggregateId: record.id, occurredAt: record.updatedAt, payload: { subjectId: record.id, displayName: parent?.plantId || record.method, method: record.method }, idempotencyKey: `backfill:propagation:${record.id}:succeeded` })
    if (record.successStatus === 'FAILED') await add({ eventType: 'propagation.failed', collectionId: record.collectionId, aggregateId: record.id, occurredAt: record.updatedAt, payload: { subjectId: record.id, displayName: parent?.plantId || record.method, method: record.method }, idempotencyKey: `backfill:propagation:${record.id}:failed` })
    for (const child of record.children) await add({ eventType: 'propagation.child_created', collectionId: record.collectionId, aggregateId: record.id, occurredAt: record.createdAt, payload: { subjectId: child.childPlantInstanceId, recordId: record.id, plantInstanceId: child.childPlantInstanceId, plantId: child.childPlantInstance.plantId, displayName: child.childPlantInstance.plantId }, idempotencyKey: `backfill:propagation:${record.id}:child:${child.childPlantInstanceId}` })
  }
  for (const photo of photos) {
    const plant = photo.entityType === 'PLANT_INSTANCE' ? plantById.get(photo.entityId) : plantById.get(bloomById.get(photo.entityId)?.plantInstanceId || '')
    if (!plant) { skippedAmbiguous += 1; continue }
    await add({ eventType: photo.entityType === 'BLOOM_EVENT' ? 'bloom.photo_added' : 'plant.photo_added', collectionId: photo.collectionId, aggregateId: photo.entityId, occurredAt: photo.createdAt, payload: { subjectId: photo.id, recordId: photo.id, recordType: 'Photo', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, summary: photo.caption || undefined }, idempotencyKey: `backfill:photo:${photo.id}:added` })
  }
  for (const move of moves) await add({ eventType: 'plant.location_moved', collectionId: move.collectionId, aggregateId: move.plantInstanceId, occurredAt: move.movedAt, actor: move.movedByUserId ? { id: move.movedByUserId } : null, payload: { subjectId: move.id, recordId: move.id, recordType: 'PlantLocationMove', plantInstanceId: move.plantInstanceId, plantId: move.plantInstance.plantId, displayName: move.plantInstance.plantId, fromLocation: move.fromLocation ? { id: move.fromLocation.id, name: move.fromLocation.name, code: move.fromLocation.code } : null, toLocation: move.toLocation ? { id: move.toLocation.id, name: move.toLocation.name, code: move.toLocation.code } : null, summary: move.notes || undefined }, idempotencyKey: `backfill:location-move:${move.id}` })
  for (const record of quarantines) {
    const common = { collectionId: record.collectionId, aggregateId: record.id, payload: { subjectId: record.id, recordType: 'PlantQuarantine', plantInstanceId: record.plantInstanceId, plantId: record.plantInstance.plantId, displayName: record.plantInstance.plantId, riskLevel: record.riskLevel, location: record.quarantineLocation ? { id: record.quarantineLocation.id, name: record.quarantineLocation.name } : null } }
    await add({ eventType: 'quarantine.started', ...common, occurredAt: record.startDate, actor: record.createdByUserId ? { id: record.createdByUserId } : null, idempotencyKey: `backfill:quarantine:${record.id}:started` })
    if (record.releasedAt) await add({ eventType: 'quarantine.released', ...common, occurredAt: record.releasedAt, actor: record.releasedByUserId ? { id: record.releasedByUserId } : null, idempotencyKey: `backfill:quarantine:${record.id}:released` })
    if (record.cancelledAt) await add({ eventType: 'quarantine.cancelled', ...common, occurredAt: record.cancelledAt, actor: record.cancelledByUserId ? { id: record.cancelledByUserId } : null, idempotencyKey: `backfill:quarantine:${record.id}:cancelled` })
  }
  for (const run of workflows) {
    const plantInstanceId = run.plants[0]?.plantInstanceId
    await add({ eventType: 'workflow.run_started', collectionId: run.collectionId, aggregateId: run.id, occurredAt: run.startedAt, actor: run.startedByUserId ? { id: run.startedByUserId } : null, payload: { subjectId: run.id, recordId: run.id, recordType: 'WorkflowRun', plantInstanceId, displayName: run.title, title: 'Workflow started', summary: run.title }, idempotencyKey: `backfill:workflow:${run.id}:started` })
    if (run.completedAt) await add({ eventType: 'workflow.run_completed', collectionId: run.collectionId, aggregateId: run.id, occurredAt: run.completedAt, payload: { subjectId: run.id, recordId: run.id, plantInstanceId, displayName: run.title, summary: run.summary || undefined }, idempotencyKey: `backfill:workflow:${run.id}:completed` })
    if (run.cancelledAt) await add({ eventType: 'workflow.run_cancelled', collectionId: run.collectionId, aggregateId: run.id, occurredAt: run.cancelledAt, payload: { subjectId: run.id, recordId: run.id, plantInstanceId, displayName: run.title, summary: run.summary || undefined }, idempotencyKey: `backfill:workflow:${run.id}:cancelled` })
  }
  for (const exhibit of exhibits) {
    await add({ eventType: 'exhibit.created', collectionId: exhibit.collectionId, aggregateId: exhibit.id, occurredAt: exhibit.createdAt, actor: exhibit.createdByUserId ? { id: exhibit.createdByUserId } : null, payload: { subjectId: exhibit.id, recordId: exhibit.id, displayName: exhibit.title, summary: exhibit.description || undefined }, idempotencyKey: `backfill:exhibit:${exhibit.id}:created` })
    if (exhibit.publishedAt) await add({ eventType: 'exhibit.published', collectionId: exhibit.collectionId, aggregateId: exhibit.id, occurredAt: exhibit.publishedAt, actor: exhibit.publishedByUserId ? { id: exhibit.publishedByUserId } : null, payload: { subjectId: exhibit.id, recordId: exhibit.id, displayName: exhibit.title, summary: exhibit.description || undefined }, idempotencyKey: `backfill:exhibit:${exhibit.id}:published` })
  }

  console.log(`${dryRun ? 'Dry run' : 'Backfill'} complete.`)
  for (const [type, amount] of [...counts].sort()) console.log(`${type}: ${amount}`)
  console.log(`Already present: ${existing}`)
  console.log(`Skipped ambiguous/unsupported records: ${skippedAmbiguous}`)
}

main().finally(() => prisma.$disconnect())
