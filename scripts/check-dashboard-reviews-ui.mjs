import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import cadenceReview from '../lib/cadence-review.ts'
const { actionableCadenceWhere } = cadenceReview
import cadenceResearch from '../lib/cadence-research.ts'
const { eligibleCadenceProposals, approveCadenceProposal } = cadenceResearch
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const base = process.env.AXILDB_REVIEW_TEST_URL || 'http://localhost:3107'
assert.match(base, /^http:\/\/localhost:/)
const db = new PrismaClient(),
  browser = await chromium.launch({ channel: 'chrome' })
let collection, other, user, viewer, renamed
try {
  const stamp = Date.now()
  collection = await db.collection.create({
    data: { name: 'Dashboard reviews', slug: `review-${stamp}` },
  })
  other = await db.collection.create({
    data: { name: 'Other review collection', slug: `review-other-${stamp}` },
  })
  user = await db.user.create({
    data: {
      email: `review-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
      role: 'SERVER_ADMIN',
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  viewer = await db.user.create({
    data: {
      email: `review-viewer-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
    },
  })
  for (const [id, role] of [
    [user.id, 'MANAGER'],
    [viewer.id, 'VIEWER'],
  ])
    await db.collectionMembership.create({
      data: { collectionId: collection.id, userId: id, role, status: 'ACTIVE' },
    })
  const definition = await db.plantDefinition.create({
    data: {
      collectionId: collection.id,
      genus: 'Hoya',
      species: 'dashboardii',
    },
  })
  const otherDefinition = await db.plantDefinition.create({
    data: { collectionId: other.id, genus: 'Hoya', species: 'otherii' },
  })
  const make = async (id, activity, extra = {}) =>
    db.careCadenceProposal.create({
      data: {
        plantDefinitionId: id,
        activity,
        interval: 7,
        unit: 'DAY',
        confidence: 'MEDIUM',
        rationale: 'Dashboard fixture recommendation.',
        applicability: 'RECOMMENDED',
        sourceReferences: [],
        source: 'AI_RESEARCH',
        ...extra,
      },
    })
  const water = await make(definition.id, 'WATERING'),
    pest = await make(definition.id, 'PEST_INSPECTION')
  await make(definition.id, 'GENERAL_INSPECTION')
  const fertilizer = await make(definition.id, 'FERTILIZING')
  await db.plantDefinitionCareCadence.create({
    data: {
      plantDefinitionId: definition.id,
      activity: 'REPOTTING',
      interval: 1,
      unit: 'YEAR',
    },
  })
  await make(definition.id, 'REPOTTING') // Deliberately stale pending proposal, after the configured cadence.
  await make(definition.id, 'PRUNING', {
    applicability: 'INSUFFICIENT_INFORMATION',
    interval: null,
    unit: null,
  })
  const otherProposal = await make(otherDefinition.id, 'WATERING')
  for (const status of ['APPROVED', 'REJECTED', 'SUPERSEDED', 'FAILED'])
    await make(definition.id, 'PRUNING', {
      status,
      ...(status === 'APPROVED'
        ? { approvedInterval: 7, approvedUnit: 'DAY' }
        : {}),
    })
  let completed
  for (const status of ['RUNNING', 'WAITING_FOR_HUMAN', 'COMPLETED']) {
    const d = await db.plantDefinition.create({
      data: {
        collectionId: collection.id,
        genus: 'Hoya',
        species: status.toLowerCase(),
      },
    })
    const job = await db.aiCuratorJob.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId: d.id,
        phase: 'ENRICHMENT',
        jobType: 'CADENCE_RESEARCH',
        targetField: 'careCadences',
        status,
      },
    })
    const p = await make(d.id, 'WATERING', { jobId: job.id })
    if (status === 'COMPLETED') completed = p
  }
  const curator = []
  for (let n = 0; n < 2; n++)
    curator.push(
      await db.aiCuratorSuggestion.create({
        data: {
          collectionId: collection.id,
          plantDefinitionId: definition.id,
          phase: 'ENRICHMENT',
          suggestionType: 'DESCRIPTION',
          targetField: 'description',
          title: `Dashboard fixture ${n}`,
          currentValue: { description: 'old' },
          suggestedValue: { description: `new ${n}` },
          reasoning: 'Fixture',
        },
      })
    )
  for (const extra of [
    { status: 'REJECTED' },
    { expiresAt: new Date(0) },
    { suggestedValue: { description: 'old' } },
  ])
    await db.aiCuratorSuggestion.create({
      data: {
        collectionId: collection.id,
        phase: 'ENRICHMENT',
        suggestionType: 'DESCRIPTION',
        targetField: 'description',
        title: 'Excluded fixture',
        currentValue: { description: 'old' },
        suggestedValue: { description: 'new' },
        reasoning: 'Fixture',
        ...extra,
      },
    })
  const count = () =>
    db.careCadenceProposal.count({
      where: actionableCadenceWhere(collection.id),
    })
  assert.equal(
    await count(),
    4,
    'count recommendations, not definitions, histories, job failures or blocked intervals'
  )
  assert.equal(
    (await eligibleCadenceProposals(db, collection.id)).length,
    4,
    'batch eligibility matches dashboard count'
  )
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  async function sign(context, id, verified = true) {
    const token = randomBytes(32).toString('hex')
    await db.session.create({
      data: {
        userId: id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        ...(verified ? { twoFactorVerifiedAt: new Date() } : {}),
      },
    })
    await context.addCookies([
      { name: 'axildb_session', value: token, url: base },
    ])
  }
  await sign(ctx, user.id)
  const page = await ctx.newPage(),
    errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const dashboard = `${base}/c/${collection.slug}`,
    panel = page.locator('#open-review-items')
  const review = `${base}/server/care-cadence-research?tab=review&collection=${collection.slug}`
  const before = {
    jobs: await db.aiCuratorJob.count(),
    cadences: await db.plantDefinitionCareCadence.count(),
    proposals: await db.careCadenceProposal.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, status: true },
    }),
  }
  await page.goto(dashboard)
  await expect(panel).toContainText('6 items waiting for a decision.')
  await expect(panel).toContainText('2 queues')
  await expect(panel.locator('a').first()).toContainText(
    'Care cadence suggestions'
  )
  assert.equal(await db.aiCuratorJob.count(), before.jobs)
  assert.equal(await db.plantDefinitionCareCadence.count(), before.cadences)
  assert.deepEqual(
    await db.careCadenceProposal.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, status: true },
    }),
    before.proposals,
    'dashboard loading has no proposal side effects'
  )
  for (const width of [1440, 900, 390])
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      const cards = await panel.locator('a').all(),
        a = await cards[0].boundingBox(),
        b = await cards[1].boundingBox()
      if (width >= 900)
        assert(Math.abs(a.y - b.y) < 4, 'two desktop/tablet columns')
      else assert(b.y > a.y + 40, 'mobile cards stack')
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        'no horizontal overflow'
      )
      await panel.screenshot({
        path: `/tmp/axildb-dashboard-reviews-${width}-${theme}.png`,
        caret: 'initial',
      })
    }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const cadenceLink = panel.getByRole('link', {
    name: 'Care cadence suggestions: review 4 pending items',
    exact: true,
  })
  await cadenceLink.focus()
  await page.keyboard.press('Enter')
  await page.waitForURL(review)
  await expect(
    page.getByText('4 recommendations', { exact: true })
  ).toBeVisible()
  await expect(
    page.locator(`input[name=id][value="${otherProposal.id}"]`)
  ).toHaveCount(0)
  await expect(
    page.locator(`input[name=id][value="${fertilizer.id}"]`)
  ).toHaveCount(0)
  const form = (id) =>
    page
      .locator('form')
      .filter({ has: page.locator(`input[name=id][value="${id}"]`) })
  await form(water.id)
    .getByRole('button', { name: 'Approve', exact: true })
    .click()
  await expect.poll(count).toBe(3)
  await page.goBack()
  await expect(panel).toContainText('5 items waiting for a decision.')
  await panel.getByRole('link', { name: /Care cadence suggestions/ }).click()
  await form(pest.id)
    .getByRole('button', { name: 'Reject', exact: true })
    .click()
  await expect.poll(count).toBe(2)
  await page.goBack()
  await expect(panel).toContainText('4 items waiting for a decision.')
  // Source failures are real missing-table errors, confined to this disposable DB.
  for (const table of ['CareCadenceProposal', 'AiCuratorSuggestion']) {
    renamed = table
    await db.$executeRawUnsafe(
      `ALTER TABLE "${table}" RENAME TO "${table}_review_test_unavailable"`
    )
    await page.reload()
    await expect(panel).toContainText(
      'Some review counts are temporarily unavailable.'
    )
    await expect(panel).toContainText('2 known items waiting for a decision.')
    await expect(panel).toContainText('Unavailable')
    await db.$executeRawUnsafe(
      `ALTER TABLE "${table}_review_test_unavailable" RENAME TO "${table}"`
    )
    renamed = undefined
    await page.reload()
    await expect(panel).toContainText('4 items waiting for a decision.')
  }
  // Removing recipe eligibility changes the count without rewriting any proposals.
  const recipe = await db.fertilizerRecipe.create({
    data: { collectionId: collection.id, name: 'Dashboard recipe' },
  })
  await db.plantHusbandryGuide.create({
    data: {
      collectionId: collection.id,
      plantDefinitionId: definition.id,
      fertilizerRecipeId: recipe.id,
    },
  })
  assert.equal(await count(), 3)
  await db.fertilizerRecipe.update({
    where: { id: recipe.id },
    data: { active: false },
  })
  assert.equal(await count(), 2)
  await db.fertilizerRecipe.update({
    where: { id: recipe.id },
    data: { active: true },
  })
  assert.equal(await count(), 3)
  const concurrent = await Promise.all([
    approveCadenceProposal(db, fertilizer.id, user.id),
    approveCadenceProposal(db, fertilizer.id, user.id),
  ])
  assert.equal(concurrent.filter((result) => result === 'APPROVED').length, 1)
  assert.equal(await count(), 2)
  await page.reload()
  await panel.getByRole('link', { name: /Care cadence suggestions/ }).click()
  await page
    .getByRole('button', { name: 'Approve All Eligible', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    '2 care cadence recommendations'
  )
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Approve All', exact: true })
    .click()
  await expect.poll(count).toBe(0)
  assert.equal(
    (
      await db.careCadenceProposal.findUnique({
        where: { id: otherProposal.id },
      })
    ).status,
    'PENDING',
    'collection bulk review must not apply other collections'
  )
  await page.goBack()
  await expect(panel).toContainText('2 items waiting for a decision.')
  await expect(panel).toContainText('1 queue')
  await expect(
    panel.getByRole('link', { name: /Care cadence suggestions/ })
  ).toHaveCount(0)
  const curatorLink = panel.getByRole('link', {
    name: /AI Curator suggestions/,
  })
  await curatorLink.click()
  await page.waitForURL(/\/server\/ai-curator/)
  await page.goBack()
  // Only-cadence and empty states, including the singular item label.
  await db.aiCuratorSuggestion.updateMany({
    where: { id: { in: curator.map((p) => p.id) } },
    data: { status: 'REJECTED' },
  })
  await make(definition.id, 'PEST_INSPECTION')
  await page.reload()
  await expect(panel).toContainText('1 item waiting for a decision.')
  await expect(panel.locator('a')).toHaveCount(1)
  await panel.getByRole('link', { name: /Care cadence suggestions/ }).click()
  const final = await db.careCadenceProposal.findFirst({
    where: {
      plantDefinitionId: definition.id,
      activity: 'PEST_INSPECTION',
      status: 'PENDING',
    },
  })
  await form(final.id)
    .getByRole('button', { name: 'Reject', exact: true })
    .click()
  await page.goBack()
  await expect(panel).toHaveCount(0)
  const viewerContext = await browser.newContext()
  await sign(viewerContext, viewer.id, false)
  const viewerPage = await viewerContext.newPage()
  await viewerPage.goto(dashboard)
  await expect(
    viewerPage.getByText('Care cadence suggestions', { exact: true })
  ).toHaveCount(0)
  await expect(
    viewerPage.getByText('AI Curator suggestions', { exact: true })
  ).toHaveCount(0)
  await viewerPage.goto(review)
  await expect(
    viewerPage.getByRole('heading', { name: 'Care Cadence Research' })
  ).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log(
    'Dashboard real-DB/browser checks passed: individual actionable counts, status/job/recipe exclusions, scope, keyboard navigation, actual approval/rejection/bulk/concurrency, back-navigation invalidation, real partial failures/retry, empty/singular states, 3 widths and light/dark modes; no page errors.'
  )
} finally {
  if (renamed)
    await db.$executeRawUnsafe(
      `ALTER TABLE "${renamed}_review_test_unavailable" RENAME TO "${renamed}"`
    )
  await browser.close()
  for (const c of [collection, other])
    if (c)
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104,1)`
        await tx.collection.delete({ where: { id: c.id } })
      })
  for (const u of [user, viewer])
    if (u) await db.user.delete({ where: { id: u.id } })
  await db.$disconnect()
}
