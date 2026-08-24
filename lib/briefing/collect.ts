import { createHash } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { getCareQueue } from '@/lib/care-queue'
import { addCalendarDays, dateInputValue, startOfDayInTimeZone } from '@/lib/time'
import { plantName } from '@/lib/utils'

export type BriefingSource = Awaited<ReturnType<typeof collectBriefingSource>>

function preview(value?: string | null, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function dueSoon(now: Date, days: number, timezone: string) {
  return addCalendarDays(startOfDayInTimeZone(now, timezone), days, timezone)
}

function entityKey(entityType?: string | null, entityId?: string | null) {
  return entityType && entityId ? `${entityType}:${entityId}` : ''
}

export async function collectBriefingSource(prisma: PrismaClient, options: {
  collectionId: string
  collectionSlug: string
  userId: string
  timezone: string
  now?: Date
}) {
  const now = options.now || new Date()
  const sevenDaysAgo = addCalendarDays(now, -7, options.timezone)
  const soon = dueSoon(now, 7, options.timezone)
  const staleCutoff = addCalendarDays(now, -60, options.timezone)
  const careItems = await getCareQueue(prisma, {
    collectionId: options.collectionId,
    collectionSlug: options.collectionSlug,
    userId: options.userId,
    now,
    timezone: options.timezone,
  })

  const [
    reminders,
    blooms,
    propagations,
    conditions,
    careEvents,
    notes,
    photoMetadata,
    stalePlants,
    acquisitions,
    archived,
    sports,
  ] = await Promise.all([
    prisma.reminder.findMany({
      where: { collectionId: options.collectionId, completedAt: null, pausedAt: null, dueAt: { lte: soon } },
      orderBy: { dueAt: 'asc' },
      take: 12,
    }),
    prisma.bloomEvent.findMany({
      where: { collectionId: options.collectionId, OR: [{ bloomEndDate: null }, { bloomEndDate: { gte: sevenDaysAgo } }] },
      include: { plantInstance: { include: { plantDefinition: true } } },
      orderBy: { bloomStartDate: 'desc' },
      take: 10,
    }),
    prisma.propagationEvent.findMany({
      where: { collectionId: options.collectionId, date: { gte: addCalendarDays(now, -45, options.timezone) } },
      include: {
        parents: { include: { parentPlantInstance: { include: { plantDefinition: true } } } },
        children: { include: { childPlantInstance: { include: { plantDefinition: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    prisma.plantCondition.findMany({
      where: { collectionId: options.collectionId, status: { not: 'RESOLVED' } },
      include: { plantInstance: { include: { plantDefinition: true } } },
      orderBy: { observedAt: 'desc' },
      take: 12,
    }),
    prisma.plantCareEvent.findMany({
      where: { collectionId: options.collectionId, performedAt: { gte: sevenDaysAgo } },
      include: { plantInstance: { include: { plantDefinition: true } } },
      orderBy: { performedAt: 'desc' },
      take: 12,
    }),
    prisma.note.findMany({
      where: { collectionId: options.collectionId, createdAt: { gte: addCalendarDays(now, -30, options.timezone) } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.photo.findMany({
      where: { collectionId: options.collectionId, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { entityType: true, entityId: true, caption: true, source: true, isCover: true, isType: true, createdAt: true },
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: options.collectionId, status: 'ACTIVE', updatedAt: { lte: staleCutoff } },
      include: { plantDefinition: true, currentLocation: true },
      orderBy: { updatedAt: 'asc' },
      take: 12,
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: options.collectionId, createdAt: { gte: sevenDaysAgo } },
      include: { plantDefinition: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: options.collectionId, status: 'ARCHIVED', archiveDate: { gte: sevenDaysAgo } },
      include: { plantDefinition: true },
      orderBy: { archiveDate: 'desc' },
      take: 10,
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: options.collectionId, OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }] },
      include: { plantDefinition: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    }),
  ])

  const referencedPlantInstanceIds = new Set<string>()
  const referencedBloomIds = new Set<string>()
  for (const item of [...reminders, ...notes, ...photoMetadata]) {
    if (item.entityType === 'PLANT_INSTANCE' && item.entityId) referencedPlantInstanceIds.add(item.entityId)
    if (item.entityType === 'BLOOM_EVENT' && item.entityId) referencedBloomIds.add(item.entityId)
  }
  const [referencedPlantInstances, referencedBlooms] = await Promise.all([
    referencedPlantInstanceIds.size
      ? prisma.plantInstance.findMany({
          where: { collectionId: options.collectionId, id: { in: Array.from(referencedPlantInstanceIds) } },
          include: { plantDefinition: true },
        })
      : Promise.resolve([]),
    referencedBloomIds.size
      ? prisma.bloomEvent.findMany({
          where: { collectionId: options.collectionId, id: { in: Array.from(referencedBloomIds) } },
          include: { plantInstance: { include: { plantDefinition: true } } },
        })
      : Promise.resolve([]),
  ])
  const plantReferenceByEntity = new Map<string, { plantId: string; plantName: string }>()
  for (const item of referencedPlantInstances) {
    plantReferenceByEntity.set(entityKey('PLANT_INSTANCE', item.id), {
      plantId: item.plantId,
      plantName: plantName(item.plantDefinition),
    })
  }
  for (const item of referencedBlooms) {
    plantReferenceByEntity.set(entityKey('BLOOM_EVENT', item.id), {
      plantId: item.plantInstance.plantId,
      plantName: plantName(item.plantInstance.plantDefinition),
    })
  }

  const source = {
    localDate: dateInputValue(now, options.timezone),
    timezone: options.timezone,
    careQueue: careItems.slice(0, 20).map((item) => ({
      taskType: item.taskType,
      title: item.title,
      reason: item.reason,
      plantId: item.plantId,
      plantName: item.plantName,
      dueAt: item.dueAt.toISOString(),
      overdueDays: item.overdueDays,
      href: item.href,
    })),
    reminders: reminders.map((item) => ({
      title: item.title,
      category: item.category,
      dueAt: item.dueAt.toISOString(),
      entityType: item.entityType,
      plantId: plantReferenceByEntity.get(entityKey(item.entityType, item.entityId))?.plantId || null,
      plantName: plantReferenceByEntity.get(entityKey(item.entityType, item.entityId))?.plantName || null,
    })),
    blooms: blooms.map((item) => ({
      plantId: item.plantInstance.plantId,
      plantName: plantName(item.plantInstance.plantDefinition),
      bloomStartDate: item.bloomStartDate.toISOString(),
      peakBloomDate: item.peakBloomDate?.toISOString() || null,
      bloomEndDate: item.bloomEndDate?.toISOString() || null,
      flowerCount: item.flowerCount,
      notes: preview(item.notes),
    })),
    propagations: propagations.map((event) => ({
      date: event.date.toISOString(),
      method: event.method,
      status: event.successStatus,
      parents: event.parents.map((parent) => parent.parentPlantInstance.plantId),
      children: event.children.map((child) => child.childPlantInstance.plantId),
      notes: preview(event.notes),
    })),
    conditions: conditions.map((item) => ({
      plantId: item.plantInstance.plantId,
      plantName: plantName(item.plantInstance.plantDefinition),
      category: item.category,
      severity: item.severity,
      observedAt: item.observedAt.toISOString(),
      notes: preview(item.notes),
    })),
    recentCare: careEvents.map((item) => ({
      plantId: item.plantInstance.plantId,
      plantName: plantName(item.plantInstance.plantDefinition),
      eventType: item.eventType,
      performedAt: item.performedAt.toISOString(),
      notes: preview(item.notes),
    })),
    recentNotes: notes.map((item) => ({
      entityType: item.entityType,
      plantId: plantReferenceByEntity.get(entityKey(item.entityType, item.entityId))?.plantId || null,
      plantName: plantReferenceByEntity.get(entityKey(item.entityType, item.entityId))?.plantName || null,
      createdAt: item.createdAt.toISOString(),
      note: preview(item.note),
    })),
    recentPhotoMetadata: photoMetadata.map((item) => ({
      entityType: item.entityType,
      plantId: plantReferenceByEntity.get(entityKey(item.entityType, item.entityId))?.plantId || null,
      plantName: plantReferenceByEntity.get(entityKey(item.entityType, item.entityId))?.plantName || null,
      caption: preview(item.caption),
      source: preview(item.source, 80),
      isCover: item.isCover,
      isType: item.isType,
      createdAt: item.createdAt.toISOString(),
    })),
    stalePlants: stalePlants.map((item) => ({
      plantId: item.plantId,
      plantName: plantName(item.plantDefinition),
      location: item.currentLocation?.name || null,
      updatedAt: item.updatedAt.toISOString(),
    })),
    recentAcquisitions: acquisitions.map((item) => ({
      plantId: item.plantId,
      plantName: plantName(item.plantDefinition),
      source: preview(item.source, 80),
      distributor: preview(item.distributor, 80),
      createdAt: item.createdAt.toISOString(),
    })),
    recentArchived: archived.map((item) => ({
      plantId: item.plantId,
      plantName: plantName(item.plantDefinition),
      reason: preview(item.archiveReason, 80),
      archiveDate: item.archiveDate?.toISOString() || null,
    })),
    sports: sports.map((item) => ({
      plantId: item.plantId,
      plantName: plantName(item.plantDefinition),
      sportStatus: item.sportStatus,
      description: preview(item.sportDescription),
      updatedAt: item.updatedAt.toISOString(),
    })),
  }

  return {
    ...source,
    sourceHash: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
  }
}
