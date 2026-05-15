import { createPropagationEvent, deletePropagationEvent } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { canCreate, getCurrentUser, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function Propagations() {
  const user = await getCurrentUser()
  const [instances, events] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { status: 'ACTIVE' },
      include: { plantDefinition: true },
      orderBy: { plantId: 'asc' },
    }),
    prisma.propagationEvent.findMany({
      include: {
        parents: { include: { parentPlantInstance: { include: { plantDefinition: true } } } },
        children: { include: { childPlantInstance: { include: { plantDefinition: true } } } },
      },
      orderBy: { date: 'desc' },
    }),
  ])

  const instanceIds = Array.from(new Set(events.flatMap((event) => [
    ...event.parents.map((parent) => parent.parentPlantInstanceId),
    ...event.children.map((child) => child.childPlantInstanceId),
  ])))
  const photos = await prisma.photo.findMany({
    where: { entityType: 'PLANT_INSTANCE', entityId: { in: instanceIds } },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
  })
  const photoByInstance = photos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Propagations</h2>

      {canCreate(user) && (
        <Card>
          <form action={createPropagationEvent} className="grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              Method
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="method">
                <option>LEAF</option>
                <option>CUTTING</option>
                <option>RHIZOME_SPLIT</option>
                <option>DIVISION</option>
                <option>SEED</option>
                <option>TISSUE_CULTURE</option>
                <option>RUNNER</option>
                <option>OTHER</option>
              </select>
            </label>
            <Field label="Date" name="date" type="date" required />
            <label className="grid gap-1 text-sm font-medium">
              Parent / seed parent
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="parent1">
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.plantId} · {plantName(instance.plantDefinition)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Pollen parent, for seed only
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="parent2">
                <option value="">—</option>
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.plantId} · {plantName(instance.plantDefinition)}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Number of child plants to create" name="childCount" type="number" required defaultValue="1" min="1" max="50" />
            <p className="rounded-md border border-[#d6dfc9] bg-[#f5f4e8] px-3 py-2 text-sm text-stone-700 lg:col-span-2">
              Child plant IDs will be generated from the parent definition, propagation date, method, and sequence.
            </p>
            <Field label="Child location" name="location" />
            <label className="grid gap-1 text-sm font-medium">
              Success status
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="successStatus">
                <option>PENDING</option>
                <option>SUCCESS</option>
                <option>PARTIAL</option>
                <option>FAILED</option>
              </select>
            </label>
            <TextArea label="Notes" name="notes" wrapperClassName="lg:col-span-2" />
            <Button className="justify-self-start lg:col-span-4">Create propagation</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {events.map((event) => {
          const firstChild = event.children[0]?.childPlantInstance
          const firstParent = event.parents[0]?.parentPlantInstance
          const image = photoByInstance[firstChild?.id || ''] || photoByInstance[firstParent?.id || '']

          return (
            <Card key={event.id} className="overflow-hidden p-0">
              <Link href={firstChild ? `/instances/${firstChild.id}` : '/propagations'} className="block">
                <div className="aspect-[4/3]">
                  <PlantImage src={image} alt={firstChild?.plantId || event.method} />
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2f6b45]">{fmtDate(event.date)} · {event.method}</p>
                  <h3 className="mt-1 text-sm font-bold leading-tight">{firstChild?.plantId || event.method}</h3>
                  <p className="mt-1 text-xs text-stone-600">{event.successStatus}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-stone-700">
                    Children: {event.children.map((child) => child.childPlantInstance.plantId).join(', ') || '—'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                    Parents: {event.parents.map((parent) => parent.parentPlantInstance.plantId).join(', ') || '—'}
                  </p>
                </div>
              </Link>
              {isAdmin(user) && (
                <div className="flex flex-wrap gap-2 border-t border-stone-200 p-3">
                  <Link className="rounded-md border px-2 py-1 text-xs" href={`/propagations/${event.id}/edit`}>Edit</Link>
                  <form action={deletePropagationEvent}>
                    <input type="hidden" name="id" value={event.id} />
                    <ConfirmDeleteButton title="Delete propagation event?" message="This will permanently delete the propagation event and its parent/child links. Child plant instances will remain.">
                      Delete
                    </ConfirmDeleteButton>
                  </form>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
