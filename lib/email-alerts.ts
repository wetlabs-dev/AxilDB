import type { PrismaClient } from '@prisma/client'
import { appUrl, sendEmail } from '@/lib/email'
import { renderBrandedEmail } from '@/lib/email-templates'
import { getCareQueue, type CareQueueItem, type CareTaskType } from '@/lib/care-queue'

type ServerMetricSnapshot = {
  id: string
  capturedAt: Date
  metrics: {
    memory: {
      systemTotalBytes: number
      systemFreeBytes: number
    }
    disk: {
      totalBytes: number
      freeBytes: number
      usedBytes: number
    }
  }
}

type AlertUser = {
  id: string
  email: string
  emailVerifiedAt?: Date | null
}

type CollectionDigest = {
  id: string
  name: string
  slug: string
  totalDue: number
  overdue: number
  dueToday: number
  categories: Record<CareDigestCategory, number>
}

export type CareQueueDigest = {
  totalDue: number
  overdue: number
  dueToday: number
  categories: Record<CareDigestCategory, number>
  collections: CollectionDigest[]
  careQueueUrl: string
}

export type ServerHealthAlert = {
  status: 'degraded' | 'poor'
  capturedAt: Date
  issues: string[]
  metricsUrl: string
}

const CARE_DIGEST_COOLDOWN_HOURS = cooldownHours(process.env.CARE_QUEUE_DIGEST_COOLDOWN_HOURS, 20)
const SERVER_HEALTH_COOLDOWN_HOURS = cooldownHours(process.env.SERVER_HEALTH_ALERT_COOLDOWN_HOURS, 6)

const careDigestCategories = [
  'watering',
  'fertilizing',
  'repotting',
  'pest/health check',
  'bloom follow-up',
  'propagation follow-up',
  'manual reminder',
] as const

type CareDigestCategory = (typeof careDigestCategories)[number]

function cooldownHours(value: string | undefined, fallback: number) {
  const hours = Number(value || fallback)
  return Number.isFinite(hours) && hours > 0 ? hours : fallback
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000)
}

function formatBytes(bytes: number) {
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

function blankCareCategories(): Record<CareDigestCategory, number> {
  return Object.fromEntries(careDigestCategories.map((category) => [category, 0])) as Record<CareDigestCategory, number>
}

function careDigestCategory(type: CareTaskType): CareDigestCategory {
  if (type === 'WATER') return 'watering'
  if (type === 'PEST_CHECK' || type === 'HEALTH_CHECK') return 'pest/health check'
  if (type === 'BLOOM_CHECK') return 'bloom follow-up'
  if (type === 'PROPAGATION_CHECK') return 'propagation follow-up'
  return 'manual reminder'
}

function isDue(item: CareQueueItem, now: Date) {
  return !item.completedAt && item.dueAt <= now
}

function isDueToday(item: CareQueueItem, now: Date) {
  return item.dueAt.toDateString() === now.toDateString() && item.overdueDays === 0
}

function categorySummary(categories: Record<CareDigestCategory, number>) {
  return careDigestCategories
    .filter((category) => categories[category] > 0)
    .map((category) => `${category}: ${categories[category]}`)
    .join('; ')
}

function enabled(value: boolean | null | undefined) {
  return value !== false
}

export async function sendCareQueueDigestEmail(user: AlertUser, digest: CareQueueDigest) {
  const collectionLines = digest.collections.map(
    (collection) =>
      `${collection.name}: ${collection.totalDue} due (${collection.overdue} overdue). Categories: ${categorySummary(collection.categories) || 'care tasks'}.`,
  )
  const template = renderBrandedEmail({
    title: 'AxilDB care queue digest',
    preview: `${digest.totalDue} due care queue item${digest.totalDue === 1 ? '' : 's'} need attention.`,
    body: [
      `You have ${digest.totalDue} due or overdue care queue item${digest.totalDue === 1 ? '' : 's'} across ${digest.collections.length} collection${digest.collections.length === 1 ? '' : 's'}.`,
      `Overdue: ${digest.overdue}. Due today: ${digest.dueToday}.`,
      `By category: ${categorySummary(digest.categories) || 'care tasks'}.`,
      ...collectionLines,
      'This digest includes broad care categories only; plant notes and private freeform content are not included.',
    ],
    actionLabel: 'Open care queue',
    actionUrl: digest.careQueueUrl,
  })

  return sendEmail({
    to: user.email,
    subject: `AxilDB care queue digest: ${digest.totalDue} due`,
    text: template.text,
    html: template.html,
  })
}

export async function sendServerHealthAlertEmail(adminUser: AlertUser, alert: ServerHealthAlert) {
  const template = renderBrandedEmail({
    title: `AxilDB server health ${alert.status}`,
    preview: 'AxilDB server health needs attention.',
    body: [
      `Server health is ${alert.status} as of ${alert.capturedAt.toISOString()}.`,
      ...alert.issues,
      'This alert is rate-limited and is sent only to verified server administrators who have not opted out.',
    ],
    actionLabel: 'Open server dashboard',
    actionUrl: alert.metricsUrl,
  })

  return sendEmail({
    to: adminUser.email,
    subject: `AxilDB server health ${alert.status}`,
    text: template.text,
    html: template.html,
  })
}

export function serverHealthAlertFromSnapshot(snapshot: ServerMetricSnapshot): ServerHealthAlert | null {
  const metrics = snapshot.metrics
  const issues: string[] = []
  let poor = false

  const diskPercent = metrics.disk.totalBytes ? (metrics.disk.usedBytes / metrics.disk.totalBytes) * 100 : 0
  if (diskPercent >= 95) poor = true
  if (diskPercent >= 90) {
    issues.push(`Disk usage is ${diskPercent.toFixed(1)}% (${formatBytes(metrics.disk.freeBytes)} free).`)
  } else if (metrics.disk.totalBytes && metrics.disk.freeBytes < 1024 * 1024 * 1024) {
    issues.push(`Disk free space is below 1 GB (${formatBytes(metrics.disk.freeBytes)} free).`)
  }

  const memoryUsed = Math.max(0, metrics.memory.systemTotalBytes - metrics.memory.systemFreeBytes)
  const memoryPercent = metrics.memory.systemTotalBytes ? (memoryUsed / metrics.memory.systemTotalBytes) * 100 : 0
  if (memoryPercent >= 95) poor = true
  if (memoryPercent >= 90) {
    issues.push(`System memory usage is ${memoryPercent.toFixed(1)}% (${formatBytes(metrics.memory.systemFreeBytes)} free).`)
  }

  if (!issues.length) return null
  return {
    status: poor ? 'poor' : 'degraded',
    capturedAt: snapshot.capturedAt,
    issues,
    metricsUrl: appUrl('/server'),
  }
}

export async function sendCareQueueDigestAlerts(prisma: PrismaClient, now = new Date()) {
  const cooldownCutoff = hoursAgo(CARE_DIGEST_COOLDOWN_HOURS)
  const users = await prisma.user.findMany({
    where: {
      emailVerifiedAt: { not: null },
      OR: [
        { emailPreference: null },
        {
          emailPreference: {
            careQueueDigestEmailEnabled: true,
            OR: [{ careQueueDigestLastSentAt: null }, { careQueueDigestLastSentAt: { lt: cooldownCutoff } }],
          },
        },
      ],
      memberships: { some: { status: 'ACTIVE', collection: { status: 'ACTIVE' } } },
    },
    include: {
      emailPreference: true,
      memberships: {
        where: { status: 'ACTIVE', collection: { status: 'ACTIVE' } },
        include: { collection: { select: { id: true, name: true, slug: true } } },
      },
    },
  })

  let sent = 0
  let failed = 0

  for (const user of users) {
    if (!enabled(user.emailPreference?.careQueueDigestEmailEnabled)) continue
    const lastSent = user.emailPreference?.careQueueDigestLastSentAt
    if (lastSent && lastSent >= cooldownCutoff) continue

    const digest: CareQueueDigest = {
      totalDue: 0,
      overdue: 0,
      dueToday: 0,
      categories: blankCareCategories(),
      collections: [],
      careQueueUrl: appUrl('/care'),
    }

    for (const membership of user.memberships) {
      const collection = membership.collection
      const items = await getCareQueue(prisma, {
        collectionId: collection.id,
        collectionSlug: collection.slug,
        userId: user.id,
        now,
      })
      const dueItems = items.filter((item) => isDue(item, now))
      if (!dueItems.length) continue

      const collectionDigest: CollectionDigest = {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        totalDue: dueItems.length,
        overdue: dueItems.filter((item) => item.overdueDays > 0).length,
        dueToday: dueItems.filter((item) => isDueToday(item, now)).length,
        categories: blankCareCategories(),
      }

      for (const item of dueItems) {
        const category = careDigestCategory(item.taskType)
        digest.categories[category] += 1
        collectionDigest.categories[category] += 1
      }

      digest.totalDue += collectionDigest.totalDue
      digest.overdue += collectionDigest.overdue
      digest.dueToday += collectionDigest.dueToday
      digest.collections.push(collectionDigest)
    }

    if (!digest.totalDue) continue

    try {
      await sendCareQueueDigestEmail(user, digest)
      await prisma.emailPreference.upsert({
        where: { userId: user.id },
        update: { careQueueDigestLastSentAt: now },
        create: { userId: user.id, careQueueDigestLastSentAt: now },
      })
      sent += 1
    } catch (error) {
      failed += 1
      console.error('Failed to send AxilDB care queue digest', { userId: user.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return { considered: users.length, sent, failed }
}

export async function sendServerHealthAlertEmails(prisma: PrismaClient, snapshot: ServerMetricSnapshot, now = new Date()) {
  const alert = serverHealthAlertFromSnapshot(snapshot)
  if (!alert) return { status: 'healthy' as const, considered: 0, sent: 0, failed: 0 }

  const cooldownCutoff = hoursAgo(SERVER_HEALTH_COOLDOWN_HOURS)
  const admins = await prisma.user.findMany({
    where: {
      role: 'SERVER_ADMIN',
      emailVerifiedAt: { not: null },
      OR: [
        { emailPreference: null },
        {
          emailPreference: {
            serverHealthEmailEnabled: true,
            OR: [{ serverHealthAlertLastSentAt: null }, { serverHealthAlertLastSentAt: { lt: cooldownCutoff } }],
          },
        },
      ],
    },
    include: { emailPreference: true },
  })

  let sent = 0
  let failed = 0
  for (const admin of admins) {
    if (!enabled(admin.emailPreference?.serverHealthEmailEnabled)) continue
    const lastSent = admin.emailPreference?.serverHealthAlertLastSentAt
    if (lastSent && lastSent >= cooldownCutoff) continue

    try {
      await sendServerHealthAlertEmail(admin, alert)
      await prisma.emailPreference.upsert({
        where: { userId: admin.id },
        update: { serverHealthAlertLastSentAt: now },
        create: { userId: admin.id, serverHealthAlertLastSentAt: now },
      })
      sent += 1
    } catch (error) {
      failed += 1
      console.error('Failed to send AxilDB server health alert', { userId: admin.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return { status: alert.status, considered: admins.length, sent, failed }
}
