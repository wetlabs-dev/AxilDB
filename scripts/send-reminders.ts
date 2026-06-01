import { PrismaClient } from '@prisma/client'
import { appUrl, sendEmail } from '../lib/email'
import { reminderEmail } from '../lib/email-templates'
import { sendCareQueueDigestAlerts } from '../lib/email-alerts'
import { nextOccurrence, reminderCategoryLabel, reminderPreferenceKey } from '../lib/reminders'

const prisma = new PrismaClient()

function collectionPath(slug: string | null | undefined, path = '/') {
  if (!slug) return '/collections'
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `/c/${slug}${normalized === '/' ? '' : normalized}`
}

async function recordUrl(reminder: { collectionId: string | null; entityType: string | null; entityId: string | null; collection?: { id: string; slug: string } | null }) {
  if (reminder.entityType === 'PLANT_INSTANCE' && reminder.entityId) {
    return appUrl(collectionPath(reminder.collection?.slug, `/instances/${reminder.entityId}`))
  }

  if (reminder.entityType === 'BLOOM_EVENT' && reminder.entityId) {
    const bloom = await prisma.bloomEvent.findFirst({
      where: { id: reminder.entityId, collectionId: reminder.collectionId },
      select: { id: true, plantInstanceId: true, collection: { select: { slug: true } } },
    })
    if (bloom) return appUrl(collectionPath(bloom.collection?.slug || reminder.collection?.slug, `/instances/${bloom.plantInstanceId}#bloom-${bloom.id}`))
  }

  if (reminder.entityType === 'PROPAGATION_EVENT' && reminder.entityId) {
    return appUrl(collectionPath(reminder.collection?.slug, '/propagations'))
  }

  return appUrl(collectionPath(reminder.collection?.slug, '/reminders'))
}

async function finishReminder(id: string, dueAt: Date, rrule: string | null) {
  let next = nextOccurrence(dueAt, rrule)
  const now = new Date()

  while (next && next <= now) {
    next = nextOccurrence(next, rrule)
  }

  await prisma.reminder.update({
    where: { id },
    data: {
      lastSentAt: new Date(),
      nextSendAt: next,
      completedAt: next ? null : new Date(),
      dueAt: next || dueAt,
    },
  })
}

async function main() {
  const now = new Date()
  const reminders = await prisma.reminder.findMany({
    where: {
      completedAt: null,
      pausedAt: null,
      nextSendAt: { lte: now },
    },
    include: {
      collection: { select: { id: true, name: true, slug: true, visibility: true } },
      user: {
        include: {
          emailPreference: true,
          memberships: {
            where: { status: 'ACTIVE' },
            select: { collectionId: true },
          },
        },
      },
    },
    orderBy: { nextSendAt: 'asc' },
    take: 50,
  })

  for (const reminder of reminders) {
    const preferenceKey = reminderPreferenceKey(reminder.category)
    const preferences = reminder.user.emailPreference as Record<string, unknown> | null
    const preferenceEnabled = preferences?.[preferenceKey] !== false
    const hasCollectionAccess =
      reminder.collection?.visibility === 'PUBLIC' ||
      !reminder.collectionId ||
      reminder.user.memberships.some((membership) => membership.collectionId === reminder.collectionId)

    if (!hasCollectionAccess) {
      await prisma.reminderDelivery.create({
        data: {
          reminderId: reminder.id,
          collectionId: reminder.collectionId,
          userId: reminder.userId,
          recipient: reminder.user.email,
          subject: reminder.title,
          status: 'SKIPPED',
          error: 'User no longer has access to this private collection.',
        },
      })
      await finishReminder(reminder.id, reminder.nextSendAt || reminder.dueAt, reminder.rrule)
      continue
    }

    if (!reminder.user.emailVerifiedAt) {
      await prisma.reminderDelivery.create({
        data: {
          reminderId: reminder.id,
          collectionId: reminder.collectionId,
          userId: reminder.userId,
          recipient: reminder.user.email,
          subject: reminder.title,
          status: 'SKIPPED',
          error: 'Email address is not verified.',
        },
      })
      await finishReminder(reminder.id, reminder.nextSendAt || reminder.dueAt, reminder.rrule)
      continue
    }

    if (!preferenceEnabled) {
      await prisma.reminderDelivery.create({
        data: {
          reminderId: reminder.id,
          collectionId: reminder.collectionId,
          userId: reminder.userId,
          recipient: reminder.user.email,
          subject: reminder.title,
          status: 'SKIPPED',
          error: `${reminderCategoryLabel(reminder.category)} emails are disabled for this user.`,
        },
      })
      await finishReminder(reminder.id, reminder.nextSendAt || reminder.dueAt, reminder.rrule)
      continue
    }

    const url = await recordUrl(reminder)
    const template = reminderEmail(reminder.title, url, [
      reminder.body || 'A reminder you scheduled in AxilDB is ready.',
      reminder.collection ? `Collection: ${reminder.collection.name}.` : '',
      `Category: ${reminderCategoryLabel(reminder.category)}.`,
    ].filter(Boolean))

    try {
      const result = await sendEmail({
        to: reminder.user.email,
        subject: reminder.title,
        text: template.text,
        html: template.html,
      })

      await prisma.reminderDelivery.create({
        data: {
          reminderId: reminder.id,
          collectionId: reminder.collectionId,
          userId: reminder.userId,
          recipient: reminder.user.email,
          subject: reminder.title,
          status: 'SENT',
          provider: result.mode,
          providerId: result.messageId,
          sentAt: new Date(),
        },
      })
      await finishReminder(reminder.id, reminder.nextSendAt || reminder.dueAt, reminder.rrule)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Failed to send AxilDB reminder', { reminderId: reminder.id, error: message })
      await prisma.reminderDelivery.create({
        data: {
          reminderId: reminder.id,
          collectionId: reminder.collectionId,
          userId: reminder.userId,
          recipient: reminder.user.email,
          subject: reminder.title,
          status: 'FAILED',
          error: message,
        },
      })
    }
  }

  const digestResult = await sendCareQueueDigestAlerts(prisma, now)
  console.info(`Processed ${reminders.length} due reminder(s). Sent ${digestResult.sent} care queue digest(s); ${digestResult.failed} failed.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
