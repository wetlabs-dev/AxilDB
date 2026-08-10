import { NextResponse } from 'next/server'
import { requireCollectionGardener } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compactRecipeComposition } from '@/lib/substrates'
import { plantName } from '@/lib/utils'

const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export async function GET(request: Request) {
  const collectionSlug = new URL(request.url).searchParams.get('collectionSlug') || undefined
  const mode = new URL(request.url).searchParams.get('mode') || undefined
  const { collection } = await requireCollectionGardener(collectionSlug)
  const plants = await prisma.plantInstance.findMany({
    where: { collectionId: collection.id, ...(mode ? { currentSubstrate: { is: { substrateMode: mode } } } : {}) },
    include: {
      plantDefinition: {
        include: {
          substrateRecommendations: {
            where: { collectionId: collection.id },
            include: { recipeVersion: { include: { recipe: true } } },
            orderBy: { rank: 'asc' },
            take: 1,
          },
        },
      },
      currentLocation: true,
      currentSubstrate: { include: { recipeVersion: { include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } } } },
      substrateHistory: { include: { newRecipeVersion: { include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } } }, orderBy: { changedAt: 'desc' } },
      careEvents: { where: { eventType: 'REPOTTED' }, orderBy: { performedAt: 'desc' }, take: 1 },
    },
    orderBy: { plantId: 'asc' },
  })
  const headers = ['plant_id', 'plant_name', 'status', 'location_code', 'record_type', 'current', 'changed_at', 'last_repotted_at', 'mode', 'recipe_name', 'recipe_version', 'composition', 'recommended_recipe', 'recommended_recipe_version', 'description', 'reason', 'notes']
  const rows = plants.flatMap((plant) => {
    const current = plant.currentSubstrate
    const recommendation = plant.plantDefinition.substrateRecommendations[0]?.recipeVersion
    const lastRepottedAt = plant.careEvents[0]?.performedAt
    const currentRow = [plant.plantId, plantName(plant.plantDefinition), plant.status, plant.currentLocation?.code, 'current', true, current?.startedAt, lastRepottedAt, current?.substrateMode, current?.recipeVersion?.recipe.name, current?.recipeVersion?.versionNumber, compactRecipeComposition(current?.recipeVersion), recommendation?.recipe.name, recommendation?.versionNumber, current?.receivedSubstrateDescription, '', current?.notes]
    const historyRows = plant.substrateHistory.map((entry) => [plant.plantId, plantName(plant.plantDefinition), plant.status, plant.currentLocation?.code, 'history', false, entry.changedAt, lastRepottedAt, entry.newMode, entry.newRecipeVersion?.recipe.name, entry.newRecipeVersion?.versionNumber, compactRecipeComposition(entry.newRecipeVersion), recommendation?.recipe.name, recommendation?.versionNumber, entry.newDescription, entry.reason, entry.notes])
    return [currentRow, ...historyRows].map((row) => row.map(cell).join(','))
  })
  const csv = `${headers.map(cell).join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="axildb-${collection.slug}-plant-substrates-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
