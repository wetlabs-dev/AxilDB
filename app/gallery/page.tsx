import { PhotoGallery, type GalleryPhoto } from '@/components/PhotoGallery'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'

export default async function GalleryPage() {
  const photos = await prisma.photo.findMany({
    where: { entityType: { in: ['PLANT_INSTANCE', 'BLOOM_EVENT'] } },
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
      where: { id: { in: instanceIds } },
      include: { plantDefinition: true },
    }),
    prisma.bloomEvent.findMany({
      where: { id: { in: bloomIds } },
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
        instanceHref: `/instances/${instance.id}`,
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
      instanceHref: `/instances/${bloom.plantInstance.id}`,
      bloomDate: fmtDate(bloom.bloomStartDate),
      isCover: photo.isCover,
      isType: photo.isType,
    }]
  })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-bold">Gallery</h2>
        <p className="mt-1 text-sm text-stone-600">Browse specimen and bloom photos across the collection.</p>
      </div>
      <PhotoGallery photos={galleryPhotos} />
    </div>
  )
}
