import { PrismaClient } from '@prisma/client'
import { isSimpleLegacyProvenance, normalizeProvenanceName } from '../lib/provenance'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')
const collectionArg = process.argv.find((arg) => arg.startsWith('--collection='))?.split('=')[1]

type EntityType = 'PlantObservation' | 'PlantAcquisitionRecord' | 'PlantInstance'
type LegacyRow = { id: string; collectionId: string | null; field: string; value: string; entityType: EntityType; acquisitionRecordId?: string }

async function queue(row: LegacyRow) {
  if (!row.collectionId || dryRun) return
  await prisma.provenanceReconciliationItem.upsert({
    where: { collectionId_entityType_entityId_legacyField: { collectionId: row.collectionId, entityType: row.entityType, entityId: row.id, legacyField: row.field } },
    update: { legacyValue: row.value },
    create: { collectionId: row.collectionId, entityType: row.entityType, entityId: row.id, legacyField: row.field, legacyValue: row.value },
  })
}

async function distributorFor(collectionId: string, name: string) {
  return prisma.distributor.upsert({
    where: { collectionId_normalizedName: { collectionId, normalizedName: normalizeProvenanceName(name) } },
    update: {},
    create: { collectionId, name: name.trim().replace(/\s+/g, ' '), normalizedName: normalizeProvenanceName(name), distributorType: 'OTHER' },
  })
}

async function sourceFor(collectionId: string, name: string) {
  return prisma.source.upsert({
    where: { collectionId_normalizedName: { collectionId, normalizedName: normalizeProvenanceName(name) } },
    update: {},
    create: { collectionId, name: name.trim().replace(/\s+/g, ' '), normalizedName: normalizeProvenanceName(name), sourceType: 'UNKNOWN' },
  })
}

async function main() {
  const collectionWhere = collectionArg ? { slug: collectionArg } : {}
  const collections = await prisma.collection.findMany({ where: collectionWhere, select: { id: true, slug: true } })
  if (collectionArg && collections.length === 0) throw new Error(`Collection not found: ${collectionArg}`)
  let linked = 0
  let queued = 0

  for (const collection of collections) {
    const [observations, acquisitions, instances] = await Promise.all([
      prisma.plantObservation.findMany({ where: { collectionId: collection.id, vendor: { not: null }, distributorId: null }, select: { id: true, collectionId: true, vendor: true } }),
      prisma.plantAcquisitionRecord.findMany({ where: { collectionId: collection.id, vendor: { not: null }, distributorId: null }, select: { id: true, collectionId: true, vendor: true } }),
      prisma.plantInstance.findMany({ where: { collectionId: collection.id, OR: [{ source: { not: null } }, { distributor: { not: null } }] }, select: { id: true, collectionId: true, source: true, distributor: true, acquisitionRecordLinks: { select: { acquisitionRecordId: true }, orderBy: { createdAt: 'desc' }, take: 1 } } }),
    ])
    const rows: LegacyRow[] = [
      ...observations.map((item) => ({ id: item.id, collectionId: item.collectionId, entityType: 'PlantObservation' as const, field: 'vendor', value: item.vendor! })),
      ...acquisitions.map((item) => ({ id: item.id, collectionId: item.collectionId, entityType: 'PlantAcquisitionRecord' as const, field: 'vendor', value: item.vendor! })),
      ...instances.flatMap((item) => [
        ...(item.distributor ? [{ id: item.id, collectionId: item.collectionId, entityType: 'PlantInstance' as const, field: 'distributor', value: item.distributor, acquisitionRecordId: item.acquisitionRecordLinks[0]?.acquisitionRecordId }] : []),
        ...(item.source ? [{ id: item.id, collectionId: item.collectionId, entityType: 'PlantInstance' as const, field: 'source', value: item.source, acquisitionRecordId: item.acquisitionRecordLinks[0]?.acquisitionRecordId }] : []),
      ]),
    ]

    for (const row of rows) {
      if (!row.collectionId || !isSimpleLegacyProvenance(row.value) || (row.entityType === 'PlantInstance' && !row.acquisitionRecordId)) {
        await queue(row); queued += 1; continue
      }
      if (dryRun) { linked += 1; continue }
      if (row.field === 'source') {
        const source = await sourceFor(row.collectionId, row.value)
        const count = await prisma.acquisitionSource.count({ where: { acquisitionRecordId: row.acquisitionRecordId! } })
        await prisma.acquisitionSource.upsert({
          where: { acquisitionRecordId_sourceId_role: { acquisitionRecordId: row.acquisitionRecordId!, sourceId: source.id, role: 'UNKNOWN' } },
          update: {},
          create: { collectionId: row.collectionId, acquisitionRecordId: row.acquisitionRecordId!, sourceId: source.id, role: 'UNKNOWN', sortOrder: count, isPrimary: count === 0 },
        })
      } else {
        const distributor = await distributorFor(row.collectionId, row.value)
        if (row.entityType === 'PlantObservation') await prisma.plantObservation.update({ where: { id: row.id }, data: { distributorId: distributor.id } })
        else if (row.entityType === 'PlantAcquisitionRecord') await prisma.plantAcquisitionRecord.update({ where: { id: row.id }, data: { distributorId: distributor.id } })
        else await prisma.plantAcquisitionRecord.update({ where: { id: row.acquisitionRecordId! }, data: { distributorId: distributor.id } })
      }
      linked += 1
    }
    console.log(`${collection.slug}: ${rows.length} legacy value(s) inspected`)
  }
  console.log(`${dryRun ? 'Dry run' : 'Migration'} complete: ${linked} clean value(s) ${dryRun ? 'eligible' : 'linked'}, ${queued} ambiguous/unlinked value(s) ${dryRun ? 'would enter' : 'entered'} reconciliation.`)
}

main().finally(() => prisma.$disconnect())
