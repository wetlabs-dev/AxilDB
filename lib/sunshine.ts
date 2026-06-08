import type { PrismaClient } from '@prisma/client'
import { appUrl, sendEmail } from '@/lib/email'
import { sunshineNotificationEmail } from '@/lib/email-templates'
import { collectionPath } from '@/lib/collections'
import { plantName } from '@/lib/utils'

export const SUNSHINE_TARGET_TYPES = ['PLANT_INSTANCE', 'BLOOM_EVENT', 'PHOTO'] as const
export type SunshineTargetType = (typeof SUNSHINE_TARGET_TYPES)[number]
export const WELL_LOVED_THRESHOLD = 5

type SunshineTarget = {
  targetType: SunshineTargetType
  targetId: string
}

export type SunshineTargetSummary = SunshineTarget & {
  label: string
  href: string
  collectionSlug: string
}

export function isSunshineTargetType(value?: string | null): value is SunshineTargetType {
  return SUNSHINE_TARGET_TYPES.includes(value as SunshineTargetType)
}

export function sunshineKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`
}

export function sunshineCountLabel(count: number) {
  return `${count} sunshine`
}

function targetWhere(targets: SunshineTarget[]) {
  return targets.length
    ? { OR: targets.map((target) => ({ targetType: target.targetType, targetId: target.targetId })) }
    : { id: '__no_sunshine_targets__' }
}

export async function sunshineCounts(prisma: PrismaClient, collectionId: string, targets: SunshineTarget[]) {
  if (targets.length === 0) return new Map<string, number>()
  const grouped = await prisma.sunshine.groupBy({
    by: ['targetType', 'targetId'],
    where: { collectionId, ...targetWhere(targets) },
    _count: { _all: true },
  })

  return new Map(grouped.map((row) => [sunshineKey(row.targetType, row.targetId), row._count._all]))
}

export async function sunshineStateForUser(prisma: PrismaClient, collectionId: string, userId: string | undefined, targets: SunshineTarget[]) {
  if (!userId || targets.length === 0) return new Set<string>()
  const rows = await prisma.sunshine.findMany({
    where: { collectionId, userId, ...targetWhere(targets) },
    select: { targetType: true, targetId: true },
  })

  return new Set(rows.map((row) => sunshineKey(row.targetType, row.targetId)))
}

export async function validateSunshineTarget(
  prisma: PrismaClient,
  collectionId: string,
  collectionSlug: string,
  targetType: SunshineTargetType,
  targetId: string,
): Promise<SunshineTargetSummary> {
  if (targetType === 'PLANT_INSTANCE') {
    const instance = await prisma.plantInstance.findFirstOrThrow({
      where: { id: targetId, collectionId },
      include: { plantDefinition: true },
    })
    return {
      targetType,
      targetId,
      collectionSlug,
      label: `${instance.plantId} · ${plantName(instance.plantDefinition)}`,
      href: collectionPath(collectionSlug, `/instances/${instance.id}`),
    }
  }

  if (targetType === 'BLOOM_EVENT') {
    const bloom = await prisma.bloomEvent.findFirstOrThrow({
      where: { id: targetId, collectionId },
      include: { plantInstance: { include: { plantDefinition: true } } },
    })
    return {
      targetType,
      targetId,
      collectionSlug,
      label: `Bloom for ${bloom.plantInstance.plantId} · ${plantName(bloom.plantInstance.plantDefinition)}`,
      href: collectionPath(collectionSlug, `/instances/${bloom.plantInstanceId}#bloom-${bloom.id}`),
    }
  }

  const photo = await prisma.photo.findFirstOrThrow({
    where: { id: targetId, collectionId },
  })
  if (photo.entityType === 'PLANT_DEFINITION') {
    throw new Error('Sunshine is not available for plant definition photos.')
  }
  if (photo.entityType === 'PLANT_INSTANCE') {
    const instance = await prisma.plantInstance.findFirstOrThrow({
      where: { id: photo.entityId, collectionId },
      include: { plantDefinition: true },
    })
    return {
      targetType,
      targetId,
      collectionSlug,
      label: `Photo of ${instance.plantId} · ${plantName(instance.plantDefinition)}`,
      href: collectionPath(collectionSlug, `/instances/${instance.id}#photos`),
    }
  }
  if (photo.entityType === 'BLOOM_EVENT') {
    const bloom = await prisma.bloomEvent.findFirstOrThrow({
      where: { id: photo.entityId, collectionId },
      include: { plantInstance: { include: { plantDefinition: true } } },
    })
    return {
      targetType,
      targetId,
      collectionSlug,
      label: `Bloom photo for ${bloom.plantInstance.plantId} · ${plantName(bloom.plantInstance.plantDefinition)}`,
      href: collectionPath(collectionSlug, `/instances/${bloom.plantInstanceId}#bloom-${bloom.id}`),
    }
  }

  throw new Error('Sunshine is not available for this photo.')
}

export async function resolveSunshineTarget(prisma: PrismaClient, collectionId: string, collectionSlug: string, targetType: string, targetId: string) {
  if (!isSunshineTargetType(targetType)) return null
  try {
    return await validateSunshineTarget(prisma, collectionId, collectionSlug, targetType, targetId)
  } catch {
    return null
  }
}

export async function notifySunshineManagers(
  prisma: PrismaClient,
  input: {
    actorUserId: string
    collectionId: string
    collectionName: string
    target: SunshineTargetSummary
  },
) {
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000)
  const memberships = await prisma.collectionMembership.findMany({
    where: {
      collectionId: input.collectionId,
      status: 'ACTIVE',
      role: { in: ['MANAGER'] },
      userId: { not: input.actorUserId },
      user: {
        emailVerifiedAt: { not: null },
        emailPreference: {
          is: {
            sunshineNotifications: true,
            OR: [
              { sunshineNotificationLastSentAt: null },
              { sunshineNotificationLastSentAt: { lt: cutoff } },
            ],
          },
        },
      },
    },
    include: { user: { include: { emailPreference: true } } },
  })

  for (const membership of memberships) {
    const recordUrl = appUrl(input.target.href)
    const subject = `Sunshine received in ${input.collectionName}`
    const template = sunshineNotificationEmail(subject, recordUrl, [
      `${input.target.label} received sunshine in ${input.collectionName}.`,
      'AxilDB does not disclose who gave sunshine.',
      'This alert is rate limited, so a burst of appreciation stays pleasantly quiet.',
    ])

    try {
      await sendEmail({
        to: membership.user.email,
        subject,
        ...template,
      })
      await prisma.emailPreference.update({
        where: { userId: membership.userId },
        data: { sunshineNotificationLastSentAt: new Date() },
      })
    } catch (error) {
      console.error('Sunshine notification failed', {
        userId: membership.userId,
        collectionId: input.collectionId,
        targetType: input.target.targetType,
        targetId: input.target.targetId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
