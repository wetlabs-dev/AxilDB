import type { PrismaClient } from '@prisma/client'
import { readdir, stat, unlink } from 'fs/promises'
import path from 'path'
import type { AuthUser } from '@/lib/auth'

const UPLOAD_URL_PREFIX = '/uploads/'
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tif', '.tiff'])

export type OrphanedImageFile = {
  relativePath: string
  urlPath: string
  absolutePath: string
  filename: string
  sizeBytes: number
  modifiedAt: Date
}

export type OrphanedImageScanResult = {
  scannedAt: Date
  uploadDir: string
  totalImageFiles: number
  totalReferencedFiles: number
  orphanedFiles: OrphanedImageFile[]
  orphanedBytes: number
  missingUploadDir: boolean
}

export type OrphanedImageDeleteResult = {
  scannedAt: Date
  deleted: OrphanedImageFile[]
  skipped: Array<{ relativePath: string; reason: string }>
  failed: Array<{ relativePath: string; error: string }>
  bytesReclaimed: number
}

function configuredUploadDir() {
  const configured = process.env.AXILDB_UPLOAD_DIR?.trim()
  return path.resolve(process.cwd(), configured || path.join('public', 'uploads'))
}

function isSupportedImageFile(filePath: string) {
  return SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function toPosixPath(value: string) {
  return value.split(path.sep).join('/')
}

function safeRelativePath(root: string, absolutePath: string) {
  const relative = path.relative(root, absolutePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return toPosixPath(relative)
}

function normalizeUploadReference(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('\0')) return null

  let candidate = trimmed
  try {
    if (/^https?:\/\//i.test(candidate)) candidate = new URL(candidate).pathname
  } catch {
    return null
  }

  const basename = path.posix.basename(candidate)
  if (!isSupportedImageFile(basename)) return null

  if (!candidate.includes('/')) {
    return { relativePath: basename, urlPath: `${UPLOAD_URL_PREFIX}${basename}`, basename }
  }

  const withoutPrefix = candidate.startsWith(UPLOAD_URL_PREFIX)
    ? candidate.slice(UPLOAD_URL_PREFIX.length)
    : candidate.startsWith(`.${UPLOAD_URL_PREFIX}`)
      ? candidate.slice(`.${UPLOAD_URL_PREFIX}`.length)
      : null
  if (!withoutPrefix) return null

  const normalized = path.posix.normalize(withoutPrefix)
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(normalized)) return null
  return { relativePath: normalized, urlPath: `${UPLOAD_URL_PREFIX}${normalized}`, basename: path.posix.basename(normalized) }
}

async function walkImageFiles(root: string) {
  const files: OrphanedImageFile[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      const relativePath = safeRelativePath(root, absolutePath)
      if (!relativePath) continue
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }
      if (!entry.isFile() || !isSupportedImageFile(entry.name)) continue
      const info = await stat(absolutePath)
      files.push({
        relativePath,
        urlPath: `${UPLOAD_URL_PREFIX}${relativePath}`,
        absolutePath,
        filename: entry.name,
        sizeBytes: info.size,
        modifiedAt: info.mtime,
      })
    }
  }

  await walk(root)
  return files
}

export async function collectReferencedUploadImages(prisma: PrismaClient) {
  const references = {
    relativePaths: new Set<string>(),
    urlPaths: new Set<string>(),
    basenames: new Set<string>(),
  }

  function add(value?: string | null) {
    const normalized = normalizeUploadReference(value)
    if (!normalized) return
    references.relativePaths.add(normalized.relativePath)
    references.urlPaths.add(normalized.urlPath)
    references.basenames.add(normalized.basename)
  }

  const [photos, identificationLogs] = await Promise.all([
    prisma.photo.findMany({ select: { path: true, filename: true } }),
    prisma.plantIdentificationLog.findMany({ select: { uploadedImagePath: true } }),
  ])

  for (const photo of photos) {
    add(photo.path)
    add(photo.filename)
  }
  for (const log of identificationLogs) {
    add(log.uploadedImagePath)
  }

  return references
}

export async function scanOrphanedImages(prisma: PrismaClient): Promise<OrphanedImageScanResult> {
  const uploadDir = configuredUploadDir()
  const scannedAt = new Date()
  const references = await collectReferencedUploadImages(prisma)

  let files: OrphanedImageFile[] = []
  let missingUploadDir = false
  try {
    files = await walkImageFiles(uploadDir)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      missingUploadDir = true
    } else {
      throw error
    }
  }

  const referencedFiles = files.filter((file) =>
    references.relativePaths.has(file.relativePath) ||
    references.urlPaths.has(file.urlPath) ||
    references.basenames.has(file.filename)
  )
  const orphanedFiles = files.filter((file) => !referencedFiles.includes(file))

  return {
    scannedAt,
    uploadDir,
    totalImageFiles: files.length,
    totalReferencedFiles: referencedFiles.length,
    orphanedFiles,
    orphanedBytes: orphanedFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
    missingUploadDir,
  }
}

function requestedRelativePaths(values: FormDataEntryValue[]) {
  const safe = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = path.posix.normalize(value)
    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(normalized)) continue
    safe.add(normalized)
  }
  return Array.from(safe)
}

export function selectedOrphanedImagePaths(formData: FormData) {
  return requestedRelativePaths(formData.getAll('relativePath'))
}

export async function deleteSelectedOrphanedImages(prisma: PrismaClient, user: AuthUser, relativePaths: string[]): Promise<OrphanedImageDeleteResult> {
  const scan = await scanOrphanedImages(prisma)
  const orphanedByPath = new Map(scan.orphanedFiles.map((file) => [file.relativePath, file]))
  const deleted: OrphanedImageFile[] = []
  const skipped: OrphanedImageDeleteResult['skipped'] = []
  const failed: OrphanedImageDeleteResult['failed'] = []

  for (const relativePath of relativePaths) {
    const file = orphanedByPath.get(relativePath)
    if (!file) {
      skipped.push({ relativePath, reason: 'File is no longer orphaned or was not found during the re-check.' })
      continue
    }

    try {
      await unlink(file.absolutePath)
      deleted.push(file)
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          action: 'DELETE',
          entityType: 'ORPHANED_IMAGE_FILE',
          entityId: file.relativePath,
          summary: `Deleted orphaned upload ${file.relativePath}`,
          metadata: JSON.stringify({
            urlPath: file.urlPath,
            sizeBytes: file.sizeBytes,
            modifiedAt: file.modifiedAt.toISOString(),
          }),
        },
      })
    } catch (error) {
      failed.push({ relativePath, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    scannedAt: scan.scannedAt,
    deleted,
    skipped,
    failed,
    bytesReclaimed: deleted.reduce((sum, file) => sum + file.sizeBytes, 0),
  }
}
