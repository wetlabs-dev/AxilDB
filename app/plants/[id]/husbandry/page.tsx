import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Button, Card } from '@/components/ui'
import { HusbandryBadges, HusbandryEmptyPrompt, HusbandryGuideView } from '@/components/Husbandry'
import { canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { plantName } from '@/lib/utils'

export default async function PlantHusbandryPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCollectionViewer()
  const { collection, user } = context
  const { id } = await params
  const plant = await prisma.plantDefinition.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: {
      aliases: { orderBy: { name: 'asc' } },
      husbandryGuide: true,
    },
  })

  const sourceDefinition = plant.husbandryGuide?.sourcePlantDefinitionId
    ? await prisma.plantDefinition.findFirst({
        where: { id: plant.husbandryGuide.sourcePlantDefinitionId, collectionId: collection.id },
        include: { husbandryGuide: true },
      })
    : null
  const effectiveGuide = sourceDefinition?.husbandryGuide || plant.husbandryGuide
  const canEdit = canEditInCollection(user, context)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-600">
            <Link className="underline" href={collectionPath(collection.slug, '/plants')}>
              Plant definitions
            </Link>
          </p>
          <h2 className="mt-1 text-3xl font-bold">{plantName(plant)} husbandry</h2>
          <HusbandryBadges values={effectiveGuide as any} />
        </div>
        {canEdit && (
          <Link href={collectionPath(collection.slug, `/plants/${plant.id}/edit#husbandry`)}>
            <Button type="button">Edit husbandry</Button>
          </Link>
        )}
      </div>

      <Card>
        {sourceDefinition && (
          <div className="mb-4 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/80 p-3 text-sm text-stone-700">
            This guide is inherited from{' '}
            <Link className="font-semibold underline" href={collectionPath(collection.slug, `/plants/${sourceDefinition.id}/husbandry`)}>
              {plantName(sourceDefinition)}
            </Link>
            .
          </div>
        )}
        {effectiveGuide ? (
          <HusbandryGuideView
            values={effectiveGuide as any}
            title="Full husbandry guide"
            sourceLabel={sourceDefinition ? `Inherited from ${plantName(sourceDefinition)}` : undefined}
          />
        ) : (
          <HusbandryEmptyPrompt />
        )}
      </Card>
    </div>
  )
}
