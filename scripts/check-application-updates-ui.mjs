import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { spawn } from 'node:child_process'
import { mkdtemp, access, rm } from 'node:fs/promises'
import path from 'node:path'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const directory = await mkdtemp('/tmp/axildb-update-ui-')
const fixtureDirectory = path.join(directory, 'agent')
const port = 3113
const base = `http://localhost:${port}`
const fixture = spawn(
  'python3',
  ['scripts/deployment-agent/ui_fixture.py', '--directory', fixtureDirectory],
  { stdio: ['ignore', 'pipe', 'pipe'] }
)
let fixtureOutput = '',
  appOutput = ''
fixture.stderr.on('data', (chunk) => {
  fixtureOutput += chunk
})
let app, browser, userId, loggerId, collectionId
const db = new PrismaClient()
try {
  for (let i = 0; i < 100; i++) {
    try {
      await access(path.join(fixtureDirectory, 'agent.sock'))
      break
    } catch {}
    if (fixture.exitCode !== null) throw new Error(fixtureOutput)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  app = spawn('npm', ['run', 'dev'], {
    env: {
      ...process.env,
      PORT: String(port),
      AXILDB_DEPLOY_AGENT_SOCKET: path.join(fixtureDirectory, 'agent.sock'),
      AXILDB_DEPLOY_AGENT_KEY_FILE: path.join(fixtureDirectory, 'agent.key'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  app.stdout.on('data', (chunk) => {
    appOutput += chunk
  })
  app.stderr.on('data', (chunk) => {
    appOutput += chunk
  })
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`${base}/api/health/ready`)
      if (response.ok) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  const stamp = Date.now()
  const admin = await db.user.create({
    data: {
      email: `upgrade-admin-${stamp}@example.test`,
      role: 'SERVER_ADMIN',
      emailVerifiedAt: new Date(),
      passwordHash: 'fixture',
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  userId = admin.id
  const logger = await db.user.create({
    data: {
      email: `upgrade-logger-${stamp}@example.test`,
      emailVerifiedAt: new Date(),
      passwordHash: 'fixture',
    },
  })
  loggerId = logger.id
  const collection = await db.collection.create({
    data: { name: 'Updates UI fixture', slug: `upgrade-ui-${stamp}` },
  })
  collectionId = collection.id
  await db.collectionMembership.createMany({
    data: [
      { userId, collectionId, role: 'MANAGER', status: 'ACTIVE' },
      { userId: loggerId, collectionId, role: 'LOGGER', status: 'ACTIVE' },
    ],
  })
  browser = await chromium.launch({ channel: 'chrome' })
  async function session(user, verified = false) {
    const token = randomBytes(32).toString('hex')
    await db.session.create({
      data: {
        userId: user,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        ...(verified ? { twoFactorVerifiedAt: new Date() } : {}),
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
  const context = await session(userId, true),
    page = await context.newPage()
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const endpoint = `${base}/api/server/application-updates`
  const badOrigin = await context.request.post(endpoint, {
    headers: { origin: 'https://attacker.invalid' },
    data: { operation: 'CHECK_UPDATES' },
  })
  assert.equal(badOrigin.status(), 403)
  const injection = await context.request.post(endpoint, {
    headers: { origin: base },
    data: {
      operation: 'CHECK_UPDATES',
      command: 'docker down -v',
      path: '/etc/passwd',
    },
  })
  assert.equal(injection.status(), 400)
  const loggerContext = await session(loggerId)
  assert.equal((await loggerContext.request.get(endpoint)).status(), 403)
  assert.equal(
    (
      await loggerContext.request.post(endpoint, {
        headers: { origin: base },
        data: { operation: 'CHECK_UPDATES' },
      })
    ).status(),
    403
  )
  assert.equal((await fetch(endpoint)).status, 403)
  await page.goto(`${base}/server/application-updates`)
  await expect(
    page.getByRole('heading', { name: 'Application Updates', exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Check for Updates', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Available update' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Run Preflight', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Review Upgrade', exact: true })
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Review Upgrade', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'temporarily unavailable'
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(
    (await (await context.request.get(endpoint)).json()).history.length,
    0
  )
  await page
    .getByRole('button', { name: 'Review Upgrade', exact: true })
    .click()
  let startPayload,
    interruptions = 0,
    simulateRestart = false,
    restartAt = 0
  page.on('request', (request) => {
    if (request.url() === endpoint && request.method() === 'POST') {
      const body = request.postDataJSON()
      if (body.operation === 'START_UPGRADE') {
        startPayload = body
        simulateRestart = true
        restartAt = Date.now()
      }
    }
  })
  await page.route('**/api/server/application-updates*', async (route) => {
    if (
      simulateRestart &&
      route.request().method() === 'GET' &&
      Date.now() - restartAt < 7000
    ) {
      interruptions++
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Application restarting"}',
      })
    }
    return route.continue()
  })
  await page.getByRole('button', { name: 'Start Upgrade', exact: true }).click()
  await expect(
    page.getByText(/Connection will resume automatically/)
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: /Upgrade progress · COMPLETED/ })
  ).toBeVisible({ timeout: 45000 })
  const state = await (await context.request.get(endpoint)).json()
  assert.equal(state.history.length, 1)
  assert.equal(state.history[0].status, 'COMPLETED')
  assert.ok(startPayload)
  const repeated = await context.request.post(endpoint, {
    headers: { origin: base },
    data: startPayload,
  })
  assert.equal(repeated.status(), 200)
  assert.equal((await repeated.json()).id, state.history[0].id)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: /Upgrade progress · COMPLETED/ })
  ).toBeVisible()
  await page.getByText('Detailed deployment logs', { exact: true }).click()
  await expect(page.locator('pre')).toContainText('Completed')
  const events = await (
    await context.request.get(
      `${endpoint}?mode=events&jobId=${state.history[0].id}`
    )
  ).json()
  assert.ok(events.events.length > 5)
  const last = events.events[0].id
  const replay = await (
    await context.request.get(
      `${endpoint}?mode=events&jobId=${state.history[0].id}&after=${last}`
    )
  ).json()
  assert.ok(replay.events.every((event) => event.id > last))
  assert.ok(!JSON.stringify(state).includes('ab'.repeat(32)))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: '/tmp/axildb-application-updates-mobile.png',
    fullPage: true,
    caret: 'initial',
  })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    )
  )
  assert.deepEqual(errors, [])
  console.log(
    'Application Updates browser checks passed: verified admin access, unauthorized/CSRF/injection rejection, real authenticated Unix transport, update review, preflight, confirmation/cancel, duplicate requests, restart reconnect, durable event replay/history, secret boundary and mobile layout. Docker operations in this browser fixture are simulated; the separate Docker test exercises actual orchestration.'
  )
} catch (error) {
  console.error(appOutput.slice(-3000), fixtureOutput.slice(-1000))
  throw error
} finally {
  await browser?.close()
  if (app?.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM')
    } catch {}
  }
  fixture.kill('SIGTERM')
  if (collectionId) await db.collection.delete({ where: { id: collectionId } })
  if (userId) await db.user.delete({ where: { id: userId } })
  if (loggerId) await db.user.delete({ where: { id: loggerId } })
  await db.$disconnect()
  await rm(directory, { recursive: true, force: true })
}
