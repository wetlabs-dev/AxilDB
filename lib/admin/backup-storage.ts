import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, readdir, readFile, realpath, statfs, readlink } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient, type BackupRun } from '@prisma/client'
import { migrationOutboundHeld } from '../migration-hold'
import { backupRootAbsolutePath, resolveBackupFolder } from './restore-management'

const exec = promisify(execFile)
const DELETE = 'BACKUP_DELETE', GC = 'BACKUP_GC'
const active = ['REQUESTED', 'RUNNING']
const managedName = /^(?:axildb|manual|deploy)-[A-Za-z0-9_-]+$/
type Identity = [string, string]
type Intent = { version: 1; root: string; rootIdentity: Identity; identity: Identity; name: string; tomb: string; nominalBytes: number; allocatedBytes: number }
const identity = (s: { dev: number | bigint; ino: number | bigint }): Identity => [String(s.dev), String(s.ino)]
const same = (a: Identity, b: Identity) => a[0] === b[0] && a[1] === b[1]
function intent(run: BackupRun): Intent | null {
  const value = run.manifest as any
  return run.scope === DELETE && value?.version === 1 && managedName.test(value.name) && value.tomb === `.gc-${run.id}` && Array.isArray(value.identity) && Array.isArray(value.rootIdentity) ? value : null
}
function event(operation: string, id: string, result: string, extra = {}) {
  console.info(JSON.stringify({ event: 'backup_storage', operation, id, result, at: new Date().toISOString(), ...extra }))
}
async function containerMount(directory: string) {
  try {
    const decode = (s: string) => s.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).trim().split('\n').map(line => {
      const [left, right] = line.split(' - '), fields = left.split(' '), details = right.split(' ')
      return { mountPoint: decode(fields[4]), filesystemType: details[0], source: decode(details[1]) }
    }).filter(m => directory === m.mountPoint || directory.startsWith(m.mountPoint === '/' ? '/' : `${m.mountPoint}/`))
    return mounts.sort((a, b) => b.mountPoint.length - a.mountPoint.length)[0] || null
  } catch { return null }
}
export async function backupFilesystem() {
  try {
    const resolved = await realpath(backupRootAbsolutePath()), info = await lstat(resolved, { bigint: true }), s = await statfs(resolved)
    if (!info.isDirectory()) throw new Error('Backup root is not a directory')
    return { configured: backupRootAbsolutePath(), resolved, identity: identity(info), device: String(info.dev), totalBytes: Number(s.blocks) * Number(s.bsize), usedBytes: Number(s.blocks - s.bfree) * Number(s.bsize), availableBytes: Number(s.bavail) * Number(s.bsize), reservedBytes: Number(s.bfree - s.bavail) * Number(s.bsize), checkedAt: new Date().toISOString(), mount: await containerMount(resolved) }
  } catch { return null }
}
async function usage(directory: string, device: number, seen = new Set<string>()) {
  let nominal = 0, allocated = 0
  async function walk(file: string) {
    if (seen.size > 50000) throw new Error('Inventory limit exceeded; manual review required')
    const s = await lstat(file, { bigint: true })
    if (s.dev !== BigInt(device)) throw new Error('Nested filesystem; manual review required')
    if (s.isSymbolicLink()) return // Account for neither nor traverse its target.
    const key = `${s.dev}:${s.ino}`
    if (seen.has(key)) return
    seen.add(key)
    allocated += Number(s.blocks) * 512
    if (s.isDirectory()) for (const child of await readdir(file)) await walk(path.join(file, child))
    else if (s.isFile()) nominal += Number(s.size)
  }
  await walk(directory)
  return { nominal, allocated }
}
async function absent(file: string) {
  try { await lstat(file); return false } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return true; throw e }
}
/** Conservative policy: deploy checkpoints and migration control/exports are never GC candidates.
 * Their independent host agent cannot participate in this worker's lock. */
async function protectedReason(db: PrismaClient, name: string) {
  if (await migrationOutboundHeld()) return 'Full-instance migration or recovery hold is active'
  if (name.startsWith('deploy-')) return 'Deployment checkpoint: retain for host recovery review'
  const runs = await db.backupRun.findMany({ where: { scope: { notIn: [DELETE, GC] } } })
  if (runs.some(r => active.includes(r.status))) return 'Backup creation is active; retry after it finishes'
  const references = runs.filter(r => r.backupPath && path.basename(r.backupPath) === name)
  if (references.some(r => /\b(?:protected|pinned)\b/i.test(r.notes || ''))) return 'Backup is marked protected or pinned'
  const restore = await db.restoreRequest.findFirst({ where: { backupName: name, status: { in: ['PLANNED', 'VALIDATED', 'COMMAND_GENERATED'] } } })
  if (restore) return 'Referenced by an open restore plan'
  return null
}
export type StorageEntry = { name: string; status: string; reason: string; nominalBytes: number | null; allocatedBytes: number | null; intentId?: string }
export async function scanBackupStorage(db: PrismaClient) {
  const filesystem = await backupFilesystem()
  const runs = await db.backupRun.findMany({ orderBy: { requestedAt: 'desc' } })
  const storageJobs = runs.filter(r => [DELETE, GC].includes(r.scope))
  const recentJobs = [...storageJobs.filter(r => active.includes(r.status)), ...storageJobs.filter(r => !active.includes(r.status)).slice(0, 15)].map(r => ({ id: r.id, scope: r.scope, status: r.status, name: intent(r)?.name || 'Garbage collection', progress: r.manifest, error: r.error, updatedAt: r.updatedAt.toISOString() }))
  const entries: StorageEntry[] = []
  if (!filesystem) return { filesystem, entries, recentJobs, estimateBytes: null, digest: '', checkedAt: new Date().toISOString(), error: 'Backup storage unavailable. Check the configured path and container mount.', uploadFilesystemSame: null, openDeleted: null }
  const rootStat = await lstat(filesystem.resolved)
  const seen = new Set<string>()
  const names = await readdir(filesystem.resolved)
  for (const name of names) {
    const file = path.join(filesystem.resolved, name)
    try {
      const s = await lstat(file, { bigint: true })
      const deletion = runs.find(r => { const i = intent(r); return i && (i.name === name || i.tomb === name) && i.root === filesystem.resolved && same(i.rootIdentity, filesystem.identity) })
      let amount: { nominal: number; allocated: number } | null = null
      if (!s.isSymbolicLink()) amount = await usage(file, rootStat.dev, seen)
      let status = 'Manual review', reason = 'Unknown artifact: excluded from automatic cleanup'
      if (name === '.migration') { status = 'Protected'; reason = 'Migration exports, embedded backup copies, staging and control state: excluded' }
      else if (deletion && intent(deletion) && same(intent(deletion)!.identity, identity(s))) {
        if (['REQUESTED', 'RUNNING', 'DELETE_FAILED'].includes(deletion.status)) {
          const protectedBy = await protectedReason(db, intent(deletion)!.name)
          status = protectedBy ? 'Protected' : deletion.status === 'DELETE_FAILED' ? 'Deletion failed' : 'Pending cleanup'
          reason = protectedBy || (deletion.status === 'DELETE_FAILED' ? deletion.error || 'Deletion failed; preview a retry' : 'Explicit deletion intent with matching filesystem identity')
        } else { status = 'Manual review'; reason = 'A completed deletion has a remaining artifact; identity requires operator review' }
      } else if (managedName.test(name) && s.isDirectory() && !s.isSymbolicLink()) {
        const files = await readdir(file)
        const complete = ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz'].every(f => files.includes(f)) && files.some(f => ['manifest.txt', 'manifest.json'].includes(f))
        const linked = runs.some(r => ![DELETE, GC].includes(r.scope) && r.backupPath && path.basename(r.backupPath) === name)
        status = (await protectedReason(db, name)) ? 'Protected' : complete ? linked ? 'Healthy' : 'Orphaned artifact' : 'Incomplete artifact'
        reason = status === 'Protected' ? (await protectedReason(db, name))! : complete ? linked ? 'Archive exists with history' : 'Recognized backup without history; retained until explicitly selected for deletion' : 'Incomplete or temporary data; no proven safe deletion intent, retained'
      }
      entries.push({ name, status, reason, nominalBytes: amount?.nominal ?? null, allocatedBytes: amount?.allocated ?? null, ...(deletion ? { intentId: deletion.id } : {}) })
    } catch { entries.push({ name, status: 'Storage unavailable', reason: 'Artifact changed or cannot be read; excluded', nominalBytes: null, allocatedBytes: null }) }
  }
  for (const run of runs) {
    const i = intent(run)
    if (i && i.root === filesystem.resolved && same(i.rootIdentity, filesystem.identity) && ['REQUESTED', 'RUNNING', 'DELETE_FAILED'].includes(run.status) && await absent(path.join(filesystem.resolved, i.name)) && await absent(path.join(filesystem.resolved, i.tomb))) {
      entries.push({ name: i.name, status: 'Metadata reconciliation', reason: 'Explicitly deleted artifact is absent; metadata can be reconciled', nominalBytes: 0, allocatedBytes: 0, intentId: run.id })
    } else if (![DELETE, GC].includes(run.scope) && run.backupPath && run.status === 'SUCCEEDED' && !names.includes(path.basename(run.backupPath))) {
      entries.push({ name: path.basename(run.backupPath), status: 'Missing artifact', reason: 'History references a missing archive; verify mount before changing metadata', nominalBytes: null, allocatedBytes: null })
    }
  }
  const eligible = entries.filter(e => ['Pending cleanup', 'Deletion failed', 'Metadata reconciliation'].includes(e.status))
  const digest = createHash('sha256').update(JSON.stringify(eligible.map(e => [e.intentId, e.name, e.allocatedBytes]).sort())).digest('hex')
  let uploadFilesystemSame: boolean | null = null
  try { uploadFilesystemSame = String((await lstat(await realpath(path.resolve('public/uploads')))).dev) === filesystem.device } catch {}
  return { filesystem, entries, recentJobs, estimateBytes: eligible.reduce((n, e) => n + (e.allocatedBytes || 0), 0), digest, checkedAt: new Date().toISOString(), error: null, uploadFilesystemSame, openDeleted: await deletedOpenFiles(filesystem.device) }
}
/** Container PID namespace only. Never signals or restarts a process. */
async function deletedOpenFiles(device: string) {
  if (process.platform !== 'linux') return null
  const found: { pid: string; fd: string; bytes: number }[] = [], seen = new Set<string>()
  let inaccessible = 0
  try {
    for (const pid of (await readdir('/proc')).filter(p => /^\d+$/.test(p))) {
      try {
        for (const fd of await readdir(`/proc/${pid}/fd`)) {
          try {
            const file = `/proc/${pid}/fd/${fd}`
            if (!(await readlink(file)).endsWith(' (deleted)')) continue
            const { stat } = await import('node:fs/promises'), s = await stat(file)
            const key = `${s.dev}:${s.ino}`
            if (String(s.dev) === device && s.isFile() && !seen.has(key)) { seen.add(key); found.push({ pid, fd, bytes: s.blocks * 512 }) }
          } catch {}
        }
      } catch { inaccessible++ }
    }
    return { files: found, inaccessible, scope: 'Visible container processes only; host and other containers require host diagnostics' }
  } catch { return null }
}
async function locked<T>(db: PrismaClient, work: (tx: any) => Promise<T>) {
  return db.$transaction(async tx => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(186105, 1)`; return work(tx) })
}
export async function requestBackupDeletion(db: PrismaClient, name: string, userId: string) {
  if (!managedName.test(name)) throw new Error('Only recognized backup identities can be selected; unknown artifacts require manual review')
  const resolved = resolveBackupFolder(name), fs = await backupFilesystem()
  if (!fs) throw new Error('Backup storage unavailable')
  const reason = await protectedReason(db, name)
  if (reason) throw new Error(reason)
  if (await absent(resolved.absolutePath)) {
    const completed = await db.backupRun.findMany({ where: { scope: DELETE, status: 'DELETED' } })
    const receipt = completed.find(r => { const i = intent(r); return i?.name === name && i.root === fs.resolved && same(i.rootIdentity, fs.identity) })
    if (receipt && await absent(path.join(fs.resolved, intent(receipt)!.tomb))) return receipt.id
    throw new Error('Backup folder was not found under the configured backup root')
  }
  const s = await lstat(resolved.absolutePath, { bigint: true })
  if (!s.isDirectory() || s.isSymbolicLink() || String(s.dev) !== fs.device) throw new Error('Backup must be a real directory on the managed filesystem')
  const references = await db.backupRun.findMany({ where: { scope: { notIn: [DELETE, GC] }, backupPath: { not: null } } })
  if (!references.some(r => path.basename(r.backupPath!) === name)) {
    // A prefix alone is not proof of ownership. Unknown/incomplete untracked data is retained.
    const manifest = await readFile(path.join(resolved.absolutePath, 'manifest.txt'), 'utf8').catch(() => '')
    let json: any = null
    try { json = JSON.parse(await readFile(path.join(resolved.absolutePath, 'manifest.json'), 'utf8')) } catch {}
    if (!(/created_at[=:]\s*\d{8}T\d{6}Z/.test(manifest) && /database_format[=:]\s*pg_dump_custom/.test(manifest)) && !(json?.created_at && json?.database_format === 'pg_dump_custom')) throw new Error('Unknown backup ownership; retain for manual review')
    for (const file of ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz']) {
      const info = await lstat(path.join(resolved.absolutePath, file))
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Incomplete untracked backup; manual review required')
    }
  }
  const amount = await usage(resolved.absolutePath, Number(s.dev))
  return locked(db, async tx => {
    const existing: BackupRun[] = await tx.backupRun.findMany({ where: { scope: DELETE, status: { in: ['REQUESTED', 'RUNNING', 'DELETE_FAILED'] } } })
    const prior = existing.find(r => { const i = intent(r); return i?.root === fs.resolved && i.name === name && same(i.identity, identity(s)) })
    if (prior) return prior.id
    const run = await tx.backupRun.create({ data: { scope: DELETE, status: 'REQUESTED', requestedById: userId, backupPath: resolved.relativePath } })
    await tx.backupRun.update({ where: { id: run.id }, data: { manifest: { version: 1, name, root: fs.resolved, rootIdentity: fs.identity, identity: identity(s), tomb: `.gc-${run.id}`, nominalBytes: amount.nominal, allocatedBytes: amount.allocated } } })
    event('deletion_requested', run.id, 'REQUESTED')
    return run.id
  })
}
export async function requestBackupGc(db: PrismaClient, digest: string, userId: string) {
  const scan = await scanBackupStorage(db)
  if (!digest || digest !== scan.digest || !scan.filesystem) throw new Error('Storage changed or unavailable. Scan again before confirming cleanup.')
  const ids = [...new Set(scan.entries.filter(e => ['Pending cleanup', 'Deletion failed', 'Metadata reconciliation'].includes(e.status)).map(e => e.intentId!))]
  if (!ids.length) throw new Error('No eligible deletion intents. Unknown and orphaned data need explicit review.')
  return locked(db, async tx => {
    const existing = await tx.backupRun.findFirst({ where: { scope: GC, status: { in: active } } })
    if (existing) return existing.id
    const job = await tx.backupRun.create({ data: { scope: GC, status: 'REQUESTED', requestedById: userId, manifest: { ids, stage: 'Queued', processed: 0, removed: 0, failed: 0, estimatedBytes: scan.estimateBytes } } })
    return job.id
  })
}
async function removeIntent(db: PrismaClient, run: BackupRun) {
  const started = Date.now(), i = intent(run)
  if (!i) throw new Error('Invalid deletion intent; manual review required')
  const fs = await backupFilesystem()
  if (!fs || fs.resolved !== i.root || !same(fs.identity, i.rootIdentity)) throw new Error('Backup root or mount changed; manual review required')
  const protection = await protectedReason(db, i.name)
  if (protection) throw new Error(protection)
  await db.backupRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: new Date(), error: null } })
  event('artifact_deletion_started', run.id, 'RUNNING')
  try {
    await exec('python3', ['scripts/purge-backup.py', JSON.stringify(i)], { timeout: 30 * 60_000, maxBuffer: 16000 })
    // If the name was recreated concurrently it is a new artifact, never remove it.
    if (!(await absent(path.join(i.root, i.tomb)))) throw new Error('Quarantined artifact is still present')
    const after = await backupFilesystem()
    const availableDelta = after ? after.availableBytes - fs.availableBytes : null
    await db.$transaction(async tx => {
      const refs = await tx.backupRun.findMany({ where: { scope: { notIn: [DELETE, GC] }, backupPath: { not: null } } })
      for (const reference of refs.filter(r => path.basename(r.backupPath!) === i.name && !active.includes(r.status))) await tx.backupRun.update({ where: { id: reference.id }, data: { status: 'DELETED' } })
      await tx.backupRun.update({ where: { id: run.id }, data: { status: 'DELETED', finishedAt: new Date(), error: null, manifest: { ...i, stage: 'Completed: artifact removed and metadata reconciled', availableDelta, beforeAvailable: fs.availableBytes, afterAvailable: after?.availableBytes ?? null, checkedAt: after?.checkedAt ?? null } } })
    })
    event('artifact_deletion_succeeded', run.id, 'DELETED', { durationMs: Date.now() - started, nominalBytes: i.nominalBytes, availableDelta })
  } catch (error) {
    const e = error as any
    // Do not persist subprocess argv, which contains administrative paths.
    const message = e.stdout ? String(e.stdout).slice(0, 1500) : error instanceof Error ? error.message.slice(0, 1500) : 'Deletion failed'
    await db.backupRun.update({ where: { id: run.id }, data: { status: 'DELETE_FAILED', error: message } })
    event('artifact_deletion_failed', run.id, 'DELETE_FAILED', { durationMs: Date.now() - started })
    throw new Error(message)
  }
}
/** Existing backups worker owns the session lock through FS operations (no open DB transaction). */
export async function processBackupStorage(db: PrismaClient, fallback?: () => Promise<boolean>) {
  const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('connection_limit', '1')
  const lock = new PrismaClient({ datasources: { db: { url: url.toString() } } })
  let currentJob: string | null = null
  try {
    const [held] = await lock.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_lock(186105, 2) AS acquired`
    if (!held.acquired) return false
    const job = await db.backupRun.findFirst({ where: { scope: GC, status: { in: active } }, orderBy: { requestedAt: 'asc' } })
    if (job) {
      currentJob = job.id
      const progress = job.manifest as any
      if (!Array.isArray(progress?.ids)) throw new Error('Invalid cleanup job')
      const before = progress.beforeAvailable ?? (await backupFilesystem())?.availableBytes ?? null
      await db.backupRun.update({ where: { id: job.id }, data: { status: 'RUNNING', startedAt: job.startedAt || new Date(), manifest: { ...progress, stage: 'Validating and removing eligible artifacts', beforeAvailable: before } } })
      event('garbage_collection_started', job.id, 'RUNNING')
      let processed = 0, removed = 0, failed = 0
      for (const id of progress.ids) {
        const run = await db.backupRun.findUnique({ where: { id } })
        if (!run || !intent(run)) { failed++ }
        else if (run.status === 'DELETED') { removed++ }
        else {
          try { await removeIntent(db, run); removed++ } catch (error) { failed++; await db.backupRun.update({ where: { id: run.id }, data: { status: 'DELETE_FAILED', error: error instanceof Error ? error.message : 'Deletion failed' } }) }
        }
        processed++
        await db.backupRun.update({ where: { id: job.id }, data: { manifest: { ...progress, beforeAvailable: before, stage: 'Reconciling metadata and refreshing storage', processed, removed, failed } } })
      }
      const after = await backupFilesystem()
      await db.backupRun.update({ where: { id: job.id }, data: { status: failed ? 'PARTIAL' : 'SUCCEEDED', finishedAt: new Date(), manifest: { ...progress, stage: 'Completed', processed, removed, failed, beforeAvailable: before, afterAvailable: after?.availableBytes ?? null, availableDelta: before != null && after ? after.availableBytes - before : null, checkedAt: after?.checkedAt ?? null } } })
      event('garbage_collection_completed', job.id, failed ? 'PARTIAL' : 'SUCCEEDED', { processed, removed, failed })
      return true
    }
    const pending = await db.backupRun.findFirst({ where: { scope: DELETE, status: { in: active } }, orderBy: { requestedAt: 'asc' } })
    if (!pending) return fallback ? await fallback() : false
    try { await removeIntent(db, pending) } catch (error) {
      // Includes protection/root errors before any filesystem mutation.
      await db.backupRun.update({ where: { id: pending.id }, data: { status: 'DELETE_FAILED', error: error instanceof Error ? error.message : 'Deletion failed' } })
    }
    return true
  } catch (error) {
    event('garbage_collection_failed', currentJob || 'worker', 'FAILED')
    if (currentJob) {
      try { await db.backupRun.update({ where: { id: currentJob }, data: { status: 'FAILED', error: 'Cleanup interrupted by an application or storage error. Review deletion intents and scan again.' } }) } catch {}
    }
    throw error
  } finally { await lock.$disconnect() }
}
