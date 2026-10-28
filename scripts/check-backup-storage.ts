import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, access, rm, rename, symlink, chmod, lstat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { backupFilesystem, processBackupStorage, requestBackupDeletion, requestBackupGc, scanBackupStorage } from '../lib/admin/backup-storage'

assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/, 'Disposable database only')
const db = new PrismaClient()
async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axildb-storage-')), outside = await mkdtemp(path.join(os.tmpdir(), 'axildb-storage-outside-'))
  const previous = process.env.AXILDB_BACKUP_ROOT
  process.env.AXILDB_BACKUP_ROOT = root
  const user = await db.user.create({ data: { email: `storage-${Date.now()}@test.invalid`, passwordHash: 'fixture' } })
  const ids: string[] = []
  const create = async (name: string) => {
    await mkdir(path.join(root, name))
    for (const file of ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz']) await writeFile(path.join(root, name, file), Buffer.alloc(65536, 1))
    await writeFile(path.join(root, name, 'manifest.txt'), 'created_at=20261028T190000Z\ndatabase_format=pg_dump_custom\n')
    return name
  }
  const request = async (name: string) => { const id = await requestBackupDeletion(db, name, user.id); ids.push(id); return id }
  try {
    const fs = await backupFilesystem()
    assert.ok(fs && fs.availableBytes > 0 && fs.totalBytes >= fs.usedBytes)
    const first = await create('manual-20261028T190000Z')
    const history = await db.backupRun.create({ data: { scope: 'SITEWIDE', status: 'SUCCEEDED', backupPath: path.join(root, first), requestedById: user.id } }); ids.push(history.id)
    const shared = await db.backupRun.create({ data: { scope: 'SITEWIDE', status: 'SUCCEEDED', backupPath: `backups/${first}`, requestedById: user.id } }); ids.push(shared.id)
    const [a, b] = await Promise.all([request(first), request(first)])
    assert.equal(a, b, 'Concurrent intent requests deduplicate')
    const before = await db.backupRun.findMany({ where: { requestedById: user.id } })
    const preview = await scanBackupStorage(db)
    assert.ok(preview.entries.some(e => e.name === first && e.status === 'Pending cleanup'))
    await access(path.join(root, first))
    assert.deepEqual(await db.backupRun.findMany({ where: { requestedById: user.id } }), before, 'Preview does not mutate metadata')
    const gc = await requestBackupGc(db, preview.digest, user.id); ids.push(gc)
    await processBackupStorage(db)
    await assert.rejects(access(path.join(root, first)))
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: a } })).status, 'DELETED')
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: history.id } })).status, 'DELETED')
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: shared.id } })).status, 'DELETED', 'All terminal references are reconciled without erasing history')
    const done = await db.backupRun.findUniqueOrThrow({ where: { id: gc } })
    assert.equal(done.status, 'SUCCEEDED')
    assert.equal(typeof (done.manifest as any).availableDelta, 'number', 'Measure, never infer free-space change')
    assert.equal(await request(first), a, 'Already-removed artifact has an idempotent durable receipt')
    assert.equal(await processBackupStorage(db), false, 'Repeated worker wakes do not remove new data')

    await writeFile(path.join(outside, 'keep'), 'outside')
    await symlink(outside, path.join(root, 'manual-link'))
    for (const name of ['../outside', root, '.migration', 'manual-link']) await assert.rejects(request(name))
    await mkdir(path.join(root, 'manual-unknown'))
    await assert.rejects(request('manual-unknown'), /ownership/)
    const deploy = await create('deploy-fixture')
    await assert.rejects(request(deploy), /Deployment/)
    const unknown = path.join(root, 'not-a-backup.partial'); await writeFile(unknown, 'keep')
    await mkdir(path.join(root, '.migration')); await writeFile(path.join(root, '.migration', 'export.partial'), 'keep')
    const pinned = await create('manual-pinned')
    const pin = await db.backupRun.create({ data: { backupPath: path.join(root, pinned), status: 'SUCCEEDED', notes: 'pinned', requestedById: user.id } }); ids.push(pin.id)
    await assert.rejects(request(pinned), /pinned/)
    const active = await db.backupRun.create({ data: { status: 'RUNNING', requestedById: user.id } }); ids.push(active.id)
    const waiting = await create('manual-waiting')
    await assert.rejects(request(waiting), /active/)
    await db.backupRun.update({ where: { id: active.id }, data: { status: 'FAILED' } })
    const restore = await db.restoreRequest.create({ data: { backupName: waiting, backupPath: path.join(root, waiting), requestedByUserId: user.id } })
    await assert.rejects(request(waiting), /restore plan/)
    await db.restoreRequest.update({ where: { id: restore.id }, data: { status: 'CANCELLED' } })

    const interrupted = await create('manual-interrupted'), interruptedId = await request(interrupted)
    await rename(path.join(root, interrupted), path.join(root, `.gc-${interruptedId}`))
    await db.backupRun.update({ where: { id: interruptedId }, data: { status: 'RUNNING' } })
    const resumptions = await Promise.all([processBackupStorage(db), processBackupStorage(db)])
    assert.ok(resumptions.some(Boolean), 'One worker owns the session lock')
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: interruptedId } })).status, 'DELETED')

    const changed = await create('manual-changed'), changedId = await request(changed)
    await rename(path.join(root, changed), path.join(root, 'original-retained'))
    await create(changed)
    await processBackupStorage(db)
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: changedId } })).status, 'DELETE_FAILED')
    await access(path.join(root, changed)); await access(path.join(root, 'original-retained'))

    const linked = await create('manual-inner-link'), linkedId = await request(linked)
    await symlink(outside, path.join(root, linked, 'external-link'))
    await processBackupStorage(db)
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: linkedId } })).status, 'DELETED')
    await access(path.join(outside, 'keep'))
    const gone = await create('manual-gone'), goneId = await request(gone)
    await rm(path.join(root, gone), { recursive: true }) // Simulated crash after FS removal and before metadata commit.
    await processBackupStorage(db)
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: goneId } })).status, 'DELETED')

    const denied = await create('manual-denied'), deniedId = await request(denied)
    await chmod(path.join(root, denied), 0o500)
    await processBackupStorage(db)
    const failed = await db.backupRun.findUniqueOrThrow({ where: { id: deniedId } })
    assert.equal(failed.status, 'DELETE_FAILED', 'A permission failure is durable')
    await chmod(path.join(root, `.gc-${deniedId}`), 0o700)
    const retry = await scanBackupStorage(db)
    assert.ok(retry.entries.some(e => e.intentId === deniedId && e.status === 'Deletion failed'))
    const retryJob = await requestBackupGc(db, retry.digest, user.id); ids.push(retryJob)
    await processBackupStorage(db)
    assert.equal((await db.backupRun.findUniqueOrThrow({ where: { id: deniedId } })).status, 'DELETED')
    // Wrong-identity failure remains excluded from eligibility, never silently purged.
    await access(path.join(root, changed))
    await access(unknown); await access(path.join(root, '.migration', 'export.partial')); await access(path.join(outside, 'keep'))
    const oldScan = await scanBackupStorage(db)
    const another = await create('manual-next'); await request(another)
    await assert.rejects(requestBackupGc(db, oldScan.digest, user.id), /Storage changed/)
    assert.ok((await scanBackupStorage(db)).entries.some(e => e.status === 'Orphaned artifact'))
    assert.equal((await lstat(path.join(root, 'manual-link'))).isSymbolicLink(), true)
    process.env.AXILDB_BACKUP_ROOT = path.join(root, 'missing-root')
    const unavailable = await scanBackupStorage(db)
    assert.equal(unavailable.filesystem, null); assert.equal(unavailable.estimateBytes, null, 'Missing metrics must not become zero')
    process.env.AXILDB_BACKUP_ROOT = root
    console.log('Backup storage passed: dry run, real removal, measured FS delta, metadata/history, concurrency, interrupted quarantine, crash reconciliation, permissions/retry, identity replacement, traversal/symlinks, active/pinned/deploy protection, unknown/temp preservation, stale preview and orphan classification.')
  } finally {
    await db.restoreRequest.deleteMany({ where: { requestedByUserId: user.id } })
    await db.backupRun.deleteMany({ where: { requestedById: user.id } })
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect()
    if (previous === undefined) delete process.env.AXILDB_BACKUP_ROOT; else process.env.AXILDB_BACKUP_ROOT = previous
    await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
