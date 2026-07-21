import { NextResponse } from 'next/server'
import { requireCollectionGardener } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export async function GET(req: Request) {
  const url = new URL(req.url)
  const { collection } = await requireCollectionGardener(url.searchParams.get('collectionSlug') || undefined)
  const applications = await prisma.treatmentApplication.findMany({ where: { collectionId: collection.id }, include: { plantInstance: { include: { currentLocation: true, plantDefinition: true } }, condition: true, outcomes: { orderBy: { observedAt: 'desc' }, take: 1 } }, orderBy: { appliedAt: 'desc' } })
  const headers = ['application_id', 'applied_at', 'plant_id', 'genus', 'species', 'location_code', 'condition_type', 'treatment', 'product', 'dose_amount', 'dose_unit', 'water_volume_ml', 'strength', 'method', 'target_area', 'adverse_reaction', 'latest_outcome', 'latest_effectiveness', 'notes']
  const rows = applications.map((item) => [item.id, item.appliedAt.toISOString(), item.plantInstance.plantId, item.plantInstance.plantDefinition.genus, item.plantInstance.plantDefinition.species, item.plantInstance.currentLocation?.code, item.condition?.category, item.treatmentNameSnapshot, item.productNameSnapshot, item.doseAmount, item.doseUnit, item.waterVolumeMl, item.strength, item.applicationMethod, item.targetArea, item.adverseReaction, item.outcomes[0]?.outcome, item.outcomes[0]?.effectiveness, item.notes].map(cell).join(','))
  const csv = `${headers.map(cell).join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="axildb-${collection.slug}-treatments-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } })
}
