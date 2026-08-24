import { PhotoGallery, type GalleryPhoto } from '@/components/PhotoGallery'
import { SortControl } from '@/components/SortControl'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { fmtDate, plantName } from '@/lib/utils'

const gallerySortOptions: SortOption[] = [
  { value: 'newest', label: 'Newest photos' },
  { value: 'oldest', label: 'Oldest photos' },
  { value: 'plantIdAsc', label: 'Plant ID A-Z' },
  { value: 'typeAsc', label: 'Photo type A-Z' },
]

const GALLERY_PAGE_SIZE = 96

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const user = await getCurrentUser()
  const params = await searchParams
  const { collection } = await requireCollectionViewer()
  const collectionWhere = { collectionId: collection.id }
  const sortKey = await sortPreference(user?.id, 'gallery', 'newest', gallerySortOptions.map((option) => option.value))
  const page = Math.max(1, Number(params.page || 1) || 1)
  const photoWithCollectionWhere = { ...collectionWhere, entityType: { in: ['PLANT_INSTANCE', 'BLOOM_EVENT', 'PLANT_DEFINITION'] } }
  const pagedByDatabase = sortKey === 'newest' || sortKey === 'oldest'
  const photoOrder =
    sortKey === 'oldest'
      ? [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
      : sortKey === 'typeAsc'
        ? [{ entityType: 'asc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'desc' as const }]
  const [photos, totalPhotos] = await Promise.all([
    prisma.photo.findMany({
      where: photoWithCollectionWhere,
      orderBy: photoOrder,
      ...(pagedByDatabase ? { skip: (page - 1) * GALLERY_PAGE_SIZE, take: GALLERY_PAGE_SIZE } : {}),
      select: {
        id: true,
        path: true,
        entityType: true,
        entityId: true,
        moderationStatus: true,
        nsfwFlagged: true,
        caption: true,
        cropX: true,
        cropY: true,
        cropWidth: true,
        cropHeight: true,
        focalX: true,
        focalY: true,
        createdAt: true,
        isCover: true,
        isType: true,
      },
    }),
    prisma.photo.count({ where: photoWithCollectionWhere }),
  ])

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
      select: {
        id: true,
        plantId: true,
        plantDefinition: {
          select: { genus: true, species: true, hybridNotation: true, cultivarName: true, authority: true, provisionalTaxon: true, identificationStatus: true },
        },
      },
    }),
    prisma.bloomEvent.findMany({
      where: { ...collectionWhere, id: { in: bloomIds } },
      select: {
        id: true,
        bloomStartDate: true,
        plantInstance: {
          select: {
            id: true,
            plantId: true,
            plantDefinition: {
              select: { genus: true, species: true, hybridNotation: true, cultivarName: true, authority: true, provisionalTaxon: true, identificationStatus: true },
            },
          },
        },
      },
    }),
    prisma.plantDefinition.findMany({
      where: { ...collectionWhere, id: { in: definitionIds } },
      select: { id: true, genus: true, species: true, hybridNotation: true, cultivarName: true, authority: true, provisionalTaxon: true, identificationStatus: true },
    }),
  ])

  const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
  const bloomById = new Map(blooms.map((bloom) => [bloom.id, bloom]))
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]))

  const galleryPhotos = photos.flatMap<GalleryPhoto>((photo) => {
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
    }]
  })
  const sortedPhotos = [...galleryPhotos].sort((left, right) => {
    if (sortKey === 'oldest') return timeValue(left.createdAt) - timeValue(right.createdAt)
    if (sortKey === 'plantIdAsc') return compareText(left.plantId, right.plantId) || timeValue(right.createdAt) - timeValue(left.createdAt)
    if (sortKey === 'typeAsc') return compareText(left.kind, right.kind) || timeValue(right.createdAt) - timeValue(left.createdAt)
    return timeValue(right.createdAt) - timeValue(left.createdAt)
  })
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams()
    query.set('page', String(nextPage))
    return `?${query.toString()}`
  }

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
      <PhotoGallery
        photos={sortedPhotos}
        totalPhotos={totalPhotos}
        page={pagedByDatabase ? page : 1}
        pageSize={pagedByDatabase ? GALLERY_PAGE_SIZE : Math.max(totalPhotos, 1)}
        pageHref={pagedByDatabase ? pageHref : undefined}
      />
    </div>
  )
}
