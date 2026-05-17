import { updatePropagationEvent, deletePropagationEvent } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { requireCollectionAdmin } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { dateInput } from '@/lib/utils'

export default async function EditPropagation({ params }: { params: Promise<{ id: string }> }) {
  const { collection } = await requireCollectionAdmin()
  const { id } = await params
  const event = await prisma.propagationEvent.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: { parents: { include: { parentPlantInstance: true } }, children: { include: { childPlantInstance: true } } },
  })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Edit Propagation Event</h2>
      <Card>
        <form action={updatePropagationEvent} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <label className="grid gap-1 text-sm font-medium">
            Method
            <select className="rounded-lg border px-3 py-2 font-normal" name="method" defaultValue={event.method}>
              <option>LEAF</option><option>CUTTING</option><option>RHIZOME_SPLIT</option><option>DIVISION</option><option>SEED</option><option>TISSUE_CULTURE</option><option>RUNNER</option><option>OTHER</option>
            </select>
          </label>
          <Field label="Date" name="date" type="date" required defaultValue={dateInput(event.date)} />
          <label className="grid gap-1 text-sm font-medium">
            Success status
            <select className="rounded-lg border px-3 py-2 font-normal" name="successStatus" defaultValue={event.successStatus}>
              <option>PENDING</option><option>SUCCESS</option><option>PARTIAL</option><option>FAILED</option>
            </select>
          </label>
          <div className="text-sm"><b>Parents</b><br />{event.parents.map((parent) => <div key={parent.id}>{parent.parentRole}: {parent.parentPlantInstance.plantId}</div>)}</div>
          <div className="text-sm"><b>Children</b><br />{event.children.map((child) => <div key={child.id}>{child.childPlantInstance.plantId}</div>)}</div>
          <TextArea label="Notes" name="notes" defaultValue={event.notes} />
          <Button className="md:col-span-2">Save changes</Button>
        </form>
      </Card>
      <Card>
        <h3 className="font-bold">Delete</h3>
        <p className="mb-3 text-sm">Deletes the propagation event and parent/child links, but not the child plant instances.</p>
        <form action={deletePropagationEvent}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <ConfirmDeleteButton title="Delete propagation event?" message="This will permanently delete the propagation event and its parent/child links. Child plant instances will remain." confirmLabel="Delete event">Delete event</ConfirmDeleteButton>
        </form>
      </Card>
    </div>
  )
}
