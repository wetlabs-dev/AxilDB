import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { getCareQueue } from '../lib/care-queue'
import { loadCareForecast, previewQuietChange } from '../lib/care-forecast-service'
import { addCalendarDays, dateInputValue, startOfDayInTimeZone } from '../lib/time'
import { executeCareOperation } from '../lib/care-queue-operations'
import { applyCareQueueMutation, type MutationContext } from '../lib/care-queue-mutations'
const db = new PrismaClient()
const timezone = 'America/New_York'
async function main() {
  const user = await db.user.create({ data: { email: `calendar-${randomUUID()}@example.test`, passwordHash: 'fixture' } })
  const collection = await db.collection.create({ data: { name: 'Calendar checks', slug: `calendar-${randomUUID()}` } })
  try {
    const membership = await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } })
    await db.emailPreference.create({ data: { userId: user.id, timezone } })
    const context: MutationContext = { user, collection, membership, role: 'MANAGER' }
    const now = startOfDayInTimeZone(new Date(), timezone)
    const tomorrow = addCalendarDays(now, 1, timezone)
    const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Fern' } })
    await db.plantDefinitionCareCadence.create({ data: { plantDefinitionId: definition.id, activity: 'WATERING', interval: 3, unit: 'DAY' } })
    const plant = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'FERN', instanceType: 'ACQUIRED' } })
    const original = await db.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, eventType: 'WATERED', performedAt: new Date(addCalendarDays(now, -2, timezone).getTime() + 15 * 3600000) } })
    const scope = { collectionId: collection.id, collectionSlug: collection.slug, userId: user.id, timezone, now }
    const base = await getCareQueue(db, scope)
    assert.equal(base[0].dueAt.getTime(), tomorrow.getTime())
    assert.equal((await getCareQueue(db, { ...scope, now: new Date(tomorrow.getTime() + 1000) }))[0].dueAt.getTime(), tomorrow.getTime(), 'All care is due at local midnight, not prior completion time.')
    const draft = { kind: 'set', date: dateInputValue(tomorrow, timezone) } as const
    const preview = await previewQuietChange(db, scope, draft)
    assert.equal(preview.wateringToday, 1); assert.equal(preview.tomorrow, true)
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(tomorrow))
    assert.equal((await previewQuietChange(db, scope, { kind: 'create', name: 'Weekly tomorrow', quietType: 'WEEKLY_RECURRING', dayOfWeek: weekday })).tomorrow, true)
    assert.equal((await previewQuietChange(db, scope, { kind: 'create', name: 'Range tomorrow', quietType: 'DATE_RANGE', startDate: dateInputValue(tomorrow, timezone), endDate: dateInputValue(addCalendarDays(tomorrow, 1, timezone), timezone) })).tomorrow, true)
    assert.equal(await db.collectionQuietDay.count({ where: { collectionId: collection.id } }), 0, 'Preview never changes settings.')
    const quiet = await db.collectionQuietDay.create({ data: { collectionId: collection.id, name: 'Rest', quietType: 'ONE_TIME', date: tomorrow, timezone } })
    const concurrent = await Promise.all(Array.from({ length: 4 }, () => getCareQueue(db, scope)))
    assert.ok(concurrent.every(items => items[0].dueAt.getTime() === now.getTime()))
    assert.equal(await db.careQuietDayAdjustment.count({ where: { collectionId: collection.id, taskKey: `WATER:${plant.id}` } }), 1)
    assert.equal((await getCareQueue(db, { ...scope, now: new Date(now.getTime() + 18 * 3600000) }))[0].dueAt.getTime(), now.getTime(), 'No intraday threshold drift.')
    const forecast = await loadCareForecast(db, scope)
    assert.equal(forecast.days[0].categories.WATER, 1)
    const restarted = new PrismaClient()
    try { assert.equal((await getCareQueue(restarted, { ...scope, now: tomorrow }))[0].dueAt.getTime(), now.getTime(), 'New database client preserves incomplete advanced work.') } finally { await restarted.$disconnect() }
    await db.collectionQuietDay.delete({ where: { id: quiet.id } })
    assert.equal((await getCareQueue(db, { ...scope, now: tomorrow }))[0].dueAt.getTime(), now.getTime())
    const fd = new FormData(); fd.set('plantInstanceId', plant.id); fd.set('taskType', 'WATER'); fd.set('queueCompletion', 'on')
    await executeCareOperation(db, { collectionId: collection.id, userId: user.id, action: 'complete', fd }, tx => applyCareQueueMutation(tx, context, 'complete', fd))
    assert.ok((await getCareQueue(db, scope))[0].dueAt > now, 'Early completion satisfies shifted task and advances from actual care.')
    assert.deepEqual(await db.plantCareEvent.findUnique({ where: { id: original.id } }), original)
    await db.plantCareAdjustment.upsert({ where: { collectionId_plantInstanceId_taskType: { collectionId: collection.id, plantInstanceId: plant.id, taskType: 'WATER' } }, create: { collectionId: collection.id, plantInstanceId: plant.id, taskType: 'WATER', nextDueAt: tomorrow, snoozedUntil: new Date(tomorrow.getTime() + 16 * 3600000) }, update: { nextDueAt: tomorrow, snoozedUntil: new Date(tomorrow.getTime() + 16 * 3600000) } })
    const snoozed = await getCareQueue(db, { ...scope, now: tomorrow })
    assert.equal(snoozed[0].dueAt.getTime(), tomorrow.getTime()); assert.equal(snoozed[0].manualSchedule, true)
    const locationType = await db.locationType.create({ data: { collectionId: collection.id, name: 'Room', abbreviation: 'RM' } })
    const office = await db.location.create({ data: { collectionId: collection.id, locationTypeId: locationType.id, name: 'Office', code: 'OFFICE' } })
    const home = await db.location.create({ data: { collectionId: collection.id, locationTypeId: locationType.id, name: 'Home', code: 'HOME' } })
    const moving = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'MOVING', instanceType: 'ACQUIRED', currentLocationId: home.id } })
    const care = await db.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: moving.id, eventType: 'WATERED', performedAt: now } })
    const due = addCalendarDays(now, 3, timezone)
    const localRule = await db.collectionQuietDay.create({ data: { collectionId: collection.id, locationId: office.id, quietType: 'ONE_TIME', name: 'Office closed', date: due, timezone } })
    const movingTask = async () => (await getCareQueue(db, scope)).find(item => item.plantInstanceId === moving.id)!
    assert.equal((await movingTask()).dueAt.getTime(), due.getTime(), 'Home plants remain eligible.')
    await db.plantInstance.update({ where: { id: moving.id }, data: { currentLocationId: office.id } })
    assert.equal((await movingTask()).dueAt.getTime(), addCalendarDays(due, -1, timezone).getTime(), 'Location change reconciles future scheduling.')
    const closurePreview = await previewQuietChange(db, scope, { kind: 'create', locationId: office.id, name: 'Extended closure', quietType: 'DATE_RANGE', startDate: dateInputValue(addCalendarDays(now, 20, timezone), timezone), endDate: dateInputValue(addCalendarDays(now, 35, timezone), timezone) })
    assert.equal(closurePreview.careRisks.length, 1, 'Closures beyond the seven-day forecast still warn only for affected location plants.')
    assert.equal(closurePreview.careRisks[0].key, `WATER:${moving.id}`)
    const count = await db.careQuietDayAdjustment.count({ where: { collectionId: collection.id, plantInstanceId: moving.id } })
    await movingTask(); await movingTask()
    assert.equal(await db.careQuietDayAdjustment.count({ where: { collectionId: collection.id, plantInstanceId: moving.id } }), count)
    await db.plantInstance.update({ where: { id: moving.id }, data: { currentLocationId: home.id } })
    assert.equal((await movingTask()).dueAt.getTime(), due.getTime(), 'Moving out restores future natural dates.')
    assert.deepEqual(await db.plantCareEvent.findUnique({ where: { id: care.id } }), care)
    const localPreview = await previewQuietChange(db, scope, { kind: 'weekly', locationId: office.id, weekdays: [0,6] })
    assert.ok(localPreview.changes.every(change => change.locationId === office.id))
    await assert.rejects(previewQuietChange(db, scope, { kind: 'weekly', locationId: 'foreign-location', weekdays: [0] }))
    await db.location.delete({ where: { id: office.id } })
    assert.equal(await db.collectionQuietDay.findUnique({ where: { id: localRule.id } }), null, 'Deleting a location safely cascades its local rules.')
    await db.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: plant.id, activity: 'WATERING', mode: 'DISABLED' } })
    assert.equal((await getCareQueue(db, scope)).filter(item => item.plantInstanceId === plant.id).length, 0)
    console.log('Calendar DB: midnight availability, concurrent durable shifts, restart/overdue retention, preview-only planning, tomorrow warning, forecast consistency, completion, preserved history, snoozes and instance overrides passed.')
  } finally { await db.collection.delete({ where: { id: collection.id } }); await db.user.delete({ where: { id: user.id } }) }
}
main().finally(() => db.$disconnect())
