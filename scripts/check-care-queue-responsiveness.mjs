import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

// Creates fixtures only in an explicitly named disposable local test database.
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const base = process.env.AXILDB_QUEUE_TEST_URL || 'http://localhost:3107'
const db = new PrismaClient()
const browser = await chromium.launch({ channel: 'chrome' })
let collectionId, userId
const pending = []
try {
  const user = await db.user.create({ data: { email: `queue-ui-${Date.now()}@example.test`, emailVerifiedAt: new Date(), passwordHash: 'unused-test' } })
  userId = user.id
  const collection = await db.collection.create({ data: { name: 'Responsive queue', slug: `queue-ui-${Date.now()}` } })
  collectionId = collection.id
  await db.collectionMembership.create({ data: { userId, collectionId, role: 'LOGGER', status: 'ACTIVE' } })
  const type = await db.locationType.create({ data: { collectionId, name: 'Test area', abbreviation: 'TEST' } })
  const location = await db.location.create({ data: { collectionId, locationTypeId: type.id, code: 'TEST-1', name: 'Test shelf' } })
  const definition = await db.plantDefinition.create({ data: { collectionId, genus: 'Test', species: 'responsiva', careCadences: { create: { activity: 'WATERING', interval: 7, unit: 'DAY' } } } })
  const makePlant = async label => {
    const plant = await db.plantInstance.create({ data: { collectionId, plantDefinitionId: definition.id, plantId: label, instanceType: 'ACQUIRED', currentLocationId: location.id } })
    await db.plantCareEvent.create({ data: { collectionId, plantInstanceId: plant.id, eventType: 'WATERED', performedAt: new Date(Date.now() - 9 * 86400000) } })
    return plant
  }
  const [a, b, c] = await Promise.all(['TEST-A', 'TEST-B', 'TEST-C'].map(makePlant))
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', hasTouch: true })
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } })
  await context.addCookies([{ name: 'axildb_session', value: token, url: base }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /React|hydration|controlled|uncontrolled|unique.*key/i.test(message.text())) errors.push(message.text()) })
  page.setDefaultTimeout(15000)
  let hold = true
  await page.route('**/api/care-queue', async route => {
    if (route.request().method() !== 'POST' || !hold) return route.continue()
    pending.push({ route, input: route.request().postDataJSON() })
  })
  const prefix = `${base}/c/${collection.slug}`
  const queueUrl = `${prefix}/care?filter=today&location=${location.id}`
  await page.goto(queueUrl)
  const row = plant => page.locator(`[data-care-key="WATER:${plant.id}"]`)
  await expect(row(a)).toBeVisible()
  await expect(page.locator('[data-care-summary="today"]')).toHaveText('3')
  await row(b).getByRole('button', { name: 'Details', exact: true }).click()
  await row(b).getByLabel('Quick note', { exact: true }).last().fill('Keep this note after rollback')
  const started = Date.now()
  await row(a).getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(row(a)).toBeHidden()
  assert.ok(Date.now() - started < 1500, 'Visual response must not wait for the held request.')
  await expect(page.locator('[data-care-summary="today"]')).toHaveText('2')
  await expect.poll(() => pending.length).toBe(1)
  await page.getByRole('link', { name: 'All locations (2)', exact: true }).click()
  await expect(row(a)).toBeHidden()
  assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: a.id } }), 1, 'No optimistic history is written while the request is held.')
  // A second submit in the same interaction cannot start a duplicate request.
  await row(a).locator('form').first().evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  assert.equal(pending.length, 1)
  await row(b).getByRole('button', { name: 'Complete', exact: true }).last().click()
  await expect(row(b)).toBeHidden()
  await row(c).getByRole('button', { name: 'Details', exact: true }).click()
  await row(c).getByRole('button', { name: 'Snooze 3d', exact: true }).click()
  await expect(row(c)).toBeHidden()
  await expect.poll(() => pending.length).toBe(3)
  await expect(page.locator('[data-care-summary="today"]')).toHaveText('0')
  await expect(page.getByText('Nothing pressing here.', { exact: true })).toBeVisible()
  await expect(page.locator('[data-care-empty-focus]')).toBeFocused()
  const find = plant => pending.find(entry => entry.input.fields.some(([key, value]) => key === 'plantInstanceId' && value === plant.id))
  const bRequest = find(b)
  await bRequest.route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Controlled validation failure.', category: 'validation' }) })
  await expect(row(b)).toBeVisible()
  await expect(row(b).getByLabel('Quick note', { exact: true }).last()).toHaveValue('Keep this note after rollback')
  await expect(row(a)).toBeHidden(); await expect(row(c)).toBeHidden()
  await expect(page.locator('[data-care-summary="today"]')).toHaveText('1')
  await page.getByRole('link', { name: 'Weekly checklist', exact: true }).click()
  await expect(row(a)).toBeHidden(); await expect(row(c)).toBeHidden(); await expect(row(b)).toBeVisible()
  await page.locator('main').getByRole('link', { name: 'Care queue', exact: true }).click()
  await expect(row(a)).toBeHidden(); await expect(row(c)).toBeHidden()
  const aRequest = find(a), cRequest = find(c)
  await cRequest.route.continue(); await aRequest.route.continue()
  await expect.poll(() => db.plantCareEvent.count({ where: { plantInstanceId: a.id } })).toBe(2)
  await expect(row(a)).toBeHidden(); await expect(row(c)).toBeHidden()
  // Replay the exact committed request; the original success returns without another care event.
  const duplicate = await context.request.post(`${base}/api/care-queue`, { headers: { Origin: base }, data: aRequest.input })
  assert.equal(duplicate.status(), 200)
  assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: a.id } }), 2)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(row(b)).toBeHidden()
  await expect.poll(() => pending.length).toBe(4)
  assert.equal(pending[3].input.operationId, bRequest.input.operationId)
  await pending[3].route.continue()
  await expect.poll(() => db.plantCareEvent.count({ where: { plantInstanceId: b.id } })).toBe(2)
  assert.equal((await db.plantCareEvent.findFirstOrThrow({ where: { plantInstanceId: b.id }, orderBy: { performedAt: 'desc' } })).notes, 'Keep this note after rollback')
  hold = false
  const [d, e] = await Promise.all(['TEST-D', 'TEST-E'].map(makePlant))
  // The compact checklist uses the same overlay and immediate snooze behavior.
  await page.goto(`${prefix}/care/checklist`)
  await expect(row(d)).toBeVisible()
  hold = true
  await row(d).getByRole('button', { name: 'Snooze 3d', exact: true }).click()
  await expect(row(d)).toBeHidden()
  await expect.poll(() => pending.length).toBe(5)
  await pending[4].route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Controlled snooze failure.' }) })
  await expect(row(d)).toBeVisible()
  await context.setOffline(true)
  await row(d).getByRole('button', { name: 'Snooze 3d', exact: true }).click()
  await expect(row(d)).toBeVisible()
  await expect(page.locator('main').getByRole('alert')).toContainText('offline')
  await context.setOffline(false)
  hold = false
  // Bulk uses its dedicated server action and same-day eligibility review.
  const bulkUrl = `${prefix}/care/bulk?review=1&locationId=${location.id}&careType=WATERING&plantInstanceId=${d.id}&plantInstanceId=${e.id}`
  await page.goto(bulkUrl)
  await page.getByRole('button', { name: 'Record care for 2 plants', exact: true }).click()
  await expect.poll(() => db.plantCareEvent.count({ where: { plantInstanceId: d.id } })).toBe(2)
  await expect.poll(() => db.plantCareEvent.count({ where: { plantInstanceId: e.id } })).toBe(2)
  const f = await makePlant('TEST-F')
  await page.goto(`${prefix}/care?filter=today`)
  hold = true
  await row(f).getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(row(f)).toBeHidden()
  await expect.poll(() => pending.length).toBe(6)
  const lostResponse = await pending[5].route.fetch()
  assert.equal(lostResponse.status(), 200)
  await pending[5].route.abort('failed')
  await expect.poll(() => db.plantCareEvent.count({ where: { plantInstanceId: f.id } })).toBe(2)
  await expect(row(f)).toBeHidden()
  hold = false
  await page.waitForLoadState('networkidle')
  const condition = await db.plantCondition.create({ data: { collectionId, plantInstanceId: f.id, category: 'HEALTH', severity: 'HIGH', status: 'OPEN' } })
  await page.goto(`${prefix}/care?filter=health`)
  const conditionRow = page.locator(`[data-care-key="HEALTH_CHECK:${condition.id}"]`)
  await conditionRow.getByRole('button', { name: 'Condition actions', exact: true }).click()
  await conditionRow.locator('select[name=severity]').last().selectOption('LOW')
  await conditionRow.locator('select[name=status]').last().selectOption('IMPROVING')
  hold = true
  await conditionRow.getByRole('button', { name: 'Update condition', exact: true }).click()
  await expect(conditionRow).toBeVisible()
  await expect(conditionRow).toContainText('Improving')
  await expect.poll(() => pending.length).toBe(7)
  await pending[6].route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Controlled condition failure.' }) })
  await expect(conditionRow).toContainText('High')
  await conditionRow.getByRole('button', { name: 'Resolve condition', exact: true }).click()
  await expect(conditionRow).toBeHidden()
  await expect.poll(() => pending.length).toBe(8)
  await pending[7].route.continue()
  await expect.poll(async () => (await db.plantCondition.findUniqueOrThrow({ where: { id: condition.id } })).status).toBe('RESOLVED')
  hold = false
  const g = await db.plantInstance.create({ data: { collectionId, plantDefinitionId: definition.id, plantId: 'TEST-G', instanceType: 'PROPAGATION', propagationDate: new Date(Date.now() - 20 * 86400000), currentLocationId: location.id } })
  await page.goto(`${prefix}/care?filter=propagation`)
  const propagationRow = page.locator(`[data-care-key="PROPAGATION_CHECK:${g.id}"]`)
  await propagationRow.getByRole('button', { name: 'Details', exact: true }).click()
  hold = true
  await propagationRow.getByRole('button', { name: 'Mark established', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(propagationRow).toBeHidden()
  await expect.poll(() => pending.length).toBe(9)
  await pending[8].route.continue()
  await expect.poll(async () => Boolean((await db.plantInstance.findUniqueOrThrow({ where: { id: g.id } })).propagationEstablishedAt)).toBe(true)
  hold = false
  const h = await makePlant('TEST-H')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${prefix}/care?filter=today`)
  hold = true
  await row(h).getByRole('button', { name: 'Complete', exact: true }).tap()
  await expect(row(h)).toBeHidden()
  await expect.poll(() => pending.length).toBe(10)
  await pending[9].route.continue()
  await expect.poll(() => db.plantCareEvent.count({ where: { plantInstanceId: h.id } })).toBe(2)
  // Access checks apply to API requests independently from the UI.
  const anonymous = await browser.newContext()
  const denied = await anonymous.request.post(`${base}/api/care-queue`, { headers: { Origin: base }, data: aRequest.input })
  assert.equal(denied.status(), 401)
  for (const origin of ['http://evil.example', 'https://localhost:3107']) {
    const rejected = await context.request.post(`${base}/api/care-queue`, { headers: { Origin: origin, 'X-Forwarded-Host': 'evil.example' }, data: aRequest.input })
    assert.equal(rejected.status(), 403, 'Exact-origin validation rejects cross-site and wrong-scheme requests even with a spoofed forwarded host.')
  }

  await db.collectionMembership.update({ where: { collectionId_userId: { collectionId, userId } }, data: { role: 'VIEWER' } })
  const readOnly = await context.request.post(`${base}/api/care-queue`, { headers: { Origin: base }, data: aRequest.input })
  assert.equal(readOnly.status(), 403)
  await db.collectionMembership.update({ where: { collectionId_userId: { collectionId, userId } }, data: { role: 'LOGGER' } })
  await anonymous.close()
  hold = false
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${prefix}/care?filter=water`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`)
  }
  await page.screenshot({ path: '/tmp/axildb-responsive-queue-desktop.png', fullPage: false, caret: 'initial' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/axildb-responsive-queue-mobile.png', fullPage: false, caret: 'initial' })
  assert.deepEqual(errors, [])
  console.log('Browser controlled-network immediacy, concurrent rollback, counters, preserved form state, retry idempotency, focus, checklist, bulk, authorization, and four-width checks passed.')
} finally {
  await browser.close()
  if (collectionId) await db.collection.delete({ where: { id: collectionId } })
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
}
