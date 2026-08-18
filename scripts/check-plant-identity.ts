import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizePlantDefinitionIdentity } from '@/lib/plant-identity'
import { acceptedPlantName, plantName, plantNeedsIdentification } from '@/lib/utils'

const identified = normalizePlantDefinitionIdentity({ genus: 'Streptocarpus', species: 'IONANTHUS' })
assert.deepEqual(identified, {
  genus: 'Streptocarpus',
  species: 'ionanthus',
  provisionalTaxon: null,
  identificationStatus: 'IDENTIFIED',
})

const provisional = normalizePlantDefinitionIdentity({ provisionalTaxon: 'Saintpaulia sp. aff. ionantha' })
assert.equal(provisional.identificationStatus, 'PROVISIONAL')
assert.equal(provisional.genus, 'Saintpaulia')
assert.equal(provisional.species, 'sp.')
assert.equal(plantName(provisional), 'Saintpaulia sp. aff. ionantha')
assert.equal(acceptedPlantName(provisional), 'Saintpaulia sp.')
assert.equal(plantNeedsIdentification(provisional), true)

for (const namedCultivar of [
  { genus: 'Monstera', species: 'sp.', cultivarName: 'Burle Marx Flame' },
  { genus: 'Philodendron', species: 'sp', cultivarName: 'Ring of Fire' },
]) {
  const normalized = normalizePlantDefinitionIdentity(namedCultivar)
  assert.deepEqual(normalized, {
    genus: namedCultivar.genus,
    species: 'sp.',
    provisionalTaxon: null,
    identificationStatus: 'PROVISIONAL',
  })
  assert.equal(plantName({ ...normalized, cultivarName: namedCultivar.cultivarName }), `${namedCultivar.genus} sp. '${namedCultivar.cultivarName}'`)
  assert.equal(plantNeedsIdentification(normalized), true)
}

assert.throws(
  () => normalizePlantDefinitionIdentity({ genus: 'Monstera', species: 'sp.' }),
  /named cultivar|provisional taxon/i,
)

assert.throws(
  () => normalizePlantDefinitionIdentity({ genus: 'Unidentified', species: 'sp.' }),
  /named cultivar|provisional taxon/i,
)

const schema = readFileSync('prisma/schema.prisma', 'utf8')
const definitionModel = schema.match(/model PlantDefinition \{[\s\S]*?\n\}/)?.[0] || ''
const instanceModel = schema.match(/model PlantInstance \{[\s\S]*?\n\}/)?.[0] || ''
assert.ok(!definitionModel.includes('acquisitionLabel'), 'PlantDefinition must not own an acquisition label')
assert.ok(definitionModel.includes('identificationStatus'), 'PlantDefinition must expose identification status')
assert.ok(instanceModel.includes('acquisitionLabel'), 'PlantInstance must own the acquisition label')

const migration = readFileSync('prisma/migrations/20260720120000_instance_acquisition_labels_and_provisional_identity/migration.sql', 'utf8')
assert.match(migration, /UPDATE "PlantInstance"/)
assert.match(migration, /DROP COLUMN "acquisitionLabel"/)
assert.match(migration, /Legacy definition acquisition label/)

console.log('Plant identity and acquisition-label checks passed.')
