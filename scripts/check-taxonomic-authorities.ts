import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { authoritySelectionValue, matchTaxonomicAuthorityScopes, TAXONOMIC_SCOPE_RANKS } from '../lib/taxonomic-authorities'

const authorities = [
  { id: 'family', name: 'Family Registry', scopeRules: [{ id: 'family-rule', rank: 'FAMILY', taxonName: 'Gesneriaceae', priority: 900 }] },
  { id: 'genus', name: 'Genus Registry', scopeRules: [{ id: 'genus-rule', rank: 'GENUS', taxonName: 'Streptocarpus', priority: 0 }] },
  { id: 'species', name: 'Species Registry', scopeRules: [{ id: 'species-rule', rank: 'SPECIES', taxonName: 'Streptocarpus ionanthus', priority: 0 }] },
]

const matches = matchTaxonomicAuthorityScopes({
  genus: 'streptocarpus',
  species: 'ionanthus',
  taxonomicPlacementJson: { family: 'Gesneriaceae' },
}, authorities)
assert.deepEqual(matches.map((match) => match.authority.id), ['species', 'genus', 'family'])
assert.equal(matches[0].rule.rank, 'SPECIES')
assert.equal(authoritySelectionValue({ taxonomicAuthorityId: 'genus', taxonomicAuthoritySource: 'MANUAL' }), 'MANUAL:genus')
assert.equal(authoritySelectionValue({ taxonomicAuthorityId: null, taxonomicAuthoritySource: 'NONE' }), 'NONE')
assert.equal(authoritySelectionValue({ taxonomicAuthorityId: 'genus', taxonomicAuthoritySource: 'AUTO' }), 'AUTO')
assert.ok(TAXONOMIC_SCOPE_RANKS.includes('SUBSERIES'))

const migration = readFileSync('prisma/migrations/20260811100000_taxonomic_authorities/migration.sql', 'utf8')
assert.match(migration, /RENAME TO "TaxonomicAuthority"/)
assert.match(migration, /RENAME COLUMN "governingBodyId" TO "taxonomicAuthorityId"/)
assert.match(migration, /SET "taxonomicAuthoritySource" = 'MANUAL'/)
assert.match(migration, /CREATE TABLE "TaxonomicAuthorityScopeRule"/)
assert.match(migration, /CREATE TABLE "PlantDefinitionAuthorityMatch"/)

console.log('Taxonomic Authority checks passed.')
