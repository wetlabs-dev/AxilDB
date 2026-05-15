import { createPlantInstance } from '@/app/actions'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, Field, TextArea } from '@/components/ui'
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
        <Card>
          <form action={createPlantInstance} className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Plant definition
              <select className="rounded-lg border px-3 py-2 font-normal" name="plantDefinitionId" required>
                {defs.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {plantName(definition)}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Plant ID" name="plantId" required />
            <label className="grid gap-1 text-sm font-medium">
              Type
              <select className="rounded-lg border px-3 py-2 font-normal" name="instanceType">
                <option>MOTHER</option>
                <option>PROPAGATION</option>
              </select>
            </label>
            <Field label="Location" name="location" />
            <Field label="Acquisition date" name="acquisitionDate" type="date" />
            <Field label="Propagation date" name="propagationDate" type="date" />
            <Field label="Source/propagator" name="source" />
            <Field label="Distributor" name="distributor" />
            <Field label="Stock number" name="stockNumber" />
            <Field label="Purchase price" name="purchasePrice" type="number" />
            <label className="text-sm font-medium"><input type="checkbox" name="isSportCandidate" /> Sport candidate</label>
            <label className="grid gap-1 text-sm font-medium">
              Sport status
              <select className="rounded-lg border px-3 py-2 font-normal" name="sportStatus">
                <option>NONE</option>
                <option>SUSPECTED</option>
                <option>CANDIDATE</option>
                <option>STABLE</option>
                <option>UNSTABLE</option>
                <option>REGISTERED</option>
              </select>
            </label>
            <TextArea label="Sport description" name="sportDescription" />
            <Button className="md:col-span-2">Create instance</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {instances.map((instance) => (
          <Card key={instance.id} className="overflow-hidden p-0">
            <Link href={`/instances/${instance.id}`} className="block">
              <div className="aspect-[4/3]">
                <PlantImage src={photoByInstance[instance.id]} alt={instance.plantId} />
              </div>
              <div className="p-3">
                <p className="text-sm font-bold underline">{instance.plantId}</p>
                <p className="text-sm text-stone-700">{plantName(instance.plantDefinition)}</p>
                <p className="text-sm text-stone-600">{instance.instanceType} · {instance.location || 'No location'}</p>
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
