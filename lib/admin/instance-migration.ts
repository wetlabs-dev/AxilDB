import { constants } from 'node:fs'
import { lstat, open, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { backupRootAbsolutePath } from './restore-management'

export const migrationRoot = () => path.join(backupRootAbsolutePath(), '.migration')
export type MigrationJob = {
  id: string; reportSource?: 'local' | 'imported'; command: string; status: string; stage?: string; requestedBy: string
  requestedAt: string; startedAt?: string; completedAt?: string; error?: string
  archive?: string; archiveDeleted?: boolean; archiveBytes?: number; archiveSha256?: string; keepStopped?: boolean
  manifest?: Record<string, unknown>; verification?: Record<string, unknown>
  recoveryError?: string; safetyArchive?: string; rollbackDatabase?: string
}
export function migrationArchivePath(name: string) {
  if (!/^axildb-migration-[a-f0-9]{32}\.tar\.gz$/.test(name)) throw new Error('Invalid migration archive name.')
  return path.join(migrationRoot(), name)
}
export async function migrationJobs(): Promise<MigrationJob[]> {
  const candidates: { name: string; file: string; modified: number; reportSource: 'local' | 'imported' }[] = []
  for (const [directory, reportSource] of [['jobs', 'local'], ['imported-history', 'imported']] as const) {
    const root = path.join(migrationRoot(), directory)
    const names = await readdir(root).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const name of names.filter(n => /^[a-f0-9]{32}\.json$/.test(n))) {
      const file = path.join(root, name)
      candidates.push({ name, file, modified: (await lstat(file)).mtimeMs, reportSource })
    }
  }
  const jobs: MigrationJob[] = []
  for (const { file, reportSource } of candidates.sort((a, b) => b.modified - a.modified).slice(0, 25)) {
    const info = await lstat(file)
    if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new Error('Invalid migration job record.')
    const job: MigrationJob = JSON.parse(await readFile(file, 'utf8'))
    job.reportSource = reportSource
    // Full manifests are streamed from the report endpoint on demand.
    delete job.manifest
    delete job.verification
    if (job.archive) {
      const exists = await lstat(migrationArchivePath(job.archive)).catch(() => null)
      if (!exists?.isFile()) { job.archiveDeleted = true; delete job.archive }
    }
    jobs.push(job)
  }
  return jobs.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
}
export async function queueMigration(command: 'create' | 'verify' | 'preflight', requestedBy: string, options: { archive?: string; keepStopped?: boolean } = {}) {
  if (options.archive) migrationArchivePath(options.archive)
  const root = path.join(migrationRoot(), 'jobs')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const id = randomUUID().replaceAll('-', '')
  const job: MigrationJob = { id, command, requestedBy, requestedAt: new Date().toISOString(), status: 'REQUESTED', ...options }
  const temp = path.join(root, `${id}.tmp`)
  await writeFile(temp, JSON.stringify(job, null, 2), { flag: 'wx', mode: 0o600 })
  await rename(temp, path.join(root, `${id}.json`))
  return job
}
export async function migrationPreflight() {
  try {
    return JSON.parse(await readFile(path.join(migrationRoot(), 'preflight.json'), 'utf8')) as {
      createdAt: string; databaseBytes: number; estimatedBytes: number
      recordCounts: Record<string, number>; storage: Record<string, { files: number; bytes: number }>
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
export async function openMigrationArchive(name: string) {
  const file = migrationArchivePath(name)
  const info = await lstat(file)
  if (!info.isFile()) throw new Error('Migration archive is not a regular file.')
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  const opened = await handle.stat()
  if (!opened.isFile()) { await handle.close(); throw new Error('Migration archive is not a regular file.') }
  return { stream: handle.createReadStream(), bytes: opened.size, file }
}
export async function deleteMigrationArchive(name: string) {
  const file = migrationArchivePath(name)
  // Jobs remain as immutable history. Deletion only removes the completed archive.
  const info = await lstat(file)
  if (!info.isFile()) throw new Error('Migration archive is not a regular file.')
  await unlink(file)
}
