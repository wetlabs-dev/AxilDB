import { prisma } from '@/lib/prisma'
import { createGoverningBody, deleteGoverningBody, updateGoverningBody } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Card, Field, TextArea, Button } from '@/components/ui'

export default async function Settings() {
  const bodies = await prisma.governingBody.findMany({
    include: { _count: { select: { plantDefinitions: true } } },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Governing Bodies</h2>

      <Card>
        <h3 className="mb-3 font-bold">Add governing body</h3>
        <form action={createGoverningBody} className="grid gap-3 md:grid-cols-2">
          <Field label="Name" name="name" required />
          <Field label="Abbreviation" name="abbreviation" />
          <Field label="Website" name="website" />
          <TextArea label="Notes" name="notes" />
          <Button className="md:col-span-2">Add governing body</Button>
        </form>
      </Card>

      <div className="grid gap-4">
        {bodies.map((body) => (
          <Card key={body.id}>
            <form action={updateGoverningBody} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={body.id} />
              <Field label="Name" name="name" required defaultValue={body.name} />
              <Field label="Abbreviation" name="abbreviation" defaultValue={body.abbreviation} />
              <Field label="Website" name="website" defaultValue={body.website} />
              <TextArea label="Notes" name="notes" defaultValue={body.notes} />
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <Button>Save changes</Button>
                <span className="text-sm text-stone-600">
                  {body._count.plantDefinitions} plant definition(s)
                </span>
              </div>
            </form>

            <form action={deleteGoverningBody} className="mt-4 border-t pt-4">
              <input type="hidden" name="id" value={body.id} />
              <ConfirmDeleteButton
                title="Delete governing body?"
                message={`This will permanently delete ${body.name}. Plant definitions using it will keep their records and lose this governing body assignment.`}
                confirmLabel="Delete governing body"
              >
                Delete governing body
              </ConfirmDeleteButton>
            </form>
          </Card>
        ))}

        {bodies.length === 0 && <Card>No governing bodies yet.</Card>}
      </div>
    </div>
  )
}
