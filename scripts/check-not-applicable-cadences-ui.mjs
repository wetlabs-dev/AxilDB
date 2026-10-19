import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const base = 'http://localhost:3107',
  db = new PrismaClient()
const browser = await chromium.launch({ channel: 'chrome' })
let c, user
try {
  const stamp = Date.now()
  c = await db.collection.create({
    data: { name: 'N/A browser test', slug: `na-ui-${stamp}` },
  })
  user = await db.user.create({
    data: {
      email: `na-ui-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
      role: 'SERVER_ADMIN',
      memberships: {
        create: { collectionId: c.id, role: 'MANAGER', status: 'ACTIVE' },
      },
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  const d = await db.plantDefinition.create({
    data: { collectionId: c.id, genus: 'Dionaea', species: 'muscipula' },
  })
  const i = await db.plantInstance.create({
    data: {
      collectionId: c.id,
      plantDefinitionId: d.id,
      plantId: 'N/A-UI',
      instanceType: 'ACQUIRED',
    },
  })
  const token = randomBytes(32).toString('hex')
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3600000),
      twoFactorVerifiedAt: new Date(),
    },
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page
    .context()
    .addCookies([{ name: 'axildb_session', value: token, url: base }])
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(20000)
  const prefix = `${base}/c/${c.slug}`,
    definitionUrl = `${prefix}/plants/${d.id}/husbandry`,
    instanceUrl = `${prefix}/instances/${i.id}`
  const panel = page.locator('#care-cadences'),
    dialog = panel.locator('dialog')
  const tile = (activity) =>
    panel.locator(`[data-cadence-activity="${activity}"]`)
  const edit = async (activity) => {
    await tile(activity).click()
    await expect(dialog).toBeVisible()
  }
  const save = async () => {
    await dialog.getByRole('button', { name: /^Save cadence/ }).click()
    await expect(dialog).toHaveCount(0)
  }
  await page.goto(definitionUrl)
  await edit('FERTILIZING')
  assert.notEqual(
    await dialog
      .getByLabel('Schedule')
      .locator('option[value="OVERRIDE"]')
      .getAttribute('disabled'),
    null
  )
  await dialog.getByLabel('Schedule').selectOption('NOT_APPLICABLE')
  await save()
  await expect(tile('FERTILIZING')).toContainText('Not applicable')
  assert.equal(
    (
      await db.plantDefinitionCareCadence.findFirstOrThrow({
        where: { plantDefinitionId: d.id, activity: 'FERTILIZING' },
      })
    ).interval,
    null
  )
  await edit('WATERING')
  assert.equal(
    await dialog.locator('option[value="NOT_APPLICABLE"]').count(),
    0
  )
  await dialog.getByLabel('Schedule').evaluate((select) => {
    const option = document.createElement('option')
    option.value = 'NOT_APPLICABLE'
    option.text = 'Injected invalid N/A'
    select.append(option)
  })
  await dialog.getByLabel('Schedule').selectOption('NOT_APPLICABLE')
  await dialog
    .getByRole('button', { name: 'Save cadence', exact: true })
    .click()
  // Next.js masks thrown server-action messages in production; verify rejection and unchanged data.
  await expect(dialog.getByRole('alert')).toBeVisible()
  assert.equal(
    await db.plantDefinitionCareCadence.count({
      where: { plantDefinitionId: d.id, activity: 'WATERING' },
    }),
    0
  )
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await panel.getByRole('button', { name: 'Edit all care cadences' }).click()
  for (const [name, mode] of [
    ['Watering', 'OVERRIDE'],
    ['Pest inspection', 'OVERRIDE'],
    ['General inspection', 'OVERRIDE'],
    ['Repotting', 'NOT_APPLICABLE'],
    ['Pruning', 'NOT_APPLICABLE'],
  ]) {
    const group = dialog.getByRole('group', { name, exact: true })
    await group.getByLabel('Schedule').selectOption(mode)
    if (mode === 'OVERRIDE')
      await group.getByLabel('Every', { exact: true }).fill('7')
  }
  await save()
  await expect(panel).toContainText('Complete care schedule')
  await page.goto(instanceUrl)
  await expect(tile('PRUNING')).toContainText('Not applicable')
  await expect(tile('PRUNING')).toContainText('From definition')
  await edit('PRUNING')
  await dialog.getByLabel('Schedule').selectOption('OVERRIDE')
  await dialog.getByLabel('Every', { exact: true }).fill('6')
  await dialog.getByLabel('Unit').selectOption('MONTH')
  await save()
  await expect(tile('PRUNING')).toContainText('Every 6 months')
  await expect(tile('PRUNING')).toContainText('Custom')
  await edit('PRUNING')
  await dialog.getByRole('button', { name: 'Reset to definition' }).click()
  await save()
  await expect(tile('PRUNING')).toContainText('Not applicable')
  assert.equal(
    await db.plantInstanceCareCadenceOverride.count({
      where: { plantInstanceId: i.id, activity: 'PRUNING' },
    }),
    0
  )
  await edit('WATERING')
  await dialog.getByLabel('Schedule').selectOption('DISABLED')
  await save()
  await expect(panel).toContainText('5 of 6 care decisions resolved')
  await page.goto(definitionUrl)
  await edit('REPOTTING')
  await dialog.getByLabel('Schedule').selectOption('OVERRIDE')
  await dialog.getByLabel('Every', { exact: true }).fill('12')
  await dialog.getByLabel('Unit').selectOption('MONTH')
  await save()
  await page.goto(instanceUrl)
  await edit('REPOTTING')
  await dialog.getByLabel('Schedule').selectOption('NOT_APPLICABLE')
  await save()
  await expect(tile('REPOTTING')).toContainText('Not applicable')
  await expect(tile('REPOTTING')).not.toContainText('Next due')
  for (const width of [390, 900, 1440])
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
        document.documentElement.style.colorScheme = theme
      }, theme)
      await panel.screenshot({ path: `/tmp/axildb-na-${width}-${theme}.png` })
      await edit('FERTILIZING')
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      )
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
  await page.setViewportSize({ width: 1280, height: 900 })
  // Real N/A approvals, rejection and mixed bulk batch; current decisions are intentionally cleared first.
  await db.plantDefinitionCareCadence.deleteMany({
    where: {
      plantDefinitionId: d.id,
      activity: { in: ['FERTILIZING', 'REPOTTING', 'PRUNING', 'WATERING'] },
    },
  })
  const proposal = (activity, na = true) =>
    db.careCadenceProposal.create({
      data: {
        plantDefinitionId: d.id,
        activity,
        applicability: na ? 'NOT_APPLICABLE' : 'RECOMMENDED',
        interval: na ? null : 7,
        unit: na ? null : 'DAY',
        confidence: 'MEDIUM',
        rationale:
          'No fixed recurring cadence is appropriate under these conditions; occasional care remains available.',
        sourceReferences: [],
        source: 'AI_RESEARCH',
      },
    })
  const fert = await proposal('FERTILIZING')
  const prune = await proposal('PRUNING')
  await proposal('REPOTTING')
  await proposal('WATERING', false)
  const dashboard = `${prefix}`
  await page.goto(dashboard)
  await expect(page.locator('#open-review-items')).toContainText(
    '4 items waiting'
  )
  await page
    .getByRole('link', {
      name: 'Care cadence suggestions: review 4 pending items',
    })
    .click()
  const fertForm = page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${fert.id}"]`) })
  assert.equal(
    await fertForm.getByLabel('Approved interval', { exact: true }).count(),
    0
  )
  await fertForm.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(fertForm).toHaveCount(0)
  assert.equal(
    (
      await db.plantDefinitionCareCadence.findFirstOrThrow({
        where: { plantDefinitionId: d.id, activity: 'FERTILIZING' },
      })
    ).status,
    'NOT_APPLICABLE'
  )
  const pruneForm = page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${prune.id}"]`) })
  await pruneForm.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(pruneForm).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Approve All Eligible', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'Approve 2 care cadence recommendations'
  )
  await page.getByRole('button', { name: 'Approve All', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByText('0 recommendations', { exact: true })
  ).toBeVisible()
  await page.goto(dashboard)
  await expect(page.locator('#open-review-items')).toHaveCount(0)
  assert.equal(
    await db.plantDefinitionCareCadence.count({
      where: { plantDefinitionId: d.id, activity: 'PRUNING' },
    }),
    0
  )
  assert.ok(
    (await db.auditLog.count({
      where: { collectionId: c.id, summary: 'Updated care cadences' },
    })) > 0
  )
  const magic = await proposal('PRUNING')
  await page.route('**/api/ai/plant-husbandry-fill', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fields: {},
        cadenceProposals: [magic],
        canApproveCadences: true,
      }),
    })
  )
  await page.goto(`${prefix}/plants/${d.id}/edit`)
  await page
    .getByRole('button', { name: 'Magic Fill husbandry', exact: true })
    .click()
  const fillMissing = page.getByRole('button', {
    name: 'Fill Missing Only',
    exact: true,
  })
  if (await fillMissing.isVisible()) await fillMissing.click()
  const magicPanel = page
    .getByText('Review care cadence recommendations', { exact: true })
    .locator('..')
  await expect(magicPanel).toContainText('NOT APPLICABLE')
  await magicPanel.getByRole('checkbox').check()
  await magicPanel
    .getByRole('button', { name: 'Approve selected recommendations' })
    .click()
  await expect
    .poll(() =>
      db.careCadenceProposal
        .findUniqueOrThrow({ where: { id: magic.id } })
        .then((p) => p.status)
    )
    .toBe('APPROVED')
  assert.equal(
    (
      await db.plantDefinitionCareCadence.findFirstOrThrow({
        where: { plantDefinitionId: d.id, activity: 'PRUNING' },
      })
    ).status,
    'NOT_APPLICABLE'
  )
  assert.deepEqual(errors, [])
  console.log(
    'N/A browser tests passed: definition/bulk editor, recipe-free N/A, required-activity options, completeness, inheritance/custom/reset, instance N/A, six responsive/theme layouts, individual N/A approval/rejection, mixed bulk and dashboard counts.'
  )
} finally {
  if (c) await db.collection.delete({ where: { id: c.id } })
  if (user) await db.user.delete({ where: { id: user.id } })
  await browser.close()
  await db.$disconnect()
}
