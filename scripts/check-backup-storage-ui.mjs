import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, access, rm, chmod } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const root = process.env.AXILDB_BACKUP_ROOT
assert.ok(root && path.dirname(root) === os.tmpdir().replace(/\/$/, '') && /^axildb-(?:storage-ui|delete-ui)-/.test(path.basename(root)), 'Disposable UI fixture root only')
const db = new PrismaClient(), browser = await chromium.launch({ channel: 'chrome', headless: true }), base = 'http://localhost:3107'
const exec = promisify(execFile), users = [], names = ['manual-20261028T190000Z', 'axildb-20261028T190001Z', 'deploy-ui-protected']
async function fixture(name) {
  await mkdir(path.join(root, name), { mode: 0o700 })
  for (const file of ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz']) await writeFile(path.join(root, name, file), Buffer.alloc(65536, 1))
  await writeFile(path.join(root, name, 'manifest.txt'), 'created_at=20261028T190000Z\ndatabase_format=pg_dump_custom\n')
}
async function signed(admin) {
  const user = await db.user.create({ data: { email: `storage-ui-${randomBytes(8).toString('hex')}@test.invalid`, passwordHash: 'fixture', role: admin ? 'SERVER_ADMIN' : 'USER', emailVerifiedAt: new Date(), ...(admin ? { twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture' } } } : {}) } })
  users.push(user.id)
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), ...(admin ? { twoFactorVerifiedAt: new Date() } : {}) } })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: 'axildb_session', value: token, url: base }])
  return { context, user }
}
const worker = () => exec('node', ['--import', 'tsx', 'scripts/run-backup-worker.ts', '--once'], { env: process.env })
try {
  for (const name of names) await fixture(name)
  const { context, user } = await signed(true), page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  let action
  page.on('request', r => { if (r.headers()['next-action']) action = { headers: r.headers(), data: r.postData() } })
  await page.goto(`${base}/server?selectedBackup=${names[0]}`)
  const panel = page.locator('#backup-storage')
  await expect(panel).toContainText('Filesystem available')
  await expect(panel).not.toContainText('Not measured yet')
  await page.getByText('Delete this backup folder', { exact: true }).click()
  const button = page.getByRole('button', { name: 'Delete backup', exact: true })
  await expect(button).toBeDisabled()
  await page.locator('input[name=confirmation]').fill(names[0])
  await button.click()
  await expect(page).toHaveURL(/backup=deletion-requested/)
  await access(path.join(root, names[0]))
  assert.equal(await db.backupRun.count({ where: { scope: 'BACKUP_DELETE', status: 'REQUESTED', requestedById: user.id } }), 1)
  // Browser can leave; work is durable and completes in the existing worker.
  await page.goto(`${base}/server`)
  await worker()
  await assert.rejects(access(path.join(root, names[0])))
  await page.reload()
  await expect(panel).toContainText('Measured filesystem available-space change:')

  await page.goto(`${base}/server?selectedBackup=${names[1]}`)
  await page.getByText('Delete this backup folder', { exact: true }).click()
  await page.locator('input[name=confirmation]').fill(names[1])
  await button.click(); await expect(page).toHaveURL(/backup=deletion-requested/)
  await chmod(path.join(root, names[1]), 0o500)
  await worker()
  const failed = await db.backupRun.findFirstOrThrow({ where: { requestedById: user.id, scope: 'BACKUP_DELETE', status: 'DELETE_FAILED' } })
  await page.reload()
  await expect(panel).toContainText('DELETE_FAILED')
  await chmod(path.join(root, `.gc-${failed.id}`), 0o700)
  await panel.getByRole('button', { name: 'Scan for garbage', exact: true }).click()
  await expect(panel).toContainText('Garbage collection preview — no files changed')
  await access(path.join(root, `.gc-${failed.id}`))
  const clean = panel.getByRole('button', { name: 'Clean up eligible files', exact: true })
  await expect(clean).toBeDisabled()
  await panel.getByRole('textbox').fill('PURGE DELETED BACKUPS')
  await clean.click()
  await expect(panel.getByRole('status')).toContainText('queued')
  await page.reload() // job survives refresh; resume through the existing backup worker
  await worker(); await page.reload()
  await expect(panel).toContainText('Completed')
  await assert.rejects(access(path.join(root, `.gc-${failed.id}`)))
  await access(path.join(root, names[2]))

  await page.goto(`${base}/server?selectedBackup=${names[2]}`)
  await page.getByText('Delete this backup folder', { exact: true }).click()
  await page.locator('input[name=confirmation]').fill(names[2])
  await button.click()
  await expect(page.locator('form [role=alert]')).toContainText('Deployment checkpoint')
  await access(path.join(root, names[2]))

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await panel.locator('summary').click()
    assert.ok(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 2), `Storage panel fits ${width}px`)
    await panel.locator('summary').click()
  }
  await panel.getByRole('button', { name: 'Refresh storage', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Refresh storage', exact: true })).toBeEnabled()
  assert.ok(action)
  const regular = await signed(false)
  const rejected = await regular.context.request.post(`${base}/server`, { headers: { 'next-action': action.headers['next-action'], 'content-type': action.headers['content-type'], origin: base }, data: action.data })
  assert.ok(rejected.status() >= 400, 'Ordinary user cannot access storage Server Actions')
  assert.deepEqual(errors, [])
  console.log('Storage UI passed: queued deletion vs physical removal, browser disconnection, permission failure, dry-run confirmation, GC retry/progress, live FS delta, deployment protection, ordinary-user rejection and 390/768/1440px layout.')
} finally {
  await browser.close()
  await db.backupRun.deleteMany({ where: { requestedById: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect()
  for (const name of await (await import('node:fs/promises')).readdir(root)) {
    // Root is dedicated to this script; fixtures only, never production backups.
    await rm(path.join(root, name), { recursive: true, force: true })
  }
}
