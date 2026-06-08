import { createLocalCopyFromValidatedDefinition, disputeValidatedPlantDefinition } from '@/app/actions'
import { Button, Card, TextArea } from '@/components/ui'
import { canManageCollection, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'

const disputeReasons = [
  ['TAXONOMY_INCORRECT', 'Taxonomy incorrect'],
  ['CULTIVAR_INCORRECT', 'Cultivar incorrect'],
  ['HUSBANDRY_INACCURATE', 'Husbandry inaccurate'],
  ['ALIASES_INCOMPLETE', 'Aliases incomplete'],
  ['IMAGE_INCORRECT', 'Image incorrect'],
] as const

export default async function ValidatedDefinitions() {
  const context = await requireCollectionViewer()
  const { collection, user } = context
  const canManage = canManageCollection(user, context)
  const [definitions, linkedInstances, pendingDisputes] = await Promise.all([
    prisma.plantDefinition.findMany({
      where: { collectionId: null, isValidated: true },
      include: {
        aliases: { orderBy: { name: 'asc' } },
        husbandryGuide: true,
        _count: { select: { instances: true } },
      },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
    }),
    prisma.plantInstance.findMany({
      where: { collectionId: collection.id, plantDefinition: { is: { collectionId: null, isValidated: true } } },
      select: { id: true, plantId: true, plantDefinitionId: true },
      orderBy: { plantId: 'asc' },
    }),
    prisma.plantDefinitionDispute.findMany({
      where: { collectionId: collection.id, status: 'PENDING' },
      select: { validatedPlantDefinitionId: true },
    }),
  ])
  const linkedByDefinition = new Map<string, typeof linkedInstances>()
  for (const instance of linkedInstances) {
    const rows = linkedByDefinition.get(instance.plantDefinitionId) || []
    rows.push(instance)
    linkedByDefinition.set(instance.plantDefinitionId, rows)
  }
  const pendingDisputeIds = new Set(pendingDisputes.map((dispute) => dispute.validatedPlantDefinitionId))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Validated Plant Definitions</h2>
        <p className="mt-1 text-sm text-stone-600">Curated site-level plant definitions are shared across collections and remain available even if the originating collection is deleted.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {definitions.length === 0 && <Card><p className="text-sm text-stone-600">No validated definitions have been approved yet.</p></Card>}
        {definitions.map((definition) => {
          const linked = linkedByDefinition.get(definition.id) || []
          return (
            <Card key={definition.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-2xl font-semibold">{plantName(definition)}</h3>
                  <p className="mt-1 text-sm text-stone-600">
                    <span className="rounded-full bg-[#edf3e6] px-2 py-0.5 text-xs font-semibold text-[#2f6b45]">Validated</span>
                    {' '}· {definition._count.instances} linked instance(s) site-wide
                  </p>
                </div>
              </div>
              {definition.description && <p className="mt-3 text-sm">{definition.description}</p>}
              {definition.aliases.length > 0 && (
                <p className="mt-2 text-sm text-stone-600">Aliases: {definition.aliases.slice(0, 6).map((alias) => alias.name).join(', ')}</p>
              )}
              {canManage && (
                <div className="mt-4 grid gap-4">
                  {linked.length > 0 && (
                    <form action={createLocalCopyFromValidatedDefinition} className="grid gap-2 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3">
                      <input type="hidden" name="id" value={definition.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <p className="text-sm font-semibold">Create local copy</p>
                      <p className="text-sm text-stone-600">Move selected specimens to an independent local copy. Husbandry overrides can stay on specimens when only local care differs.</p>
                      <div className="grid gap-1">
                        {linked.map((instance) => (
                          <label key={instance.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="plantInstanceId" value={instance.id} />
                            {instance.plantId}
                          </label>
                        ))}
                      </div>
                      <Button className="w-fit">Create Local Copy</Button>
                    </form>
                  )}
                  {pendingDisputeIds.has(definition.id) ? (
                    <p className="rounded-lg border border-[#dfcc87] bg-[#fff8dc] p-3 text-sm text-[#6f541f]">Your collection has a pending dispute for this definition.</p>
                  ) : (
                    <form action={disputeValidatedPlantDefinition} className="grid gap-2 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-3">
                      <input type="hidden" name="id" value={definition.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <label className="grid gap-1 text-sm font-medium">
                        Dispute reason
                        <select name="reason" className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal">
                          {disputeReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <TextArea label="Notes" name="notes" />
                      <Button className="w-fit bg-[#9a3f35] hover:bg-[#7d3028]">Dispute Definition</Button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
