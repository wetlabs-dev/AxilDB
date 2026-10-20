import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/, 'Use the local disposable fixture database.')
const db = new PrismaClient()
const base = 'http://localhost:3115'
let app, browser, user, collection
let output = ''
try {
  app = spawn('npm', ['run', 'dev'], { env: { ...process.env, PORT: '3115' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  app.stdout.on('data', chunk => { output += chunk }); app.stderr.on('data', chunk => { output += chunk })
  let available = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health/ready`)).ok) { available = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert(available, output)
  user = await db.user.create({ data: { email: `label-prefs-${randomUUID()}@example.test`, passwordHash: 'fixture', emailVerifiedAt: new Date() } })
  collection = await db.collection.create({ data: { name: 'Label preferences fixture', slug: `label-prefs-${randomUUID()}` } })
  await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } })
  const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Begonia', species: 'test' } })
  for (const [plantId, createdAt] of [['A-OLDER', '2026-01-01'], ['Z-NEWER', '2026-02-01']]) await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId, instanceType: 'ACQUIRED', createdAt: new Date(createdAt) } })
  const type = await db.locationType.create({ data: { collectionId: collection.id, name: 'Room', abbreviation: 'RM' } })
  await db.location.create({ data: { collectionId: collection.id, locationTypeId: type.id, name: 'Fixture room', code: 'ROOM' } })
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } })
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  await context.addCookies([{ name: 'axildb_session', value: token, url: base }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /hydration|did not match/i.test(message.text())) errors.push(message.text()) })
  const path = `${base}/c/${collection.slug}/labels`
  const key = `axildb:plant-label-pdf-preferences:v1:${user.id}`
  const format = () => page.getByRole('combobox', { name: 'Print format', exact: true })
  const orientation = () => page.getByRole('combobox', { name: 'Orientation', exact: true })
  const sort = () => page.getByRole('combobox', { name: 'Sort plants by', exact: true })
  const ready = async () => { await expect(format()).toBeVisible() }
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
  const order = () => page.locator('input[name="id"][value^="plant:"]').evaluateAll(inputs => inputs.map(input => input.closest('label').innerText))
  await page.goto(path); await ready()
  await expect(format()).toHaveValue('fixed'); await expect(orientation()).toHaveValue('landscape')
  await sort().selectOption('added-newest')
  assert.equal((await saved()).categories.plants.sort, 'plant-id', 'pending sort must not be saved')
  assert((await order())[0].includes('A-OLDER'))
  await page.getByRole('button', { name: 'Sort', exact: true }).click(); await ready()
  await expect(sort()).toHaveValue('added-newest')
  await expect.poll(async () => (await order())[0]).toContain('Z-NEWER')
  await format().selectOption('sheet'); await orientation().selectOption('landscape')
  await page.getByRole('link', { name: 'Locations', exact: true }).click(); await ready()
  assert.equal(await sort().count(), 0)
  await format().selectOption('brother-dk-2210'); await orientation().selectOption('portrait')
  await page.getByRole('link', { name: 'Plants + Locations', exact: true }).click(); await ready()
  await expect(format()).toHaveValue('fixed'); await expect(sort()).toHaveValue('plant-id')
  await format().selectOption('fixed'); await orientation().selectOption('portrait')
  await sort().selectOption('added-oldest'); await page.getByRole('button', { name: 'Sort', exact: true }).click(); await ready()
  await page.getByRole('link', { name: 'Plants', exact: true }).click(); await ready()
  await expect(format()).toHaveValue('sheet'); await expect(orientation()).toHaveValue('landscape'); await expect(sort()).toHaveValue('added-newest')
  await page.reload(); await ready(); await expect(format()).toHaveValue('sheet')
  await page.locator('input[name="id"]').first().check()
  const plantDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export selected PDF', exact: true }).click()
  const plantDownload = await plantDownloadPromise
  const plantRequest = new URL(plantDownload.url())
  assert.equal(plantRequest.searchParams.get('sort'), 'added-newest')
  assert.equal(plantRequest.searchParams.get('format'), 'sheet')
  assert.equal(plantRequest.searchParams.get('orientation'), 'landscape')
  const sheetPdf = await context.request.get(plantDownload.url())
  assert.equal(sheetPdf.status(), 200)
  assert.match((await sheetPdf.body()).toString('latin1'), /\/MediaBox \[0 0 792 612\]/)
  plantRequest.searchParams.set('format', 'fixed'); plantRequest.searchParams.set('orientation', 'portrait')
  const fixedPdf = await context.request.get(plantRequest.toString())
  assert.equal(fixedPdf.status(), 200)
  const fixedContent = (await fixedPdf.body()).toString('latin1')
  assert.match(fixedContent, /\/MediaBox \[0 0 90 162\]/)
  assert.match(fixedContent, /\/Subtype \/Image/, 'QR image remains embedded')
  await page.getByRole('link', { name: 'Locations', exact: true }).click(); await ready()
  await page.goto(`${base}/c/${collection.slug}/plants`)
  await page.goto(path); await ready()
  assert.equal(new URL(page.url()).searchParams.get('target'), 'locations')
  await expect(format()).toHaveValue('brother-dk-2210'); await expect(orientation()).toHaveValue('portrait')
  const state = await context.storageState()
  const reopened = await browser.newContext({ storageState: state })
  const reopenedPage = await reopened.newPage(); await reopenedPage.goto(path)
  await expect(reopenedPage.getByRole('combobox', { name: 'Print format', exact: true })).toHaveValue('brother-dk-2210')
  await reopened.close()
  // Actual PDF request uses the restored controls and keeps the Brother tape width.
  await page.locator('input[name="id"]').first().check()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export selected PDF', exact: true }).click()
  const download = await downloadPromise
  const request = new URL(download.url())
  assert.equal(request.searchParams.get('format'), 'brother-dk-2210')
  assert.equal(request.searchParams.get('orientation'), 'portrait')
  const pdf = await context.request.get(download.url())
  assert.equal(pdf.status(), 200)
  const bytes = await pdf.body(); assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
  assert.match(bytes.toString('latin1'), /\/MediaBox \[0 0 82\.2857/)
  // A second tab updates Locations; edits in this tab preserve that category.
  await page.evaluate(({ key }) => { const value = JSON.parse(localStorage.getItem(key)); value.categories.locations.orientation='landscape'; localStorage.setItem(key, JSON.stringify(value)) }, { key })
  await page.getByRole('link', { name: 'Plants', exact: true }).click(); await ready()
  await orientation().selectOption('portrait')
  assert.equal((await saved()).categories.locations.orientation, 'landscape')
  await page.evaluate(key => localStorage.setItem(key, '{broken'), key)
  await page.goto(path); await ready(); await expect(format()).toHaveValue('fixed'); await expect(sort()).toHaveValue('plant-id')
  assert.equal((await saved()).version, 1)
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, lastCategory: 'both', categories: { both: { format: 'removed', orientation: 'portrait', sort: 'added-oldest' } } })), key)
  await page.goto(path); await ready(); await expect(format()).toHaveValue('fixed'); await expect(orientation()).toHaveValue('portrait'); await expect(sort()).toHaveValue('added-oldest')
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 99, lastCategory: 'both' })), key)
  await page.goto(path); await ready(); await expect(sort()).toHaveValue('plant-id')
  const blocked = await browser.newContext(); await blocked.addCookies([{ name: 'axildb_session', value: token, url: base }])
  await blocked.addInitScript(() => {
    // Isolate label storage failures from unrelated theme/sidebar preferences.
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem
    Storage.prototype.getItem = function(key) { if (key.startsWith('axildb:plant-label-pdf-preferences:')) throw new Error('Storage disabled'); return get.call(this, key) }
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('axildb:plant-label-pdf-preferences:')) throw new Error('Storage disabled'); return set.call(this, key, value) }
  })
  const blockedPage = await blocked.newPage(); await blockedPage.goto(path)
  await expect(blockedPage.getByRole('combobox', { name: 'Print format', exact: true })).toBeVisible()
  await blockedPage.getByRole('combobox', { name: 'Print format', exact: true }).selectOption('brother-dk-2210')
  await expect(blockedPage.getByRole('combobox', { name: 'Print format', exact: true })).toHaveValue('brother-dk-2210')
  await blocked.close()
  for (const width of [320, 375, 390, 1280]) {
    await page.setViewportSize({ width, height: 850 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `overflow at ${width}`)
  }
  assert.deepEqual(errors, [])
  console.log('Label preference browser checks passed: applied sorting, independent categories, refresh/navigation/browser restoration, PDF parameters and Brother dimensions, malformed/stale/blocked storage, multiple-tab merge, hydration and mobile layouts.')
} catch (error) { console.error(output.slice(-10000)); throw error }
finally {
  await browser?.close()
  if (app?.pid) { try { process.kill(-app.pid, 'SIGTERM') } catch {} }
  if (collection) await db.collection.delete({ where: { id: collection.id } })
  if (user) await db.user.delete({ where: { id: user.id } })
  await db.$disconnect()
}
