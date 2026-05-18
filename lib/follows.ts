import type { PrismaClient } from '@prisma/client'
import { followNotificationEmail } from '@/lib/email-templates'
import { appUrl, sendEmail } from '@/lib/email'

type NotifyFollowersInput = {
  collectionId?: string | null
  actorUserId?: string | null
  eventType: string
  subject: string
  body?: string
  recordPath: string
  plantInstanceIds?: string[]
  plantDefinitionIds?: string[]
}

export const followScopes = [
  ['SPECIMEN', 'Specimen'],
  ['TYPE', 'Plant type'],
  ['LINEAGE', 'Lineage'],
] as const

export function followScopeLabel(scope?: string | null) {
  return followScopes.find(([value]) => value === scope)?.[1] || 'Follow'
}

async function connectedLineageIds(prisma: PrismaClient, seedIds: string[], collectionId?: string | null) {
  const seen = new Set(seedIds)
  let frontier = [...seedIds]

  while (frontier.length > 0) {
    const links = await prisma.propagationEvent.findMany({
      where: {
        ...(collectionId ? { collectionId } : {}),
        OR: [
          { parents: { some: { parentPlantInstanceId: { in: frontier } } } },
          { children: { some: { childPlantInstanceId: { in: frontier } } } },
        ],
      },
      include: {
        parents: { select: { parentPlantInstanceId: true } },
        children: { select: { childPlantInstanceId: true } },
      },
    })

    const next: string[] = []
    for (const link of links) {
      for (const parent of link.parents) {
        if (!seen.has(parent.parentPlantInstanceId)) {
          seen.add(parent.parentPlantInstanceId)
          next.push(parent.parentPlantInstanceId)
        }
      }
      for (const child of link.children) {
        if (!seen.has(child.childPlantInstanceId)) {
          seen.add(child.childPlantInstanceId)
          next.push(child.childPlantInstanceId)
        }
      }
    }
    frontier = next
  }

  return [...seen]
}

export async function notifyFollowers(prisma: PrismaClient, input: NotifyFollowersInput) {
  const plantInstanceIds = [...new Set(input.plantInstanceIds || [])]
  const plantDefinitionIds = [...new Set(input.plantDefinitionIds || [])]
  const lineageIds = plantInstanceIds.length > 0 ? await connectedLineageIds(prisma, plantInstanceIds, input.collectionId) : []

  const filters = [
    ...plantInstanceIds.map((id) => ({ scope: 'SPECIMEN', entityType: 'PLANT_INSTANCE', entityId: id })),
    ...plantDefinitionIds.map((id) => ({ scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: id })),
    ...lineageIds.map((id) => ({ scope: 'LINEAGE', entityType: 'PLANT_INSTANCE', entityId: id })),
  ]

  if (filters.length === 0) return

  const follows = await prisma.follow.findMany({
    where: { ...(input.collectionId ? { collectionId: input.collectionId } : {}), OR: filters },
    include: {
      collection: { select: { name: true, visibility: true } },
      user: {
        include: {
          emailPreference: true,
          memberships: {
            where: {
              ...(input.collectionId ? { collectionId: input.collectionId } : {}),
              status: 'ACTIVE',
            },
            select: { collectionId: true },
          },
        },
      },
    },
  })

  const seenUsers = new Set<string>()
  for (const follow of follows) {
    if (seenUsers.has(follow.userId)) continue
    seenUsers.add(follow.userId)

    const hasActiveMembership =
      !!follow.collectionId &&
      follow.user.memberships.some((membership) => membership.collectionId === follow.collectionId)

    if (!hasActiveMembership) {
      await prisma.followNotification.create({
        data: {
          followId: follow.id,
          collectionId: input.collectionId || follow.collectionId,
          userId: follow.userId,
          eventType: input.eventType,
          subject: input.subject,
          body: input.body,
          recordUrl: appUrl(input.recordPath),
          status: 'SKIPPED',
          error: 'User is not an active member of this collection.',
        },
      })
      continue
    }

    if (!follow.user.emailVerifiedAt || follow.user.emailPreference?.followNotifications === false) {
      await prisma.followNotification.create({
        data: {
          followId: follow.id,
          collectionId: input.collectionId || follow.collectionId,
          userId: follow.userId,
          eventType: input.eventType,
          subject: input.subject,
          body: input.body,
          recordUrl: appUrl(input.recordPath),
          status: 'SKIPPED',
          error: !follow.user.emailVerifiedAt ? 'Email address is not verified.' : 'Follow notification emails are disabled.',
        },
      })
      continue
    }

    const recordUrl = appUrl(input.recordPath)
    const template = followNotificationEmail(input.subject, recordUrl, [
      input.body || 'A record you follow was updated in AxilDB.',
      follow.collection ? `Collection: ${follow.collection.name}.` : '',
      `Followed ${followScopeLabel(follow.scope).toLowerCase()}: ${follow.label}.`,
    ].filter(Boolean))

    try {
      await sendEmail({
        to: follow.user.email,
        subject: input.subject,
        ...template,
      })
      await prisma.followNotification.create({
        data: {
          followId: follow.id,
          collectionId: input.collectionId || follow.collectionId,
          userId: follow.userId,
          eventType: input.eventType,
          subject: input.subject,
          body: input.body,
          recordUrl,
          status: 'SENT',
          sentAt: new Date(),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Follow notification failed', { followId: follow.id, eventType: input.eventType, error: message })
      await prisma.followNotification.create({
        data: {
          followId: follow.id,
          collectionId: input.collectionId || follow.collectionId,
          userId: follow.userId,
          eventType: input.eventType,
          subject: input.subject,
          body: input.body,
          recordUrl,
          status: 'FAILED',
          error: message,
        },
      })
    }
  }
}
