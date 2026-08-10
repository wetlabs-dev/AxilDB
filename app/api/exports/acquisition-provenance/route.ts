export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireCollectionAdmin } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { acquisitionProvenanceDisplay, sourceChainDisplay } from '@/lib/provenance'
import { plantName } from '@/lib/utils'

const headers = ['acquisitionId', 'plantDefinitionId', 'plantName', 'acquiredAt', 'quantity', 'price', 'currency', 'primarySourceId', 'primarySource', 'orderedSourceChain', 'sourceRoles', 'sellerId', 'seller', 'sellerStorefrontId', 'sellerStorefront', 'distributorId', 'distributor', 'distributorType', 'distributorOutletId', 'distributorOutlet', 'provenanceDisplay', 'legacyVendor', 'plantIds']
const cell = (input: unknown) => `"${String(input ?? '').replaceAll('"', '""')}"`

export async function GET(request: Request) {
  const collectionSlug = new URL(request.url).searchParams.get('collectionSlug') || undefined
  const { collection } = await requireCollectionAdmin(collectionSlug)
  const records = await prisma.plantAcquisitionRecord.findMany({
    where: { collectionId: collection.id },
    include: { plantDefinition: true, seller: true, sellerStorefront: true, distributor: true, distributorOutlet: true, sources: { include: { source: true }, orderBy: { sortOrder: 'asc' } }, plantInstances: { include: { plantInstance: { select: { plantId: true } } } } },
    orderBy: { acquiredAt: 'desc' },
  })
  const rows = records.map((record) => {
    const primary = record.sources.find((item) => item.isPrimary) || record.sources[0]
    return [record.id, record.plantDefinitionId, plantName(record.plantDefinition), record.acquiredAt.toISOString(), record.quantity, record.price, record.currency, primary?.sourceId, primary?.source.name, sourceChainDisplay(record.sources), record.sources.map((item) => item.role).join('; '), record.sellerId, record.seller?.name, record.sellerStorefrontId, record.sellerStorefront?.handleOrName, record.distributorId, record.distributor?.name, record.distributor?.distributorType, record.distributorOutletId, record.distributorOutlet?.name, acquisitionProvenanceDisplay({ seller: record.seller, storefront: record.sellerStorefront, distributor: record.distributor, outlet: record.distributorOutlet, legacy: record.vendor }), record.vendor, record.plantInstances.map((item) => item.plantInstance.plantId).join('; ')].map(cell).join(',')
  })
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(`${headers.map(cell).join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="axildb-${collection.slug}-acquisition-provenance-${date}.csv"`, 'Cache-Control': 'no-store' } })
}
