import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizePlantDefinitionIdentity } from '@/lib/plant-identity'
import { plantDefinitionCode } from '@/lib/plant-id'
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

const genusOnly = normalizePlantDefinitionIdentity({ genus: 'Begonia' })
assert.equal(genusOnly.species, null)
assert.equal(genusOnly.identificationStatus, 'IDENTIFIED')
assert.equal(plantName(genusOnly), 'Begonia')

const omittedSpecies = normalizePlantDefinitionIdentity({ genus: 'Begonia', species: '', cultivarName: 'Looking Glass' })
assert.equal(omittedSpecies.species, null)
assert.equal(omittedSpecies.identificationStatus, 'IDENTIFIED')
assert.equal(plantName({ ...omittedSpecies, cultivarName: 'Looking Glass' }), "Begonia 'Looking Glass'")
assert.equal(plantDefinitionCode({ genus: 'Begonia', species: null, cultivarName: 'Looking Glass' } as any), 'BEG-LOO')

assert.equal(acceptedPlantName({ genus: 'Monstera', species: 'deliciosa' }), 'Monstera deliciosa')
assert.equal(acceptedPlantName({ genus: 'Monstera', species: 'deliciosa', cultivarName: 'Thai Constellation' }), "Monstera deliciosa 'Thai Constellation'")

const unknownSpecies = normalizePlantDefinitionIdentity({ genus: 'Begonia', species: 'sp.', cultivarName: 'Looking Glass' })
assert.equal(unknownSpecies.species, 'sp.')
assert.equal(unknownSpecies.identificationStatus, 'PROVISIONAL')
assert.equal(plantName({ ...unknownSpecies, cultivarName: 'Looking Glass' }), "Begonia sp. 'Looking Glass'")
assert.notEqual(plantName({ ...unknownSpecies, cultivarName: 'Looking Glass' }), plantName({ ...omittedSpecies, cultivarName: 'Looking Glass' }))

assert.throws(
  () => normalizePlantDefinitionIdentity({ genus: 'Unidentified', species: 'sp.' }),
  /genus/i,
)
assert.throws(() => normalizePlantDefinitionIdentity({ species: 'deliciosa' }), /genus/i)

const schema = readFileSync('prisma/schema.prisma', 'utf8')
const definitionModel = schema.match(/model PlantDefinition \{[\s\S]*?\n\}/)?.[0] || ''
const instanceModel = schema.match(/model PlantInstance \{[\s\S]*?\n\}/)?.[0] || ''
assert.ok(!definitionModel.includes('acquisitionLabel'), 'PlantDefinition must not own an acquisition label')
assert.ok(definitionModel.includes('identificationStatus'), 'PlantDefinition must expose identification status')
assert.match(definitionModel, /species\s+String\?/, 'PlantDefinition species must support an intentionally omitted epithet')
assert.ok(instanceModel.includes('acquisitionLabel'), 'PlantInstance must own the acquisition label')

const migration = readFileSync('prisma/migrations/20260720120000_instance_acquisition_labels_and_provisional_identity/migration.sql', 'utf8')
assert.match(migration, /UPDATE "PlantInstance"/)
assert.match(migration, /DROP COLUMN "acquisitionLabel"/)
assert.match(migration, /Legacy definition acquisition label/)

const nullableSpeciesMigration = readFileSync('prisma/migrations/20260819180000_nullable_plant_definition_species/migration.sql', 'utf8')
assert.match(nullableSpeciesMigration, /ALTER COLUMN "species" DROP NOT NULL/)
assert.doesNotMatch(nullableSpeciesMigration, /UPDATE "PlantDefinition"/, 'The migration must not rewrite existing sp. records')

const searchPage = readFileSync('app/search/page.tsx', 'utf8')
assert.match(searchPage, /\{ genus: contains\(q\) \}/)
assert.match(searchPage, /\{ species: contains\(q\) \}/)
assert.match(searchPage, /\{ cultivarName: contains\(q\) \}/)
assert.match(searchPage, /identityTerms\.map/)

console.log('Plant identity and acquisition-label checks passed.')
