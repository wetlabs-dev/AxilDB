import { populateDemoData } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Card, LinkButton } from '@/components/ui'
import { requireCollectionAdmin } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/time'

export default async function AdminToolsPage() {
  const { collection } = await requireCollectionAdmin()
  const collectionWhere = { collectionId: collection.id }

  const [definitions, instances, propagations, demoBatches] = await Promise.all([
    prisma.plantDefinition.count({ where: collectionWhere }),
    prisma.plantInstance.count({ where: collectionWhere }),
    prisma.propagationEvent.count({ where: collectionWhere }),
    prisma.auditLog.findMany({
      where: { entityType: 'DEMO_DATA', collectionId: collection.id },
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
        <h3 className="font-bold">Export plant definitions</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">
          Download a collection-scoped CSV of plant definitions, taxonomy fields, reference links, aliases, and instance counts.
          This is a read-only export for offline review, backup, and duplicate cleanup planning.
        </p>
        <div className="mt-4">
          <LinkButton href={`/api/exports/plant-definitions?collectionSlug=${encodeURIComponent(collection.slug)}`}>
            Download definitions CSV
          </LinkButton>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Populate demo data</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">
          Adds a new batch of realistic sample data based on real species, including taxonomy reference links,
          aliases, mother plants, hypothetical propagations, bloom events, and sport-tracking examples.
          Existing records are left untouched.
        </p>
        <form action={populateDemoData} className="mt-4">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
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
            {formatDateTime(batch.createdAt)} · {batch.summary}
          </p>
        ))}
      </Card>
    </div>
  )
}
