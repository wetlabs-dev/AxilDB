import { NextResponse } from 'next/server'
import { requireCollectionGardener } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export async function GET(request: Request) {
  const collectionSlug = new URL(request.url).searchParams.get('collectionSlug') || undefined
  const { collection } = await requireCollectionGardener(collectionSlug)
  const versions = await prisma.substrateRecipeVersion.findMany({
    where: { collectionId: collection.id },
    include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ recipe: { name: 'asc' } }, { versionNumber: 'desc' }],
  })
  const headers = ['recipe_id', 'recipe_name', 'version_id', 'version', 'status', 'active_version', 'total_percent', 'component', 'category', 'percent_by_volume', 'particle_size', 'organicity', 'water_retention', 'aeration', 'drainage', 'ph_tendency', 'component_notes', 'version_notes']
  const rows = versions.flatMap((version) => version.components.map((row) => [version.recipe.id, version.recipe.name, version.id, version.versionNumber, version.status, version.recipe.activeVersionId === version.id, version.totalPercent, row.component.name, row.component.category, row.percentByVolume, row.component.particleSize, row.component.organicity, row.component.waterRetention, row.component.aeration, row.component.drainage, row.component.phTendency, row.notes, version.notes].map(cell).join(',')))
  const csv = `${headers.map(cell).join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="axildb-${collection.slug}-substrate-recipes-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
