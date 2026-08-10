import type { AcquisitionStatus, PrismaClient } from '@prisma/client'
import { isServerAdminRole } from '@/lib/roles'

export const activeWishlistStatuses = ['RESEARCHING', 'WISHLIST', 'ACTIVELY_SEEKING', 'ON_HOLD'] as const

export type WishlistPublicSettings = {
  showPriority: boolean
  showCatSafety: boolean
  showTags: boolean
  showDifficulty: boolean
  showDesiredSize: boolean
  showPublicResearchSummary: boolean
  showOwnedCount: boolean
  showObservedPriceRange: boolean
  showLatestPublicObservation: boolean
  showPlannedLocationCategory: boolean
  showFulfilled: boolean
}

export const defaultWishlistPublicSettings: WishlistPublicSettings = {
  showPriority: false,
  showCatSafety: false,
  showTags: false,
  showDifficulty: false,
  showDesiredSize: false,
  showPublicResearchSummary: false,
  showOwnedCount: false,
  showObservedPriceRange: false,
  showLatestPublicObservation: false,
  showPlannedLocationCategory: false,
  showFulfilled: false,
}

export const wishlistPublicSettingLabels: Array<[keyof WishlistPublicSettings, string]> = [
  ['showPriority', 'Show priority'],
  ['showCatSafety', 'Show cat safety'],
  ['showTags', 'Show public plant tags'],
  ['showDifficulty', 'Show difficulty'],
  ['showDesiredSize', 'Show desired size'],
  ['showPublicResearchSummary', 'Show public research summary'],
  ['showOwnedCount', 'Show owned specimen count'],
  ['showObservedPriceRange', 'Show public observed price range'],
  ['showLatestPublicObservation', 'Show latest public observation'],
  ['showPlannedLocationCategory', 'Show planned location category'],
  ['showFulfilled', 'Include fulfilled items'],
]

export function normalizeWishlistPublicSettings(raw: unknown): WishlistPublicSettings {
  const value = raw && typeof raw === 'object' ? raw as Partial<WishlistPublicSettings> : {}
  return Object.fromEntries(wishlistPublicSettingLabels.map(([key]) => [
    key,
    typeof value[key] === 'boolean' ? value[key] : defaultWishlistPublicSettings[key],
  ])) as WishlistPublicSettings
}

export function canBrowseWishlist(input: {
  acquisitionVisibility: string
  userRole?: string | null
  membershipStatus?: string | null
}) {
  if (isServerAdminRole(input.userRole)) return true
  if (input.acquisitionVisibility === 'PUBLIC') return true
  return input.membershipStatus === 'ACTIVE'
    && ['MEMBERS', 'PRIVATE'].includes(input.acquisitionVisibility)
}

export function isPublicWishlistVisitor(input: {
  userRole?: string | null
  membershipStatus?: string | null
}) {
  return !isServerAdminRole(input.userRole) && input.membershipStatus !== 'ACTIVE'
}

export async function loadWishlistEntries(
  prisma: PrismaClient,
  collectionId: string,
  options: { includeFulfilled?: boolean; publicOnly?: boolean } = {},
) {
  const statuses: AcquisitionStatus[] = options.includeFulfilled ? [...activeWishlistStatuses, 'FULFILLED'] : [...activeWishlistStatuses]
  const definitions = await prisma.plantDefinition.findMany({
    where: { collectionId, acquisitionStatus: { in: statuses } },
    include: {
      aliases: { orderBy: { name: 'asc' } },
      tags: { where: options.publicOnly ? { plantTag: { publicVisible: true, active: true } } : undefined, include: { plantTag: true }, orderBy: { plantTag: { name: 'asc' } } },
      husbandryGuide: true,
      desiredLocation: { include: { locationType: true } },
      instances: { select: { id: true, status: true } },
      preferredSellers: { select: { seller: { select: { name: true } }, sellerStorefront: { select: { handleOrName: true, distributor: { select: { name: true } } } } }, orderBy: { sortOrder: 'asc' } },
      preferredDistributors: { select: { distributor: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } },
      plantObservations: {
        where: options.publicOnly ? { isPublic: true } : undefined,
        orderBy: { observedAt: 'desc' },
        take: 20,
      },
    },
    orderBy: [{ acquisitionPriority: 'desc' }, { createdAt: 'desc' }],
  })
  const photos = definitions.length ? await prisma.photo.findMany({
    where: {
      collectionId,
      entityType: 'PLANT_DEFINITION',
      entityId: { in: definitions.map((definition) => definition.id) },
      nsfwFlagged: false,
      moderationStatus: { notIn: ['CENSORED', 'REMOVED'] },
      OR: [{ plantDetected: null }, { plantDetected: true }],
    },
    orderBy: [{ isType: 'desc' }, { isCover: 'desc' }, { createdAt: 'desc' }],
  }) : []
  const photoByDefinition = new Map<string, typeof photos[number]>()
  for (const photo of photos) if (!photoByDefinition.has(photo.entityId)) photoByDefinition.set(photo.entityId, photo)
  return definitions.map((definition) => ({ ...definition, coverPhoto: photoByDefinition.get(definition.id) || null }))
}

export function wishlistPriceRange(observations: Array<{ observedPrice: unknown; currency: string }>) {
  const prices = observations.map((item) => Number(item.observedPrice)).filter(Number.isFinite)
  if (!prices.length) return null
  return { low: Math.min(...prices), high: Math.max(...prices), currency: observations.find((item) => item.observedPrice != null)?.currency || 'USD' }
}

export function wishlistEnvironmentSummary(guide?: {
  summaryLight?: string | null
  humidityRange?: string | null
  temperatureUsdaZone?: string | null
} | null) {
  if (!guide) return null
  return [guide.summaryLight, guide.humidityRange, guide.temperatureUsdaZone].filter(Boolean).join(' · ') || null
}
