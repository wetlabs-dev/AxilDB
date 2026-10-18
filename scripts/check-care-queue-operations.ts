import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { executeCareOperation } from '../lib/care-queue-operations'
import { applyCareQueueMutation, type MutationContext } from '../lib/care-queue-mutations'
import type { CareQueueAction } from '../lib/care-queue-optimistic'
const db = new PrismaClient()
async function main() {
  const user = await db.user.create({ data: { email: `queue-operations-${Date.now()}@example.test`, passwordHash: 'unused-test' } })
  const collection = await db.collection.create({ data: { name: 'Queue operation tests', slug: `queue-operations-${Date.now()}` } })
  try {
    const membership = await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'LOGGER', status: 'ACTIVE' } })
    const context: MutationContext = { collection, user, membership, role: 'LOGGER' }
    const locationType = await db.locationType.create({ data: { collectionId: collection.id, name: 'Test area', abbreviation: 'TEST' } })
    const location = await db.location.create({ data: { collectionId: collection.id, locationTypeId: locationType.id, name: 'Test shelf', code: 'TEST-1' } })
    const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Test' } })
    const plant = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'OP-1', instanceType: 'ACQUIRED', currentLocationId: location.id } })
    const fields = (values: Record<string, string>) => { const fd = new FormData(); fd.set('collectionSlug', collection.slug); fd.set('plantInstanceId', plant.id); for (const [key, value] of Object.entries(values)) fd.set(key, value); return fd }
    const run = (action: CareQueueAction, fd: FormData, identity = { operationId: randomUUID(), issuedAt: Date.now() }) => executeCareOperation(db, { collectionId: collection.id, userId: user.id, action, fd, identity }, tx => applyCareQueueMutation(tx, context, action, fd))
    const identity = { operationId: randomUUID(), issuedAt: Date.now() }
    const complete = fields({ taskType: 'WATER', notes: 'Preserved note' })
    await Promise.all([run('complete', complete, identity), run('complete', complete, identity), run('complete', complete, identity)])
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }), 1)
    assert.equal((await db.plantCareEvent.findFirstOrThrow({ where: { plantInstanceId: plant.id } })).notes, 'Preserved note')
    await assert.rejects(run('complete', fields({ taskType: 'WATER', notes: 'Changed payload' }), identity), /different care details/)
    await assert.rejects(run('complete', complete, { operationId: randomUUID(), issuedAt: Date.now() - 8 * 86400000 }), /expired/)
    await run('snooze', fields({ taskType: 'WATER', days: '3' }))
    assert.ok((await db.plantCareAdjustment.findFirstOrThrow({ where: { plantInstanceId: plant.id, taskType: 'WATER' } })).snoozedUntil! > new Date())
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }), 1, 'Snooze does not complete care.')
    const recipe = await db.fertilizerRecipe.create({ data: { collectionId: collection.id, name: 'Test feed' } })
    await run('complete', fields({ taskType: 'FERTILIZE', fertilizerRecipeId: recipe.id, fertilizerDose: '2ml', fertilizerWaterVolume: '1L', fertilizerStrength: 'Half' }))
    const feeding = await db.plantCareEvent.findFirstOrThrow({ where: { plantInstanceId: plant.id, eventType: 'FERTILIZED' } })
    assert.equal(feeding.fertilizerRecipeId, recipe.id)
    assert.equal((feeding.metadata as any).fertilizerDose, '2ml')
    await run('complete', fields({ taskType: 'REPOT', substrateMode: 'RECEIVED_SUBSTRATE', receivedSubstrateDescription: 'Test mix' }))
    assert.equal(await db.plantSubstrateHistory.count({ where: { plantInstanceId: plant.id } }), 1)
    const condition = await db.plantCondition.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, category: 'PESTS', severity: 'HIGH', status: 'OPEN' } })
    await run('update', fields({ taskType: 'PEST_CHECK', conditionId: condition.id, severity: 'LOW', status: 'IMPROVING', followUpAt: '2027-01-01', updateNote: 'Recovering' }))
    assert.equal((await db.plantCondition.findUniqueOrThrow({ where: { id: condition.id } })).status, 'IMPROVING')
    await run('attention', fields({ taskType: 'PEST_CHECK', conditionId: condition.id, attentionNote: 'Monitor' }))
    const resolution = { operationId: randomUUID(), issuedAt: Date.now() }
    const resolve = fields({ taskType: 'PEST_CHECK', conditionId: condition.id, resolutionNote: 'Clear' })
    const before = await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } })
    await Promise.all([run('resolve', resolve, resolution), run('resolve', resolve, resolution)])
    assert.equal((await db.plantCondition.findUniqueOrThrow({ where: { id: condition.id } })).status, 'RESOLVED')
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }), before + 1)
    const propagation = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'PROP-1', instanceType: 'PROPAGATION', propagationDate: new Date(Date.now() - 20 * 86400000) } })
    await run('establish', fields({ plantInstanceId: propagation.id }))
    assert.ok((await db.plantInstance.findUniqueOrThrow({ where: { id: propagation.id } })).propagationEstablishedAt)
    const bulk = fields({ taskType: 'WATER', locationId: location.id, careType: 'WATERING', bulkCareBatchId: randomUUID(), sharedNote: 'Bulk note' })
    const batchBefore = await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } })
    const batchResults = await Promise.all([run('bulk', bulk), run('bulk', bulk)])
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }), batchBefore + 1, 'Batch identity protects simultaneous operations too.')
    assert.ok(batchResults.some(result => result.duplicate))
    const rollbackId = { operationId: randomUUID(), issuedAt: Date.now() }
    await assert.rejects(executeCareOperation(db, { collectionId: collection.id, userId: user.id, action: 'complete', fd: complete, identity: rollbackId }, async tx => {
      await tx.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, eventType: 'WATERED' } })
      throw new Error('Controlled transaction failure')
    }))
    assert.equal(await db.careQueueOperation.count({ where: { operationId: rollbackId.operationId } }), 0)
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }), batchBefore + 1)
    console.log('Actual queue mutations, concurrent idempotency, payload conflict, expiry, bulk, metadata, condition, substrate, snooze, and transaction rollback checks passed.')
  } finally {
    await db.collection.delete({ where: { id: collection.id } })
    await db.user.delete({ where: { id: user.id } })
  }
}
main().finally(() => db.$disconnect())
