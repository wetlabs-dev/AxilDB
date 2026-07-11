import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { emitDomainEvent } from '../lib/events/emit'
import { DOMAIN_EVENT_TYPES, EVENT_REGISTRY } from '../lib/events/event-types'
import { validateEventPayload } from '../lib/events/schemas'
import { allowedEventVisibilities } from '../lib/events/visibility'
import { retryDelayMs } from '../lib/events/process'

assert.equal(new Set(DOMAIN_EVENT_TYPES).size, DOMAIN_EVENT_TYPES.length, 'Event types must be unique.')
for (const type of DOMAIN_EVENT_TYPES) {
  assert.equal(EVENT_REGISTRY[type].version, 1, `${type} must declare a version.`)
  assert.ok(EVENT_REGISTRY[type].aggregateType, `${type} must declare an aggregate.`)
  assert.ok(EVENT_REGISTRY[type].defaultVisibility, `${type} must declare visibility.`)
}

assert.throws(() => validateEventPayload('plant.created', 2, { subjectId: 'plant-1' }), /Unsupported/)
assert.throws(() => validateEventPayload('plant.created', 1, { subjectId: '' }), /subjectId/)
assert.throws(() => validateEventPayload('plant.created', 1, { subjectId: 'plant-1', passwordHash: 'nope' }), /forbidden sensitive/)
assert.deepEqual(allowedEventVisibilities({ publicCollection: true }), ['PUBLIC'])
assert.deepEqual(allowedEventVisibilities({ publicCollection: true, collectionRole: 'VIEWER' }), ['PUBLIC', 'COLLECTION_MEMBER'])
assert.ok(!allowedEventVisibilities({ publicCollection: true }).includes('COLLECTION_MEMBER'), 'Public collections must not expose member events.')
assert.ok(retryDelayMs(2) > retryDelayMs(1), 'Retry delay must increase.')
assert.equal(retryDelayMs(25), 60 * 60_000, 'Retry delay must be bounded.')

async function databaseChecks() {
  if (!process.env.DATABASE_URL) return
  const rollbackKey = `check:event-rollback:${randomUUID()}`
  await assert.rejects(prisma.$transaction(async (tx) => {
    await emitDomainEvent(tx, { eventType: 'plant.created', aggregateId: 'test-plant', idempotencyKey: rollbackKey, payload: { subjectId: 'test-plant', displayName: 'Transaction test' } })
    throw new Error('intentional rollback')
  }), /intentional rollback/)
  assert.equal(await prisma.domainEvent.count({ where: { idempotencyKey: rollbackKey } }), 0, 'Failed domain transaction must create no event.')

  const idempotencyKey = `check:event-idempotency:${randomUUID()}`
  const ids = await prisma.$transaction(async (tx) => {
    const first = await emitDomainEvent(tx, { eventType: 'plant.created', aggregateId: 'test-plant', idempotencyKey, payload: { subjectId: 'test-plant', displayName: 'Idempotency test' } })
    const second = await emitDomainEvent(tx, { eventType: 'plant.created', aggregateId: 'test-plant', idempotencyKey, payload: { subjectId: 'test-plant', displayName: 'Idempotency test' } })
    return [first?.id, second?.id]
  })
  assert.equal(ids[0], ids[1], 'Retry must return the existing event.')
  assert.equal(await prisma.domainEvent.count({ where: { idempotencyKey } }), 1, 'Retry must not duplicate the event.')
  await prisma.domainEvent.deleteMany({ where: { idempotencyKey } })
}

databaseChecks()
  .then(() => console.log('Domain event checks passed.'))
  .finally(() => prisma.$disconnect())
