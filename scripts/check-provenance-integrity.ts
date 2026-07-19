import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const [acquisitionSources, acquisitions, observations] = await Promise.all([
    prisma.acquisitionSource.findMany({ include: { acquisitionRecord: { select: { collectionId: true } }, source: { select: { collectionId: true } } } }),
    prisma.plantAcquisitionRecord.findMany({ where: { OR: [{ distributorId: { not: null } }, { distributorLocationId: { not: null } }] }, include: { distributor: { select: { id: true, collectionId: true } }, distributorLocation: { select: { distributorId: true, collectionId: true } } } }),
    prisma.plantObservation.findMany({ where: { OR: [{ distributorId: { not: null } }, { distributorLocationId: { not: null } }] }, include: { distributor: { select: { id: true, collectionId: true } }, distributorLocation: { select: { distributorId: true, collectionId: true } } } }),
  ])
  const errors: string[] = []
  for (const link of acquisitionSources) if (link.collectionId !== link.acquisitionRecord.collectionId || link.collectionId !== link.source.collectionId) errors.push(`AcquisitionSource ${link.id} crosses a collection boundary.`)
  for (const record of [...acquisitions, ...observations]) {
    if (record.distributor && record.distributor.collectionId !== record.collectionId) errors.push(`${record.id} uses a cross-collection distributor.`)
    if (record.distributorLocation && (record.distributorLocation.collectionId !== record.collectionId || record.distributorLocation.distributorId !== record.distributorId)) errors.push(`${record.id} uses a mismatched distributor location.`)
  }
  const primaryCounts = new Map<string, number>()
  for (const link of acquisitionSources) if (link.isPrimary) primaryCounts.set(link.acquisitionRecordId, (primaryCounts.get(link.acquisitionRecordId) || 0) + 1)
  const multiplePrimaryCount = [...primaryCounts.values()].filter((count) => count > 1).length
  if (multiplePrimaryCount) errors.push(`${multiplePrimaryCount} acquisition(s) have multiple primary sources.`)
  if (errors.length) throw new Error(`Provenance integrity failed:\n${errors.join('\n')}`)
  console.log(`Provenance integrity passed (${acquisitionSources.length} source links; ${acquisitions.length} acquisitions; ${observations.length} observations checked).`)
}

main().finally(() => prisma.$disconnect())
