import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const base = process.env.AXILDB_RESEARCH_TEST_URL || 'http://localhost:3107'
const db = new PrismaClient()
const browser = await chromium.launch({ channel: 'chrome' })
let collectionId, userId, loggerId
try {
  const stamp = Date.now()
  const user = await db.user.create({
    data: {
      email: `research-ui-${stamp}@example.test`,
      passwordHash: 'fixture',
      role: 'SERVER_ADMIN',
      emailVerifiedAt: new Date(),
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  userId = user.id
  const collection = await db.collection.create({
    data: {
      name: 'Research browser fixture',
      slug: `research-ui-${stamp}`,
      aiFeaturesEnabled: true,
      aiCuratorEnabled: true,
    },
  })
  collectionId = collection.id
  await db.collectionMembership.create({
    data: { userId, collectionId, role: 'MANAGER', status: 'ACTIVE' },
  })
  const logger = await db.user.create({
    data: {
      email: `research-logger-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
    },
  })
  loggerId = logger.id
  await db.collectionMembership.create({
    data: { userId: loggerId, collectionId, role: 'LOGGER', status: 'ACTIVE' },
  })
  const a = await db.plantDefinition.create({
    data: { collectionId, genus: 'Hoya', species: 'researchii' },
  })
  const b = await db.plantDefinition.create({
    data: { collectionId, genus: 'Monstera', species: 'researchii' },
  })
  const recipe = await db.fertilizerRecipe.create({
    data: { collectionId, name: 'Browser recipe' },
  })
  await db.plantHusbandryGuide.create({
    data: {
      collectionId,
      plantDefinitionId: b.id,
      fertilizerRecipeId: recipe.id,
    },
  })
  const proposal = async (definitionId, activity) =>
    db.careCadenceProposal.create({
      data: {
        plantDefinitionId: definitionId,
        activity,
        interval: 10,
        unit: 'DAY',
        confidence: 'MEDIUM',
        rationale: 'Inspect condition and adjust for season.',
        applicability: 'RECOMMENDED',
        sourceReferences: [],
        source: 'BULK_RESEARCH',
      },
    })
  const water = await proposal(a.id, 'WATERING')
  const repot = await proposal(a.id, 'REPOTTING')
  const pest = await proposal(a.id, 'PEST_INSPECTION')
  const pruning = await proposal(b.id, 'PRUNING')
  const fert = await proposal(b.id, 'FERTILIZING')
  async function signedContext(id, admin) {
    const token = randomBytes(32).toString('hex')
    await db.session.create({
      data: {
        userId: id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        ...(admin ? { twoFactorVerifiedAt: new Date() } : {}),
      },
    })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    })
    await context.addCookies([
      { name: 'axildb_session', value: token, url: base },
    ])
    return context
  }
  const context = await signedContext(userId, true)
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const management = `${base}/server/care-cadence-research`
  await page.goto(`${management}?tab=review`)
  await expect(
    page.getByRole('heading', { name: 'Care Cadence Research' })
  ).toBeVisible()
  const waterForm = page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${water.id}"]`) })
  await waterForm.getByRole('spinbutton').fill('14')
  await waterForm.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect
    .poll(() =>
      db.careCadenceProposal
        .findUnique({ where: { id: water.id } })
        .then((p) => p.status)
    )
    .toBe('APPROVED')
  assert.equal(
    (await db.careCadenceProposal.findUnique({ where: { id: water.id } }))
      .interval,
    10
  )
  assert.equal(
    (
      await db.plantDefinitionCareCadence.findFirst({
        where: { plantDefinitionId: a.id, activity: 'WATERING' },
      })
    ).interval,
    14
  )
  const pestForm = page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${pest.id}"]`) })
  await pestForm.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect
    .poll(() =>
      db.careCadenceProposal
        .findUnique({ where: { id: pest.id } })
        .then((p) => p.status)
    )
    .toBe('REJECTED')
  await page
    .getByRole('button', { name: 'Approve All Eligible', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    '3 care cadence recommendations across 2 Plant Definitions?'
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(
    await db.plantDefinitionCareCadence.count({
      where: { plantDefinitionId: b.id },
    }),
    0
  )
  await page
    .getByRole('button', { name: 'Approve All Eligible', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    '3 care cadence recommendations across 2 Plant Definitions?'
  )
  await db.plantHusbandryGuide.update({
    where: { plantDefinitionId: b.id },
    data: { fertilizerRecipeId: null },
  })
  let capturedApproval
  page.on('request', (request) => {
    if (request.headers()['next-action'])
      capturedApproval = {
        headers: request.headers(),
        data: request.postData(),
      }
  })
  await page.getByRole('button', { name: 'Approve All', exact: true }).click()
  await expect(page.getByRole('status').first()).toContainText('2 approved')
  await expect(page.getByRole('status').first()).toContainText('1 skipped')
  assert.equal(
    (await db.careCadenceProposal.findUnique({ where: { id: fert.id } }))
      .status,
    'PENDING'
  )
  await page.goto(`${management}?tab=history&view=table&definition=${a.id}`)
  await expect(page.getByRole('table')).toContainText('WATERING')
  await expect(page.getByRole('table')).toContainText('REJECTED')
  await page.goto(management)
  await page
    .getByRole('button', { name: 'Research Missing Cadences', exact: true })
    .click()
  await expect(page.getByRole('status').first()).toContainText(
    '2 definitions queued'
  )
  await page
    .getByRole('button', { name: 'Research Missing Cadences', exact: true })
    .click()
  await expect(page.getByRole('status').first()).toContainText(
    '0 definitions queued'
  )
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Persistent progress' })
  ).toBeVisible()
  assert.equal(
    await db.aiCuratorJob.count({
      where: { collectionId, targetField: 'careCadences', status: 'QUEUED' },
    }),
    2
  )
  const managedJob = await db.aiCuratorJob.findFirstOrThrow({
    where: { collectionId, targetField: 'careCadences', status: 'QUEUED' },
  })
  const jobForm = page
    .locator('form')
    .filter({ has: page.locator(`input[name="id"][value="${managedJob.id}"]`) })
  await jobForm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect
    .poll(() =>
      db.aiCuratorJob
        .findUniqueOrThrow({ where: { id: managedJob.id } })
        .then((j) => j.status)
    )
    .toBe('CANCELLED')
  await jobForm.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect
    .poll(() =>
      db.aiCuratorJob
        .findUniqueOrThrow({ where: { id: managedJob.id } })
        .then((j) => j.status)
    )
    .toBe('QUEUED')
  // Browser Magic Fill preview and selected approval use fixture results; no external tokens spent.
  const magic = await proposal(a.id, 'GENERAL_INSPECTION')
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
  await page.goto(`${base}/c/${collection.slug}/plants/${a.id}/edit`)
  const magicButton = page.getByRole('button', {
    name: 'Magic Fill husbandry',
    exact: true,
  })
  await magicButton.click()
  const fillMissing = page.getByRole('button', {
    name: 'Fill Missing Only',
    exact: true,
  })
  if (await fillMissing.isVisible()) await fillMissing.click()
  await expect(
    page.getByText('Review care cadence recommendations', { exact: true })
  ).toBeVisible()
  const magicPanel = page
    .getByText('Review care cadence recommendations', { exact: true })
    .locator('..')
  await magicPanel.getByRole('checkbox').check()
  await magicPanel
    .getByRole('button', { name: 'Approve selected recommendations' })
    .click()
  await expect
    .poll(() =>
      db.careCadenceProposal
        .findUnique({ where: { id: magic.id } })
        .then((p) => p.status)
    )
    .toBe('APPROVED')
  await page.goto(`${management}?tab=review`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: '/tmp/axildb-cadence-research-mobile.png',
    fullPage: true,
    caret: 'initial',
  })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    ),
    'Review should fit mobile viewport'
  )
  const loggerContext = await signedContext(loggerId, false)
  const denied = await loggerContext.request.post(management, {
    headers: {
      'next-action': capturedApproval.headers['next-action'],
      origin: base,
      'content-type': capturedApproval.headers['content-type'],
    },
    data: capturedApproval.data,
  })
  assert.ok(
    denied.status() >= 400,
    'Server action must reject non-admin approval'
  )
  const loggerPage = await loggerContext.newPage()
  await loggerPage.goto(management)
  await expect(
    loggerPage.getByRole('heading', { name: 'Care Cadence Research' })
  ).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log(
    'Cadence browser checks passed: edited approval, rejection, confirmation/cancel, changed-dependency partial bulk results, history/table, durable duplicate-safe research, Magic Fill selected approval, mobile layout and server-side permissions.'
  )
} finally {
  await browser.close()
  if (collectionId)
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
      await tx.collection.delete({ where: { id: collectionId } })
    })
  if (userId) await db.user.delete({ where: { id: userId } })
  if (loggerId) await db.user.delete({ where: { id: loggerId } })
  await db.$disconnect()
}
