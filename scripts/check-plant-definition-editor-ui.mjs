import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'

const db = new PrismaClient()
const base = process.env.PLANT_EDITOR_TEST_URL || 'http://localhost:3107'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const collection = await db.collection.create({ data: { name: 'Editor checks', slug: `editor-${randomUUID()}` } })
const user = await db.user.create({ data: { email: `editor-${randomUUID()}@example.test`, passwordHash: 'fixture', role: 'SERVER_ADMIN', emailVerifiedAt: new Date(), twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture' } } } })
try {
  await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } })
  const plant = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Alocasia', cultivarName: 'Frydek Variegated', acquisitionStatus: 'WISHLIST', acquisitionPriority: 4, desiredSpecimenSize: 'Mature', notes: 'Original notes', aliases: { create: { collectionId: collection.id, name: 'Existing alternate name' } } } })
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), twoFactorVerifiedAt: new Date() } })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'axildb_session', value: token, url: base }])
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().split('\n')[0]) })
  const url = `${base}/c/${collection.slug}/plants/${plant.id}/edit`
  await page.goto(url)
  const root = page.locator('[data-definition-editor]'), form = page.locator('#plant-definition-form')
  const title = page.getByRole('heading', { level: 1 })
  await expect(title).toHaveCount(1)
  await expect(title).toHaveText("Alocasia 'Frydek Variegated'")
  await expect(page).toHaveTitle("Alocasia 'Frydek Variegated' — Edit | AxilDB")
  const ids = ['definition-fields', 'definition-readiness', 'care-cadences', 'repotting-windows', 'acquisition-information', 'husbandry', 'definition-photos', 'validation-administration']
  const tops = await root.evaluate((root, ids) => ids.map(id => root.querySelector(`#${id}`).getBoundingClientRect().top), ids)
  assert.ok(tops.every((top, index) => index === 0 || top > tops[index - 1]), 'Required sections appear in order')
  assert.deepEqual((await root.locator('h2').allTextContents()).slice(0, 4).map(s => s.trim()), ['Plant Definition', 'Definition Readiness', 'Care Cadences', 'Repotting Windows'])
  assert.equal(await page.locator('form form').count(), 0, 'No nested forms')
  assert.equal(await form.evaluate(form => new FormData(form).get('desiredSpecimenSize')), 'Mature', 'Relocated acquisition fields still belong to the main form')
  await form.locator('[name="notes"]').fill('Unsaved notes remain')
  await form.locator('[name="cultivarName"]').fill('Silver Dragon')
  await expect(title).toHaveText("Alocasia 'Silver Dragon'")
  await expect(form.locator('[name="cultivarName"]')).toBeFocused()
  await expect(form.locator('[name="notes"]')).toHaveValue('Unsaved notes remain')
  assert.equal((await db.plantDefinition.findUniqueOrThrow({ where: { id: plant.id } })).cultivarName, 'Frydek Variegated', 'Live headings never save data')
  await form.locator('[name="hybridNotation"]').fill('×')
  await expect(title).toHaveText("Alocasia × 'Silver Dragon'")
  await form.locator('[name="provisionalTaxon"]').fill('Unidentified silver aroid')
  await expect(title).toHaveText('Unidentified silver aroid')
  await form.evaluate(form => form.reset())
  await expect(title).toHaveText("Alocasia 'Frydek Variegated'")
  await form.locator('[name="genus"]').fill('')
  await form.locator('[name="cultivarName"]').fill('')
  await expect(title).toHaveText('Untitled Plant Definition')
  await form.evaluate(form => form.reset())
  await form.locator('[name="cultivarName"]').fill('A very long variegated cultivar name that stays compact while editing throughout the page')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => scrollTo(0, 0))
    const compact = page.locator('[data-compact-definition-title]')
    try { await expect(compact).toBeHidden() } catch (error) {
      console.log('Sticky geometry', width, await page.evaluate(() => ({ y: scrollY, heading: document.querySelector('[data-definition-editor] header').getBoundingClientRect().toJSON(), app: document.querySelector('[data-app-mobile-header]').getBoundingClientRect().toJSON() })))
      await page.evaluate(() => scrollTo(0, 0))
    await expect(page.locator('[data-compact-definition-title]')).toBeHidden()
    await page.screenshot({ path: '/tmp/axildb-editor-sticky-debug.png', caret: 'initial' })
      throw error
    }
    const before = await root.locator('#husbandry').evaluate(node => node.getBoundingClientRect().top + scrollY)
    await page.getByRole('navigation', { name: 'Jump to section' }).getByRole('link', { name: 'Plant Husbandry', exact: true }).click()
    await expect(compact).toBeVisible()
    const geometry = await compact.evaluate(node => {
      const r = node.getBoundingClientRect(), app = document.querySelector('[data-app-mobile-header]').getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, height: r.height, appBottom: app.height ? app.bottom : 0, target: document.getElementById('husbandry').getBoundingClientRect().top }
    })
    assert.ok(geometry.top >= geometry.appBottom - 1, `Sticky title clears app header at ${width}`)
    assert.ok(geometry.target >= geometry.bottom - 1, `Anchors clear sticky title at ${width}`)
    assert.ok(geometry.height < 60, 'Compact title remains small')
    assert.equal(await root.locator('#husbandry').evaluate(node => node.getBoundingClientRect().top + scrollY), before, 'Sticky title creates no layout shift')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}`)
    await page.getByRole('navigation', { name: 'Jump to section' }).getByRole('link', { name: 'Images', exact: true }).evaluate(node => node.click())
    await expect(compact).toBeVisible()
  }
  await page.evaluate(() => scrollTo(0, 0))
  await form.locator('[name="cultivarName"]').fill('Saved cultivar')
  await form.locator('[name="notes"]').fill('Preserved notes')
  await page.locator('[name="desiredSpecimenSize"]').fill('Small cutting')
  await page.locator('#acquisition-information').getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect.poll(async () => (await db.plantDefinition.findUniqueOrThrow({ where: { id: plant.id } })).cultivarName).toBe('Saved cultivar')
  const saved = await db.plantDefinition.findUniqueOrThrow({ where: { id: plant.id }, include: { aliases: true } })
  assert.equal(saved.cultivarName, 'Saved cultivar'); assert.equal(saved.desiredSpecimenSize, 'Small cutting'); assert.equal(saved.notes, 'Preserved notes'); assert.equal(saved.acquisitionStatus, 'WISHLIST'); assert.equal(saved.acquisitionPriority, 4); assert.equal(saved.aliases[0].name, 'Existing alternate name')
  await page.goto(url)
  await expect(title).toHaveText("Alocasia 'Saved cultivar'")
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.evaluate(() => scrollTo(0, 0))
    await expect(page.locator('[data-compact-definition-title]')).toBeHidden()
    await page.screenshot({ path: `/tmp/axildb-definition-editor-${theme}.png`, caret: 'initial' })
  }
  assert.deepEqual(errors, [])
  console.log('Definition editor: section order, canonical/live/provisional/fallback/reset names, persisted metadata, retained focus/unsaved values, shared acquisition save, alias preservation, single h1, mobile/desktop sticky offsets, anchors/no layout shift, responsive overflow and themes passed.')
} finally { await browser.close(); await db.collection.delete({ where: { id: collection.id } }); await db.user.delete({ where: { id: user.id } }); await db.$disconnect() }
