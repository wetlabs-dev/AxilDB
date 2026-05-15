import { createPlantInstance } from '@/app/actions'
import { PlantImage } from '@/components/PlantImage'
import { AddPanel, Button, Card, Field, HelpTooltip, TextArea } from '@/components/ui'
import { canCreate, getCurrentUser, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function Instances() {
  const user = await getCurrentUser()
  const [instances, defs] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { status: 'ACTIVE' },
      include: { plantDefinition: true },
      orderBy: { plantId: 'asc' },
    }),
    prisma.plantDefinition.findMany({ orderBy: { genus: 'asc' } }),
  ])

  const photos = await prisma.photo.findMany({
    where: { entityType: 'PLANT_INSTANCE', entityId: { in: instances.map((item) => item.id) } },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
  })
  const photoByInstance = photos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Plant Instances</h2>

      {canCreate(user) && (
        <AddPanel label="Add plant instance">
          <form action={createPlantInstance} className="grid max-w-5xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              Plant definition
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="plantDefinitionId" required>
                {defs.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {plantName(definition)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <span>Type</span>
                <HelpTooltip>Mother plants are acquired source plants. Propagations are plants created from another plant or batch.</HelpTooltip>
              </span>
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal" name="instanceType">
                <option>MOTHER</option>
                <option>PROPAGATION</option>
              </select>
            </label>
            <p className="rounded-md border border-[#d6dfc9] bg-[#f5f4e8] px-3 py-2 text-sm text-stone-700 lg:col-span-2">
              Plant ID will be generated automatically from the plant definition, relevant date, and record type.
            </p>
            <Field label="Location" name="location" />
            <Field label="Acquisition date" help="When this physical plant entered your collection." name="acquisitionDate" type="date" />
            <Field label="Propagation date" help="When this plant was propagated, if it was created from another plant." name="propagationDate" type="date" />
            <Field label="Source/propagator" help="Who produced or propagated the plant, or the immediate source of the plant material." name="source" />
            <Field label="Distributor" help="The seller, vendor, swap partner, or organization that distributed the plant to you." name="distributor" />
            <Field label="Stock number" help="Optional vendor, nursery, or collection stock number from the original source." name="stockNumber" />
            <Field label="Purchase price" help="Optional cost record for your own collection tracking." name="purchasePrice" type="number" />
            <TextArea label="Notes" help="Initial observation or context to add to the plant's note history at creation." name="note" wrapperClassName="lg:col-span-2" />
            <Button className="justify-self-start lg:col-span-4">Create instance</Button>
          </form>
        </AddPanel>
      )}

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {instances.map((instance) => (
          <Card key={instance.id} className="flex h-full flex-col overflow-hidden p-0">
            <Link href={`/instances/${instance.id}`} className="block flex-1">
              <div className="aspect-[4/3]">
                <PlantImage src={photoByInstance[instance.id]} alt={instance.plantId} />
              </div>
              <div className="min-h-0 overflow-hidden p-3">
                <p className="line-clamp-2 text-sm font-bold underline">{instance.plantId}</p>
                <p className="line-clamp-2 text-sm text-stone-700">{plantName(instance.plantDefinition)}</p>
                <p className="truncate text-sm text-stone-600">{instance.instanceType} · {instance.location || 'No location'}</p>
              </div>
            </Link>
            <div className="flex gap-2 border-t border-stone-200 p-3">
              {isAdmin(user) && <Link className="rounded-md border px-2 py-1 text-xs" href={`/instances/${instance.id}/edit`}>Edit</Link>}
              <Link className="rounded-md border px-2 py-1 text-xs" href={`/labels/${instance.id}`}>Label</Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
