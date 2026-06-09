import webPush from 'web-push'
import type { PrismaClient, PushSubscription as DbPushSubscription } from '@prisma/client'
import { appUrl } from '@/lib/email'
import { prisma as defaultPrisma } from '@/lib/prisma'
import { timeZoneForPreference } from '@/lib/time'

export type PushPreferenceKey =
  | 'generalRemindersPushEnabled'
  | 'plantCheckInRemindersPushEnabled'
  | 'bloomCycleRemindersPushEnabled'
  | 'propagationFollowUpsPushEnabled'
  | 'followNotificationsPushEnabled'
  | 'sunshineNotificationsPushEnabled'
  | 'collectionUpdateDigestPushEnabled'
  | 'careQueueDigestPushEnabled'
  | 'serverHealthPushEnabled'

export type SafePushNotification = {
  title: string
  body?: string
  url: string
  tag?: string
  preferenceKey?: PushPreferenceKey
}

type Preference = {
  timezone?: string | null
  quietHoursStart?: string | null
  quietHoursEnd?: string | null
} & Partial<Record<PushPreferenceKey, boolean | null>>

export const pushPreferenceKeys = {
  GENERAL: 'generalRemindersPushEnabled',
  PLANT_CHECK_IN: 'plantCheckInRemindersPushEnabled',
  BLOOM_CYCLE: 'bloomCycleRemindersPushEnabled',
  PROPAGATION_FOLLOW_UP: 'propagationFollowUpsPushEnabled',
} satisfies Record<string, PushPreferenceKey>

export function webPushEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_WEB_PUSH === 'true'
}

function configureWebPush() {
  if (!webPushEnabled()) return false
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@axildb.com'
  if (!publicKey || !privateKey) return false

  webPush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

function minutesFromTime(value?: string | null) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '')
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function currentMinutesInTimeZone(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(now)
  const hours = Number(parts.find((part) => part.type === 'hour')?.value || 0)
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value || 0)
  return hours * 60 + minutes
}

export function isInQuietHours(preference?: Preference | null, now = new Date()) {
  const start = minutesFromTime(preference?.quietHoursStart)
  const end = minutesFromTime(preference?.quietHoursEnd)
  if (start === null || end === null || start === end) return false

  const current = currentMinutesInTimeZone(timeZoneForPreference(preference), now)
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}

function publicUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url
  return appUrl(url.startsWith('/') ? url : `/${url}`)
}

function safePayload(notification: SafePushNotification) {
  return JSON.stringify({
    title: notification.title.slice(0, 80),
    body: (notification.body || 'Open AxilDB for details.').slice(0, 140),
    url: publicUrl(notification.url),
    tag: notification.tag,
  })
}

export async function cleanupFailedPushSubscription(
  subscription: Pick<DbPushSubscription, 'id' | 'failureCount'>,
  error: unknown,
  prisma: PrismaClient = defaultPrisma,
) {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : null
  const gone = statusCode === 404 || statusCode === 410
  await prisma.pushSubscription.update({
    where: { id: subscription.id },
    data: {
      failureCount: { increment: 1 },
      lastFailureAt: new Date(),
      ...(gone || subscription.failureCount >= 4 ? { enabled: false, revokedAt: new Date() } : {}),
    },
  })
}

export async function sendPushToSubscription(
  subscription: DbPushSubscription,
  notification: SafePushNotification,
  prisma: PrismaClient = defaultPrisma,
) {
  if (!configureWebPush() || !subscription.enabled || subscription.revokedAt) return { sent: false, skipped: true }

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      safePayload(notification),
    )
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { failureCount: 0, lastFailureAt: null, lastSeenAt: new Date() },
    })
    return { sent: true, skipped: false }
  } catch (error) {
    await cleanupFailedPushSubscription(subscription, error, prisma)
    console.error('Web Push delivery failed', {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      statusCode: typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : undefined,
      error: error instanceof Error ? error.message : String(error),
    })
    return { sent: false, skipped: false }
  }
}

export async function sendPushNotification(
  userId: string,
  notification: SafePushNotification,
  prisma: PrismaClient = defaultPrisma,
) {
  if (!configureWebPush()) return { considered: 0, sent: 0, skipped: true }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      emailPreference: true,
      pushSubscriptions: { where: { enabled: true, revokedAt: null } },
    },
  })
  if (!user || user.pushSubscriptions.length === 0) return { considered: 0, sent: 0, skipped: true }

  const preference = user.emailPreference
  if (notification.preferenceKey && preference?.[notification.preferenceKey] !== true) {
    return { considered: user.pushSubscriptions.length, sent: 0, skipped: true }
  }
  if (isInQuietHours(preference)) return { considered: user.pushSubscriptions.length, sent: 0, skipped: true }

  let sent = 0
  for (const subscription of user.pushSubscriptions) {
    const result = await sendPushToSubscription(subscription, notification, prisma)
    if (result.sent) sent += 1
  }
  return { considered: user.pushSubscriptions.length, sent, skipped: false }
}
