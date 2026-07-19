import assert from 'node:assert/strict'
import { distributorDisplay, isSimpleLegacyProvenance, normalizeProvenanceName, sourceChainDisplay, sourceRowsFromForm, validateDistributorSelection, validateSourceRows } from '../lib/provenance'

async function main() {
  assert.equal(normalizeProvenanceName('  Costa   Farms '), 'costa farms')
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
  const scopedClient = {
    distributor: { findFirstOrThrow: async ({ where }: any) => { distributorWhere = where; return { id: where.id, name: 'Distributor' } } },
    distributorLocation: { findFirstOrThrow: async ({ where }: any) => { locationWhere = where; return { id: where.id, name: 'Branch' } } },
    source: { findMany: async ({ where }: any) => where.collectionId === 'collection-a' ? [{ id: 'source-a', name: 'A' }, { id: 'source-b', name: 'B' }] : [] },
  } as any
  await validateDistributorSelection(scopedClient, 'collection-a', 'distributor-a', 'location-a')
  assert.deepEqual(distributorWhere, { id: 'distributor-a', collectionId: 'collection-a' })
  assert.deepEqual(locationWhere, { id: 'location-a', distributorId: 'distributor-a', collectionId: 'collection-a' })
  await validateSourceRows(scopedClient, 'collection-a', rows)
  await assert.rejects(() => validateSourceRows(scopedClient, 'collection-a', [...rows, { ...rows[0] }]), /Only one source may be primary|cannot be added twice/)

  assert.equal(sourceChainDisplay([{ role: 'ORIGINATOR', source: { name: 'Hybridizer' } }, { role: 'GROWER', source: { name: 'Nursery' } }]), 'Hybridizer (Originator) → Nursery (Grower)')
  assert.equal(distributorDisplay({ name: 'Lowe’s' }, { name: 'Glen Burnie' }), 'Lowe’s — Glen Burnie')
  console.log('Provenance checks passed.')
}

main().catch((error) => { console.error(error); process.exit(1) })
