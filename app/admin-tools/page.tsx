import { populateDemoData } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Card } from '@/components/ui'
import { requireAdminUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function AdminToolsPage() {
  await requireAdminUser()

  const [definitions, instances, propagations, demoBatches] = await Promise.all([
    prisma.plantDefinition.count(),
    prisma.plantInstance.count(),
    prisma.propagationEvent.count(),
    prisma.auditLog.findMany({
      where: { entityType: 'DEMO_DATA' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Admin Tools</h2>
        <p className="mt-1 text-sm text-stone-600">Maintenance tools for evaluating and managing this AxilDB installation.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-stone-600">Definitions</p>
          <p className="mt-2 font-serif text-4xl font-semibold">{definitions}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-600">Plant instances</p>
          <p className="mt-2 font-serif text-4xl font-semibold">{instances}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-600">Propagation events</p>
          <p className="mt-2 font-serif text-4xl font-semibold">{propagations}</p>
        </Card>
      </div>

      <Card>
        <h3 className="font-bold">Populate demo data</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">
          Adds a new batch of realistic sample data based on real species, including taxonomy reference links,
          aliases, mother plants, hypothetical propagations, bloom events, and sport-tracking examples.
          Existing records are left untouched.
        </p>
        <form action={populateDemoData} className="mt-4">
          <ConfirmDeleteButton
            title="Populate demo data?"
            message="This will add a new batch of sample plant definitions, instances, propagation events, notes, and bloom records. Existing data will not be deleted."
            confirmLabel="Add demo data"
          >
            Add demo data
          </ConfirmDeleteButton>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold">Recent demo batches</h3>
        {demoBatches.length === 0 && <p className="mt-2 text-sm text-stone-600">No demo batches have been created yet.</p>}
        {demoBatches.map((batch) => (
          <p key={batch.id} className="mt-2 border-t border-stone-200 pt-2 text-sm">
            {batch.createdAt.toLocaleString()} · {batch.summary}
          </p>
        ))}
      </Card>
    </div>
  )
}
