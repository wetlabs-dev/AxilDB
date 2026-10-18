import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

// Use a seeded disposable database and its local app. Never point at production.
const base = process.env.AXILDB_CADENCE_TEST_URL || 'http://localhost:3107'
const db = new PrismaClient()
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb_final/, 'Use the disposable cadence test database.')
const fixtureUserIds = []
let mutationRequest
const browser = await chromium.launch({ channel: process.env.AXILDB_TEST_BROWSER || 'chrome' })
try {
  const specimen = await db.plantInstance.findFirstOrThrow({ include: { plantDefinition: true } })
  const collection = await db.collection.findUniqueOrThrow({ where: { id: specimen.collectionId } })
  const prefix = `${base}/c/${collection.slug}`
  const definitionUrl = `${prefix}/plants/${specimen.plantDefinitionId}/husbandry`
  const instanceUrl = `${prefix}/instances/${specimen.id}`
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const user = await db.user.create({ data: { email: `cadence-ui-${Date.now()}@example.test`, passwordHash: 'unused-test-fixture', emailVerifiedAt: new Date(), memberships: { create: { collectionId: collection.id, role: 'MANAGER', status: 'ACTIVE' } }, twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'test-fixture' } } } })
  fixtureUserIds.push(user.id)
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), twoFactorVerifiedAt: new Date() } })
  await page.context().addCookies([{ name: 'axildb_session', value: token, url: base }])
  page.on('request', request => {
    if (request.method() === 'POST' && request.headers()['next-action']) mutationRequest = { headers: request.headers(), body: request.postDataBuffer() }
  })
  page.setDefaultTimeout(15000)
  await page.goto(definitionUrl)
  const panel = page.locator('#care-cadences')
  await panel.getByRole('button', { name: 'Edit care cadences' }).click()
  const water = panel.getByRole('group', { name: 'Watering', exact: true })
  await water.getByLabel('Schedule').selectOption('OVERRIDE')
  await water.getByLabel('Every', { exact: true }).fill('2')
  await water.getByLabel('Unit').selectOption('WEEK')
  await panel.getByRole('button', { name: 'Save cadences' }).click()
  await panel.getByRole('button', { name: 'Edit care cadences' }).waitFor()
  await expect(panel).toContainText('Every 2 weeks')
  assert.ok(mutationRequest, 'Capture a real server action to test access enforcement.')
  const before = await db.plantDefinitionCareCadence.findFirstOrThrow({ where: { plantDefinitionId: specimen.plantDefinitionId, activity: 'WATERING' } })
  const unauthorized = await browser.newContext()
  await unauthorized.request.post(definitionUrl, { headers: { 'Next-Action': mutationRequest.headers['next-action'], 'Content-Type': mutationRequest.headers['content-type'], Origin: base }, data: mutationRequest.body, maxRedirects: 0 })
  const after = await db.plantDefinitionCareCadence.findUniqueOrThrow({ where: { id: before.id } })
  assert.equal(after.interval, 2)
  await unauthorized.close()

  await page.goto(instanceUrl)
  await page.getByRole('link', { name: 'Edit Instance', exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'View Plant Definition', exact: true }).getAttribute('href'), `/c/${collection.slug}/plants/${specimen.plantDefinitionId}/husbandry`)
  const instancePanel = page.locator('#care-cadences')
  assert.ok((await instancePanel.innerText()).includes('From definition'))
  await instancePanel.getByRole('button', { name: 'Edit care cadences' }).click()
  await instancePanel.getByRole('group', { name: 'Watering', exact: true }).getByLabel('Schedule').selectOption('DISABLED')
  await instancePanel.getByRole('button', { name: 'Save cadences' }).click()
  await instancePanel.getByRole('button', { name: 'Edit care cadences' }).waitFor()
  await expect(instancePanel).toContainText('Disabled for this instance')
  await instancePanel.getByRole('button', { name: 'Edit care cadences' }).click()
  await instancePanel.getByRole('group', { name: 'Watering', exact: true }).getByRole('button', { name: 'Reset to definition' }).click()
  await instancePanel.getByRole('button', { name: 'Save cadences' }).click()
  await instancePanel.getByRole('button', { name: 'Edit care cadences' }).waitFor()
  assert.equal(await db.plantInstanceCareCadenceOverride.count({ where: { plantInstanceId: specimen.id, activity: 'WATERING' } }), 0)
  await instancePanel.getByRole('button', { name: 'Edit care cadences' }).click()
  await instancePanel.getByRole('group', { name: 'Watering', exact: true }).getByLabel('Schedule').selectOption('DISABLED')
  await instancePanel.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.ok(!(await instancePanel.innerText()).includes('Disabled for this instance'))
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const url of [instanceUrl, definitionUrl]) {
      await page.goto(url)
      await page.locator('#care-cadences').getByRole('button', { name: 'Edit care cadences' }).click()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}: ${url}`)
    }
  }
  await page.screenshot({ path: '/tmp/axildb-care-cadences-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(instanceUrl)
  await page.screenshot({ path: '/tmp/axildb-care-cadences-mobile.png', fullPage: false })
  await page.getByRole('link', { name: 'Edit Instance', exact: true }).click()
  await expect(page).toHaveURL(`${prefix}/instances/${specimen.id}/edit`)
  console.log('Care cadence UI authorization, save, inheritance, disable/reset/cancel, navigation, and four responsive widths passed.')
} finally {
  await db.user.deleteMany({ where: { id: { in: fixtureUserIds } } })
  await browser.close()
  await db.$disconnect()
}
