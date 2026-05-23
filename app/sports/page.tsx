import { createSportStabilityRecord, markSportReverted } from '@/app/actions'
import { PlantImage } from '@/components/PlantImage'
import { SortControl } from '@/components/SortControl'
import { Button, Card, Field, LinkButton, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { plantName } from '@/lib/utils'
import Link from 'next/link'

const sportSortOptions: SortOption[] = [
  { value: 'updatedDesc', label: 'Recently updated' },
  { value: 'plantIdAsc', label: 'Plant ID A-Z' },
  { value: 'statusAsc', label: 'Status A-Z' },
]

export default async function SportReview() {
  const user = await getCurrentUser()
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }
  const sortKey = await sortPreference(user?.id, 'sports', 'updatedDesc', sportSortOptions.map((option) => option.value))
  const [sports, events] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }] },
      include: { plantDefinition: true, sportRecords: { include: { propagationEvent: true }, orderBy: { generationNumber: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.propagationEvent.findMany({
      where: collectionWhere,
      include: { children: { include: { childPlantInstance: true } } },
      orderBy: { date: 'desc' },
    }),
  ])

  const photos = await prisma.photo.findMany({
    where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: { in: sports.map((sport) => sport.id) } },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
  })
  const photoByInstance = photos.reduce<Record<string, (typeof photos)[number]>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const sortedSports = [...sports].sort((left, right) => {
    if (sortKey === 'plantIdAsc') return compareText(left.plantId, right.plantId)
    if (sortKey === 'statusAsc') return compareText(left.sportStatus, right.sportStatus) || compareText(left.plantId, right.plantId)
    return timeValue(right.updatedAt) - timeValue(left.updatedAt)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Sport Stability Review</h2>
          <p className="mt-1 text-sm text-stone-600">Review suspected sports, log true-to-type propagation records, mark reverted branches, and start the cultivar wizard when a line reaches three true propagations.</p>
        </div>
        <SortControl
          section="sports"
          value={sortKey}
          options={sportSortOptions}
          back={collectionPath(collection.slug, '/sports')}
          disabled={!user}
        />
      </div>

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {sortedSports.map((sport) => {
          const trueCount = sport.sportRecords.filter((record) => record.propagatedTrue).length
          const eligible = sport.sportRecords.some((record) => record.propagatedTrue && record.generationNumber >= 3) || trueCount >= 3

          return (
            <Card key={sport.id} className="flex h-full flex-col overflow-hidden p-0">
              <Link href={collectionPath(collection.slug, `/instances/${sport.id}`)} className="block flex-1">
                <div className="aspect-[4/3]">
                  <PlantImage src={photoByInstance[sport.id]} alt={sport.plantId} />
                </div>
                <div className="min-h-0 overflow-hidden p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2f6b45]">{sport.sportStatus}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight underline">{sport.plantId}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-stone-700">{plantName(sport.plantDefinition)}</p>
                  <p className="mt-2 text-xs font-medium text-stone-700">True records: {trueCount}</p>
                  {sport.sportDescription && <p className="mt-2 line-clamp-3 text-xs text-stone-600">{sport.sportDescription}</p>}
                </div>
              </Link>

              <div className="space-y-3 border-t border-stone-200 p-3 text-xs">
                {canEditInCollection(user, context) && eligible && <LinkButton className="w-full px-2 py-1.5 text-xs" href={collectionPath(collection.slug, `/sports/${sport.id}/cultivar`)}>Create cultivar</LinkButton>}

                {canCreateInCollection(user, context) && sport.sportStatus !== 'REVERTED' && (
                  <details className="rounded-md border border-stone-200 bg-white/60 p-2">
                    <summary className="cursor-pointer font-medium">Add stability record</summary>
                    <form action={createSportStabilityRecord} className="mt-3 grid gap-2">
                      <input type="hidden" name="plantInstanceId" value={sport.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, '/sports')} />
                      <label className="grid gap-1 text-xs font-medium">
                        Propagation event
                        <select className="rounded-md border px-2 py-1 font-normal" name="propagationEventId">
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.date.toLocaleDateString()} · {event.method} · {event.children.map((child) => child.childPlantInstance.plantId).join(', ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field label="Generation number" help="Which propagation generation this evidence represents. Three true generations can support a stable sport decision." name="generationNumber" type="number" defaultValue={trueCount + 1} />
                      <label className="text-xs font-medium"><input type="checkbox" name="propagatedTrue" /> Propagated true</label>
                      <TextArea label="Notes/evidence" help="Record what stayed consistent or changed in this propagation, with enough detail to justify the stability decision later." name="notes" />
                      <Button className="px-3 py-1.5 text-xs">Add record</Button>
                    </form>
                  </details>
                )}

                {canCreateInCollection(user, context) && !['REVERTED', 'REGISTERED'].includes(sport.sportStatus) && (
                  <details className="rounded-md border border-stone-200 bg-white/60 p-2">
                    <summary className="cursor-pointer font-medium">Mark reverted</summary>
                    <form action={markSportReverted} className="mt-3 grid gap-2">
                      <input type="hidden" name="id" value={sport.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, '/sports')} />
                      <TextArea label="Reversion notes" help="Explain why this plant or branch should stop carrying the sport line forward." name="observation" />
                      <Button className="px-3 py-1.5 text-xs">Mark reverted</Button>
                    </form>
                  </details>
                )}

                {sport.sportRecords.length > 0 && (
                  <div className="border-t border-stone-200 pt-2">
                    {sport.sportRecords.slice(0, 3).map((record) => (
                      <p key={record.id}>Gen {record.generationNumber}: {record.propagatedTrue ? 'true' : 'not true'}</p>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
