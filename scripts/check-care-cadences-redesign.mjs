import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const base = process.env.AXILDB_CADENCE_TEST_URL || 'http://localhost:3107'
const db = new PrismaClient(),
  browser = await chromium.launch({ channel: 'chrome' })
let collectionId, userId, viewerId
try {
  const stamp = Date.now()
  const c = await db.collection.create({
    data: { name: 'Cadence design fixture', slug: `cadence-design-${stamp}` },
  })
  collectionId = c.id
  const user = await db.user.create({
    data: {
      email: `cadence-design-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
      role: 'SERVER_ADMIN',
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  userId = user.id
  await db.collectionMembership.create({
    data: { collectionId, userId, role: 'MANAGER', status: 'ACTIVE' },
  })
  const d = await db.plantDefinition.create({
    data: {
      collectionId,
      genus: 'Hoya',
      species: 'carnosa',
      careCadences: {
        create: [
          { activity: 'WATERING', interval: 7, unit: 'DAY' },
          { activity: 'REPOTTING', interval: 12, unit: 'MONTH' },
        ],
      },
    },
  })
  const proposal = await db.careCadenceProposal.create({
    data: {
      plantDefinitionId: d.id,
      activity: 'WATERING',
      interval: 7,
      unit: 'DAY',
      approvedInterval: 7,
      approvedUnit: 'DAY',
      confidence: 'MEDIUM',
      rationale: 'Retain research provenance',
      applicability: 'RECOMMENDED',
      sourceReferences: [],
      source: 'AI_RESEARCH',
      status: 'APPROVED',
      reviewedByUserId: userId,
    },
  })
  const instance = await db.plantInstance.create({
    data: {
      collectionId,
      plantDefinitionId: d.id,
      plantId: 'DESIGN-1',
      instanceType: 'ACQUIRED',
      careCadenceOverrides: {
        create: [
          { activity: 'WATERING', mode: 'OVERRIDE', interval: 3, unit: 'DAY' },
          { activity: 'REPOTTING', mode: 'DISABLED' },
        ],
      },
    },
  })
  async function signed(id, verified = false) {
    const token = randomBytes(32).toString('hex')
    await db.session.create({
      data: {
        userId: id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        ...(verified ? { twoFactorVerifiedAt: new Date() } : {}),
      },
    })
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    await ctx.addCookies([{ name: 'axildb_session', value: token, url: base }])
    return ctx
  }
  const ctx = await signed(userId, true),
    page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const prefix = `${base}/c/${c.slug}`,
    definitionUrl = `${prefix}/plants/${d.id}/husbandry`
  await page.goto(definitionUrl)
  const panel = page.locator('#care-cadences'),
    tile = (activity) => panel.locator(`[data-cadence-activity="${activity}"]`)
  await expect(panel.locator('[data-cadence-activity]')).toHaveCount(6)
  await expect(tile('WATERING')).toContainText('Every 7 days')
  await expect(tile('REPOTTING')).toContainText('Every 12 months')
  await expect(tile('PRUNING')).toContainText('Not scheduled')
  await expect(tile('FERTILIZING')).toContainText('Recipe required')
  await expect(tile('FERTILIZING')).toHaveAttribute(
    'href',
    `/c/${c.slug}/plants/${d.id}/edit#husbandry`
  )
  await expect(
    panel.getByRole('button', { name: /Edit fertilizing cadence/ })
  ).toHaveCount(0)
  assert.equal(
    await panel
      .locator('.care-cadences-grid')
      .evaluate(
        (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length
      ),
    3
  )
  assert.ok(
    (await panel.boundingBox()).height <= 340,
    'Desktop module should be compact'
  )
  await tile('WATERING').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog'),
    water = dialog.getByRole('group', { name: 'Watering', exact: true })
  await expect(
    dialog.getByRole('group', { name: 'Repotting', exact: true })
  ).toHaveCount(0)
  await water.getByLabel('Every', { exact: true }).fill('9')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(tile('WATERING')).toBeFocused()
  assert.equal(
    (
      await db.plantDefinitionCareCadence.findFirst({
        where: { plantDefinitionId: d.id, activity: 'WATERING' },
      })
    ).interval,
    7
  )
  await page.keyboard.press('Space')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await tile('WATERING').click()
  await water.getByLabel('Every', { exact: true }).fill('10')
  await db.plantDefinitionCareCadence.update({
    where: {
      plantDefinitionId_activity: {
        plantDefinitionId: d.id,
        activity: 'REPOTTING',
      },
    },
    data: { interval: 24 },
  })
  await dialog
    .getByRole('button', { name: 'Save cadence', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(tile('WATERING')).toContainText('Every 10 days')
  assert.equal(
    (
      await db.plantDefinitionCareCadence.findFirst({
        where: { plantDefinitionId: d.id, activity: 'REPOTTING' },
      })
    ).interval,
    24,
    'Individual save must not overwrite concurrently changed activities'
  )
  await tile('WATERING').click()
  await water.getByLabel('Every', { exact: true }).fill('11')
  // A dependency changing after the editor opens produces a real server-side validation error.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  const recipe = await db.fertilizerRecipe.create({
    data: { collectionId, name: 'Design recipe' },
  })
  await db.plantHusbandryGuide.create({
    data: {
      collectionId,
      plantDefinitionId: d.id,
      fertilizerRecipeId: recipe.id,
    },
  })
  await page.reload()
  await tile('FERTILIZING').click()
  const fert = dialog.getByRole('group', { name: 'Fertilizing', exact: true })
  await fert.getByLabel('Schedule').selectOption('OVERRIDE')
  await fert.getByLabel('Every', { exact: true }).fill('2')
  await fert.getByLabel('Unit').selectOption('WEEK')
  await expect(fert.getByLabel('Unit')).toHaveValue('WEEK')
  await db.plantHusbandryGuide.update({
    where: { plantDefinitionId: d.id },
    data: { fertilizerRecipeId: null },
  })
  await dialog
    .getByRole('button', { name: 'Save cadence', exact: true })
    .click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Assign an active fertilizer recipe'
  )
  await expect(fert.getByLabel('Every', { exact: true })).toHaveValue('2')
  await expect(fert.getByLabel('Unit')).toHaveValue('WEEK')
  assert.equal(
    await db.plantDefinitionCareCadence.count({
      where: { plantDefinitionId: d.id, activity: 'FERTILIZING' },
    }),
    0
  )
  await db.plantHusbandryGuide.update({
    where: { plantDefinitionId: d.id },
    data: { fertilizerRecipeId: recipe.id },
  })
  await dialog
    .getByRole('button', { name: 'Save cadence', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(tile('FERTILIZING')).toContainText('Every 2 weeks')
  await panel.getByRole('button', { name: 'Edit all care cadences' }).click()
  await expect(dialog.locator('legend')).toHaveCount(6)
  await dialog
    .getByRole('group', { name: 'Pruning', exact: true })
    .getByLabel('Schedule')
    .selectOption('OVERRIDE')
  await dialog
    .getByRole('group', { name: 'Pruning', exact: true })
    .getByLabel('Every', { exact: true })
    .fill('6')
  await dialog
    .getByRole('group', { name: 'Pruning', exact: true })
    .getByLabel('Unit')
    .selectOption('MONTH')
  await dialog
    .getByRole('button', { name: 'Save cadences', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(tile('PRUNING')).toContainText('Every 6 months')
  // Container breakpoints work even inside a narrow desktop column.
  for (const [width, columns] of [
    [850, 3],
    [550, 2],
    [300, 1],
  ]) {
    await panel.evaluate((el, width) => {
      el.style.width = `${width}px`
      el.style.maxWidth = '100%'
    }, width)
    assert.equal(
      await panel
        .locator('.care-cadences-grid')
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length
        ),
      columns
    )
  }
  await panel.evaluate((el) => el.style.removeProperty('width'))
  for (const [width, theme] of [
    [1440, 'light'],
    [768, 'light'],
    [390, 'light'],
    [320, 'light'],
    [1440, 'dark'],
    [390, 'dark'],
  ]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme
    )
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      `Overflow ${width} ${theme}`
    )
    if (width === 1440 || width === 390)
      await panel.screenshot({
        path: `/tmp/axildb-cadence-grid-${width}-${theme}.png`,
        caret: 'initial',
      })
  }
  const empty = await db.plantDefinition.create({
    data: { collectionId, genus: 'Unscheduled' },
  })
  await page.goto(`${prefix}/plants/${empty.id}/husbandry`)
  await expect(panel.locator('[data-cadence-activity]')).toHaveCount(6)
  await expect(panel.getByText('Not scheduled', { exact: true })).toHaveCount(5)
  await expect(tile('FERTILIZING')).toContainText('Recipe required')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${prefix}/instances/${instance.id}`)
  await expect(tile('WATERING')).toContainText('Every 3 days')
  await expect(tile('WATERING')).toContainText('Custom')
  await expect(tile('REPOTTING')).toContainText('Disabled for this instance')
  await tile('WATERING').click()
  await dialog.getByRole('button', { name: 'Reset to definition' }).click()
  await dialog
    .getByRole('button', { name: 'Save cadence', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(tile('WATERING')).toContainText('Every 10 days')
  await expect(tile('WATERING')).toContainText('From definition')
  assert.equal(
    await db.plantInstanceCareCadenceOverride.count({
      where: {
        plantInstanceId: instance.id,
        activity: 'REPOTTING',
        mode: 'DISABLED',
      },
    }),
    1
  )
  assert.equal(
    (await db.careCadenceProposal.findUnique({ where: { id: proposal.id } }))
      .status,
    'APPROVED'
  )
  assert.equal(
    await db.plantCareEvent.count({ where: { plantInstanceId: instance.id } }),
    0
  )
  const viewer = await db.user.create({
    data: {
      email: `cadence-viewer-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
    },
  })
  viewerId = viewer.id
  await db.collectionMembership.create({
    data: { collectionId, userId: viewerId, role: 'VIEWER', status: 'ACTIVE' },
  })
  const readonly = await (await signed(viewerId)).newPage()
  await readonly.goto(definitionUrl)
  await expect(
    readonly.locator('#care-cadences [data-cadence-activity]')
  ).toHaveCount(6)
  await expect(
    readonly.locator('#care-cadences').getByRole('button')
  ).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log(
    'Cadence grid desktop/tablet/narrow-container/mobile/light/dark, keyboard/focus/dialog/cancel, scoped individual save, real dependency failure/retry, bulk save, instance inheritance/disabled overrides, provenance/history and read-only checks passed.'
  )
} finally {
  await browser.close()
  if (collectionId)
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
      await tx.collection.delete({ where: { id: collectionId } })
    })
  if (userId) await db.user.delete({ where: { id: userId } })
  if (viewerId) await db.user.delete({ where: { id: viewerId } })
  await db.$disconnect()
}
