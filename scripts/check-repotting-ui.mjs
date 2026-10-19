import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const db = new PrismaClient(),
  browser = await chromium.launch({ channel: 'chrome' }),
  base = 'http://localhost:3107'
let collection, user, window
try {
  const stamp = Date.now()
  collection = await db.collection.create({
    data: { name: 'Repotting browser', slug: `repotting-ui-${stamp}` },
  })
  user = await db.user.create({
    data: {
      email: `repotting-ui-${stamp}@example.test`,
      passwordHash: 'fixture',
      role: 'SERVER_ADMIN',
      emailVerifiedAt: new Date(),
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  await db.collectionMembership.create({
    data: {
      collectionId: collection.id,
      userId: user.id,
      role: 'MANAGER',
      status: 'ACTIVE',
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
  window = await db.repottingWindow.create({
    data: {
      name: `Browser window ${stamp}`,
      startMonth: 1,
      startDay: 1,
      endMonth: 12,
      endDay: 31,
    },
  })
  const definition = await db.plantDefinition.create({
    data: {
      collectionId: collection.id,
      genus: 'Monstera',
      species: 'deliciosa',
      primaryRepottingWindowId: window.id,
      careCadences: {
        create: { activity: 'REPOTTING', interval: 12, unit: 'MONTH' },
      },
      husbandryGuide: {
        create: {
          collectionId: collection.id,
          repottingInterval: 'Preserved legacy interval advice',
          repottingPotType: 'Ventilated pot',
        },
      },
    },
  })
  const plant = await db.plantInstance.create({
    data: {
      collectionId: collection.id,
      plantDefinitionId: definition.id,
      plantId: 'REPOT-UI-1',
      instanceType: 'ACQUIRED',
    },
  })
  await db.plantCareAdjustment.create({
    data: {
      collectionId: collection.id,
      plantInstanceId: plant.id,
      taskType: 'REPOT',
      nextDueAt: new Date(Date.now() - 86400000),
    },
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page
    .context()
    .addCookies([{ name: 'axildb_session', value: token, url: base }])
  const prefix = `${base}/c/${collection.slug}`
  // Collection routes use the app's real rewriting and authentication boundaries.
  await page.goto(`${prefix}/instances/${plant.id}`)
  await expect(
    page.getByText('Repotting Planner', { exact: true }).last()
  ).toBeVisible()
  await expect(
    page.getByText(
      'Preserved legacy guidance: Preserved legacy interval advice',
      { exact: true }
    )
  ).toHaveCount(1)
  await page
    .locator('summary')
    .filter({ hasText: 'Add to Repotting Queue' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Add to Queue', exact: true })
  ).toBeVisible()
  await page.goto(`${prefix}/care?filter=repot`)
  let post
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action'])
      post = { headers: r.headers(), body: r.postDataBuffer(), url: r.url() }
  })
  let failOnce = true
  await page.route('**/api/care-queue', async (route) => {
    if (route.request().method() === 'POST')
      await new Promise((r) => setTimeout(r, 700))
    if (route.request().method() === 'POST' && failOnce) {
      failOnce = false
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Fixture rejected scheduling',
          category: 'validation',
        }),
      })
    }
    await route.continue()
  })
  await page
    .getByRole('button', { name: 'Add to Next Repotting Window', exact: true })
    .click()
  await expect(
    page.getByRole('button', {
      name: 'Add to Next Repotting Window',
      exact: true,
    })
  ).toHaveCount(0, { timeout: 500 })
  await expect(
    page.getByRole('alert').filter({ hasText: 'Fixture rejected scheduling' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: 'Add to Next Repotting Window',
      exact: true,
    })
  ).toBeVisible()
  assert.equal(
    await db.repottingQueueItem.count({
      where: { plantInstanceId: plant.id, status: 'QUEUED' },
    }),
    0
  )
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect
    .poll(() =>
      db.repottingQueueItem.count({
        where: { plantInstanceId: plant.id, status: 'QUEUED' },
      })
    )
    .toBe(1)
  assert.equal(
    await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }),
    0
  )
  await page.goto(`${prefix}/care/repotting`)
  await expect(
    page.getByRole('heading', { name: 'Repotting Planner', exact: true })
  ).toBeVisible()
  const item = await db.repottingQueueItem.findFirstOrThrow({
    where: { plantInstanceId: plant.id, status: 'QUEUED' },
  })
  await page.locator(`input[name="itemId"][value="${item.id}"]`).check()
  if (
    !(await page
      .locator('summary')
      .filter({ hasText: 'Actions for selected plants' })
      .evaluate((el) => el.parentElement.open))
  )
    await page
      .locator('summary')
      .filter({ hasText: 'Actions for selected plants' })
      .click()
  await page
    .getByLabel('New occurrence start year', { exact: true })
    .fill(String(item.scheduledYear + 1))
  await page.locator('input[name="confirmed"]').check()
  await page
    .getByRole('button', { name: 'Reschedule selected', exact: true })
    .click()
  await expect
    .poll(
      async () =>
        (
          await db.repottingQueueItem.findUniqueOrThrow({
            where: { id: item.id },
          })
        ).scheduledYear
    )
    .toBe(item.scheduledYear + 1)
  await page.reload()
  await page.locator(`input[name="itemId"][value="${item.id}"]`).check()
  if (
    !(await page
      .locator('summary')
      .filter({ hasText: 'Actions for selected plants' })
      .evaluate((el) => el.parentElement.open))
  )
    await page
      .locator('summary')
      .filter({ hasText: 'Actions for selected plants' })
      .click()
  await page
    .locator('select[name=substrateMode]')
    .selectOption('RECEIVED_SUBSTRATE')
  await page
    .getByLabel('Substrate description', { exact: true })
    .fill('Browser test mix')
  await page.locator('input[name="confirmed"]').check()
  await page
    .getByRole('button', { name: 'Mark selected Repotted', exact: true })
    .click()
  await expect
    .poll(
      async () =>
        (
          await db.repottingQueueItem.findUniqueOrThrow({
            where: { id: item.id },
          })
        ).status
    )
    .toBe('COMPLETED')
  assert.equal(
    await db.plantCareEvent.count({
      where: { plantInstanceId: plant.id, eventType: 'REPOTTED' },
    }),
    1
  )
  assert.equal(
    await db.plantSubstrateHistory.count({
      where: { plantInstanceId: plant.id },
    }),
    1
  )
  await page.reload()
  await expect(
    page.getByText('No repotting work matches these filters.', { exact: false })
  ).toBeVisible()
  assert.ok(post)
  const anon = await browser.newContext()
  await anon.request.post(post.url, {
    headers: {
      'Next-Action': post.headers['next-action'],
      'Content-Type': post.headers['content-type'],
      Origin: base,
    },
    data: post.body,
    maxRedirects: 0,
  })
  await anon.close()
  assert.equal(
    await db.plantCareEvent.count({
      where: { plantInstanceId: plant.id, eventType: 'REPOTTED' },
    }),
    1
  )
  await page.goto(`${base}/server/repotting-windows`)
  await expect(
    page.getByRole('heading', { name: 'Repotting Windows', exact: true })
  ).toBeVisible()
  const windowCard = page.getByRole('heading', {name:new RegExp(window.name)}).locator('..')
  await windowCard.locator('summary').filter({hasText:'Edit'}).click()
  await windowCard.getByLabel('Description',{exact:true}).fill('Edited through the administrator interface')
  await windowCard.locator('input[name=isActive]').uncheck()
  await windowCard.getByRole('button',{name:'Save window',exact:true}).click()
  await expect.poll(async()=> (await db.repottingWindow.findUniqueOrThrow({where:{id:window.id}})).isActive).toBe(false)
  assert.equal((await db.repottingWindow.findUniqueOrThrow({where:{id:window.id}})).description,'Edited through the administrator interface')
  await expect(windowCard.getByRole('button',{name:'Delete unused window',exact:true})).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  )
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`${prefix}/care/repotting?status=COMPLETED`)
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  )
  await page.screenshot({
    path: '/tmp/axildb-repotting-mobile.png',
    fullPage: true,
  })
  console.log(
    'Repotting browser: instance confirmation, cadence/legacy display, optimistic assessment queueing, yearly reschedule, actual completion/substrate history, unauthorized replay rejection, window management and mobile/dark-mode layout passed.'
  )
} finally {
  if (collection) {
    await db.repottingQueueItem.deleteMany({
      where: { plantInstance: { collectionId: collection.id } },
    })
    await db.collection.delete({ where: { id: collection.id } })
  }
  if (user) await db.user.delete({ where: { id: user.id } })
  if (window) await db.repottingWindow.delete({ where: { id: window.id } })
  await browser.close()
  await db.$disconnect()
}
