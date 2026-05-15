import { createSportStabilityRecord } from '@/app/actions'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, Field, LinkButton, TextArea } from '@/components/ui'
import { canCreate, getCurrentUser, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function SportReview() {
  const user = await getCurrentUser()
  const [sports, events] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }] },
      include: { plantDefinition: true, sportRecords: { include: { propagationEvent: true }, orderBy: { generationNumber: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.propagationEvent.findMany({
      include: { children: { include: { childPlantInstance: true } } },
      orderBy: { date: 'desc' },
    }),
  ])

  const photos = await prisma.photo.findMany({
    where: { entityType: 'PLANT_INSTANCE', entityId: { in: sports.map((sport) => sport.id) } },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
  })
  const photoByInstance = photos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Sport Stability Review</h2>
        <p className="mt-1 text-sm text-stone-600">Review suspected sports, log true-to-type propagation records, and start the cultivar wizard when a line reaches three true propagations.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {sports.map((sport) => {
          const trueCount = sport.sportRecords.filter((record) => record.propagatedTrue).length
          const eligible = sport.sportRecords.some((record) => record.propagatedTrue && record.generationNumber >= 3) || trueCount >= 3

          return (
            <Card key={sport.id} className="overflow-hidden p-0">
              <Link href={`/instances/${sport.id}`} className="block">
                <div className="aspect-[4/3]">
                  <PlantImage src={photoByInstance[sport.id]} alt={sport.plantId} />
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2f6b45]">{sport.sportStatus}</p>
                  <h3 className="mt-1 text-sm font-bold leading-tight underline">{sport.plantId}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-stone-700">{plantName(sport.plantDefinition)}</p>
                  <p className="mt-2 text-xs font-medium text-stone-700">True records: {trueCount}</p>
                  {sport.sportDescription && <p className="mt-2 line-clamp-3 text-xs text-stone-600">{sport.sportDescription}</p>}
                </div>
              </Link>

              <div className="space-y-3 border-t border-stone-200 p-3 text-xs">
                {isAdmin(user) && eligible && <LinkButton className="w-full px-2 py-1.5 text-xs" href={`/sports/${sport.id}/cultivar`}>Create cultivar</LinkButton>}

                {canCreate(user) && (
                  <details className="rounded-md border border-stone-200 bg-white/60 p-2">
                    <summary className="cursor-pointer font-medium">Add stability record</summary>
                    <form action={createSportStabilityRecord} className="mt-3 grid gap-2">
                      <input type="hidden" name="plantInstanceId" value={sport.id} />
                      <input type="hidden" name="back" value="/sports" />
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
                      <Field label="Generation number" name="generationNumber" type="number" defaultValue={trueCount + 1} />
                      <label className="text-xs font-medium"><input type="checkbox" name="propagatedTrue" /> Propagated true</label>
                      <TextArea label="Notes/evidence" name="notes" />
                      <Button className="px-3 py-1.5 text-xs">Add record</Button>
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
