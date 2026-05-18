import { PlantImage } from '@/components/PlantImage'
import { Card } from '@/components/ui'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'
import { Flower2, Sprout } from 'lucide-react'
import Link from 'next/link'

export default async function Blooms() {
  const { collection } = await requireCollectionViewer()
  const collectionWhere = { collectionId: collection.id }
  const blooms = await prisma.bloomEvent.findMany({
    where: collectionWhere,
    include: { plantInstance: { include: { plantDefinition: true } } },
    orderBy: { bloomStartDate: 'desc' },
  })

  const [bloomPhotos, instancePhotos] = await Promise.all([
    prisma.photo.findMany({
      where: { ...collectionWhere, entityType: 'BLOOM_EVENT', entityId: { in: blooms.map((bloom) => bloom.id) } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.photo.findMany({
      where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: { in: blooms.map((bloom) => bloom.plantInstanceId) } },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    }),
  ])

  const bloomPhotoByEvent = bloomPhotos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})
  const photoByInstance = instancePhotos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Bloom Tracker</h2>
      {blooms.length === 0 && (
        <Card className="relative overflow-hidden border-[#d6dfc9] bg-[#fffaf0] p-0">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_70%_40%,rgba(143,165,143,0.22),transparent_34%),radial-gradient(circle_at_88%_72%,rgba(196,122,90,0.14),transparent_28%)] sm:block" />
          <div className="relative grid gap-5 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
            <div className="max-w-xl">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#b8c9aa] bg-[#d6dfc9]/55 text-[#2f6b45]">
                <Flower2 className="h-7 w-7" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f6b45]">No blooms yet</p>
              <h3 className="mt-2 text-2xl font-bold leading-tight text-stone-950 sm:text-3xl">Nothing in flower right now.</h3>
              <p className="mt-3 text-sm leading-6 text-stone-700 sm:text-base">
                Keep tending the collection, and the bloom tracker will fill in as buds open. When a specimen flowers, add a bloom event from its plant record to start building its history.
              </p>
            </div>
            <div className="flex justify-start sm:justify-end">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[#d6dfc9] bg-[#f5f0e2] text-[#2f6b45] shadow-inner sm:h-32 sm:w-32">
                <Sprout className="h-12 w-12 sm:h-16 sm:w-16" />
              </div>
            </div>
          </div>
        </Card>
      )}
      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {blooms.map((bloom) => {
          const status = bloom.bloomEndDate ? 'Closed' : bloom.peakBloomDate ? 'Peaked' : 'Open'
          const image = bloomPhotoByEvent[bloom.id] || photoByInstance[bloom.plantInstanceId]

          return (
            <Link key={bloom.id} href={collectionPath(collection.slug, `/instances/${bloom.plantInstanceId}`)} className="group block h-full">
              <Card className="flex h-full flex-col overflow-hidden p-0 transition group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_36px_rgba(47,38,24,0.10)]">
                <div className="aspect-[4/3]">
                  <PlantImage src={image} alt={bloom.plantInstance.plantId} />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2f6b45]">{status} · {fmtDate(bloom.bloomStartDate)}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight">{bloom.plantInstance.plantId}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-stone-700">{plantName(bloom.plantInstance.plantDefinition)}</p>
                  <p className="mt-2 text-xs text-stone-600">
                    Peak {fmtDate(bloom.peakBloomDate)} · {bloom.flowerCount || '—'} flowers
                  </p>
                  {bloom.notes && <p className="mt-2 line-clamp-2 text-xs text-stone-600">{bloom.notes}</p>}
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
