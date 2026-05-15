import { PlantImage } from '@/components/PlantImage'
import { Card } from '@/components/ui'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function Blooms() {
  const blooms = await prisma.bloomEvent.findMany({
    include: { plantInstance: { include: { plantDefinition: true } } },
    orderBy: { bloomStartDate: 'desc' },
  })

  const [bloomPhotos, instancePhotos] = await Promise.all([
    prisma.photo.findMany({
      where: { entityType: 'BLOOM_EVENT', entityId: { in: blooms.map((bloom) => bloom.id) } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.photo.findMany({
      where: { entityType: 'PLANT_INSTANCE', entityId: { in: blooms.map((bloom) => bloom.plantInstanceId) } },
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
      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {blooms.map((bloom) => {
          const status = bloom.bloomEndDate ? 'Closed' : bloom.peakBloomDate ? 'Peaked' : 'Open'
          const image = bloomPhotoByEvent[bloom.id] || photoByInstance[bloom.plantInstanceId]

          return (
            <Link key={bloom.id} href={`/instances/${bloom.plantInstanceId}`} className="group block h-full">
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
