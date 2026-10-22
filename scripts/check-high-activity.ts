import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { performance, monitorEventLoopDelay } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { approveCadenceProposal, approveCadenceBatch } from '../lib/cadence-research'
import { getCareQueue } from '../lib/care-queue'
import { careForecast } from '../lib/care-calendar'
import { executeCareOperation } from '../lib/care-queue-operations'
import { applyCareQueueMutation, type MutationContext } from '../lib/care-queue-mutations'

// Deliberately refuse every production/remote URL. The suite creates/deletes only its fixture.
const url = new URL(process.env.DATABASE_URL || '')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '55439' && url.pathname === '/axildb', 'Use the disposable database on localhost:55439/axildb')
url.searchParams.set('connection_limit', '5')
async function main() {
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const count = Number(process.env.STRESS_ACTIONS || 100)
assert.ok([20, 50, 100].includes(count))
const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable()
const samples: object[] = [], durations: Record<string, number[]> = {}
let peakRss = 0, peakConnections = 0
const user = await db.user.create({ data: { email: `stress-${randomUUID()}@example.test`, passwordHash: 'fixture', role: 'SERVER_ADMIN', emailVerifiedAt: new Date(), twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture' } } } })
const collection = await db.collection.create({ data: { name: 'Disposable stability fixture', slug: `stress-${randomUUID()}` } })
const timezone = 'America/New_York', scope = { collectionId: collection.id, collectionSlug: collection.slug, userId: user.id, timezone }
const cpu = process.cpuUsage(), started = performance.now()
async function sample(stage: string) {
  const memory = process.memoryUsage()
  peakRss = Math.max(peakRss, memory.rss)
  const connections = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()`
  peakConnections = Math.max(peakConnections, connections[0].count)
  samples.push({ stage, ...memory, connections: connections[0].count, eventLoopP99Ms: delay.percentile(99) / 1e6 })
  if (memory.rss > 1536 * 1024 * 1024) throw new Error('Diagnostic RSS safety ceiling reached; test stopped, not a production crash.')
}
async function measure(name: string, work: () => Promise<unknown>) {
  const start = performance.now(); await work(); (durations[name] ||= []).push(performance.now() - start)
}
try {
  const membership = await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } })
  const context: MutationContext = { user, collection, membership, role: 'MANAGER' }
  const recipe = await db.fertilizerRecipe.create({ data: { collectionId: collection.id, name: 'Fixture recipe', active: true } })
  const locationType = await db.locationType.create({ data: { collectionId: collection.id, name: 'Fixture room', abbreviation: 'ROOM' } })
  const location = await db.location.create({ data: { collectionId: collection.id, locationTypeId: locationType.id, name: 'Office', code: 'OFFICE' } })
  const window = await db.repottingWindow.create({ data: { name: `Fixture spring ${randomUUID()}`, startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 } })
  const ids = Array.from({ length: 150 }, () => randomUUID()), plants = Array.from({ length: 150 }, () => randomUUID())
  await db.plantDefinition.createMany({ data: ids.map((id, i) => ({ id, collectionId: collection.id, genus: 'Stressplant', species: `specimen${i}`, primaryRepottingWindowId: window.id })) })
  await db.plantInstance.createMany({ data: plants.map((id, i) => ({ id, collectionId: collection.id, plantDefinitionId: ids[i], plantId: `STRESS-${i}`, instanceType: 'ACQUIRED', currentLocationId: location.id })) })
  await db.plantDefinitionCareCadence.createMany({ data: ids.flatMap(id => [{ plantDefinitionId: id, activity: 'WATERING', interval: 7, unit: 'DAY' }, { plantDefinitionId: id, activity: 'PEST_INSPECTION', interval: 1, unit: 'WEEK' }]) })
  await db.plantCareEvent.createMany({ data: plants.map(id => ({ collectionId: collection.id, plantInstanceId: id, eventType: 'WATERED', performedAt: new Date(Date.now() - 20 * 86400000) })) })
  await db.plantInstanceCareCadenceOverride.createMany({ data: plants.slice(0, 10).map(id => ({ plantInstanceId: id, activity: 'WATERING', mode: 'OVERRIDE', interval: 5, unit: 'DAY' })) })
  await db.plantHusbandryGuide.createMany({ data: ids.slice(0, 10).map(id => ({ plantDefinitionId: id, collectionId: collection.id, fertilizerRecipeId: recipe.id })) })
  await db.collectionQuietDay.create({ data: { collectionId: collection.id, locationId: location.id, name: 'Office Sunday', quietType: 'WEEKLY_RECURRING', dayOfWeek: 0, timezone } })
  const proposals = Array.from({ length: 150 }, () => randomUUID())
  await db.careCadenceProposal.createMany({ data: proposals.map((id, i) => ({ id, plantDefinitionId: ids[i], activity: 'PRUNING', interval: 1, unit: 'MONTH', confidence: 'MEDIUM', rationale: 'Synthetic evidence', applicability: 'RECOMMENDED', sourceReferences: [], source: 'AI_RESEARCH' })) })
  const config = { timezone, quietDays: await db.collectionQuietDay.findMany({ where: { collectionId: collection.id } }), rules: [] }
  const read = async () => { const queue = await getCareQueue(db, scope); careForecast(queue, config) }
  const operation = (index: number, action: 'complete' | 'snooze' = 'complete') => {
    const fd = new FormData(); fd.set('plantInstanceId', plants[index]); fd.set('taskType', 'WATER'); fd.set('queueCompletion', 'on'); fd.set('days', '1')
    const identity = { operationId: randomUUID(), issuedAt: Date.now() }
    return { fd, identity, run: () => executeCareOperation(db, { ...scope, userId: user.id, action, fd, identity }, tx => applyCareQueueMutation(tx, context, action, fd)) }
  }
  await sample('baseline')
  for (let i = 0; i < count; i++) {
    await measure('approval', () => approveCadenceProposal(db, proposals[i], user.id))
    if ([19, 49, 99].includes(i)) await sample(`approval-${i + 1}`)
  }
  for (let i = 0; i < count; i++) {
    const op = operation(i)
    await measure('careMutation', op.run)
    await measure('queueAndForecast', read)
    if ([19, 49, 99].includes(i)) await sample(`care-${i + 1}`)
  }
  const repeat = operation(100)
  await Promise.all([repeat.run(), repeat.run(), repeat.run()])
  assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plants[100], eventType: 'WATERED' } }), 2, 'One original event plus one logical completion')
  const independent = Array.from({ length: 20 }, (_, i) => operation(110 + i))
  await measure('20ConcurrentCare', () => Promise.all(independent.map(op => op.run())))
  const bulk = await approveCadenceBatch(db, proposals.slice(count), user.id)
  assert.equal(bulk.APPROVED, 150 - count)
  for (let i = 0; i < 10; i++) {
    await operation(130 + i, 'snooze').run()
    await read()
    await db.plantDefinition.update({ where: { id: ids[140 + i] }, data: { notes: 'Mixed activity' } })
  }
  const failed = operation(149)
  await assert.rejects(executeCareOperation(db, { ...scope, userId: user.id, action: 'complete', fd: failed.fd, identity: failed.identity }, async tx => { await tx.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: plants[149], eventType: 'WATERED' } }); throw new Error('Injected failure') }))
  assert.equal(await db.careQueueOperation.count({ where: { operationId: failed.identity.operationId } }), 0)
  assert.equal(await db.careCadenceProposal.count({ where: { plantDefinitionId: { in: ids }, status: 'APPROVED' } }), 150)
  for (let i = 0; i < count; i++) assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: plants[i], eventType: 'WATERED' } }), 2)
  let http: object | undefined
  if (process.env.STRESS_HTTP_URL) {
    const origin = new URL(process.env.STRESS_HTTP_URL)
    assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'HTTP stress must remain local')
    const { chromium, expect } = await import('@playwright/test')
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    try {
      const token = randomBytes(32).toString('hex')
      await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), twoFactorVerifiedAt: new Date() } })
      const context = await browser.newContext()
      await context.addCookies([{ name: 'axildb_session', value: token, url: origin.origin }])
      const page = await context.newPage(), clientErrors: string[] = [], network = { rsc: 0, prefetch: 0, forecast: 0, snapshot: 0 }
      page.on('pageerror', error => clientErrors.push(error.message))
      page.on('request', request => { if (request.url().includes('_rsc=')) { if (request.headers()['next-router-prefetch'] || request.headers()['purpose'] === 'prefetch') network.prefetch++; else { network.rsc++; console.log('RSC navigation', new URL(request.url()).pathname) } }; if (request.url().includes('/api/care/forecast')) network.forecast++; if (request.url().includes('/api/care-queue?')) network.snapshot++ })
      const before = await (await context.request.get(`${origin.origin}/api/server/runtime`)).json()
      const extra = Array.from({ length: 100 }, () => randomUUID())
      await db.careCadenceProposal.createMany({ data: extra.map((id, i) => ({ id, plantDefinitionId: ids[i], activity: 'GENERAL_INSPECTION', interval: 3, unit: 'DAY', confidence: 'MEDIUM', rationale: 'HTTP fixture', applicability: 'RECOMMENDED', sourceReferences: [], source: 'AI_RESEARCH' })) })
      await page.goto(`${origin.origin}/server/care-cadence-research?tab=review&collection=${collection.slug}`)
      const reviews = page.locator('form:has(button[value="approve"])')
      await expect(reviews).toHaveCount(100)
      const approvalMs: number[] = []
      for (let i = 0; i < 100; i++) {
        const began = performance.now()
        await reviews.first().getByRole('button', { name: 'Approve', exact: true }).click()
        await expect(reviews).toHaveCount(99 - i)
        approvalMs.push(performance.now() - began)
      }
      assert.equal(await db.careCadenceProposal.count({ where: { id: { in: extra }, status: 'APPROVED' } }), 100)
      const careMs: number[] = []
      for (let i = 0; i < 100; i++) {
        const operationId = randomUUID(), issuedAt = Date.now(), began = performance.now()
        const data = { operationId, issuedAt, action: 'complete', fields: [['collectionSlug', collection.slug], ['plantInstanceId', plants[i]], ['taskType', 'PEST_CHECK'], ['queueCompletion', 'on']] }
        const response = await context.request.post(`${origin.origin}/api/care-queue`, { headers: { Origin: origin.origin }, data })
        assert.equal(response.status(), 200, await response.text())
        const snapshot = await context.request.get(`${origin.origin}/api/care-queue?collectionSlug=${collection.slug}&forecast=1`)
        assert.equal(snapshot.status(), 200)
        assert.equal((await snapshot.json()).forecast.days.length, 7)
        if (i === 0) assert.equal((await context.request.post(`${origin.origin}/api/care-queue`, { headers: { Origin: origin.origin }, data })).status(), 200)
        careMs.push(performance.now() - began)
      }
      // Real optimistic UI: complete twenty due inspection rows, with no full-page refresh per tap.
      await db.plantCareEvent.createMany({ data: plants.slice(100, 120).map(id => ({ collectionId: collection.id, plantInstanceId: id, eventType: 'PEST_CHECK', performedAt: new Date(Date.now() - 20 * 86400000) })) })
      await page.goto(`${origin.origin}/c/${collection.slug}/care`)
      const rscBefore = network.rsc
      for (let i = 100; i < 120; i++) {
        const row = page.locator(`[data-care-key="PEST_CHECK:${plants[i]}"]`)
        await row.getByRole('button', { name: 'Complete', exact: true }).first().click()
        await expect(row).toBeHidden()
      }
      await expect.poll(async () => await db.careQueueOperation.count({ where: { collectionId: collection.id, action: 'complete' } })).toBeGreaterThanOrEqual(count + 1 + 20 + 100 + 20)
      await expect.poll(async () => { const runtime = await (await context.request.get(`${origin.origin}/api/server/runtime`)).json(); return runtime.inFlightMutations }).toBe(0)
      const after = await (await context.request.get(`${origin.origin}/api/server/runtime`)).json()
      assert.equal(after.processId, before.processId, 'The web process did not restart')
      assert.deepEqual(clientErrors, [])
      assert.equal(network.rsc - rscBefore, 0, 'Ordinary optimistic care does not trigger full RSC page refreshes')
      const anonymous = await browser.newContext()
      assert.equal((await anonymous.request.get(`${origin.origin}/api/server/runtime`)).status(), 403)
      assert.equal((await context.request.get(`${origin.origin}/api/health/live`)).status(), 200)
      assert.equal((await context.request.get(`${origin.origin}/api/health/ready`)).status(), 200)
      http = { approvalMs, careMs, before, after, network, clientErrors }
    } finally { await browser.close() }
  }
  await db.$queryRaw`SELECT 1`
  ;(globalThis as unknown as { gc?: () => void }).gc?.()
  await sample('settled')
  const used = process.cpuUsage(cpu)
  const report = { node: process.version, fixture: { definitions: 150, instances: 150 }, count, http, totalMs: performance.now() - started, cpuMs: (used.user + used.system) / 1000, peakRss, peakConnections, errors: 0, samples, durations }
  await writeFile(process.env.STRESS_REPORT || '/tmp/axildb-stress.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ count, totalMs: report.totalMs, peakRss, peakConnections, errors: 0 }))
  await db.collection.delete({ where: { id: collection.id } }); await db.repottingWindow.delete({ where: { id: window.id } }); return report
} catch (error) { await writeFile(process.env.STRESS_REPORT || '/tmp/axildb-stress.json', JSON.stringify({ node: process.version, count, stopped: error instanceof Error ? error.message : 'failed', peakRss, peakConnections, samples, durations }, null, 2)); throw error
} finally { delay.disable(); await db.collection.deleteMany({ where: { id: collection.id } }); await db.user.delete({ where: { id: user.id } }); await db.$disconnect() }

}
async function run() {
  const cycles = Number(process.env.STRESS_CYCLES || 1)
  assert.ok(Number.isInteger(cycles) && cycles >= 1 && cycles <= 5)
  const reports = []
  for (let cycle = 0; cycle < cycles; cycle++) reports.push(await main())
  if (cycles > 1) await writeFile(`${process.env.STRESS_REPORT || '/tmp/axildb-stress.json'}.cycles.json`, JSON.stringify(reports, null, 2))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
