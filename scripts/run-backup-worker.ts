import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

const MAX_LOG_CHARS = 24000

function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

function trimLog(log: string) {
  if (log.length <= MAX_LOG_CHARS) return log
  return `${log.slice(0, 4000)}\n\n... log truncated ...\n\n${log.slice(-MAX_LOG_CHARS + 4000)}`
}

async function parseManifest(backupDir: string) {
  try {
    const text = await readFile(path.join(process.cwd(), backupDir, 'manifest.txt'), 'utf8')
    return Object.fromEntries(
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf('=')
          return index === -1 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)]
        }),
    )
  } catch {
    return undefined
  }
}

function runBackup(runId: string, backupDir: string) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn('sh', ['scripts/backup.sh', 'backups'], {
      cwd: process.cwd(),
      env: { ...process.env, AXILDB_BACKUP_DIR: backupDir, AXILDB_BACKUP_RUN_ID: runId },
    })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', (error) => {
      output += `\nBackup process error: ${error.message}\n`
      resolve({ code: 1, output })
    })
    child.on('close', (code) => resolve({ code, output }))
  })
}

async function processNextBackup() {
  const run = await prisma.backupRun.findFirst({
    where: { status: 'REQUESTED', scope: 'SITEWIDE' },
    orderBy: { requestedAt: 'asc' },
  })
  if (!run) {
    console.log('No requested sitewide backups.')
    return false
  }

  const backupDir = `backups/axildb-${utcStamp()}-${run.id.slice(0, 8)}`
  await prisma.backupRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: new Date(), backupPath: backupDir },
  })

  console.log(`Starting sitewide backup ${run.id} into ${backupDir}`)
  const result = await runBackup(run.id, backupDir)
  const log = trimLog(result.output)

  if (result.code === 0) {
    const manifest = await parseManifest(backupDir)
    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        backupPath: backupDir,
        manifest: manifest as any,
        log,
        error: null,
      },
    })
    console.log(`Backup ${run.id} succeeded.`)
    return true
  }

  await prisma.backupRun.update({
    where: { id: run.id },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      backupPath: backupDir,
      log,
      error: `Backup script exited with code ${result.code ?? 'unknown'}`,
    },
  })
  console.error(`Backup ${run.id} failed.`)
  return true
}

async function main() {
  const once = process.argv.includes('--once')
  do {
    const didWork = await processNextBackup()
    if (once || !didWork) break
  } while (true)
}

main()
  .catch((error) => {
    console.error('Backup worker failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
