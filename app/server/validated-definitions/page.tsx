import { reviewPlantDefinitionDispute, reviewPlantDefinitionValidationCandidate } from '@/app/actions'
import { Button, Card, TextArea } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/time'
import { plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function ValidatedDefinitionsAdmin() {
  await requireServerAdmin()
  const [candidates, disputes, validatedDefinitions] = await Promise.all([
    prisma.plantDefinitionValidationCandidate.findMany({
      where: { status: 'PENDING' },
      include: {
        collection: true,
        plantDefinition: { include: { aliases: true, husbandryGuide: true } },
        nominatedByUser: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.plantDefinitionDispute.findMany({
      where: { status: 'PENDING' },
      include: {
        collection: true,
        validatedPlantDefinition: true,
        submittedByUser: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.plantDefinition.findMany({
      where: { collectionId: null, isValidated: true },
      include: { _count: { select: { instances: true, disputes: true } } },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
      take: 100,
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Validated Plant Definitions</h2>
        <p className="mt-1 text-sm text-stone-600">
          Site-level curated definitions are not owned by a collection, so deleting a collection will not delete linked validated definitions.
        </p>
      </div>

      <Card>
        <h3 className="font-serif text-2xl font-semibold">Pending nominations</h3>
        <div className="mt-4 grid gap-3">
          {candidates.length === 0 && <p className="text-sm text-stone-600">No nominations are waiting for review.</p>}
          {candidates.map((candidate) => (
            <div key={candidate.id} className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{candidate.plantDefinition ? plantName(candidate.plantDefinition) : 'Deleted source definition'}</p>
                  <p className="text-sm text-stone-600">
                    {candidate.collection.name} · {candidate.nominatedByUser?.email || 'Unknown nominator'} · {formatDateTime(candidate.createdAt)}
                  </p>
                  {candidate.notes && <p className="mt-2 text-sm">{candidate.notes}</p>}
                </div>
                {candidate.plantDefinition && (
                  <div className="text-xs text-stone-600">
                    {candidate.plantDefinition.aliases.length} aliases · {candidate.plantDefinition.husbandryGuide ? 'husbandry included' : 'no husbandry'}
                  </div>
                )}
              </div>
              <form action={reviewPlantDefinitionValidationCandidate} className="mt-3 grid gap-2">
                <input type="hidden" name="candidateId" value={candidate.id} />
                <TextArea label="Review notes" name="reviewNotes" />
                <div className="flex flex-wrap gap-2">
                  <Button name="reviewAction" value="APPROVE">Approve</Button>
                  <Button name="reviewAction" value="REQUEST_REVISIONS" className="border border-stone-300 bg-white/70 text-stone-800 hover:bg-white">Request revisions</Button>
                  <Button name="reviewAction" value="REJECT" className="bg-[#9a3f35] hover:bg-[#7d3028]">Reject</Button>
                </div>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-2xl font-semibold">Pending disputes</h3>
        <div className="mt-4 grid gap-3">
          {disputes.length === 0 && <p className="text-sm text-stone-600">No validated definition disputes are waiting for review.</p>}
          {disputes.map((dispute) => (
            <div key={dispute.id} className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3">
              <p className="font-semibold">{plantName(dispute.validatedPlantDefinition)}</p>
              <p className="text-sm text-stone-600">
                {dispute.collection.name} · {dispute.submittedByUser?.email || 'Unknown submitter'} · {dispute.reason}
              </p>
              {dispute.notes && <p className="mt-2 text-sm">{dispute.notes}</p>}
              <form action={reviewPlantDefinitionDispute} className="mt-3 grid gap-2">
                <input type="hidden" name="disputeId" value={dispute.id} />
                <TextArea label="Resolution notes" name="resolutionNotes" />
                <div className="flex flex-wrap gap-2">
                  <Button name="status" value="RESOLVED">Resolve</Button>
                  <Button name="status" value="REJECTED" className="bg-[#9a3f35] hover:bg-[#7d3028]">Reject dispute</Button>
                </div>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="font-serif text-2xl font-semibold">Validated registry</h3>
        <div className="mt-4 grid gap-2">
          {validatedDefinitions.length === 0 && <p className="text-sm text-stone-600">No validated definitions have been approved yet.</p>}
          {validatedDefinitions.map((definition) => (
            <div key={definition.id} className="rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{plantName(definition)} <span className="rounded-full bg-[#edf3e6] px-2 py-0.5 text-xs text-[#2f6b45]">Validated</span></p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                  <span>{definition._count.instances} linked instance(s) · {definition._count.disputes} dispute(s)</span>
                  <Link className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 font-medium text-stone-800 hover:bg-white" href={`/server/validated-definitions/${definition.id}`}>Edit</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
