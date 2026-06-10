import { PlantImage } from '@/components/PlantImage'
import { SortControl } from '@/components/SortControl'
import { Card } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { fmtDate, plantName } from '@/lib/utils'
import { Flower2, Sprout } from 'lucide-react'
import Link from 'next/link'

const bloomSortOptions: SortOption[] = [
  { value: 'startDesc', label: 'Newest bloom' },
  { value: 'startAsc', label: 'Oldest bloom' },
  { value: 'updatedDesc', label: 'Recently updated' },
  { value: 'statusAsc', label: 'Status A-Z' },
  { value: 'plantIdAsc', label: 'Plant ID A-Z' },
]

function bloomStatus(bloom: { bloomEndDate: Date | null; peakBloomDate: Date | null }) {
  return bloom.bloomEndDate ? 'Closed' : bloom.peakBloomDate ? 'Peaked' : 'Open'
}

export default async function Blooms() {
  const user = await getCurrentUser()
  const { collection } = await requireCollectionViewer()
  const collectionWhere = { collectionId: collection.id }
  const sortKey = await sortPreference(user?.id, 'blooms', 'startDesc', bloomSortOptions.map((option) => option.value))
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

  const bloomPhotoByEvent = bloomPhotos.reduce<Record<string, (typeof bloomPhotos)[number]>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const photoByInstance = instancePhotos.reduce<Record<string, (typeof instancePhotos)[number]>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const sortedBlooms = [...blooms].sort((left, right) => {
    if (sortKey === 'startAsc') return timeValue(left.bloomStartDate) - timeValue(right.bloomStartDate)
    if (sortKey === 'updatedDesc') return timeValue(right.updatedAt) - timeValue(left.updatedAt)
    if (sortKey === 'statusAsc') return compareText(bloomStatus(left), bloomStatus(right)) || timeValue(right.bloomStartDate) - timeValue(left.bloomStartDate)
    if (sortKey === 'plantIdAsc') return compareText(left.plantInstance.plantId, right.plantInstance.plantId)
    return timeValue(right.bloomStartDate) - timeValue(left.bloomStartDate)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold">Bloom Tracker</h2>
        <SortControl
          section="blooms"
          value={sortKey}
          options={bloomSortOptions}
          back={collectionPath(collection.slug, '/blooms')}
          disabled={!user}
        />
      </div>
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
        {sortedBlooms.map((bloom) => {
          const status = bloomStatus(bloom)
          const image = bloomPhotoByEvent[bloom.id] || photoByInstance[bloom.plantInstanceId]

          return (
            <Card key={bloom.id} className="flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(47,38,24,0.10)]">
              <Link href={collectionPath(collection.slug, `/instances/${bloom.plantInstanceId}#bloom-${bloom.id}`)} className="group block flex-1">
                <div className="aspect-[4/3] overflow-hidden">
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
              </Link>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
