import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acquisitionProvenanceDisplay, distributorDisplay, isSimpleLegacyProvenance, normalizeProvenanceName, sourceChainDisplay, sourceRowsFromForm, validateCommerceSelection, validateDistributorSelection, validateSourceRows } from '../lib/provenance'

async function main() {
  assert.equal(normalizeProvenanceName('  Costa   Farms '), 'costa farms')
  assert.equal(normalizeProvenanceName('  Lowe’s  '), "lowe's")
  assert.equal(isSimpleLegacyProvenance('Costa Farms'), true)
  assert.equal(isSimpleLegacyProvenance('Costa Farms via Lowe’s'), false)
  assert.equal(isSimpleLegacyProvenance('Lowe’s / Costa'), false)
  assert.equal(isSimpleLegacyProvenance('Gift from Jane, originally Lyndon Lyon'), false)

  const form = new FormData()
  form.append('sourceId', 'source-a'); form.append('sourceRole', 'ORIGINATOR'); form.append('sourceNotes', 'Original hybridizer')
  form.append('sourceId', 'source-b'); form.append('sourceRole', 'GROWER'); form.append('sourceNotes', '')
  form.set('primarySourceIndex', '0')
  const rows = sourceRowsFromForm(form)
  assert.deepEqual(rows.map((row) => [row.sourceId, row.role, row.isPrimary]), [['source-a', 'ORIGINATOR', true], ['source-b', 'GROWER', false]])

  let distributorWhere: any
  let locationWhere: any
  let sellerWhere: any
  let storefrontWhere: any
  const scopedClient = {
    distributor: { findFirstOrThrow: async ({ where }: any) => { distributorWhere = where; return { id: where.id, name: 'Distributor' } } },
    distributorOutlet: { findFirstOrThrow: async ({ where }: any) => { locationWhere = where; return { id: where.id, name: 'Branch' } } },
    seller: { findFirstOrThrow: async ({ where }: any) => { sellerWhere = where; return { id: where.id, name: 'Seller' } } },
    sellerStorefront: { findFirstOrThrow: async ({ where }: any) => { storefrontWhere = where; return { id: where.id, sellerId: 'seller-a', distributorId: 'distributor-a' } } },
    source: { findMany: async ({ where }: any) => where.collectionId === 'collection-a' ? [{ id: 'source-a', name: 'A' }, { id: 'source-b', name: 'B' }] : [] },
  } as any
  await validateDistributorSelection(scopedClient, 'collection-a', 'distributor-a', 'location-a')
  assert.deepEqual(distributorWhere, { id: 'distributor-a', collectionId: 'collection-a' })
  assert.deepEqual(locationWhere, { id: 'location-a', distributorId: 'distributor-a', collectionId: 'collection-a' })
  await validateSourceRows(scopedClient, 'collection-a', rows)
  await assert.rejects(() => validateSourceRows(scopedClient, 'collection-a', [...rows, { ...rows[0] }]), /Only one source may be primary|cannot be added twice/)

  assert.equal(sourceChainDisplay([{ role: 'ORIGINATOR', source: { name: 'Hybridizer' } }, { role: 'GROWER', source: { name: 'Nursery' } }]), 'Hybridizer (Originator) → Nursery (Grower)')
  assert.equal(distributorDisplay({ name: 'Lowe’s' }, { name: 'Glen Burnie' }), 'Lowe’s — Glen Burnie')
  await validateCommerceSelection(scopedClient, 'collection-a', { sellerId: 'seller-a', sellerStorefrontId: 'storefront-a', distributorId: 'distributor-a' })
  assert.deepEqual(sellerWhere, { id: 'seller-a', collectionId: 'collection-a' })
  assert.deepEqual(storefrontWhere, { id: 'storefront-a', collectionId: 'collection-a' })
  assert.equal(acquisitionProvenanceDisplay({ seller: { name: 'Aerial Roots' }, storefront: { handleOrName: '@AerialRootsFL' }, distributor: { name: 'Palmstreet' } }), 'Purchased from Aerial Roots via Palmstreet')
  assert.equal(acquisitionProvenanceDisplay({ distributor: { name: 'Lowe’s' }, outlet: { name: 'Glen Burnie' } }), 'Purchased from Lowe’s — Glen Burnie')
  const migration = readFileSync('prisma/migrations/20260810160000_normalized_seller_storefronts/migration.sql', 'utf8')
  assert.match(migration, /ALTER TABLE "DistributorLocation" RENAME TO "DistributorOutlet"/)
  assert.match(migration, /ADD COLUMN "showSellerIdentity" BOOLEAN NOT NULL DEFAULT false/)
  const marketplaceMigration = readFileSync('scripts/migrate-marketplace-provenance.ts', 'utf8')
  assert.match(marketplaceMigration, /--dry-run/)
  assert.match(marketplaceMigration, /hasPhysicalEvidence/)
  assert.match(marketplaceMigration, /provenanceReconciliationItem\.upsert/)
  const channelMigration = readFileSync('prisma/migrations/20260810210000_provenance_sales_channels/migration.sql', 'utf8')
  assert.match(channelMigration, /CREATE TABLE "SalesChannelType"/)
  assert.match(channelMigration, /UPDATE "PlantAcquisitionRecord"/)
  assert.match(channelMigration, /AND ar\."sellerId" IS NULL/)
  const acquisitionFields = readFileSync('components/DistributorFields.tsx', 'utf8')
  assert.match(acquisitionFields, /Who did you get this from\?/)
  assert.match(acquisitionFields, /How did you buy or receive it\?/)
  assert.doesNotMatch(acquisitionFields, />Distributor outlet</)
  const instanceEditor = readFileSync('app/instances/[id]/acquisition/page.tsx', 'utf8')
  assert.match(instanceEditor, /Edit Acquisition &amp; Provenance/)
  assert.match(instanceEditor, /savePlantInstanceAcquisition/)
  console.log('Provenance checks passed.')
}

main().catch((error) => { console.error(error); process.exit(1) })
