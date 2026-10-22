import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'

const db = new PrismaClient()
const base = process.env.PLANT_LAYOUT_TEST_URL || 'http://localhost:3107'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const collection = await db.collection.create({ data: { name: 'Definition layout checks', slug: `layout-${randomUUID()}`, aiFeaturesEnabled: true, aiCuratorEnabled: true, visibility: 'PUBLIC' } })
const user = await db.user.create({ data: { email: `layout-${randomUUID()}@example.test`, passwordHash: 'fixture', role: 'SERVER_ADMIN', emailVerifiedAt: new Date(), twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture' } } } })
try {
  await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } })
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), twoFactorVerifiedAt: new Date() } })
  const definitions = []
  for (let index = 0; index < 12; index++) {
    definitions.push(await db.plantDefinition.create({ data: {
      collectionId: collection.id, genus: 'Layoutplant', species: `specimen${String(index).padStart(2, '0')}`,
      ...(index === 0 ? {
        cultivarName: 'A particularly long variegated cultivar name', authority: '(Linden & André) G.S.Bunting',
        description: 'A climbing tropical plant with heart-shaped leaves and mottled green foliage. '.repeat(5),
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Plant', inaturalistUrl: 'https://www.inaturalist.org', powoUrl: 'https://powo.science.kew.org', gbifUrl: 'https://www.gbif.org',
        aliases: { create: Array.from({ length: 6 }, (_, i) => ({ collectionId: collection.id, name: `Long botanical alias number ${i}` })) },
        husbandryGuide: { create: { collectionId: collection.id, summaryWater: 'Assess moisture before watering', summaryLight: 'Bright indirect light', toxicityPets: 'Toxic if ingested' } },
      } : {}),
    } }))
  }
  const firstId = definitions[0].id
  for (let i = 0; i < 4; i++) {
    const tag = await db.plantTag.create({ data: { collectionId: collection.id, name: `Foliage trait ${i}`, slug: `trait-${i}` } })
    await db.plantDefinitionTag.create({ data: { collectionId: collection.id, plantDefinitionId: firstId, plantTagId: tag.id } })
  }
  await db.photo.create({ data: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId: firstId, filename: 'splash-bloom.png', path: '/splash-bloom.png', isType: true, moderationStatus: 'APPROVED' } })
  await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: firstId, plantId: 'LAYOUT-001', instanceType: 'ACQUIRED' } })
  await db.aiCuratorSuggestion.create({ data: { collectionId: collection.id, plantDefinitionId: firstId, phase: 'ENRICHMENT', suggestionType: 'FIELD_UPDATE', title: 'Fixture suggestion', suggestedValue: 'Fixture', reasoning: 'Layout fixture' } })
  await db.aiCuratorJob.create({ data: { collectionId: collection.id, plantDefinitionId: firstId, phase: 'ENRICHMENT', jobType: 'DEFINITION_RESEARCH', status: 'WAITING_FOR_HUMAN' } })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'axildb_session', value: token, url: base }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const url = `${base}/c/${collection.slug}/plants`
  await page.goto(url)
  const cards = page.locator('[data-plant-definition-card]')
  await expect(cards).toHaveCount(12)
  const first = page.locator(`[data-plant-definition-card="${firstId}"]`)
  await expect(first.getByText('AI has prepared suggestions', { exact: true })).toBeVisible()
  await expect(first.getByText('AI Curator is waiting for human input', { exact: true })).toBeVisible()
  await expect(first.getByRole('progressbar')).toBeVisible()
  await expect(first.getByText(/Aliases:/)).toBeVisible()
  await expect(first.getByText('Foliage trait 0', { exact: true })).toBeVisible()
  await expect(cards.last().getByText('No instances', { exact: true })).toBeVisible()

  const measure = () => cards.evaluateAll(nodes => nodes.map(node => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } }
    return { card: rect(node), content: rect(node.querySelector('[data-plant-definition-content]')), footer: rect(node.querySelector('[data-plant-definition-footer]')), toolbar: rect(node.querySelector('[data-plant-definition-toolbar]')), image: rect(node.firstElementChild), actions: [...node.querySelectorAll('[data-plant-definition-toolbar] a, [data-plant-definition-toolbar] button')].map(rect) }
  }))
  const rowsOf = entries => {
    const rows = []
    entries.forEach(entry => { const row = rows.find(row => Math.abs(row[0].card.y - entry.card.y) < 1); if (row) row.push(entry); else rows.push([entry]) })
    return rows
  }
  for (const width of [2400, 1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 })
    const entries = await measure(), rows = rowsOf(entries)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}`)
    for (const row of rows) for (const entry of row) {
      assert.ok(Math.abs(entry.card.height - row[0].card.height) <= 1, `Equal heights within row at ${width}`)
      assert.ok(Math.abs(entry.footer.bottom - row[0].footer.bottom) <= 1, `Bottom actions align at ${width}`)
      assert.ok(Math.abs(entry.content.width - entry.footer.width) <= 1, 'Botanical information occupies the full content width')
      assert.ok(Math.abs(entry.image.width / entry.image.height - 4 / 3) < 0.02, 'Images retain 4:3 aspect ratio')
      assert.ok(entry.actions.every(action => Math.abs(action.y - entry.actions[0].y) <= 1), `Primary actions form a horizontal toolbar at ${width}`)
      for (const action of entry.actions) {
        assert.ok(action.x >= entry.card.x && action.x + action.width <= entry.card.x + entry.card.width + 1, `Toolbar fits at ${width}`)
        assert.ok(action.y >= entry.image.bottom - 1 && action.bottom <= entry.content.y + 1, 'Toolbar sits between image and botanical information')
      }
    }
    if (width === 2400) {
      assert.equal(rows[0].length, 5, 'Existing dense desktop column count is retained')
      assert.ok(rows[0][0].card.height > rows[1][0].card.height + 80, 'Sparse second row does not inherit the rich first row height')
      const secondHeight = rows[1][0].card.height
      await first.locator('[data-plant-definition-content]').evaluate(node => { const extra = document.createElement('p'); extra.dataset.layoutFixture = ''; extra.style.height = '100px'; extra.textContent = 'New dynamic metadata'; node.append(extra) })
      const changed = rowsOf(await measure())
      assert.ok(changed[0][0].card.height >= rows[0][0].card.height + 99, 'Dynamic content expands its own row')
      assert.ok(Math.abs(changed[1][0].card.height - secondHeight) <= 1, 'Dynamic content leaves other row heights independent')
      await page.locator('[data-layout-fixture]').evaluate(node => node.remove())
      await page.locator('[data-plant-definition-grid]').screenshot({ path: '/tmp/axildb-definition-grid-desktop.png' })
    }
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await first.screenshot({ path: `/tmp/axildb-definition-card-${theme}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1100 })
  await first.getByRole('link', { name: 'Edit', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(first.getByRole('button', { name: 'Research Now', exact: true })).toBeFocused()
  await first.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForURL(`**/plants/${firstId}/edit`)
  await page.goto(url)
  await first.getByRole('link', { name: 'See full husbandry', exact: true }).click()
  await page.waitForURL(`**/plants/${firstId}/husbandry`)
  await page.goto(url)
  await first.getByRole('link', { name: /View instances/ }).click()
  await page.waitForURL(`**/instances?definition=${firstId}`)
  await page.goto(url)
  await first.getByRole('button', { name: 'Follow type · 0', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Following type · 1', exact: true })).toBeVisible()
  await first.getByRole('button', { name: 'Following type · 1', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Follow type · 0', exact: true })).toBeVisible()
  await cards.nth(1).getByRole('button', { name: 'Research Now', exact: true }).click()
  await expect(page.getByText('AI Curator research was queued for that plant definition.', { exact: true })).toBeVisible()
  assert.ok(await db.aiCuratorJob.count({ where: { collectionId: collection.id, plantDefinitionId: definitions[1].id } }))
  await page.getByLabel('Sort', { exact: true }).selectOption('nameDesc')
  await page.locator('form').filter({ has: page.getByLabel('Sort', { exact: true }) }).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(cards.first()).toHaveAttribute('data-plant-definition-card', definitions[11].id)
  await page.locator(`[data-plant-definition-card="${definitions[11].id}"]`).getByRole('button', { name: 'Copy', exact: true }).click()
  await page.waitForURL(/\/plants\/[^/]+\/edit/)
  assert.equal(await db.plantDefinition.count({ where: { collectionId: collection.id } }), 13)
  await page.goto(`${url}?q=specimen00`)
  await expect(cards).toHaveCount(1)
  const anonymous = await browser.newContext()
  const visitor = await anonymous.newPage()
  await visitor.goto(url)
  await expect(visitor.locator('[data-plant-definition-card]')).toHaveCount(13)
  await expect(visitor.locator('[data-plant-definition-toolbar]')).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log('Definition cards: independent equal-height rows, dynamic content, 5-column desktop density, responsive toolbar/full-width content, image ratio, footer alignment, themes, metadata/statuses, edit/research/copy, husbandry/instances, follow/unfollow, filters, and visitor permissions passed.')
} finally {
  await browser.close()
  await db.collection.delete({ where: { id: collection.id } })
  await db.user.delete({ where: { id: user.id } })
  await db.$disconnect()
}
