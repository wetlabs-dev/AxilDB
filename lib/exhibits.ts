import { createHash, randomBytes } from 'crypto'
import type { CollectionExhibit, PrismaClient } from '@prisma/client'
import { CollectionExhibitAccessMode, CollectionExhibitStatus } from '@prisma/client'
import { collectionPath } from '@/lib/collections'
import { appUrl } from '@/lib/email'
import { locationPathWithCodes } from '@/lib/locations'
import { plantName } from '@/lib/utils'

export type ExhibitSettings = {
  wishlistHeading: string
  taxonomyDetails: boolean
  aliases: boolean
  plantTags: boolean
  referenceLinks: boolean
  husbandry: boolean
  typeImages: boolean
  specimenPhotos: boolean
  imageMode: 'cover' | 'recent' | 'all' | 'selected'
  acquisitionSource: boolean
  location: boolean
  notes: boolean
  careNotes: boolean
  conditions: boolean
  lineage: boolean
  miniLineage: boolean
  bloomHistory: boolean
  propagationHistory: boolean
  timeline: boolean
  sunshine: boolean
  archivedStatus: boolean
  quarantineStatus: boolean
}

export type ExhibitUpdateSettings = {
  cadence: 'manual' | 'daily' | 'weekly' | 'disabled'
  changes: Record<string, boolean>
}

export const exhibitSettingLabels: Array<[keyof ExhibitSettings, string, string]> = [
  ['taxonomyDetails', 'Definition taxonomy details', 'Botanical identity, authority, registration, and validation context.'],
  ['aliases', 'Aliases and common names', 'Common, trade, and alternate names attached to the definition.'],
  ['plantTags', 'Plant tags', 'Collection-defined traits marked public-visible.'],
  ['referenceLinks', 'Reference links', 'Definition reference URLs.'],
  ['husbandry', 'Husbandry summary', 'Structured care guidance from the definition.'],
  ['typeImages', 'Type images', 'Definition/type photos.'],
  ['specimenPhotos', 'Specimen photos', 'Photos for selected specimens.'],
  ['acquisitionSource', 'Acquisition/source data', 'Source, distributor, and acquisition/propagation dates.'],
  ['location', 'Current location', 'Structured location path or legacy location text.'],
  ['notes', 'Specimen notes', 'Freeform notes attached to selected specimens. Off by default.'],
  ['careNotes', 'Care notes', 'Care-event notes. Off by default.'],
  ['conditions', 'Problem/condition info', 'Open and recent condition records. Off by default.'],
  ['lineage', 'Lineage information', 'Parent/child propagation links within the exhibit.'],
  ['miniLineage', 'Mini lineage panel', 'Compact read-only lineage summary.'],
  ['bloomHistory', 'Bloom history', 'Bloom dates, counts, and first-bloom markers.'],
  ['propagationHistory', 'Propagation history', 'Propagation relationships and success status.'],
  ['timeline', 'Plant Health Timeline summary', 'Condensed recent public-safe timeline facts.'],
  ['sunshine', 'Sunshine count', 'Aggregate sunshine/bookmark count.'],
  ['archivedStatus', 'Archived status', 'Show archived status and reason.'],
  ['quarantineStatus', 'Quarantine status', 'Show active quarantine indicator.'],
]

export const updateChangeLabels = [
  ['plants', 'New/removed exhibit plants'],
  ['photos', 'New photos'],
  ['blooms', 'New blooms'],
  ['notes', 'New notes'],
  ['care', 'New care notes'],
  ['conditions', 'Condition/problem changes'],
  ['locations', 'Location changes'],
  ['lineage', 'Propagation/lineage updates'],
  ['definitions', 'Definition/husbandry changes'],
  ['sunshine', 'Sunshine milestones'],
] as const

export const defaultExhibitSettings: ExhibitSettings = {
  wishlistHeading: 'Planned Acquisitions',
  taxonomyDetails: true,
  aliases: true,
  plantTags: false,
  referenceLinks: true,
  husbandry: true,
  typeImages: true,
  specimenPhotos: true,
  imageMode: 'cover',
  acquisitionSource: true,
  location: true,
  notes: false,
  careNotes: false,
  conditions: false,
  lineage: true,
  miniLineage: true,
  bloomHistory: true,
  propagationHistory: true,
  timeline: true,
  sunshine: true,
  archivedStatus: true,
  quarantineStatus: true,
}

export const defaultExhibitUpdateSettings: ExhibitUpdateSettings = {
  cadence: 'manual',
  changes: Object.fromEntries(updateChangeLabels.map(([key]) => [key, ['plants', 'photos', 'blooms', 'lineage', 'definitions'].includes(key)])),
}

export function normalizeExhibitSettings(raw: unknown): ExhibitSettings {
  const input = raw && typeof raw === 'object' ? raw as Partial<ExhibitSettings> : {}
  const imageMode = ['cover', 'recent', 'all', 'selected'].includes(String(input.imageMode)) ? input.imageMode as ExhibitSettings['imageMode'] : defaultExhibitSettings.imageMode
  return {
    ...defaultExhibitSettings,
    ...Object.fromEntries(Object.keys(defaultExhibitSettings).map((key) => [
      key,
      typeof (input as any)[key] === 'boolean' ? (input as any)[key] : (defaultExhibitSettings as any)[key],
    ])),
    imageMode,
    wishlistHeading: typeof input.wishlistHeading === 'string' && input.wishlistHeading.trim() ? input.wishlistHeading.trim().slice(0, 120) : defaultExhibitSettings.wishlistHeading,
  }
}

export function normalizeExhibitUpdateSettings(raw: unknown): ExhibitUpdateSettings {
  const input = raw && typeof raw === 'object' ? raw as Partial<ExhibitUpdateSettings> : {}
  const cadence = ['manual', 'daily', 'weekly', 'disabled'].includes(String(input.cadence)) ? input.cadence as ExhibitUpdateSettings['cadence'] : defaultExhibitUpdateSettings.cadence
  return {
    cadence,
    changes: {
      ...defaultExhibitUpdateSettings.changes,
      ...(input.changes && typeof input.changes === 'object' ? input.changes : {}),
    },
  }
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'exhibit'
}

export function secureToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url')
}

export function hashExhibitToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function publicExhibitPath(exhibit: { slug: string; accessMode: CollectionExhibitAccessMode | string; token?: string | null }) {
  const token = exhibit.accessMode === CollectionExhibitAccessMode.UNLISTED && exhibit.token ? `?token=${encodeURIComponent(exhibit.token)}` : ''
  return `/exhibit/${exhibit.slug}${token}`
}

export function publicExhibitUrl(exhibit: { slug: string; accessMode: CollectionExhibitAccessMode | string; token?: string | null }) {
  return appUrl(publicExhibitPath(exhibit))
}

export function isPublishedExhibitVisible(exhibit: Pick<CollectionExhibit, 'status' | 'accessMode' | 'token' | 'expiresAt' | 'revokedAt'>, token?: string | null) {
  if (exhibit.revokedAt) return false
  if (exhibit.status !== CollectionExhibitStatus.PUBLISHED) return false
  if (exhibit.expiresAt && exhibit.expiresAt < new Date()) return false
  if (exhibit.accessMode === CollectionExhibitAccessMode.UNLISTED && exhibit.token !== token) return false
  return true
}

function publicSafePhotoWhere(collectionId: string, entityType: string, entityId: string) {
  return {
    collectionId,
    entityType,
    entityId,
    nsfwFlagged: false,
    moderationStatus: { notIn: ['CENSORED', 'REMOVED'] },
    OR: [{ plantDetected: null }, { plantDetected: true }],
  }
}

export async function nextExhibitSlug(prisma: PrismaClient, title: string) {
  const base = slugify(title)
  let slug = base
  let suffix = 2
  while (await prisma.collectionExhibit.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`
    suffix += 1
  }
  return slug
}

export async function exhibitPlantCandidates(prisma: PrismaClient, collectionId: string) {
  return prisma.plantInstance.findMany({
    where: { collectionId },
    orderBy: { plantId: 'asc' },
    include: {
      plantDefinition: true,
      currentLocation: { include: { locationType: true } },
    },
  })
}

export async function loadExhibitForDisplay(prisma: PrismaClient, slug: string) {
  const exhibit = await prisma.collectionExhibit.findUnique({
    where: { slug },
    include: {
      collection: true,
      coverPhoto: true,
      plants: {
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          plantInstance: {
            include: {
              plantDefinition: {
                include: {
                  aliases: true,
                  tags: { where: { plantTag: { publicVisible: true, active: true } }, include: { plantTag: true }, orderBy: { plantTag: { name: 'asc' } } },
                  governingBody: true,
                  husbandryGuide: true,
                },
              },
              currentLocation: { include: { locationType: true } },
              acquisitionRecordLinks: { include: { acquisitionRecord: { include: { distributor: true, distributorLocation: true, sources: { include: { source: true }, orderBy: { sortOrder: 'asc' } } } } }, orderBy: { createdAt: 'desc' }, take: 1 },
              blooms: { orderBy: { bloomStartDate: 'desc' }, take: 8 },
              conditions: { orderBy: { observedAt: 'desc' }, take: 8 },
              careEvents: { orderBy: { performedAt: 'desc' }, take: 8 },
              quarantines: { orderBy: { startDate: 'desc' }, take: 4 },
              parentLinks: { include: { propagationEvent: true, parentPlantInstance: { select: { id: true, plantId: true, plantDefinitionId: true } } } },
              childLinks: { include: { propagationEvent: true, childPlantInstance: { select: { id: true, plantId: true, plantDefinitionId: true } } } },
            },
          },
        },
      },
      wishlistItems: {
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          plantDefinition: {
            include: {
              aliases: true,
              tags: { where: { plantTag: { publicVisible: true, active: true } }, include: { plantTag: true }, orderBy: { plantTag: { name: 'asc' } } },
              husbandryGuide: true,
              desiredLocation: { include: { locationType: true } },
              instances: { select: { id: true } },
              plantObservations: { where: { isPublic: true }, orderBy: { observedAt: 'desc' }, take: 10 },
            },
          },
        },
      },
      subscribers: { select: { id: true, email: true, status: true, createdAt: true, confirmedAt: true, unsubscribedAt: true }, orderBy: { createdAt: 'desc' } },
      updates: { include: { deliveries: true }, orderBy: { createdAt: 'desc' }, take: 8 },
    },
  })
  if (!exhibit) return null
  const settings = normalizeExhibitSettings(exhibit.settingsJson)
  const updateSettings = normalizeExhibitUpdateSettings(exhibit.updateSettingsJson)
  const plantIds = exhibit.plants.map((entry) => entry.plantInstance.id)
  const definitionIds = Array.from(new Set([
    ...exhibit.plants.map((entry) => entry.plantInstance.plantDefinitionId),
    ...exhibit.wishlistItems.map((entry) => entry.plantDefinitionId),
  ]))
  const [locations, photos, definitionPhotos, notes, sunshineRows] = await Promise.all([
    prisma.location.findMany({ where: { collectionId: exhibit.collectionId }, include: { locationType: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    settings.specimenPhotos && plantIds.length ? prisma.photo.findMany({
      where: {
        OR: plantIds.map((id) => publicSafePhotoWhere(exhibit.collectionId, 'PLANT_INSTANCE', id)),
      },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    }) : Promise.resolve([]),
    settings.typeImages && definitionIds.length ? prisma.photo.findMany({
      where: {
        OR: definitionIds.map((id) => publicSafePhotoWhere(exhibit.collectionId, 'PLANT_DEFINITION', id)),
      },
      orderBy: [{ isType: 'desc' }, { createdAt: 'desc' }],
    }) : Promise.resolve([]),
    settings.notes && plantIds.length ? prisma.note.findMany({
      where: { collectionId: exhibit.collectionId, entityType: 'PLANT_INSTANCE', entityId: { in: plantIds } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }) : Promise.resolve([]),
    settings.sunshine && plantIds.length ? prisma.sunshine.groupBy({
      by: ['targetId'],
      where: { collectionId: exhibit.collectionId, targetType: 'PLANT_INSTANCE', targetId: { in: plantIds } },
      _count: { _all: true },
    }) : Promise.resolve([]),
  ])
  const sunshineByPlant = new Map(sunshineRows.map((row) => [row.targetId, row._count._all]))
  const photosByPlant = new Map<string, typeof photos>()
  for (const photo of photos) {
    const list = photosByPlant.get(photo.entityId) || []
    list.push(photo)
    photosByPlant.set(photo.entityId, list)
  }
  const typePhotosByDefinition = new Map<string, typeof definitionPhotos>()
  for (const photo of definitionPhotos) {
    const list = typePhotosByDefinition.get(photo.entityId) || []
    list.push(photo)
    typePhotosByDefinition.set(photo.entityId, list)
  }
  const notesByPlant = new Map<string, typeof notes>()
  for (const note of notes) {
    const list = notesByPlant.get(note.entityId) || []
    list.push(note)
    notesByPlant.set(note.entityId, list)
  }
  const groups = new Map<string, {
    definition: typeof exhibit.plants[number]['plantInstance']['plantDefinition']
    typePhotos: typeof definitionPhotos
    entries: Array<typeof exhibit.plants[number] & { sunshineCount: number; photos: typeof photos; notes: typeof notes; locationPath: string | null }>
  }>()
  for (const entry of exhibit.plants) {
    const definition = entry.plantInstance.plantDefinition
    const existing = groups.get(definition.id) || { definition, typePhotos: typePhotosByDefinition.get(definition.id) || [], entries: [] }
    const currentPhotos = photosByPlant.get(entry.plantInstance.id) || []
    const limitedPhotos = settings.imageMode === 'all'
      ? currentPhotos
      : settings.imageMode === 'recent'
        ? currentPhotos.slice(0, 4)
        : settings.imageMode === 'selected'
          ? (currentPhotos.filter((photo) => photo.isCover).slice(0, 4).length ? currentPhotos.filter((photo) => photo.isCover).slice(0, 4) : currentPhotos.slice(0, 1))
          : currentPhotos.slice(0, 1)
    existing.entries.push({
      ...entry,
      sunshineCount: sunshineByPlant.get(entry.plantInstance.id) || 0,
      photos: limitedPhotos,
      notes: notesByPlant.get(entry.plantInstance.id) || [],
      locationPath: entry.plantInstance.currentLocationId
        ? locationPathWithCodes(entry.plantInstance.currentLocationId, locations)
        : entry.plantInstance.legacyLocationText || entry.plantInstance.location,
    })
    groups.set(definition.id, existing)
  }
  return {
    exhibit,
    settings,
    updateSettings,
    groups: Array.from(groups.values()),
    wishlistItems: exhibit.wishlistItems.map((entry) => ({
      ...entry,
      typePhotos: typePhotosByDefinition.get(entry.plantDefinitionId) || [],
    })),
    publicPath: publicExhibitPath(exhibit),
    publicUrl: publicExhibitUrl(exhibit),
  }
}

export function definitionDisplayName(definition: { genus: string; species: string; hybridNotation?: string | null; cultivarName?: string | null }) {
  return plantName(definition)
}

export function plantRecordPath(collectionSlug: string, plantInstanceId: string) {
  return collectionPath(collectionSlug, `/instances/${plantInstanceId}`)
}
