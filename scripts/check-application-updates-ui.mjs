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
const migrationReview = process.env.AXILDB_TEST_MIGRATION_REVIEW === '1'
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
      NEXT_PUBLIC_APP_URL: 'https://updates.axildb.test',
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
  // Proxy request is HTTPS externally, HTTP on Next's internal listener.
  const proxied = await context.request.post(endpoint, {
    headers: { origin: 'https://updates.axildb.test' },
    data: { operation: 'CHECK_UPDATES', command: 'rejected' },
  })
  assert.equal(
    proxied.status(),
    400,
    'trusted public origin passes CSRF and reaches payload validation'
  )
  const localTls = await context.request.post(endpoint, {
    headers: {
      origin: `https://localhost:${port}`,
      'x-forwarded-proto': 'https',
    },
    data: { operation: 'CHECK_UPDATES', command: 'rejected' },
  })
  assert.equal(localTls.status(), 400, 'local TLS proxy origin passes CSRF')
  const forgedHost = await context.request.post(endpoint, {
    headers: {
      origin: 'https://attacker.invalid',
      'x-forwarded-host': 'attacker.invalid',
      'x-forwarded-proto': 'https',
    },
    data: { operation: 'CHECK_UPDATES' },
  })
  assert.equal(forgedHost.status(), 403)
  const careProxy = await context.request.post(`${base}/api/care-queue`, {
    headers: { origin: 'https://updates.axildb.test' },
    data: { action: 'invalid', fields: [] },
  })
  assert.equal(
    careProxy.status(),
    400,
    'Care Queue shares the proxy-safe origin check'
  )
  const careForgery = await context.request.post(`${base}/api/care-queue`, {
    headers: {
      origin: 'https://attacker.invalid',
      'x-forwarded-host': 'attacker.invalid',
    },
    data: { action: 'invalid', fields: [] },
  })
  assert.equal(careForgery.status(), 403)
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
  if (migrationReview) {
    const sql = page
      .locator('details')
      .filter({ hasText: 'ALTER TABLE example DROP CONSTRAINT old_rule;' })
    await sql.locator('summary').click()
    await expect(sql.locator('pre')).toContainText(
      'ALTER TABLE example DROP CONSTRAINT old_rule;'
    )
  }
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
  if (migrationReview) {
    const start = page.getByRole('button', {
      name: 'Start Upgrade',
      exact: true,
    })
    await expect(start).toBeDisabled()
    await page
      .getByRole('checkbox', {
        name: 'I reviewed the migration SQL and authorize these database changes.',
      })
      .check()
    await expect(start).toBeDisabled()
    const report = await (
      await context.request.post(endpoint, {
        headers: { origin: base },
        data: {
          operation: 'PREFLIGHT',
          revision: (await (await context.request.get(endpoint)).json()).checked
            .revision,
        },
      })
    ).json()
    await page
      .getByRole('textbox', { name: /Type target revision/ })
      .fill(report.revision.slice(0, 12))
    await expect(start).toBeEnabled()
  }
  await page.getByRole('button', { name: 'Start Upgrade', exact: true }).click()
  await expect(
    page.getByText(/Connection will resume automatically/)
  ).toBeVisible()
  await expect(
    page.getByText('Upgrade completed successfully.', { exact: false })
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
    page.getByText('Upgrade completed successfully.', { exact: false })
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
  if (migrationReview)
    assert.match(startPayload.migrationApproval, /^[a-f0-9]{64}$/)
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
  // Presentation fixtures exercise every timeline state without changing agent execution.
  let renderJob = { ...state.history[0], stage: 'PREFLIGHT', status: 'QUEUED', data: {}, finished: null }
  let statusReads = 0
  await page.route('**/api/server/application-updates*', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const url = new URL(route.request().url())
    if (url.searchParams.get('mode') === 'events') {
      const event = { id: 1, job_id: renderJob.id, timestamp: new Date(Date.now() - 18000).toISOString(), stage: renderJob.stage, level: 'INFO', message: renderJob.stage.charAt(0) + renderJob.stage.slice(1).toLowerCase() }
      if (url.searchParams.get('stream') === '1') return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(event)}\n\n` })
      return route.fulfill({ json: { events: url.searchParams.get('after') === '1' ? [] : [event] } })
    }
    statusReads++
    return route.fulfill({ json: { ...state, history: [renderJob], activeJob: ['RUNNING', 'QUEUED'].includes(renderJob.status) ? renderJob : null } })
  })
  await page.reload()
  const timeline = page.locator('[data-deployment-progress]')
  await expect(timeline.locator('[data-stage-status="pending"]')).toHaveCount(8)
  await expect(timeline.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  renderJob = { ...renderJob, status: 'RUNNING', stage: 'BACKUP' }
  await expect(timeline.locator('[data-stage="BACKUP"]')).toHaveAttribute('data-stage-status', 'active', { timeout: 10000 })
  await expect(timeline.locator('[data-stage="PREFLIGHT"]')).toHaveAttribute('data-stage-status', 'completed')
  assert.equal(await timeline.locator('.deployment-spinner').evaluate(node => getComputedStyle(node).animationDuration), '1s')
  await expect(timeline.locator('[data-stage="BACKUP"]')).toContainText(/In progress · \d+s/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await timeline.locator('.deployment-spinner').evaluate(node => getComputedStyle(node).animationName), 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await timeline.screenshot({ path: '/tmp/axildb-upgrade-timeline-dark.png' })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  renderJob = { ...renderJob, stage: 'BUILDING' }
  await expect(timeline.locator('[data-stage="BUILDING"]')).toHaveAttribute('data-stage-status', 'active', { timeout: 10000 })
  await expect(timeline.locator('[data-stage="BACKUP"]')).toHaveAttribute('data-stage-status', 'completed')
  renderJob = { ...renderJob, stage: 'UNKNOWN_STAGE' }
  await page.reload()
  await expect(timeline.getByText('Waiting for stage information…')).toBeVisible()
  assert.equal(await timeline.getByRole('progressbar').getAttribute('aria-valuenow'), null)
  await expect(timeline.locator('.deployment-spinner')).toHaveCount(0)
  renderJob = { ...renderJob, stage: 'BUILDING', status: 'FAILED', actor: 'administrator-'.repeat(12), data: { failedStage: 'BUILDING', error: 'Build failed while retrieving application dependencies. ' + 'diagnostic-'.repeat(40) } }
  await page.reload()
  await expect(timeline.locator('[data-stage="BUILDING"]')).toHaveAttribute('data-stage-status', 'failed')
  await expect(timeline.locator('[data-stage="MIGRATING"]')).toHaveAttribute('data-stage-status', 'pending')
  await expect(page.locator('#deployment-logs')).toHaveAttribute('open', '')
  const details = timeline.locator('.deployment-details')
  assert.equal(await details.getAttribute('open'), null)
  await details.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(details).toHaveAttribute('open', '')
  await expect(details.getByText(renderJob.revision, { exact: true })).toBeVisible()
  for (const width of [320, 375, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow at ${width}px`)
  }
  renderJob = { ...renderJob, stage: 'COMPLETED', status: 'COMPLETED', data: { hasMigrations: false, migrationStatus: 'NOT_REQUIRED' } }
  await page.reload()
  await expect(timeline.locator('[data-stage="MIGRATING"]')).toHaveAttribute('data-stage-status', 'skipped')
  await expect(timeline.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8')
  await expect(timeline.getByText(/7 completed · 1 skipped/)).toBeVisible()
  await expect(timeline.locator('.deployment-spinner')).toHaveCount(0)
  assert.equal(await page.locator('#deployment-logs').getAttribute('open'), null)
  await page.setViewportSize({ width: 390, height: 844 })
  await timeline.screenshot({ path: '/tmp/axildb-upgrade-timeline-mobile.png' })
  await page.waitForTimeout(300)
  const terminalReads = statusReads
  await page.waitForTimeout(3500)
  assert.equal(statusReads, terminalReads, 'Terminal jobs stop routine status polling.')
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
