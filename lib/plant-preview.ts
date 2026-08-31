import type { PrismaClient } from '@prisma/client'
import { collectionPath } from '@/lib/collections'
import { locationPathWithCodes } from '@/lib/locations'
import { plantInstanceTypeLabel } from '@/lib/plant-instance-types'
import { acceptedPlantName, plantName } from '@/lib/utils'

export type PlantInstancePreview = {
  id: string
  plantId: string
  href: string
  displayName: string
  botanicalName: string
  acquisitionLabel: string | null
  coverPhotoUrl: string | null
  currentLocationPath: string | null
  currentLocationCode: string | null
  status: string
  activeConditionCount: number
  activeBloomCount: number
  activeQuarantine: boolean
  lastObservedAt: string | null
  lastPhotoAt: string | null
  lastCareAt: string | null
  acquisitionStatus: string | null
  acquisitionPriority: number | null
  desiredLocationPath: string | null
  idealPurchasePrice: string | null
  maximumPurchasePrice: string | null
  tags: Array<{
    id: string
    name: string
    icon: string | null
    colorToken: string | null
    publicVisible: boolean
    active: boolean
  }>
}

function mostRecentDate(dates: Array<Date | null | undefined>) {
  return dates
    .filter((date): date is Date => date instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null
}

function acquisitionLabel(instance: {
  acquisitionLabel?: string | null
  instanceType: string
  source?: string | null
  distributor?: string | null
  acquisitionDate?: Date | null
  propagationDate?: Date | null
}) {
  if (instance.acquisitionLabel?.trim()) return instance.acquisitionLabel.trim()
  const source = [instance.source, instance.distributor].filter(Boolean).join(' via ')
  if (source) return source
  if (instance.instanceType === 'ACQUIRED_PROPAGATION') return 'Acquired propagation'
  if (['SEED', 'CORM', 'TISSUE_CULTURE'].includes(instance.instanceType)) return plantInstanceTypeLabel(instance.instanceType)
  if (instance.propagationDate) return 'Propagation'
  if (instance.acquisitionDate) return 'Acquired plant'
  return null
}

export async function getPlantInstancePreview(
  prisma: PrismaClient,
  options: {
    collectionId: string
    collectionSlug: string
    plantInstanceIdOrCode: string
    publicOnly?: boolean
  },
): Promise<PlantInstancePreview | null> {
  const instance = await prisma.plantInstance.findFirst({
    where: {
      collectionId: options.collectionId,
      OR: [
        { id: options.plantInstanceIdOrCode },
        { plantId: options.plantInstanceIdOrCode },
      ],
    },
    include: {
      plantDefinition: {
        include: {
          tags: {
            where: {
              plantTag: {
                active: true,
                ...(options.publicOnly ? { publicVisible: true } : {}),
              },
            },
            include: { plantTag: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      currentLocation: { include: { locationType: true } },
      conditions: {
        where: { status: 'OPEN' },
        select: { id: true, observedAt: true },
      },
      blooms: {
        where: { bloomEndDate: null },
        select: { id: true, bloomStartDate: true },
      },
      quarantines: {
        where: { status: 'ACTIVE' },
        select: { id: true, startDate: true },
      },
      careEvents: {
        orderBy: { performedAt: 'desc' },
        take: 1,
        select: { performedAt: true },
      },
    },
  })
  if (!instance) return null

  const [coverPhoto, lastPhoto, locationNodes] = await Promise.all([
    prisma.photo.findFirst({
      where: { collectionId: options.collectionId, entityType: 'PLANT_INSTANCE', entityId: instance.id },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      select: { path: true, moderationStatus: true, nsfwFlagged: true },
    }),
    prisma.photo.findFirst({
      where: { collectionId: options.collectionId, entityType: 'PLANT_INSTANCE', entityId: instance.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.location.findMany({
      where: { collectionId: options.collectionId },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])
  const coverPhotoUrl = coverPhoto && !coverPhoto.nsfwFlagged && !['CENSORED', 'REMOVED'].includes(coverPhoto.moderationStatus)
    ? coverPhoto.path
    : null
  const lastObservedAt = mostRecentDate([
    ...instance.conditions.map((condition) => condition.observedAt),
    ...instance.blooms.map((bloom) => bloom.bloomStartDate),
    ...instance.quarantines.map((quarantine) => quarantine.startDate),
  ])
  const displayName = plantName(instance.plantDefinition)
  const botanicalName = acceptedPlantName(instance.plantDefinition)

  return {
    id: instance.id,
    plantId: instance.plantId,
    href: collectionPath(options.collectionSlug, `/instances/${instance.id}`),
    displayName,
    botanicalName,
    acquisitionLabel: acquisitionLabel(instance),
    coverPhotoUrl,
    currentLocationPath: instance.currentLocationId
      ? locationPathWithCodes(instance.currentLocationId, locationNodes)
      : null,
    currentLocationCode: instance.currentLocation?.code || null,
    status: instance.status,
    activeConditionCount: instance.conditions.length,
    activeBloomCount: instance.blooms.length,
    activeQuarantine: instance.quarantines.length > 0,
    lastObservedAt: lastObservedAt?.toISOString() || null,
    lastPhotoAt: lastPhoto?.createdAt.toISOString() || null,
    lastCareAt: instance.careEvents[0]?.performedAt.toISOString() || null,
    acquisitionStatus: instance.plantDefinition.acquisitionStatus || null,
    acquisitionPriority: instance.plantDefinition.acquisitionPriority || null,
    desiredLocationPath: instance.plantDefinition.desiredLocationId
      ? locationPathWithCodes(instance.plantDefinition.desiredLocationId, locationNodes)
      : null,
    idealPurchasePrice: instance.plantDefinition.idealPurchasePrice ? String(instance.plantDefinition.idealPurchasePrice) : null,
    maximumPurchasePrice: instance.plantDefinition.maximumPurchasePrice ? String(instance.plantDefinition.maximumPurchasePrice) : null,
    tags: instance.plantDefinition.tags.map(({ plantTag }) => ({
      id: plantTag.id,
      name: plantTag.name,
      icon: plantTag.icon,
      colorToken: plantTag.colorToken,
      publicVisible: plantTag.publicVisible,
      active: plantTag.active,
    })),
  }
}
