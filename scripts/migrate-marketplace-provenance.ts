import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { normalizeProvenanceName } from '../lib/provenance'
import { emitDomainEvent } from '../lib/events/emit'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')
const collectionSlug = process.argv.find((arg) => arg.startsWith('--collection='))?.slice('--collection='.length)
const marketplaceTypes = ['MARKETPLACE', 'AUCTION_PLATFORM']

function hasPhysicalEvidence(outlet: {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  latitude: unknown
  longitude: unknown
}) {
  return Boolean(outlet.addressLine1 || outlet.addressLine2 || outlet.city || outlet.region || outlet.postalCode || outlet.country || outlet.phone || outlet.latitude || outlet.longitude)
}

function obviousSellerProfile(outlet: { name: string; outletType: string; url: string | null } & Parameters<typeof hasPhysicalEvidence>[0]) {
  if (hasPhysicalEvidence(outlet)) return false
  const name = outlet.name.trim()
  if (/^@[a-z0-9._-]+$/i.test(name)) return true
  if (outlet.url && /(seller|shop|store|profile|user|etsy|ebay|palmstreet)/i.test(outlet.url)) return true
  return outlet.outletType === 'ONLINE_STOREFRONT' && /[a-z]/i.test(name) && !/\b(branch|store|booth|pickup|location|tampa|office)\b/i.test(name)
}

async function queueAmbiguous(collectionId: string, outlet: { id: string; name: string; distributorId: string }) {
  const [acquisitions, observations, batches] = await Promise.all([
    prisma.plantAcquisitionRecord.findMany({ where: { collectionId, distributorOutletId: outlet.id }, select: { id: true } }),
    prisma.plantObservation.findMany({ where: { collectionId, distributorOutletId: outlet.id }, select: { id: true } }),
    prisma.acquisitionBatch.findMany({ where: { collectionId, distributorOutletId: outlet.id }, select: { id: true } }),
  ])
  const entities = [
    ...acquisitions.map((item) => ({ entityType: 'PlantAcquisitionRecord', entityId: item.id })),
    ...observations.map((item) => ({ entityType: 'PlantObservation', entityId: item.id })),
    ...batches.map((item) => ({ entityType: 'AcquisitionBatch', entityId: item.id })),
  ]
  if (!entities.length) entities.push({ entityType: 'DistributorOutlet', entityId: outlet.id })
  if (dryRun) return entities.length
  for (const entity of entities) {
    await prisma.provenanceReconciliationItem.upsert({
      where: { collectionId_entityType_entityId_legacyField: { collectionId, entityType: entity.entityType, entityId: entity.entityId, legacyField: 'marketplaceOutlet' } },
      update: { legacyValue: outlet.name, suggestedDistributorId: outlet.distributorId, suggestedDistributorOutletId: outlet.id, status: 'PENDING' },
      create: { collectionId, entityType: entity.entityType, entityId: entity.entityId, legacyField: 'marketplaceOutlet', legacyValue: outlet.name, suggestedDistributorId: outlet.distributorId, suggestedDistributorOutletId: outlet.id },
    })
  }
  return entities.length
}

async function main() {
  const collections = await prisma.collection.findMany({
    where: collectionSlug ? { slug: collectionSlug } : {},
    select: { id: true, slug: true },
  })
  if (collectionSlug && !collections.length) throw new Error(`Collection not found: ${collectionSlug}`)

  let migrated = 0
  let queued = 0
  let linkedRecords = 0
  const correlationId = randomUUID()

  for (const collection of collections) {
    const outlets = await prisma.distributorOutlet.findMany({
      where: { collectionId: collection.id, active: true, distributor: { distributorType: { in: marketplaceTypes } } },
      include: { distributor: true, _count: { select: { acquisitions: true, observations: true, acquisitionBatches: true } } },
      orderBy: { name: 'asc' },
    })
    for (const outlet of outlets) {
      if (!obviousSellerProfile(outlet)) {
        queued += await queueAmbiguous(collection.id, outlet)
        continue
      }
      const relationshipCount = outlet._count.acquisitions + outlet._count.observations + outlet._count.acquisitionBatches
      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          const normalizedName = normalizeProvenanceName(outlet.name)
          const seller = await tx.seller.upsert({
            where: { collectionId_normalizedName: { collectionId: collection.id, normalizedName } },
            update: {},
            create: { collectionId: collection.id, name: outlet.name.trim(), normalizedName, kind: 'ORGANIZATION' },
          })
          const storefront = await tx.sellerStorefront.upsert({
            where: { sellerId_normalizedName_distributorId: { sellerId: seller.id, normalizedName, distributorId: outlet.distributorId } },
            update: { active: true, archivedAt: null, profileUrl: outlet.url || undefined },
            create: { collectionId: collection.id, sellerId: seller.id, distributorId: outlet.distributorId, handleOrName: outlet.name.trim(), normalizedName, storefrontType: outlet.distributor.distributorType === 'AUCTION_PLATFORM' ? 'AUCTION_PROFILE' : 'MARKETPLACE_SELLER', profileUrl: outlet.url },
          })
          await tx.plantAcquisitionRecord.updateMany({ where: { collectionId: collection.id, distributorOutletId: outlet.id }, data: { sellerId: seller.id, sellerStorefrontId: storefront.id, distributorOutletId: null } })
          await tx.plantObservation.updateMany({ where: { collectionId: collection.id, distributorOutletId: outlet.id }, data: { sellerId: seller.id, sellerStorefrontId: storefront.id, distributorOutletId: null } })
          await tx.acquisitionBatch.updateMany({ where: { collectionId: collection.id, distributorOutletId: outlet.id }, data: { sellerId: seller.id, sellerStorefrontId: storefront.id, distributorOutletId: null } })
          await tx.distributorOutlet.update({ where: { id: outlet.id }, data: { active: false, archivedAt: new Date(), notes: [outlet.notes, `Migrated to seller storefront ${storefront.handleOrName}.`].filter(Boolean).join('\n') } })
          await emitDomainEvent(tx, { eventType: 'provenance.marketplace_migrated', collectionId: collection.id, aggregateId: outlet.id, source: 'IMPORT', correlationId, idempotencyKey: `provenance-marketplace:${outlet.id}:migrated`, payload: { subjectId: outlet.id, displayName: outlet.name, sellerId: seller.id, sellerStorefrontId: storefront.id, distributorId: outlet.distributorId, linkedRecords: relationshipCount } })
          await tx.auditLog.create({ data: { collectionId: collection.id, action: 'MIGRATE', entityType: 'DISTRIBUTOR_OUTLET', entityId: outlet.id, summary: `Migrated marketplace outlet ${outlet.name} to a seller storefront`, metadata: JSON.stringify({ sellerId: seller.id, sellerStorefrontId: storefront.id, distributorId: outlet.distributorId, correlationId, linkedRecords: relationshipCount }) } })
        })
      }
      migrated += 1
      linkedRecords += relationshipCount
    }
    console.log(`${collection.slug}: ${outlets.length} active marketplace outlet(s) inspected`)
  }
  console.log(`${dryRun ? 'Dry run' : 'Migration'} complete: ${migrated} obvious storefront(s) ${dryRun ? 'would migrate' : 'migrated'} (${linkedRecords} linked record(s)); ${queued} ambiguous relationship(s) ${dryRun ? 'would enter' : 'entered'} reconciliation.`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
