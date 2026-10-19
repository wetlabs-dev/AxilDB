import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { ingestUpgradeOutcomes, deliverUpgradeNotification, upgradeMessage, upgradePreferenceKeys, type UpgradeOutcome } from '../lib/server-upgrade-notifications'
import { processDomainEventBatch } from '../lib/events/process'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL || '').hostname)) throw new Error('Use an isolated local test database.')
const prisma = new PrismaClient()
const suffix = randomBytes(8).toString('hex')
const ids: string[] = []
const jobs: string[] = []
const outcome = (status: 'COMPLETED' | 'FAILED'): UpgradeOutcome => {
  const job_id = randomBytes(16).toString('hex'); jobs.push(job_id)
  return { id: jobs.length, job_id, outcome: status, finished: new Date().toISOString(), revision: 'a'.repeat(40), stage: 'BUILDING' }
}
async function main() {
  const admin = await prisma.user.create({ data: { email: `upgrade-admin-${suffix}@example.test`, passwordHash: 'fixture', role: 'SERVER_ADMIN', emailVerifiedAt: new Date(), emailPreference: { create: {} } }, include: { emailPreference: true } }); ids.push(admin.id)
  const ordinary = await prisma.user.create({ data: { email: `upgrade-user-${suffix}@example.test`, passwordHash: 'fixture', emailVerifiedAt: new Date(), emailPreference: { create: { serverUpgradeCompletedEmailEnabled: true } } } }); ids.push(ordinary.id)
  const unverified = await prisma.user.create({ data: { email: `upgrade-unverified-${suffix}@example.test`, passwordHash: 'fixture', role: 'SERVER_ADMIN', emailPreference: { create: { serverUpgradeCompletedEmailEnabled: true } } } }); ids.push(unverified.id)
  for (const key of upgradePreferenceKeys) assert.equal(admin.emailPreference![key], false)
  const quiet = await prisma.emailPreference.findUniqueOrThrow({ where: { userId: admin.id } })
  await prisma.emailPreference.update({ where: { userId: admin.id }, data: { serverUpgradeCompletedEmailEnabled: true, serverUpgradeFailedEmailEnabled: true } })
  const success = outcome('COMPLETED'), failure = outcome('FAILED')
  await Promise.all([ingestUpgradeOutcomes(prisma, [success, failure]), ingestUpgradeOutcomes(prisma, [success, failure])])
  const events = await prisma.domainEvent.findMany({ where: { aggregateId: { in: jobs } } })
  assert.equal(events.length, 4, 'two receipts and two email deliveries; no push or ordinary-user delivery')
  assert.equal(events.filter(e => (e.payloadJson as any).recipientId === ordinary.id).length, 0)
  assert(events.every(e => e.visibility === 'INTERNAL' && !e.collectionId))
  const delivery = events.find(e => (e.payloadJson as any).recipientId === admin.id)!
  process.env.EMAIL_DELIVERY_MODE = 'smtp'; delete process.env.SMTP_HOST
  await assert.rejects(deliverUpgradeNotification(prisma, delivery), /SMTP_HOST/)
  process.env.EMAIL_DELIVERY_MODE = 'log'
  // Claim only fixture events; keep other local events outside this worker batch.
  const allOther = await prisma.domainEvent.findMany({ where: { aggregateId: { notIn: jobs }, processingStatus: { in: ['PENDING', 'FAILED'] } }, select: { id: true, nextAttemptAt: true } })
  const later = new Date(Date.now() + 86400000)
  await prisma.domainEvent.updateMany({ where: { id: { in: allOther.map(e => e.id) } }, data: { nextAttemptAt: later } })
  try {
    process.env.EMAIL_DELIVERY_MODE = 'smtp'
    const failed = await processDomainEventBatch(prisma)
    assert.equal(failed.failed, 2, 'provider failures retain both channel deliveries for retry')
    assert.equal(failed.processed, 2, 'ingestion receipts do not send notifications')
    const pending = await prisma.domainEvent.findMany({ where: { aggregateId: { in: jobs }, processingStatus: 'FAILED' } })
    assert(pending.every(e => e.nextAttemptAt && e.processingAttempts === 1))
    await prisma.domainEvent.updateMany({ where: { aggregateId: { in: jobs }, processingStatus: 'FAILED' }, data: { nextAttemptAt: new Date(0) } })
    process.env.EMAIL_DELIVERY_MODE = 'log'
    const first = await processDomainEventBatch(prisma)
    assert.equal(first.processed, 2)
    assert.equal((await processDomainEventBatch(prisma)).claimed, 0)
    await ingestUpgradeOutcomes(prisma, [success, failure])
    assert.equal((await processDomainEventBatch(prisma)).claimed, 0, 'replay after restart cannot redeliver')
  } finally {
    for (const row of allOther) await prisma.domainEvent.update({ where: { id: row.id }, data: { nextAttemptAt: row.nextAttemptAt } })
  }
  const before = await prisma.emailPreference.findUniqueOrThrow({ where: { userId: admin.id } })
  assert.equal(before.careQueueDigestEmailEnabled, quiet.careQueueDigestEmailEnabled)
  assert.equal(before.serverUpgradeCompletedPushEnabled, false)
  const next = outcome('COMPLETED')
  await ingestUpgradeOutcomes(prisma, [next])
  assert.equal(await prisma.domainEvent.count({ where: { aggregateId: next.job_id } }), 2, 'new job with same revision gets its own delivery')
  assert.equal(upgradeMessage({ ...failure, stage: 'password=SECRET\nraw stderr' }).body.includes('SECRET'), false)
  assert.equal(upgradeMessage(success).url, `/server/application-updates?jobId=${success.job_id}`)
  await assert.rejects(ingestUpgradeOutcomes(prisma, [{ ...next, outcome: 'RUNNING' as any }]), /Invalid/)
  await prisma.emailPreference.update({ where: { userId: admin.id }, data: { serverUpgradeCompletedPushEnabled: true, quietHoursStart: '00:00', quietHoursEnd: '23:59' } })
  const quietEvent = await prisma.domainEvent.findFirstOrThrow({ where: { aggregateId: next.job_id, idempotencyKey: { endsWith: `EMAIL:${admin.id}` } } })
  if (new Intl.DateTimeFormat('en-US', { timeZone: before.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) !== '23:59') await assert.rejects(deliverUpgradeNotification(prisma, quietEvent), /quiet hours/)
  await prisma.emailPreference.update({ where: { userId: admin.id }, data: { quietHoursStart: null, quietHoursEnd: null } })
  const pushOutcome = outcome('COMPLETED')
  await ingestUpgradeOutcomes(prisma, [pushOutcome])
  const pushEvent = await prisma.domainEvent.findFirstOrThrow({ where: { aggregateId: pushOutcome.job_id, idempotencyKey: { endsWith: `PUSH:${admin.id}` } } })
  const devices = await Promise.all([1, 2].map(n => prisma.pushSubscription.create({ data: { userId: admin.id, endpoint: `https://push.example.test/${suffix}/${n}`, p256dh: 'fixture', auth: 'fixture' } })))
  process.env.NEXT_PUBLIC_ENABLE_WEB_PUSH = 'true'; process.env.VAPID_PRIVATE_KEY = 'fixture'; process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'fixture'
  const calls: string[] = []
  await assert.rejects(deliverUpgradeNotification(prisma, pushEvent, { push: async subscription => { calls.push(subscription.id); return { sent: subscription.id === devices[0].id, skipped: false } } }), /pending devices/)
  const reloaded = await prisma.domainEvent.findUniqueOrThrow({ where: { id: pushEvent.id } })
  await deliverUpgradeNotification(prisma, reloaded, { push: async subscription => { calls.push(subscription.id); return { sent: true, skipped: false } } })
  assert.equal(calls.filter(id => id === devices[0].id).length, 1, 'successful push device is not repeated during retry')
  assert.equal(calls.filter(id => id === devices[1].id).length, 2)
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
  await deliverUpgradeNotification(prisma, delivery) // role is checked again at delivery
  console.log('Upgrade notification defaults, independent channels, authorization, concurrent replay, provider failure, durable processing, restart deduplication, new attempts, safe content and links passed.')
}
main().finally(async () => {
  await prisma.domainEvent.deleteMany({ where: { aggregateId: { in: jobs } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
}).catch(error => { console.error(error); process.exitCode = 1 })
