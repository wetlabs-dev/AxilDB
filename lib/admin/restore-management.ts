import { execFile } from 'child_process'
import { readdir, readFile, stat } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import type { PrismaClient } from '@prisma/client'

const execFileAsync = promisify(execFile)
const requiredFiles = ['axildb.dump', 'uploads.tar.gz', 'labels.tar.gz'] as const
const manifestFiles = ['manifest.json', 'manifest.txt'] as const

export type BackupArtifact = {
  name: string
  present: boolean
  sizeBytes: number
}

export type BackupFolder = {
  name: string
  relativePath: string
  createdAt: Date | null
  sizeBytes: number
  manifestStatus: 'present' | 'missing' | 'invalid'
  manifest: Record<string, unknown> | null
  artifacts: BackupArtifact[]
  linkedRunStatus: string | null
  quickStatus: 'Complete' | 'Incomplete' | 'Invalid' | 'Unknown'
  warnings: string[]
}

export type RestoreValidationResult = {
  readiness: 'Ready' | 'Ready with warnings' | 'Not ready'
  passed: string[]
  warnings: string[]
  failed: string[]
  checkedAt: string
  backupPath: string
}

export function backupRootRelativePath() {
  return process.env.AXILDB_BACKUP_ROOT || 'backups'
}

export function backupRootAbsolutePath() {
  const configured = backupRootRelativePath()
  return path.resolve(process.cwd(), configured)
}

function safeName(name: string) {
  return path.basename(name) === name && !name.includes('..') && name.length > 0
}

export function resolveBackupFolder(nameOrPath: string) {
  const root = backupRootAbsolutePath()
  const raw = nameOrPath.trim()
  const normalizedName = raw.startsWith(`${backupRootRelativePath().replace(/\/$/, '')}/`)
    ? raw.slice(backupRootRelativePath().replace(/\/$/, '').length + 1)
    : raw
  if (!safeName(normalizedName)) throw new Error('Backup folder is outside the configured backup root.')
  const absolutePath = path.resolve(root, normalizedName)
  const relativePath = path.join(backupRootRelativePath(), normalizedName)
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error('Backup folder is outside the configured backup root.')
  return { name: normalizedName, absolutePath, relativePath }
}

async function fileArtifact(dir: string, name: string): Promise<BackupArtifact> {
  try {
    const info = await stat(path.join(dir, name))
    return { name, present: info.isFile(), sizeBytes: info.isFile() ? info.size : 0 }
  } catch {
    return { name, present: false, sizeBytes: 0 }
  }
}

async function directorySize(dir: string) {
  let total = 0
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        total += (await stat(fullPath)).size
      }
    }
  }
  await walk(dir)
  return total
}

function parseManifestText(text: string): Record<string, unknown> {
  const manifest: Record<string, unknown> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) throw new Error(`Invalid manifest line: ${trimmed}`)
    manifest[trimmed.slice(0, separator)] = trimmed.slice(separator + 1)
  }
  return manifest
}

function parseUtcStamp(value: string) {
  const match = value.match(/(\d{8})T(\d{6})Z/)
  if (!match) return null
  const [, day, time] = match
  const parsed = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function readManifest(dir: string) {
  for (const name of manifestFiles) {
    try {
      const text = await readFile(path.join(dir, name), 'utf8')
      const manifest = name.endsWith('.json') ? JSON.parse(text) : parseManifestText(text)
      return { name, text, manifest, status: 'present' as const }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      return { name, text: '', manifest: null, status: 'invalid' as const }
    }
  }
  return { name: null, text: '', manifest: null, status: 'missing' as const }
}

function backupCreatedAt(name: string, manifest: Record<string, unknown> | null) {
  const manifestCreatedAt = manifest?.created_at
  if (typeof manifestCreatedAt === 'string') {
    const parsed = parseUtcStamp(manifestCreatedAt) || new Date(manifestCreatedAt)
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed
  }
  return parseUtcStamp(name)
}

function quickStatus(artifacts: BackupArtifact[], manifestStatus: BackupFolder['manifestStatus']): BackupFolder['quickStatus'] {
  if (manifestStatus === 'invalid') return 'Invalid'
  const missing = artifacts.some((artifact) => !artifact.present)
  const empty = artifacts.some((artifact) => artifact.present && artifact.sizeBytes === 0)
  if (manifestStatus === 'missing' || missing || empty) return 'Incomplete'
  return 'Complete'
}

export async function listBackupFolders(prisma: PrismaClient): Promise<BackupFolder[]> {
  const root = backupRootAbsolutePath()
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const runs = await prisma.backupRun.findMany({
    where: { backupPath: { not: null } },
    select: { backupPath: true, status: true },
    orderBy: { requestedAt: 'desc' },
  })
  const runStatus = new Map(runs.map((run) => [run.backupPath, run.status]))
  const folders = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const backup = resolveBackupFolder(entry.name)
    const manifestResult = await readManifest(backup.absolutePath)
    const artifacts = await Promise.all(requiredFiles.map((file) => fileArtifact(backup.absolutePath, file)))
    const warnings = []
    if (manifestResult.status === 'missing') warnings.push('Manifest is missing.')
    if (manifestResult.status === 'invalid') warnings.push('Manifest could not be parsed.')
    for (const artifact of artifacts) {
      if (!artifact.present) warnings.push(`${artifact.name} is missing.`)
      if (artifact.present && artifact.sizeBytes === 0) warnings.push(`${artifact.name} is empty.`)
    }
    return {
      name: entry.name,
      relativePath: backup.relativePath,
      createdAt: backupCreatedAt(entry.name, manifestResult.manifest),
      sizeBytes: await directorySize(backup.absolutePath),
      manifestStatus: manifestResult.status,
      manifest: manifestResult.manifest,
      artifacts,
      linkedRunStatus: runStatus.get(backup.relativePath) || null,
      quickStatus: quickStatus(artifacts, manifestResult.status),
      warnings,
    }
  }))
  return folders.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
}

export async function backupDetail(prisma: PrismaClient, nameOrPath: string) {
  const backup = resolveBackupFolder(nameOrPath)
  const folders = await listBackupFolders(prisma)
  return folders.find((folder) => folder.name === backup.name) || null
}

async function commandAvailable(command: string) {
  try {
    await execFileAsync('sh', ['-c', `command -v ${command}`], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

async function currentGitCommit() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: process.cwd(), timeout: 3000 })
    return stdout.trim()
  } catch {
    return 'unknown'
  }
}

async function diskFreeBytes(dir: string) {
  try {
    const { stdout } = await execFileAsync('df', ['-Pk', dir], { timeout: 3000 })
    const lines = stdout.trim().split(/\r?\n/)
    const parts = lines[lines.length - 1]?.split(/\s+/)
    const availableKilobytes = Number(parts?.[3])
    return Number.isFinite(availableKilobytes) ? availableKilobytes * 1024 : null
  } catch {
    return null
  }
}

async function tarLists(filePath: string) {
  try {
    await execFileAsync('tar', ['-tzf', filePath], { timeout: 10000, maxBuffer: 1024 * 1024 })
    return true
  } catch {
    return false
  }
}

async function pgDumpReadable(filePath: string) {
  if (!(await commandAvailable('pg_restore'))) return null
  try {
    await execFileAsync('pg_restore', ['-l', filePath], { timeout: 10000, maxBuffer: 1024 * 1024 })
    return true
  } catch {
    return false
  }
}

export async function validateBackupForRestore(prisma: PrismaClient, nameOrPath: string): Promise<RestoreValidationResult> {
  const backup = resolveBackupFolder(nameOrPath)
  const passed: string[] = []
  const warnings: string[] = []
  const failed: string[] = []

  try {
    const info = await stat(backup.absolutePath)
    if (info.isDirectory()) passed.push('Backup folder exists under the configured backup root.')
    else failed.push('Backup path exists but is not a directory.')
  } catch {
    failed.push('Backup folder does not exist under the configured backup root.')
  }

  const manifestResult = await readManifest(backup.absolutePath)
  if (manifestResult.status === 'present') passed.push(`Manifest ${manifestResult.name} parses successfully.`)
  if (manifestResult.status === 'missing') failed.push('Manifest file is missing.')
  if (manifestResult.status === 'invalid') failed.push(`Manifest ${manifestResult.name} could not be parsed.`)

  const artifacts = await Promise.all(requiredFiles.map((file) => fileArtifact(backup.absolutePath, file)))
  for (const artifact of artifacts) {
    if (!artifact.present) failed.push(`${artifact.name} is missing.`)
    else if (artifact.sizeBytes === 0) failed.push(`${artifact.name} exists but is empty.`)
    else passed.push(`${artifact.name} exists and is non-empty.`)
  }

  const freeBytes = await diskFreeBytes(backup.absolutePath)
  const backupBytes = await directorySize(backup.absolutePath).catch(() => 0)
  if (freeBytes == null) warnings.push('Could not determine free disk space for restore staging.')
  else if (freeBytes < backupBytes * 2) warnings.push('Free disk space is less than twice the backup size; staging/extraction may be tight.')
  else passed.push('Free disk space appears sufficient for restore staging.')

  const currentCommit = await currentGitCommit()
  const backupCommit = manifestResult.manifest?.git_commit
  if (typeof backupCommit === 'string' && backupCommit && backupCommit !== 'unknown') {
    if (currentCommit === backupCommit) passed.push('Current app git commit matches the backup manifest.')
    else warnings.push(`Current app git commit ${currentCommit} differs from backup manifest commit ${backupCommit}.`)
  } else {
    warnings.push('Backup manifest does not include a usable git commit.')
  }

  const dumpReadable = await pgDumpReadable(path.join(backup.absolutePath, 'axildb.dump'))
  if (dumpReadable === true) passed.push('Database dump can be listed by pg_restore.')
  if (dumpReadable === false) failed.push('Database dump could not be listed by pg_restore.')
  if (dumpReadable == null) warnings.push('pg_restore is not available, so database dump readability was not checked.')

  for (const archive of ['uploads.tar.gz', 'labels.tar.gz']) {
    const artifact = artifacts.find((item) => item.name === archive)
    if (!artifact?.present || artifact.sizeBytes === 0) continue
    if (await tarLists(path.join(backup.absolutePath, archive))) passed.push(`${archive} can be listed by tar.`)
    else failed.push(`${archive} could not be listed by tar.`)
  }

  const detail = await backupDetail(prisma, backup.name)
  const createdAt = detail?.createdAt
  if (!createdAt) warnings.push('Backup creation time could not be determined.')
  else if (Date.now() - createdAt.getTime() > 30 * 24 * 60 * 60 * 1000) warnings.push('Backup is more than 30 days old.')
  else passed.push('Backup is recent enough for normal restore planning.')

  const maintenance = await prisma.maintenanceMode.findFirst({ where: { enabled: true }, orderBy: { updatedAt: 'desc' } })
  if (maintenance) passed.push('Maintenance mode is currently enabled.')
  else warnings.push('Maintenance mode is not enabled; active traffic should be paused before restoring.')

  return {
    readiness: failed.length ? 'Not ready' : warnings.length ? 'Ready with warnings' : 'Ready',
    passed,
    warnings,
    failed,
    checkedAt: new Date().toISOString(),
    backupPath: backup.relativePath,
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

export function restoreCommandForBackup(nameOrPath: string) {
  const backup = resolveBackupFolder(nameOrPath)
  return `AXILDB_RESTORE_CONFIRM=YES scripts/restore.sh ${shellQuote(backup.relativePath)}`
}
