import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { careDayBounds, findSameDayCareRecords, requireBulkCareType } from '../lib/bulk-care'
import { executeCareOperation } from '../lib/care-queue-operations'
import { applyCareQueueMutation, type MutationContext } from '../lib/care-queue-mutations'
import { getCareQueue } from '../lib/care-queue'
import type { CareQueueAction } from '../lib/care-queue-optimistic'
const db = new PrismaClient()
async function main() {
  const zone = 'America/New_York'
  for (const [day, hours] of [['2026-03-08T16:00:00Z', 23], ['2026-11-01T16:00:00Z', 25]] as const) {
    const bounds = careDayBounds(new Date(day), zone)
    assert.equal((bounds.lt.getTime() - bounds.gte.getTime()) / 3600000, hours)
  }
  assert.throws(() => requireBulkCareType('WATERING; DROP TABLE'), /supported/)
  const user = await db.user.create({ data: { email: `bulk-${randomUUID()}@example.test`, passwordHash: 'unused' } })
  const collection = await db.collection.create({ data: { name: 'Bulk care tests', slug: `bulk-${randomUUID()}` } })
  try {
    await db.emailPreference.create({ data: { userId: user.id, timezone: zone } })
    const membership = await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'LOGGER', status: 'ACTIVE' } })
    const context: MutationContext = { collection, user, membership, role: 'LOGGER' }
    const type = await db.locationType.create({ data: { collectionId: collection.id, name: 'Test', abbreviation: 'TEST' } })
    const location = await db.location.create({ data: { collectionId: collection.id, locationTypeId: type.id, name: 'Room', code: 'ROOM' } })
    const child = await db.location.create({ data: { collectionId: collection.id, locationTypeId: type.id, parentLocationId: location.id, name: 'Shelf', code: 'SHELF' } })
    const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Test' } })
    await db.plantDefinitionCareCadence.create({ data: { plantDefinitionId: definition.id, activity: 'WATERING', interval: 7, unit: 'DAY' } })
    const plants = await Promise.all(['A', 'B', 'C'].map((name, i) => db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: name, instanceType: 'ACQUIRED', currentLocationId: i === 2 ? child.id : location.id } })))
    const date = '2026-10-19T23:45'
    function fields(ids = plants.map(p => p.id), extra: Record<string, string> = {}) {
      const fd = new FormData()
      for (const [key, value] of Object.entries({ collectionSlug: collection.slug, locationId: location.id, includeNested: 'on', careType: 'WATERING', performedAt: date, bulkCareBatchId: randomUUID(), ...extra })) fd.set(key, value)
      ids.forEach(id => fd.append('plantInstanceId', id)); return fd
    }
    const run = (action: CareQueueAction, fd: FormData, operationId = randomUUID()) => {
      return executeCareOperation(db, { collectionId: collection.id, userId: user.id, action, fd, identity: { operationId, issuedAt: Date.now() } }, tx => applyCareQueueMutation(tx, context, action, fd))
    }
    const care = fields([plants[0].id], { taskType: 'WATER', notes: 'Original note' })
    await run('complete', care)
    const original = await db.plantCareEvent.findFirstOrThrow({ where: { plantInstanceId: plants[0].id } })
    const detection = (ids = plants.map(p => p.id), careType: any = 'WATERING', fertilizerRecipeId?: string) => findSameDayCareRecords(db, { collectionId: collection.id, plantInstanceIds: ids, careType, referenceDate: new Date('2026-10-20T03:50:00Z'), timezone: zone, fertilizerRecipeId })
    assert.equal((await detection()).length, 1, 'Local evening belongs to the prior UTC date.')
    assert.equal((await detection(undefined, 'PEST_CHECK')).length, 0)
    await db.plantCareEvent.createMany({ data: ['2026-10-19T03:59:59Z', '2026-10-20T04:00:00Z'].map(performedAt => ({ collectionId: collection.id, plantInstanceId: plants[1].id, eventType: 'WATERED', performedAt: new Date(performedAt) })) })
    assert.equal((await detection()).length, 1, 'Yesterday and exclusive end boundary excluded.')
    await db.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: plants[1].id, eventType: 'PESTICIDE_APPLIED', performedAt: original.performedAt } })
    assert.equal((await detection(undefined, 'PEST_CHECK')).length, 0, 'Treatment is not inspection.')
    const batch = fields()
    const id = randomUUID()
    const [first, retry] = await Promise.all([run('bulk', batch, id), run('bulk', batch, id)])
    assert.equal(first.createdCount, 2); assert.deepEqual(first, retry)
    assert.equal(first.skippedAlreadyCompletedCount, 1)
    assert.deepEqual(await db.plantCareEvent.findUnique({ where: { id: original.id } }), original, 'Historical record unchanged.')
    const zero = await run('bulk', fields())
    assert.equal(zero.createdCount, 0); assert.equal(zero.skippedAlreadyCompletedCount, 3)
    const repeated = fields(undefined, { includeAlreadyCompleted: 'on' })
    const repeatId = randomUUID()
    assert.equal((await run('bulk', repeated, repeatId)).createdCount, 3)
    assert.equal((await run('bulk', repeated, repeatId)).createdCount, 3, 'Retry returns receipt rather than inserting.')
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plants[0].id, eventType: 'WATERED' } }), 2)
    const future = '2026-10-22T12:00'
    const results = await Promise.all([run('bulk', fields(undefined, { performedAt: future })), run('bulk', fields(undefined, { performedAt: future }))])
    assert.equal(results.reduce((sum, result) => sum + result.createdCount!, 0), 3, 'Concurrent different batches create once per plant.')
    const overlap = await Promise.all([
      run('bulk', fields([plants[0].id], { performedAt: '2026-10-23T12:00' })),
      run('complete', fields([plants[0].id], { taskType: 'WATER', queueCompletion: 'on', performedAt: '2026-10-23T12:00' })),
    ])
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plants[0].id, eventType: 'WATERED', performedAt: { gte: new Date('2026-10-23T04:00Z'), lt: new Date('2026-10-24T04:00Z') } } }), 1, 'Queue/bulk overlap creates one completion.')
    assert.ok(overlap.length)
    const excluded = await run('bulk', fields(undefined, { includeNested: '', performedAt: '2026-10-25T12:00', [`skip:${plants[1].id}`]: 'on' }))
    assert.equal(excluded.createdCount, 1); assert.equal(excluded.skippedOtherCount, 2)
    const recipe = await db.fertilizerRecipe.create({ data: { collectionId: collection.id, name: 'Feed A' } })
    const recipeB = await db.fertilizerRecipe.create({ data: { collectionId: collection.id, name: 'Feed B' } })
    await run('complete', fields([plants[0].id], { taskType: 'FERTILIZE', fertilizerRecipeId: recipe.id }))
    assert.equal((await detection(undefined, 'FERTILIZING', recipe.id)).length, 1)
    assert.equal((await detection(undefined, 'FERTILIZING', recipeB.id)).length, 0, 'Different fertilizer applications remain eligible.')
    assert.equal((await detection(undefined, 'OTHER')).length, 0, 'Unrelated free-form activities do not suppress each other.')
    for (const careType of ['PRUNING', 'PEST_CHECK', 'HEALTH_CHECK', 'BLOOM_CHECK', 'PROPAGATION_CHECK', 'REPOTTING']) {
      const extra = { careType, ...(careType === 'REPOTTING' ? { substrateMode: 'RECEIVED_SUBSTRATE', receivedSubstrateDescription: 'Mix' } : {}) }
      assert.equal((await run('bulk', fields([plants[0].id], extra))).createdCount, 1)
      assert.equal((await run('bulk', fields([plants[0].id], extra))).createdCount, 0)
    }
    const queue = await getCareQueue(db, { collectionId: collection.id, collectionSlug: collection.slug, userId: user.id, timezone: zone, now: new Date('2026-10-26T12:00Z') })
    assert.equal(queue.find(row => row.plantInstanceId === plants[0].id && row.taskType === 'WATER')?.dueAt.toISOString(), '2026-11-01T04:00:00.000Z', 'Cadence follows latest actual occurrence.')
    await db.plantCareEvent.delete({ where: { id: original.id } })
    assert.notEqual((await detection()).find(row => row.plantInstanceId === plants[0].id)?.performedAt, original.performedAt, 'Deleted rows no longer qualify.')
    const foreign = await db.collection.create({ data: { name: 'Other', slug: `other-${randomUUID()}` } })
    try {
      const foreignDef = await db.plantDefinition.create({ data: { collectionId: foreign.id, genus: 'Private' } })
      const foreignPlant = await db.plantInstance.create({ data: { collectionId: foreign.id, plantDefinitionId: foreignDef.id, plantId: 'PRIVATE', instanceType: 'ACQUIRED' } })
      const authorized = await run('bulk', fields([plants[0].id, foreignPlant.id], { performedAt: '2026-10-28T12:00' }))
      assert.equal(authorized.createdCount, 1); assert.equal(authorized.skippedOtherCount, 1)
      assert.equal((await detection([foreignPlant.id])).length, 0)
      await assert.rejects(run('bulk', fields(undefined, { fertilizerRecipeId: 'foreign', careType: 'FERTILIZING' })))
    } finally { await db.collection.delete({ where: { id: foreign.id } }) }
    console.log('Bulk care: timezone/DST, shared event equivalence, exclusions, override, stale preview, retries, concurrent bulk/queue, location selection, authorization, cadence and preservation checks passed.')
  } finally {
    await db.collection.delete({ where: { id: collection.id } }); await db.user.delete({ where: { id: user.id } })
  }
}
main().finally(() => db.$disconnect())
