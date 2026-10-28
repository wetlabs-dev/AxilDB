import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, access, rm, chmod } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const url = new URL(process.env.DATABASE_URL || '')
assert.ok(url.hostname === 'localhost' && url.port === '55439' && url.pathname === '/axildb', 'Disposable database only')
const root = process.env.AXILDB_BACKUP_ROOT
assert.ok(root && path.dirname(root) === os.tmpdir().replace(/\/$/, '') && path.basename(root).startsWith('axildb-delete-ui-'), 'Use a newly created private test root')
const base = 'http://localhost:3107', db = new PrismaClient(), browser = await chromium.launch({ channel: 'chrome', headless: true })
const user = await db.user.create({ data: { email: `delete-${randomUUID()}@example.test`, passwordHash: 'fixture', role: 'SERVER_ADMIN', emailVerifiedAt: new Date(), twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture' } } } })
const names = ['deploy-' + randomUUID().replaceAll('-', ''), 'manual-20261028T190000Z', 'axildb-20260824T161026Z-fixture']
try {
  for (const name of names) {
    const directory = path.join(root, name); await mkdir(directory, { mode: 0o700 })
    for (const file of ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz']) await writeFile(path.join(directory, file), 'fixture', { mode: 0o600 })
    await writeFile(path.join(directory, 'manifest.txt'), 'created_at=20261028T190000Z\ngit_commit=fixture\ndatabase_format=pg_dump_custom\n')
  }
  await db.backupRun.create({ data: { backupPath: path.join(root, names[2]), status: 'SUCCEEDED', requestedById: user.id } })
  const token = randomBytes(32).toString('hex')
  await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), twoFactorVerifiedAt: new Date() } })
  const context = await browser.newContext()
  await context.addCookies([{ name: 'axildb_session', value: token, url: base }])
  const page = await context.newPage()
  for (const name of names) {
    await page.goto(`${base}/server?selectedBackup=${encodeURIComponent(name)}`)
    await page.getByText('Delete this backup folder', { exact: true }).click()
    const confirmation = page.locator('input[name=confirmation]')
    const button = page.getByRole('button', { name: 'Delete backup', exact: true })
    await expect(button).toBeDisabled()
    await confirmation.fill('wrong name')
    await expect(button).toBeDisabled()
    await confirmation.fill(name)
    await expect(button).toBeEnabled()
    if (name === names[0]) {
      // Remove only this disposable fixture after rendering to exercise an action failure.
      await rm(path.join(root, name), { recursive: true })
      await button.click()
      await expect(page.locator('form [role=alert]')).toContainText('was not found')
      await expect(confirmation).toHaveValue(name)
      await expect(page).toHaveURL(/selectedBackup=/)
      await mkdir(path.join(root, name), { mode: 0o700 })
    }
    if (name === names[1]) {
      await chmod(path.join(root, name), 0o500)
      try {
        await button.click()
        await expect(page.locator('form [role=alert]')).toContainText('filesystem permissions')
        await expect(confirmation).toHaveValue(name)
        await access(path.join(root, name))
      } finally { await chmod(path.join(root, name), 0o700) }
    }
    await page.getByRole('button', { name: 'Delete backup', exact: true }).click()
    await expect(page).toHaveURL(/backup=deleted/)
    await assert.rejects(access(path.join(root, name)))
    console.log('Deleted fixture via real server action:', name)
  }
} finally {
  await db.backupRun.deleteMany({ where: { requestedById: user.id } })
  await db.user.delete({ where: { id: user.id } })
  await browser.close(); await db.$disconnect()
  for (const name of names) await rm(path.join(root, name), { recursive: true, force: true })
}
