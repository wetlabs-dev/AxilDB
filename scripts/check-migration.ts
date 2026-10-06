import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { migrationOutboundHeld, assertMigrationOutboundReleased } from '../lib/migration-hold'
import { migrationArchivePath, openMigrationArchive, queueMigration } from '../lib/admin/instance-migration'
import { listBackupFolders } from '../lib/admin/restore-management'
import { sendEmail } from '../lib/email'
import { processAiCuratorWake } from '../lib/ai-curator'
import { processDomainEventBatch } from '../lib/events/process'
import { processPendingImageModeration } from '../lib/image-moderation'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axildb-migration-check-'))
  const previous = process.env.AXILDB_BACKUP_ROOT
  process.env.AXILDB_BACKUP_ROOT = root
  try {
    assert.equal(await migrationOutboundHeld(), false)
    const job = await queueMigration('preflight', 'test@example.invalid')
    const saved = JSON.parse(await readFile(path.join(root, '.migration/jobs', `${job.id}.json`), 'utf8'))
    assert.equal(saved.status, 'REQUESTED')
    assert.equal(saved.requestedBy, 'test@example.invalid')
    for (const name of ['../secret', '/etc/passwd', 'axildb-migration-invalid.tar.gz']) {
      assert.throws(() => migrationArchivePath(name))
    }
    const archive = `axildb-migration-${'b'.repeat(32)}.tar.gz`
    await symlink('/etc/passwd', migrationArchivePath(archive))
    await assert.rejects(openMigrationArchive(archive), /regular file/)
    const routine = path.join(root, 'axildb-20261005T190000Z')
    await mkdir(routine)
    for (const name of ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz']) await writeFile(path.join(routine, name), 'fixture')
    await writeFile(path.join(routine, 'manifest.txt'), 'created_at=20261005T190000Z\ndatabase_format=pg_dump_custom\n')
    const historyDb = { backupRun: { findMany: async () => [{ id: 'original-history', backupPath: '/old/server/backups/axildb-20261005T190000Z', status: 'SUCCEEDED', requestedAt: new Date(), startedAt: null, finishedAt: null, notes: null, requestedBy: null }] } } as any
    const folders = await listBackupFolders(historyDb)
    assert.equal(folders.length, 1)
    assert.equal(folders[0].linkedRun?.id, 'original-history')
    const hold = path.join(root, '.migration/outbound-hold.json')
    await mkdir(path.dirname(hold), { recursive: true })
    await writeFile(hold, '{}')
    assert.equal(await migrationOutboundHeld(), true)
    await assert.rejects(assertMigrationOutboundReleased(), /held after restore/)
    await assert.rejects(sendEmail({ to: 'test@example.invalid', subject: 'test', text: 'test', html: 'test' }), /held after restore/)
    // Guards must run before any database/provider operation.
    const noDatabase = new Proxy({}, { get() { throw new Error('Unexpected database access') } }) as any
    await assert.rejects(processAiCuratorWake(noDatabase), /held after restore/)
    await assert.rejects(processDomainEventBatch(noDatabase), /held after restore/)
    await assert.rejects(processPendingImageModeration(noDatabase), /held after restore/)
    await unlink(hold)
    await assertMigrationOutboundReleased()
    console.log('Migration service checks passed: durable queue, path confinement, symlink rejection, outbound/worker holds and release.')
  } finally {
    if (previous === undefined) delete process.env.AXILDB_BACKUP_ROOT
    else process.env.AXILDB_BACKUP_ROOT = previous
    await rm(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
