// Opt-in local smoke test. Use only the disposable migration integration DB and
// AXILDB_BACKUP_ROOT=/tmp/axildb-migration-ui fixture described in the guide.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.MIGRATION_TEST_BASE_URL || 'http://localhost:3137'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local test URL required')
const name = `axildb-migration-${'a'.repeat(32)}.tar.gz`
const anonymous = await fetch(`${base}/api/server/migrations/download?name=${name}`, { redirect: 'manual' })
assert.equal(anonymous.status, 307)
assert.ok(anonymous.headers.get('location')?.includes('/login'))
const browser = await chromium.launch({ headless: true, channel: process.env.MIGRATION_TEST_BROWSER || 'chrome' })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await context.addCookies([{ name: 'axildb_session', value: 'migration-test-session', url: base }])
  const viewer = await browser.newContext()
  await viewer.addCookies([{ name: 'axildb_session', value: 'migration-test-viewer', url: base }])
  const denied = await viewer.request.get(`${base}/api/server/migrations/download?name=${name}`)
  assert.ok(denied.status() >= 400, 'Non-admin download must be denied')
  await viewer.close()
  const page = await context.newPage()
  await page.goto(`${base}/server/migrations`)
  await page.getByRole('heading', { name: 'Full Instance Migration', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Create migration bundle' }).count(), 1)
  const download = await context.request.get(`${base}/api/server/migrations/download?name=${name}`)
  assert.equal(download.status(), 200)
  assert.equal(download.headers()['content-type'], 'application/gzip')
  assert.equal(Number(download.headers()['content-length']), (await download.body()).length)
  const report = await context.request.get(`${base}/api/server/migrations/report?id=${'a'.repeat(32)}`)
  assert.equal(report.status(), 200)
  assert.equal((await report.json()).manifest.testFixture, true)
  await page.getByRole('button', { name: 'Refresh size estimate' }).click()
  await page.getByText('REQUESTED', { exact: false }).first().waitFor()
  await page.screenshot({ path: '/tmp/axildb-migration-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/axildb-migration-mobile.png', fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  console.log('Migration UI: anonymous and non-admin downloads blocked; durable preflight request saved; authenticated page/report/streamed download pass; mobile has no horizontal overflow.')
} finally { await browser.close() }
