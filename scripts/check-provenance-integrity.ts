import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const [acquisitionSources, acquisitions, observations, batches, storefronts, preferredSellers, preferredDistributors] = await Promise.all([
    prisma.acquisitionSource.findMany({ include: { acquisitionRecord: { select: { collectionId: true } }, source: { select: { collectionId: true } } } }),
    prisma.plantAcquisitionRecord.findMany({ include: { seller: { select: { collectionId: true } }, sellerStorefront: { select: { sellerId: true, distributorId: true, collectionId: true } }, distributor: { select: { id: true, collectionId: true } }, distributorOutlet: { select: { distributorId: true, collectionId: true } } } }),
    prisma.plantObservation.findMany({ include: { seller: { select: { collectionId: true } }, sellerStorefront: { select: { sellerId: true, distributorId: true, collectionId: true } }, distributor: { select: { id: true, collectionId: true } }, distributorOutlet: { select: { distributorId: true, collectionId: true } } } }),
    prisma.acquisitionBatch.findMany({ include: { seller: { select: { collectionId: true } }, sellerStorefront: { select: { sellerId: true, distributorId: true, collectionId: true } }, distributor: { select: { id: true, collectionId: true } }, distributorOutlet: { select: { distributorId: true, collectionId: true } } } }),
    prisma.sellerStorefront.findMany({ include: { seller: { select: { collectionId: true } }, distributor: { select: { collectionId: true } } } }),
    prisma.plantDefinitionPreferredSeller.findMany({ include: { plantDefinition: { select: { collectionId: true } }, seller: { select: { collectionId: true } }, sellerStorefront: { select: { collectionId: true, sellerId: true } } } }),
    prisma.plantDefinitionPreferredDistributor.findMany({ include: { plantDefinition: { select: { collectionId: true } }, distributor: { select: { collectionId: true } } } }),
  ])
  const errors: string[] = []
  for (const link of acquisitionSources) if (link.collectionId !== link.acquisitionRecord.collectionId || link.collectionId !== link.source.collectionId) errors.push(`AcquisitionSource ${link.id} crosses a collection boundary.`)
  for (const record of [...acquisitions, ...observations, ...batches]) {
    if (record.seller && record.seller.collectionId !== record.collectionId) errors.push(`${record.id} uses a cross-collection seller.`)
    if (record.sellerStorefront && (record.sellerStorefront.collectionId !== record.collectionId || record.sellerStorefront.sellerId !== record.sellerId)) errors.push(`${record.id} uses a mismatched seller storefront.`)
    if (record.distributor && record.distributor.collectionId !== record.collectionId) errors.push(`${record.id} uses a cross-collection distributor.`)
    if (record.distributorOutlet && (record.distributorOutlet.collectionId !== record.collectionId || record.distributorOutlet.distributorId !== record.distributorId)) errors.push(`${record.id} uses a mismatched distributor outlet.`)
    if (record.sellerStorefront?.distributorId && record.sellerStorefront.distributorId !== record.distributorId) errors.push(`${record.id} combines a storefront with a different distributor.`)
  }
  for (const storefront of storefronts) {
    if (storefront.collectionId !== storefront.seller.collectionId) errors.push(`SellerStorefront ${storefront.id} crosses its seller collection.`)
    if (storefront.distributor && storefront.collectionId !== storefront.distributor.collectionId) errors.push(`SellerStorefront ${storefront.id} crosses its distributor collection.`)
  }
  for (const preference of preferredSellers) {
    if (preference.collectionId !== preference.plantDefinition.collectionId || preference.collectionId !== preference.seller.collectionId) errors.push(`Preferred seller ${preference.id} crosses a collection boundary.`)
    if (preference.sellerStorefront && (preference.sellerStorefront.collectionId !== preference.collectionId || preference.sellerStorefront.sellerId !== preference.sellerId)) errors.push(`Preferred seller ${preference.id} uses a mismatched storefront.`)
  }
  for (const preference of preferredDistributors) if (preference.collectionId !== preference.plantDefinition.collectionId || preference.collectionId !== preference.distributor.collectionId) errors.push(`Preferred distributor ${preference.id} crosses a collection boundary.`)

  const primaryCounts = new Map<string, number>()
  for (const link of acquisitionSources) if (link.isPrimary) primaryCounts.set(link.acquisitionRecordId, (primaryCounts.get(link.acquisitionRecordId) || 0) + 1)
  const multiplePrimaryCount = [...primaryCounts.values()].filter((count) => count > 1).length
  if (multiplePrimaryCount) errors.push(`${multiplePrimaryCount} acquisition(s) have multiple primary sources.`)
  if (errors.length) throw new Error(`Provenance integrity failed:\n${errors.join('\n')}`)
  console.log(`Provenance integrity passed (${acquisitions.length} acquisitions; ${observations.length} observations; ${batches.length} batches; ${storefronts.length} storefronts checked).`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
