import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { getCareQueue } from '../lib/care-queue'

// Run against a disposable migrated database. Fixtures are removed in finally.
const db = new PrismaClient()
async function main() {
  const collection = await db.collection.create({ data: { name: 'Cadence checks', slug: `cadence-check-${Date.now()}` } })
  const collectionId = collection.id
  try {
    const definition = await db.plantDefinition.create({ data: { collectionId, genus: 'Test' } })
    const instance = await db.plantInstance.create({ data: { collectionId, plantDefinitionId: definition.id, plantId: 'TEST-1', instanceType: 'ACQUIRED' } })
    const defaultData = { plantDefinitionId: definition.id, activity: 'WATERING', interval: 7, unit: 'DAY' }
    await assert.rejects(db.plantDefinitionCareCadence.create({ data: { ...defaultData, interval: 0 } }))
    await assert.rejects(db.plantDefinitionCareCadence.create({ data: { ...defaultData, unit: 'INVALID' } }))
    await db.plantDefinitionCareCadence.create({ data: defaultData })
    await assert.rejects(db.plantDefinitionCareCadence.create({ data: defaultData }))
    await assert.rejects(db.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: 'missing', activity: 'WATERING', mode: 'DISABLED' } }))
    await assert.rejects(db.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: instance.id, activity: 'WATERING', mode: 'OVERRIDE' } }))
    await assert.rejects(db.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: instance.id, activity: 'WATERING', mode: 'DISABLED', interval: 7 } }))
    const queue = () => getCareQueue(db, { collectionId, collectionSlug: collection.slug, now: new Date('2026-10-18T12:00:00Z'), timezone: 'America/New_York' })
    assert.equal((await queue()).filter(row => row.taskType === 'WATER').length, 0)
    await db.plantCareEvent.create({ data: { collectionId, plantInstanceId: instance.id, eventType: 'WATERED', performedAt: new Date('2026-10-12T12:00:00Z') } })
    assert.equal((await queue()).find(row => row.taskType === 'WATER')?.dueAt.toISOString(), '2026-10-19T04:00:00.000Z')
    const override = await db.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: instance.id, activity: 'WATERING', mode: 'DISABLED' } })
    assert.equal((await queue()).filter(row => row.taskType === 'WATER').length, 0)
    await db.plantInstanceCareCadenceOverride.delete({ where: { id: override.id } })
    assert.equal((await queue()).filter(row => row.taskType === 'WATER').length, 1)
    const fertilizerData = { ...defaultData, activity: 'FERTILIZING', interval: 2, unit: 'WEEK' }
    await assert.rejects(db.plantDefinitionCareCadence.create({ data: fertilizerData }))
    await assert.rejects(db.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: instance.id, activity: 'FERTILIZING', mode: 'OVERRIDE', interval: 2, unit: 'WEEK' } }))
    const recipe = await db.fertilizerRecipe.create({ data: { collectionId, name: 'Test recipe' } })
    const guide = await db.plantHusbandryGuide.create({ data: { collectionId, plantDefinitionId: definition.id, fertilizerRecipeId: recipe.id } })
    await db.plantDefinitionCareCadence.create({ data: fertilizerData })
    await assert.rejects(db.plantHusbandryGuide.update({ where: { id: guide.id }, data: { fertilizerRecipeId: null } }))
    await assert.rejects(db.fertilizerRecipe.update({ where: { id: recipe.id }, data: { active: false } }))
    await db.plantDefinitionCareCadence.deleteMany({ where: { plantDefinitionId: definition.id, activity: 'FERTILIZING' } })
    // Competing assignment removal and cadence creation must never both succeed.
    const results = await Promise.allSettled([
      db.plantDefinitionCareCadence.create({ data: fertilizerData }),
      db.plantHusbandryGuide.update({ where: { id: guide.id }, data: { fertilizerRecipeId: null } }),
    ])
    assert.ok(results.some(result => result.status === 'rejected'))
    const currentGuide = await db.plantHusbandryGuide.findUniqueOrThrow({ where: { id: guide.id } })
    const scheduled = await db.plantDefinitionCareCadence.count({ where: { plantDefinitionId: definition.id, activity: 'FERTILIZING' } })
    assert.ok(!scheduled || currentGuide.fertilizerRecipeId)
    await db.plantDefinitionCareCadence.deleteMany({ where: { plantDefinitionId: definition.id, activity: 'FERTILIZING' } })
    await db.plantHusbandryGuide.update({ where: { id: guide.id }, data: { fertilizerRecipeId: null } })
    await db.plantCareAdjustment.create({ data: { collectionId, plantInstanceId: instance.id, taskType: 'WATER', cadenceOverrideDays: 5 } })
    assert.equal((await db.plantInstanceCareCadenceOverride.findFirstOrThrow({ where: { plantInstanceId: instance.id, activity: 'WATERING' } })).interval, 5)
    await db.plantCareAdjustment.updateMany({ where: { plantInstanceId: instance.id, taskType: 'WATER' }, data: { nextDueAt: new Date('2026-12-01') } })
    await db.plantCareEvent.create({ data: { collectionId, plantInstanceId: instance.id, eventType: 'WATERED', performedAt: new Date('2026-10-17T12:00:00Z') } })
    assert.equal((await db.plantCareAdjustment.findFirstOrThrow({ where: { plantInstanceId: instance.id, taskType: 'WATER' } })).nextDueAt, null)
    assert.equal((await queue()).find(row => row.taskType === 'WATER')?.dueAt.toISOString(), '2026-10-22T04:00:00.000Z')
    assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: instance.id } }), 2)
    await db.plantInstance.delete({ where: { id: instance.id } })
    assert.equal(await db.plantInstanceCareCadenceOverride.count({ where: { plantInstanceId: instance.id } }), 0)
    // Parent deletion must remain possible while FK cascades remove dependent schedules.
    await db.plantHusbandryGuide.update({ where: { id: guide.id }, data: { fertilizerRecipeId: recipe.id } })
    await db.plantDefinitionCareCadence.create({ data: fertilizerData })
    const cascadeInstance = await db.plantInstance.create({ data: { collectionId, plantDefinitionId: definition.id, plantId: 'CASCADE', instanceType: 'ACQUIRED' } })
    await db.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: cascadeInstance.id, activity: 'FERTILIZING', mode: 'OVERRIDE', interval: 1, unit: 'WEEK' } })
    await db.plantDefinition.delete({ where: { id: definition.id } })
    assert.equal(await db.plantInstance.count({ where: { id: cascadeInstance.id } }), 0)
    console.log('Care cadence database constraints, recipe concurrency, queue, sync, and history checks passed.')
  } finally {
    await db.plantDefinitionCareCadence.deleteMany({ where: { plantDefinition: { collectionId } } })
    await db.plantInstanceCareCadenceOverride.deleteMany({ where: { plantInstance: { collectionId } } })
    await db.collection.delete({ where: { id: collectionId } })
  }
}
main().finally(() => db.$disconnect())
