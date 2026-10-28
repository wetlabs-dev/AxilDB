import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'

const database = new URL(process.env.DATABASE_URL || '')
assert.ok(database.hostname === 'localhost' && database.port === '55439' && database.pathname === '/axildb', 'Disposable database only')
const base = process.env.AXILDB_PHOTO_TEST_URL || 'http://localhost:3107'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const db = new PrismaClient(), browser = await chromium.launch({ channel: 'chrome', headless: true })
let collection, users = []
const files = new Set(), errors = []
const bytes = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#70a070' } }).png().toBuffer()
try {
  collection = await db.collection.create({ data: { name: 'Photo queue test', slug: `photo-ui-${randomUUID()}` } })
  const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Photo', species: 'testii', careCadences: { create: { activity: 'WATERING', interval: 7, unit: 'DAY' } } } })
  const kind = await db.locationType.create({ data: { collectionId: collection.id, name: 'Room', abbreviation: 'RM' } })
  const location = await db.location.create({ data: { collectionId: collection.id, locationTypeId: kind.id, code: 'ROOM', name: 'Photo shelf' } })
  const plant = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'PHOTO-001', instanceType: 'ACQUIRED', currentLocationId: location.id } })
  const other = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'PHOTO-002', instanceType: 'ACQUIRED', currentLocationId: location.id } })
  for (const instance of [plant, other]) await db.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: instance.id, eventType: 'WATERED', performedAt: new Date(Date.now() - 20 * 86400000) } })
  async function login(role) {
    const user = await db.user.create({ data: { email: `photo-${randomUUID()}@example.test`, passwordHash: 'fixture', emailVerifiedAt: new Date(), twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture' } } } }); users.push(user.id)
    await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role, status: 'ACTIVE' } })
    const token = randomBytes(32).toString('hex')
    await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), twoFactorVerifiedAt: new Date() } })
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await context.addCookies([{ name: 'axildb_session', value: token, url: base }]); return context
  }
  const context = await login('MANAGER'), page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.photoUrls = { created: 0, revoked: 0 }
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = blob => { window.photoUrls.created++; return create(blob) }
    URL.revokeObjectURL = url => { window.photoUrls.revoked++; return revoke(url) }
  })
  const queue = `${base}/c/${collection.slug}/care?filter=today&location=${location.id}&q=PHOTO`
  await page.goto(queue)
  const row = page.locator(`[data-care-key="WATER:${plant.id}"]`), secondRow = page.locator(`[data-care-key="WATER:${other.id}"]`)
  const camera = () => row.getByRole('button', { name: /Add (progress )?photo to PHOTO-001/ }).filter({ visible: true })
  await expect(camera()).toBeVisible()
  await row.getByRole('button', { name: 'Details', exact: true }).filter({ visible: true }).click()
  const note = row.getByLabel('Quick note', { exact: true }).filter({ visible: true })
  await note.fill('Preserve this care note')
  const initialEvents = await db.plantCareEvent.count({ where: { collectionId: collection.id } })
  const initialCadence = await db.plantDefinitionCareCadence.findMany({ where: { plantDefinitionId: definition.id } })
  let rsc = 0, queueReads = 0
  page.on('request', request => { if (request.url().includes('_rsc=')) rsc++; if (request.url().includes('/api/care-queue')) queueReads++ })
  async function open() { await camera().click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('button', { name: 'Save photo', exact: true })).toBeVisible() }
  const dialog = page.getByRole('dialog')
  await open()
  await expect(dialog.getByRole('heading', { name: 'Add plant photo' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(camera()).toBeFocused()
  assert.equal(await db.photo.count({ where: { collectionId: collection.id } }), 0)
  await open()
  await dialog.locator('input[name=photo]').setInputFiles({ name: 'plant.png', mimeType: 'image/png', buffer: bytes })
  await dialog.getByLabel('Photo note (optional)', { exact: true }).fill('First photograph')
  await dialog.getByLabel('Source (optional)', { exact: true }).fill('Own camera')
  await dialog.getByRole('slider', { name: /Crop/ }).press('ArrowRight')
  const networkBefore = { rsc, queueReads }, urlBefore = page.url()
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click()
  await expect(dialog).toBeHidden()
  const first = await db.photo.findFirstOrThrow({ where: { entityId: plant.id } }); files.add(first.filename)
  assert.equal(first.isCover, true); assert.equal(first.caption, 'First photograph'); assert.equal(first.source, 'Own camera'); assert.ok(first.cropWidth < 100)
  await expect(row.locator('img').filter({ visible: true }).first()).toHaveAttribute('src', first.path)
  assert.equal(page.url(), urlBefore); assert.deepEqual({ rsc, queueReads }, networkBefore)
  await expect(note).toHaveValue('Preserve this care note')
  await expect(secondRow.getByRole('button', { name: /Add photo to PHOTO-002/ }).filter({ visible: true })).toBeVisible()
  await open(); await expect(dialog.getByRole('heading', { name: 'Add progress photo' })).toBeVisible()
  await expect(dialog.getByLabel('Set as representative photo', { exact: true })).not.toBeChecked()
  await dialog.locator('input[name=photo]').setInputFiles({ name: 'progress.png', mimeType: 'image/png', buffer: bytes })
  await dialog.getByLabel('Photo note (optional)', { exact: true }).fill('New leaf')
  // A server rejection preserves both selected file and metadata.
  await page.route('**/api/photos', route => route.fulfill({ status: 500, json: { error: 'Controlled photo failure' } }), { times: 1 })
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Controlled photo failure')
  await expect(dialog.getByLabel('Photo note (optional)', { exact: true })).toHaveValue('New leaf')
  assert.equal(await dialog.locator('input[name=photo]').evaluate(input => input.files.length), 1)
  // Server commits but the upload response is lost. The same durable upload ID reconciles on retry.
  await page.route('**/api/photos', async route => { const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed') }, { times: 1 })
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click()
  await expect(dialog).toBeHidden()
  assert.equal(await db.photo.count({ where: { entityId: plant.id } }), 2)
  assert.equal((await db.photo.findUniqueOrThrow({ where: { id: first.id } })).isCover, true)
  await expect(row.locator('img').filter({ visible: true }).first()).toHaveAttribute('src', first.path)
  // Explicit promotion preserves every previous photograph.
  await open()
  await dialog.locator('input[name=photo]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: bytes })
  await dialog.getByLabel('Set as representative photo', { exact: true }).check()
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click(); await expect(dialog).toBeHidden()
  const promoted = await db.photo.findFirstOrThrow({ where: { entityId: plant.id, isCover: true } })
  assert.notEqual(promoted.id, first.id); assert.equal(await db.photo.count({ where: { entityId: plant.id } }), 3)
  await expect(row.locator('img').filter({ visible: true }).first()).toHaveAttribute('src', promoted.path)
  await open(); await dialog.getByText('Choose an existing representative photo', { exact: true }).click()
  await dialog.getByRole('button', { name: 'Use First photograph as representative', exact: true }).click(); await expect(dialog).toBeHidden()
  await expect(row.locator('img').filter({ visible: true }).first()).toHaveAttribute('src', first.path)
  assert.equal(await db.plantCareEvent.count({ where: { collectionId: collection.id } }), initialEvents)
  assert.deepEqual(await db.plantDefinitionCareCadence.findMany({ where: { plantDefinitionId: definition.id } }), initialCadence)
  assert.equal(await db.photo.count({ where: { entityType: 'PLANT_DEFINITION', entityId: definition.id } }), 0)
  assert.deepEqual(await page.evaluate(() => window.photoUrls), { created: 3, revoked: 3 })
  await page.screenshot({ path: '/tmp/axildb-care-photo-desktop.png' })
  // Narrow viewport, capture choice, focus, no overflow, invalid file and Escape cancellation.
  await page.setViewportSize({ width: 390, height: 844 }); await open()
  await expect(dialog.locator('input[capture=environment]')).toBeVisible()
  assert.ok(await dialog.evaluate(element => element.getBoundingClientRect().width <= innerWidth))
  await page.screenshot({ path: '/tmp/axildb-care-photo-mobile.png' })
  await dialog.locator('input[name=photo]').setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click(); await expect(dialog.getByRole('alert').last()).toContainText('Choose a JPEG')
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(camera()).toBeFocused()
  // A photo upload must preserve an already pending optimistic care action.
  await page.setViewportSize({ width: 1400, height: 900 })
  let held
  await page.route('**/api/care-queue', async route => { if (route.request().method() === 'POST') held = route; else await route.continue() })
  await secondRow.getByRole('button', { name: 'Complete', exact: true }).filter({ visible: true }).first().click()
  await expect(secondRow).toBeHidden(); await expect.poll(() => Boolean(held)).toBe(true)
  await open()
  await dialog.locator('input[name=photo]').setInputFiles({ name: 'library.png', mimeType: 'image/png', buffer: bytes })
  await dialog.locator('input[name=photoCapture]').setInputFiles({ name: 'camera.png', mimeType: 'image/png', buffer: bytes })
  assert.deepEqual(await dialog.locator('form').evaluate(form => [...new FormData(form)].filter(([, value]) => value instanceof File).map(([key]) => key)), ['photoCapture'])
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click(); await expect(dialog).toBeHidden()
  await expect(secondRow).toBeHidden()
  assert.equal(await db.plantCareEvent.count({ where: { collectionId: collection.id } }), initialEvents)
  await held.continue()
  await expect.poll(() => db.plantCareEvent.count({ where: { collectionId: collection.id } })).toBe(initialEvents + 1)
  await page.unroute('**/api/care-queue')
  const logger = await login('LOGGER'), viewer = await login('VIEWER')
  const viewerPage = await viewer.newPage(); await viewerPage.goto(queue)
  await expect(viewerPage.getByRole('button', { name: /Add (progress )?photo to PHOTO/ })).toHaveCount(0)
  const upload = (clientUploadId, extras = {}) => ({ collectionSlug: collection.slug, entityType: 'PLANT_INSTANCE', entityId: plant.id, clientUploadId, photo: { name: 'api.png', mimeType: 'image/png', buffer: bytes }, ...extras })
  const headers = { Origin: base, Accept: 'application/json' }
  assert.equal((await viewer.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID()) })).status(), 403)
  assert.equal((await logger.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID(), { setRepresentative: 'on' }) })).status(), 403)
  assert.equal((await context.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID(), { entityId: 'wrong-collection-target' }) })).status(), 400)
  assert.equal((await context.request.post(`${base}/api/photos`, { headers: { ...headers, Origin: 'https://evil.example' }, multipart: upload(randomUUID()) })).status(), 403)
  // Concurrent identical requests must create one photo; twenty sequential uploads retain the cover.
  const failedDecode = await context.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID(), { photo: { name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('Not an image') } }) })
  assert.equal(failedDecode.status(), 400)
  // Other existing photo targets keep their processing and representative rules.
  const definitionUpload = await context.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID(), { entityType: 'PLANT_DEFINITION', entityId: definition.id }) })
  assert.equal(definitionUpload.status(), 200)
  assert.equal((await db.photo.findFirstOrThrow({ where: { entityType: 'PLANT_DEFINITION', entityId: definition.id } })).isType, true)
  const bloom = await db.bloomEvent.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, bloomStartDate: new Date() } })
  assert.equal((await context.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID(), { entityType: 'BLOOM_EVENT', entityId: bloom.id }) })).status(), 200)
  // Legacy instance photos may have no designated cover: preserve the displayed newest photo.
  const legacy = await db.photo.create({ data: { collectionId: collection.id, entityType: 'PLANT_INSTANCE', entityId: other.id, filename: 'fixture-not-written.jpg', path: '/uploads/fixture-not-written.jpg', caption: 'Legacy gallery photo' } })
  assert.equal((await logger.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID(), { entityId: other.id }) })).status(), 200)
  assert.equal((await db.photo.findUniqueOrThrow({ where: { id: legacy.id } })).isCover, true)
  const repeat = randomUUID()
  const responses = await Promise.all([1, 2].map(() => logger.request.post(`${base}/api/photos`, { headers, multipart: upload(repeat) })))
  assert.ok(responses.every(response => response.status() === 200)); assert.equal(await db.photo.count({ where: { id: repeat } }), 1)
  for (let i = 0; i < 20; i++) assert.equal((await logger.request.post(`${base}/api/photos`, { headers, multipart: upload(randomUUID()) })).status(), 200)
  assert.equal((await db.photo.findUniqueOrThrow({ where: { id: first.id } })).isCover, true)
  // Existing native instance-detail form still uses the same processor and redirect behavior.
  await page.goto(`${base}/c/${collection.slug}/instances/${plant.id}`)
  await page.getByText('Upload specimen photo', { exact: true }).click()
  const native = page.locator('form[action="/api/photos"]').filter({ has: page.locator('input[name=entityType][value=PLANT_INSTANCE]') })
  await native.locator('input[name=photo]').setInputFiles({ name: 'detail.png', mimeType: 'image/png', buffer: bytes })
  await native.getByLabel('Photo note (optional)', { exact: true }).fill('Detail regression')
  await native.getByRole('button', { name: 'Save photo', exact: true }).click()
  await expect(page.getByText('Detail regression', { exact: true }).first()).toBeVisible()
  assert.deepEqual(errors, [])
  await writeFile('/tmp/axildb-care-photos-result.json', JSON.stringify({ photos: await db.photo.count({ where: { entityId: plant.id } }), careEvents: initialEvents, clientErrors: errors, networkBefore, networkAfterUpload: networkBefore, result: 'passed' }, null, 2))
  console.log('Care photos: initial/progress/explicit cover, existing selection, framing, metadata, rollback, lost-response and concurrent idempotency, 20 uploads, care isolation, queue state, mobile/focus/object URLs, permissions, native detail upload passed.')
} finally {
  if (collection) {
    for (const photo of await db.photo.findMany({ where: { collectionId: collection.id }, select: { filename: true } })) files.add(photo.filename)
    await db.collection.delete({ where: { id: collection.id } })
  }
  files.delete('fixture-not-written.jpg')
  for (const filename of files) await unlink(path.join(process.cwd(), 'public', 'uploads', filename)).catch(() => {})
  for (const id of users) await db.user.delete({ where: { id } })
  await browser.close(); await db.$disconnect()
}
