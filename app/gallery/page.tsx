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

export default async function GalleryPage() {
  const user = await getCurrentUser()
  const { collection } = await requireCollectionViewer()
  const collectionWhere = { collectionId: collection.id }
  const sortKey = await sortPreference(user?.id, 'gallery', 'newest', gallerySortOptions.map((option) => option.value))
  const photos = await prisma.photo.findMany({
    where: { ...collectionWhere, entityType: { in: ['PLANT_INSTANCE', 'BLOOM_EVENT'] } },
    orderBy: { createdAt: 'desc' },
  })

  const instanceIds = photos
    .filter((photo) => photo.entityType === 'PLANT_INSTANCE')
    .map((photo) => photo.entityId)
  const bloomIds = photos
    .filter((photo) => photo.entityType === 'BLOOM_EVENT')
    .map((photo) => photo.entityId)

  const [instances, blooms] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, id: { in: instanceIds } },
      include: { plantDefinition: true },
    }),
    prisma.bloomEvent.findMany({
      where: { ...collectionWhere, id: { in: bloomIds } },
      include: { plantInstance: { include: { plantDefinition: true } } },
    }),
  ])

  const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
  const bloomById = new Map(blooms.map((bloom) => [bloom.id, bloom]))

  const galleryPhotos = photos.flatMap<GalleryPhoto>((photo) => {
    if (photo.entityType === 'PLANT_INSTANCE') {
      const instance = instanceById.get(photo.entityId)
      if (!instance) return []
      return [{
        id: photo.id,
        path: photo.path,
        caption: photo.caption || '',
        createdAt: photo.createdAt.toISOString(),
        kind: 'Specimen',
        plantId: instance.plantId,
        plantName: plantName(instance.plantDefinition),
        instanceHref: collectionPath(collection.slug, `/instances/${instance.id}`),
        isCover: photo.isCover,
        isType: photo.isType,
      }]
    }

    const bloom = bloomById.get(photo.entityId)
    if (!bloom) return []
    return [{
      id: photo.id,
      path: photo.path,
      caption: photo.caption || `Bloom photo from ${fmtDate(bloom.bloomStartDate)}`,
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Gallery</h2>
          <p className="mt-1 text-sm text-stone-600">Browse specimen and bloom photos across the collection.</p>
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
