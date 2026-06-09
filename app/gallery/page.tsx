import { PhotoGallery, type GalleryPhoto } from '@/components/PhotoGallery'
import { SortControl } from '@/components/SortControl'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { sunshineCounts, sunshineKey, sunshineStateForUser } from '@/lib/sunshine'
import { fmtDate, plantName } from '@/lib/utils'

const gallerySortOptions: SortOption[] = [
  { value: 'newest', label: 'Newest photos' },
  { value: 'oldest', label: 'Oldest photos' },
  { value: 'plantIdAsc', label: 'Plant ID A-Z' },
  { value: 'typeAsc', label: 'Photo type A-Z' },
  { value: 'sunshineDesc', label: 'Sunshine high-low' },
  { value: 'sunshineAsc', label: 'Sunshine low-high' },
]

export default async function GalleryPage() {
  const user = await getCurrentUser()
  const { collection } = await requireCollectionViewer()
  const collectionWhere = { collectionId: collection.id }
  const sortKey = await sortPreference(user?.id, 'gallery', 'newest', gallerySortOptions.map((option) => option.value))
  const photos = await prisma.photo.findMany({
    where: { ...collectionWhere, entityType: { in: ['PLANT_INSTANCE', 'BLOOM_EVENT', 'PLANT_DEFINITION'] } },
    orderBy: { createdAt: 'desc' },
  })

  const instanceIds = photos
    .filter((photo) => photo.entityType === 'PLANT_INSTANCE')
    .map((photo) => photo.entityId)
  const bloomIds = photos
    .filter((photo) => photo.entityType === 'BLOOM_EVENT')
    .map((photo) => photo.entityId)
  const definitionIds = photos
    .filter((photo) => photo.entityType === 'PLANT_DEFINITION')
    .map((photo) => photo.entityId)

  const [instances, blooms, definitions] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, id: { in: instanceIds } },
      include: { plantDefinition: true },
    }),
    prisma.bloomEvent.findMany({
      where: { ...collectionWhere, id: { in: bloomIds } },
      include: { plantInstance: { include: { plantDefinition: true } } },
    }),
    prisma.plantDefinition.findMany({
      where: { ...collectionWhere, id: { in: definitionIds } },
    }),
  ])

  const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
  const bloomById = new Map(blooms.map((bloom) => [bloom.id, bloom]))
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]))
  const photoSunshineTargets = photos
    .filter((photo) => photo.entityType !== 'PLANT_DEFINITION')
    .map((photo) => ({ targetType: 'PHOTO' as const, targetId: photo.id }))
  const [photoSunshineCounts, currentUserSunshine] = await Promise.all([
    sunshineCounts(prisma, collection.id, photoSunshineTargets),
    sunshineStateForUser(prisma, collection.id, user?.id, photoSunshineTargets),
  ])

  const galleryPhotos = photos.flatMap<GalleryPhoto>((photo) => {
    const canSunshine = photo.entityType !== 'PLANT_DEFINITION'
    const sunshineCount = photoSunshineCounts.get(sunshineKey('PHOTO', photo.id)) || 0
    const sunshined = currentUserSunshine.has(sunshineKey('PHOTO', photo.id))
    if (photo.entityType === 'PLANT_INSTANCE') {
      const instance = instanceById.get(photo.entityId)
      if (!instance) return []
      return [{
        id: photo.id,
        path: photo.path,
        moderationStatus: photo.moderationStatus,
        nsfwFlagged: photo.nsfwFlagged,
        caption: photo.caption || '',
        cropX: photo.cropX,
        cropY: photo.cropY,
        cropWidth: photo.cropWidth,
        cropHeight: photo.cropHeight,
        focalX: photo.focalX,
        focalY: photo.focalY,
        createdAt: photo.createdAt.toISOString(),
        kind: 'Specimen',
        plantId: instance.plantId,
        plantName: plantName(instance.plantDefinition),
        instanceHref: collectionPath(collection.slug, `/instances/${instance.id}`),
        isCover: photo.isCover,
        isType: photo.isType,
        canSunshine,
        sunshineCount,
        sunshined,
        canToggleSunshine: Boolean(user),
        collectionSlug: collection.slug,
        back: collectionPath(collection.slug, '/gallery'),
      }]
    }

    if (photo.entityType === 'PLANT_DEFINITION') {
      const definition = definitionById.get(photo.entityId)
      if (!definition) return []
      const definitionName = plantName(definition)
      return [{
        id: photo.id,
        path: photo.path,
        moderationStatus: photo.moderationStatus,
        nsfwFlagged: photo.nsfwFlagged,
        caption: photo.caption || 'Plant definition type image',
        cropX: photo.cropX,
        cropY: photo.cropY,
        cropWidth: photo.cropWidth,
        cropHeight: photo.cropHeight,
        focalX: photo.focalX,
        focalY: photo.focalY,
        createdAt: photo.createdAt.toISOString(),
        kind: 'Type image',
        plantId: definitionName,
        plantName: definitionName,
        instanceHref: collectionPath(collection.slug, `/plants/${definition.id}/edit`),
        isCover: photo.isCover,
        isType: photo.isType,
        canSunshine,
        sunshineCount,
        sunshined,
        canToggleSunshine: false,
        collectionSlug: collection.slug,
        back: collectionPath(collection.slug, '/gallery'),
      }]
    }

    const bloom = bloomById.get(photo.entityId)
    if (!bloom) return []
    return [{
      id: photo.id,
      path: photo.path,
      moderationStatus: photo.moderationStatus,
      nsfwFlagged: photo.nsfwFlagged,
      caption: photo.caption || `Bloom photo from ${fmtDate(bloom.bloomStartDate)}`,
      cropX: photo.cropX,
      cropY: photo.cropY,
      cropWidth: photo.cropWidth,
      cropHeight: photo.cropHeight,
      focalX: photo.focalX,
      focalY: photo.focalY,
      createdAt: photo.createdAt.toISOString(),
      kind: 'Bloom',
      plantId: bloom.plantInstance.plantId,
      plantName: plantName(bloom.plantInstance.plantDefinition),
      instanceHref: collectionPath(collection.slug, `/instances/${bloom.plantInstance.id}`),
      bloomDate: fmtDate(bloom.bloomStartDate),
      isCover: photo.isCover,
      isType: photo.isType,
      canSunshine,
      sunshineCount,
      sunshined,
      canToggleSunshine: Boolean(user),
      collectionSlug: collection.slug,
      back: collectionPath(collection.slug, '/gallery'),
    }]
  })
  const sortedPhotos = [...galleryPhotos].sort((left, right) => {
    if (sortKey === 'oldest') return timeValue(left.createdAt) - timeValue(right.createdAt)
    if (sortKey === 'plantIdAsc') return compareText(left.plantId, right.plantId) || timeValue(right.createdAt) - timeValue(left.createdAt)
    if (sortKey === 'typeAsc') return compareText(left.kind, right.kind) || timeValue(right.createdAt) - timeValue(left.createdAt)
    if (sortKey === 'sunshineDesc') return right.sunshineCount - left.sunshineCount || timeValue(right.createdAt) - timeValue(left.createdAt)
    if (sortKey === 'sunshineAsc') return left.sunshineCount - right.sunshineCount || timeValue(right.createdAt) - timeValue(left.createdAt)
    return timeValue(right.createdAt) - timeValue(left.createdAt)
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Gallery</h2>
          <p className="mt-1 text-sm text-stone-600">Browse specimen, bloom, and type images across the collection.</p>
        </div>
        <SortControl
          section="gallery"
          value={sortKey}
          options={gallerySortOptions}
          back={collectionPath(collection.slug, '/gallery')}
          disabled={!user}
        />
      </div>
      <PhotoGallery photos={sortedPhotos} />
    </div>
  )
}
