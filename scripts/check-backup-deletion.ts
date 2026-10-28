import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, access, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deleteBackupFolder } from '../lib/admin/restore-management'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axildb-delete-service-'))
  const previous = process.env.AXILDB_BACKUP_ROOT
  process.env.AXILDB_BACKUP_ROOT = root
  try {
    const db = { backupRun: { findMany: async () => { throw new Error('Deletion must not scan unrelated backups') }, findFirst: async () => null } } as any
    for (const name of ['deploy-738e6a3651c4480f8dddb7e249ef512c', 'manual-20261019T023821Z', 'axildb-20261018T231402Z']) {
      const directory = path.join(root, name)
      await mkdir(directory, { mode: 0o700 })
      for (const file of ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz']) await writeFile(path.join(directory, file), 'fixture', { mode: 0o600 })
      await writeFile(path.join(directory, 'manifest.txt'), 'created_at=20261028T180000Z\ndatabase_format=pg_dump_custom\n')
      await deleteBackupFolder(db, directory, 'fixture-admin')
      await assert.rejects(access(directory))
    }
    const active = path.join(root, 'deploy-active')
    await mkdir(active)
    for (const status of ['REQUESTED', 'RUNNING']) {
      const activeDb = { backupRun: { findFirst: async () => ({ id: 'active', status }) } } as any
      await assert.rejects(deleteBackupFolder(activeDb, 'deploy-active', 'fixture-admin'), /linked run is active/)
      await access(active)
    }
    let updated = false
    const linkedDb = { backupRun: {
      findFirst: async () => ({ id: 'historical', status: 'SUCCEEDED', log: 'Original log' }),
      update: async ({ where, data }: any) => {
        assert.equal(where.id, 'historical'); assert.equal(data.status, 'DELETED')
        assert.match(data.log, /Original log\nBackup folder deleted by fixture-admin/); updated = true
      },
    } } as any
    await deleteBackupFolder(linkedDb, 'deploy-active', 'fixture-admin')
    assert.ok(updated, 'Keep linked history with DELETED status')
    await assert.rejects(deleteBackupFolder(db, 'manual-missing', 'fixture-admin'), /was not found/)
    await mkdir(path.join(root, '.migration'))
    for (const invalid of ['.migration', '../outside', root]) await assert.rejects(deleteBackupFolder(db, invalid, 'fixture-admin'), /outside/)
    await symlink(path.join(root, '.migration'), path.join(root, 'deploy-link'))
    await assert.rejects(deleteBackupFolder(db, 'deploy-link', 'fixture-admin'), /real directory/)
    await access(path.join(root, '.migration'))
    console.log('Active runs, linked history, missing folders, traversal, reserved folders and symlinks checked.')
    console.log('Unlinked deploy, manual and axildb backup folders delete successfully from a private disposable directory.')
  } finally { if (previous === undefined) delete process.env.AXILDB_BACKUP_ROOT; else process.env.AXILDB_BACKUP_ROOT = previous; await rm(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
