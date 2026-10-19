import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { chromium } from '@playwright/test'
const db = new PrismaClient()
const baseURL = process.env.CARE_CALENDAR_TEST_URL || 'http://localhost:3107'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const user = await db.user.create({ data: { email: `calendar-ui-${randomUUID()}@example.test`, passwordHash: 'fixture', role: 'SERVER_ADMIN', emailVerifiedAt: new Date(), twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture' } } } })
const collection = await db.collection.create({ data: { name: 'Calendar UI', slug: `calendar-ui-${randomUUID()}` } })
const localDate = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
try {
  await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } })
  await db.emailPreference.create({ data: { userId: user.id, timezone: 'America/New_York' } })
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), twoFactorVerifiedAt: new Date() } })
  const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Fern' } })
  await db.plantDefinitionCareCadence.create({ data: { plantDefinitionId: definition.id, activity: 'WATERING', interval: 3, unit: 'DAY' } })
  const plant = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'FORECAST-FERN', instanceType: 'ACQUIRED' } })
  await db.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, eventType: 'WATERED', performedAt: new Date(Date.now() - 2 * 86400000) } })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'axildb_session', value: token, url: baseURL }])
  const page = await context.newPage()
  const responseErrors = []
  page.on('pageerror', error => responseErrors.push(error.message))
  await page.goto(`${baseURL}/c/${collection.slug}/care`)
  const forecast = page.locator('[data-care-forecast]')
  await forecast.getByRole('button', { name: /Today/ }).waitFor()
  const dayButtons = forecast.getByRole('button', { name: /Today|Projected/ })
  assert.equal(await dayButtons.count(), 7)
  await dayButtons.nth(1).click()
  await forecast.getByRole('button', { name: 'Set as Quiet Day', exact: true }).click()
  const review = forecast.getByRole('dialog')
  await review.getByText(/1 watering assessment\(s\) move into today/).waitFor()
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await db.collectionQuietDay.count({ where: { collectionId: collection.id } }), 0)
  await forecast.getByRole('button', { name: 'Set as Quiet Day', exact: true }).click()
  await review.getByRole('button', { name: 'Confirm Quiet Day change', exact: true }).click()
  await forecast.getByText(/Quiet Day updated/).waitFor()
  assert.equal(await db.collectionQuietDay.count({ where: { collectionId: collection.id } }), 1)
  assert.equal(await db.careQuietDayAdjustment.count({ where: { collectionId: collection.id, taskKey: `WATER:${plant.id}` } }), 1)
  await forecast.getByRole('button', { name: /Today/ }).click()
  await forecast.getByText('Actionable today', { exact: true }).waitFor()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}`)
  }
  await forecast.screenshot({ path: '/tmp/axildb-care-forecast-mobile.png' })
  const post = data => context.request.post(`${baseURL}/api/care/forecast`, { headers: { Origin: baseURL }, data: { collectionSlug: collection.slug, ...data } })
  const quiet = await db.collectionQuietDay.findFirstOrThrow({ where: { collectionId: collection.id } })
  const draft = { kind: 'remove', id: quiet.id }
  const previewResponse = await post({ operation: 'preview', draft })
  const preview = await previewResponse.json()
  assert.equal(previewResponse.status(), 200)
  // Concurrent explicit scheduling changes must invalidate the confirmation token.
  await db.plantCareAdjustment.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, taskType: 'WATER', nextDueAt: new Date(Date.now() + 5 * 86400000) } })
  const stale = await post({ operation: 'commit', draft, hash: preview.hash })
  assert.equal(stale.status(), 409)
  assert.equal(await db.collectionQuietDay.count({ where: { collectionId: collection.id } }), 1)
  const nextPreview = (await stale.json()).preview
  const results = await Promise.all([post({ operation: 'commit', draft, hash: nextPreview.hash }), post({ operation: 'commit', draft, hash: nextPreview.hash })])
  assert.ok(results.some(result => result.status() === 200))
  assert.equal(await db.collectionQuietDay.count({ where: { collectionId: collection.id } }), 0)
  const ruleDraft = { kind: 'rule', careType: 'PEST_CHECK', defaultShiftDirection: 'SMART', maxShiftDaysBefore: 1, maxShiftDaysAfter: 1, active: true }
  const rulePreview = await (await post({ operation: 'preview', draft: ruleDraft })).json()
  assert.equal((await post({ operation: 'commit', draft: ruleDraft, hash: rulePreview.hash })).status(), 200)
  assert.equal((await db.collectionQuietDayShiftRule.findUniqueOrThrow({ where: { collectionId_careType: { collectionId: collection.id, careType: 'PEST_CHECK' } } })).maxShiftDaysBefore, 1)
  const inactiveDraft = { kind: 'create', name: 'Inactive weekly rule', quietType: 'WEEKLY_RECURRING', dayOfWeek: 1, active: false, description: 'Preserved settings note' }
  await page.goto(`${baseURL}/c/${collection.slug}/care/quiet-day-review?draft=${encodeURIComponent(JSON.stringify(inactiveDraft))}`)
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm Quiet Day change', exact: true }).click()
  await page.waitForURL(`**/c/${collection.slug}/care`)
  const inactive = await db.collectionQuietDay.findFirstOrThrow({ where: { collectionId: collection.id, name: 'Inactive weekly rule' } })
  assert.equal(inactive.active, false); assert.equal(inactive.description, 'Preserved settings note')
  const badOrigin = await context.request.post(`${baseURL}/api/care/forecast`, { headers: { Origin: 'https://untrusted.example' }, data: {} })
  assert.equal(badOrigin.status(), 403)
  const unauth = await browser.newContext()
  assert.equal((await unauth.request.post(`${baseURL}/api/care/forecast`, { headers: { Origin: baseURL }, data: {} })).status(), 401)
  const viewer = await db.user.create({ data: { email: `calendar-viewer-${randomUUID()}@example.test`, passwordHash: 'fixture', emailVerifiedAt: new Date() } })
  try {
    await db.collectionMembership.create({ data: { collectionId: collection.id, userId: viewer.id, role: 'VIEWER', status: 'ACTIVE' } })
    const viewerToken = randomBytes(32).toString('hex')
    await db.session.create({ data: { userId: viewer.id, tokenHash: createHash('sha256').update(viewerToken).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } })
    await unauth.addCookies([{ name: 'axildb_session', value: viewerToken, url: baseURL }])
    assert.equal((await unauth.request.post(`${baseURL}/api/care/forecast`, { headers: { Origin: baseURL }, data: { collectionSlug: collection.slug, operation: 'preview', draft: { kind: 'set', date: localDate(new Date()) } } })).status(), 403)
  } finally { await db.user.delete({ where: { id: viewer.id } }) }
  assert.deepEqual(responseErrors, [])
  console.log('Forecast browser/API: seven days, tomorrow warning, cancel/confirm, immediately actionable work, mobile/desktop layout, stale confirmations, concurrent commits, origin and viewer/anonymous authorization passed.')
} finally { await browser.close(); await db.collection.delete({ where: { id: collection.id } }); await db.user.delete({ where: { id: user.id } }); await db.$disconnect() }
