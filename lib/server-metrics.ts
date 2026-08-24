import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { evaluateServerIncidents } from '@/lib/server-incidents'

const HISTORY_HOURS = 36
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
const PHOTO_STORAGE_BATCH_SIZE = 1000

function uploadsRoot() {
  return path.resolve(process.cwd(), process.env.AXILDB_UPLOADS_ROOT || path.join('public', 'uploads'))
}

export type CollectionUsage = {
  id: string
  name: string
  slug: string
  status: string
  uploadBytes: number
  recordCount: number
  photos: number
}

export type ServerMetricData = {
  memory: {
    rssBytes: number
    peakRssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
    externalBytes: number
    arrayBuffersBytes: number
    systemTotalBytes: number
    systemFreeBytes: number
    containerUsedBytes: number
    containerLimitBytes: number
    processUptimeSeconds: number
  }
  disk: {
    totalBytes: number
    freeBytes: number
    usedBytes: number
    uploadBytes: number
    databaseBytes: number
    codeBytes: number
    otherBytes: number
  }
  network: {
    rxBytes: number
    txBytes: number
  }
  collections: CollectionUsage[]
}

export type ServerMetricSnapshot = {
  id: string
  capturedAt: Date
  metrics: ServerMetricData
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`
}

async function fileSize(filePath: string) {
  try {
    return (await fs.stat(filePath)).size
  } catch {
    return 0
  }
}

async function directorySize(dir: string, options: { exclude?: (entryPath: string) => boolean } = {}) {
  let total = 0
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (options.exclude?.(entryPath)) continue
    if (entry.isDirectory()) {
      total += await directorySize(entryPath, options)
    } else if (entry.isFile()) {
      total += await fileSize(entryPath)
    }
  }
  return total
}

async function statfsBytes(target: string) {
  try {
    const stats = await fs.statfs(target)
    const totalBytes = Number(stats.blocks) * Number(stats.bsize)
    const freeBytes = Number(stats.bavail) * Number(stats.bsize)
    return { totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes) }
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedBytes: 0 }
  }
}

async function databaseBytes() {
  try {
    const rows = await prisma.$queryRaw<Array<{ size: bigint | number }>>`SELECT pg_database_size(current_database()) AS size`
    return Number(rows[0]?.size || 0)
  } catch {
    return 0
  }
}

async function networkBytes() {
  try {
    const text = await fs.readFile('/proc/net/dev', 'utf8')
    return text
      .split('\n')
      .slice(2)
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce(
        (total, line) => {
          const [iface, rest] = line.split(':')
          if (!iface || iface.trim() === 'lo' || !rest) return total
          const values = rest.trim().split(/\s+/).map(Number)
          return {
            rxBytes: total.rxBytes + (values[0] || 0),
            txBytes: total.txBytes + (values[8] || 0),
          }
        },
        { rxBytes: 0, txBytes: 0 },
      )
  } catch {
    return { rxBytes: 0, txBytes: 0 }
  }
}

async function readNumberFile(filePath: string) {
  try {
    const text = (await fs.readFile(filePath, 'utf8')).trim()
    if (!text || text === 'max') return 0
    const value = Number(text)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

async function cgroupMemoryBytes() {
  const [v2Used, v2Limit] = await Promise.all([
    readNumberFile('/sys/fs/cgroup/memory.current'),
    readNumberFile('/sys/fs/cgroup/memory.max'),
  ])
  if (v2Used || v2Limit) return { containerUsedBytes: v2Used, containerLimitBytes: v2Limit }

  const [v1Used, v1Limit] = await Promise.all([
    readNumberFile('/sys/fs/cgroup/memory/memory.usage_in_bytes'),
    readNumberFile('/sys/fs/cgroup/memory/memory.limit_in_bytes'),
  ])
  return { containerUsedBytes: v1Used, containerLimitBytes: v1Limit }
}

function photoUploadPath(photoPath: string) {
  if (!photoPath.startsWith('/uploads/')) return null
  return path.join(uploadsRoot(), photoPath.replace(/^\/uploads\/?/, ''))
}

async function photoUploadBytesByCollection() {
  const fileSizeCache = new Map<string, number>()
  const uploadBytesByCollection = new Map<string, number>()
  let cursor: string | undefined

  while (true) {
    const photos = await prisma.photo.findMany({
      where: { path: { startsWith: '/uploads/' } },
      select: { id: true, collectionId: true, path: true },
      orderBy: { id: 'asc' },
      take: PHOTO_STORAGE_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (!photos.length) break

    for (const photo of photos) {
      if (!photo.collectionId) continue
      const filePath = photoUploadPath(photo.path)
      if (!filePath) continue
      if (!fileSizeCache.has(filePath)) fileSizeCache.set(filePath, await fileSize(filePath))
      uploadBytesByCollection.set(photo.collectionId, (uploadBytesByCollection.get(photo.collectionId) || 0) + (fileSizeCache.get(filePath) || 0))
    }

    cursor = photos[photos.length - 1].id
    if (photos.length < PHOTO_STORAGE_BATCH_SIZE) break
  }

  return uploadBytesByCollection
}

async function collectionUsages() {
  const [collections, uploadBytesByCollection] = await Promise.all([
    prisma.collection.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        _count: {
          select: {
            plantDefinitions: true,
            plantAliases: true,
            plantInstances: true,
            propagationEvents: true,
            bloomEvents: true,
            notes: true,
            photos: true,
            reminders: true,
            follows: true,
            taxonomicAuthorities: true,
          },
        },
      },
    }),
    photoUploadBytesByCollection(),
  ])

  return collections.map((collection) => {
    const recordCount = Object.values(collection._count).reduce((sum, count) => sum + count, 0)
    return {
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      status: collection.status,
      uploadBytes: uploadBytesByCollection.get(collection.id) || 0,
      recordCount,
      photos: collection._count.photos,
    }
  })
}

export async function collectServerMetricData(): Promise<ServerMetricData> {
  const uploadDir = uploadsRoot()
  await fs.mkdir(uploadDir, { recursive: true })
  const [disk, uploadBytes, dbBytes, appBytes, net, collections, cgroupMemory] = await Promise.all([
    statfsBytes(uploadDir),
    directorySize(uploadDir),
    databaseBytes(),
    directorySize(process.cwd(), {
      exclude: (entryPath) => entryPath.includes('/public/uploads') || entryPath.includes('/public/labels') || entryPath.endsWith('/node_modules/.cache'),
    }),
    networkBytes(),
    collectionUsages(),
    cgroupMemoryBytes(),
  ])
  const memory = process.memoryUsage()
  const resourceUsage = process.resourceUsage()
  const categorizedBytes = uploadBytes + dbBytes + appBytes

  return {
    memory: {
      rssBytes: memory.rss,
      peakRssBytes: resourceUsage.maxRSS > 0 ? resourceUsage.maxRSS * 1024 : 0,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      systemTotalBytes: os.totalmem(),
      systemFreeBytes: os.freemem(),
      containerUsedBytes: cgroupMemory.containerUsedBytes,
      containerLimitBytes: cgroupMemory.containerLimitBytes,
      processUptimeSeconds: Math.round(process.uptime()),
    },
    disk: {
      ...disk,
      uploadBytes,
      databaseBytes: dbBytes,
      codeBytes: appBytes,
      otherBytes: Math.max(0, disk.usedBytes - categorizedBytes),
    },
    network: net,
    collections,
  }
}

function isMetricData(value: unknown): value is ServerMetricData {
  return Boolean(value && typeof value === 'object' && 'memory' in value && 'disk' in value && 'network' in value)
}

export async function ensureRecentServerMetricSnapshot() {
  const latest = await prisma.serverMetricSnapshot.findFirst({ orderBy: { capturedAt: 'desc' } })
  if (latest && Date.now() - latest.capturedAt.getTime() < SNAPSHOT_INTERVAL_MS && isMetricData(latest.metrics)) {
    return latest as ServerMetricSnapshot
  }

  const metrics = await collectServerMetricData()
  const snapshot = await prisma.serverMetricSnapshot.create({ data: { metrics: metrics as any } })
  const cutoff = new Date(Date.now() - (HISTORY_HOURS + 6) * 60 * 60 * 1000)
  await prisma.serverMetricSnapshot.deleteMany({ where: { capturedAt: { lt: cutoff } } })
  await evaluateServerIncidents(prisma, snapshot as ServerMetricSnapshot)
  return snapshot as ServerMetricSnapshot
}

export async function serverMetricHistory() {
  const cutoff = new Date(Date.now() - HISTORY_HOURS * 60 * 60 * 1000)
  const rows = await prisma.serverMetricSnapshot.findMany({
    where: { capturedAt: { gte: cutoff } },
    orderBy: { capturedAt: 'asc' },
  })
  return rows.filter((row) => isMetricData(row.metrics)) as ServerMetricSnapshot[]
}
