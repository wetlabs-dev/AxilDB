import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { plantDefinitionCode, plantIdContextCode } from '../lib/plant-id'
import {
  childTypeForPropagationMethod,
  defaultLifecycleDateForType,
  establishedPlantInstanceTypes,
  isTransitionalPlantInstanceType,
  plantInstanceTypeLabel,
  plantInstanceTypes,
} from '../lib/plant-instance-types'

for (const type of ['SEED', 'CORM', 'TISSUE_CULTURE'] as const) {
  assert.ok(plantInstanceTypes.includes(type), `${type} must be a valid plant instance type`)
  assert.ok(isTransitionalPlantInstanceType(type), `${type} must be transitional`)
  assert.notEqual(plantInstanceTypeLabel(type), type, `${type} must have a human-readable label`)
}

assert.deepEqual(establishedPlantInstanceTypes, ['MOTHER', 'PROPAGATION'])
assert.equal(plantIdContextCode('SEED'), 'SD')
assert.equal(plantIdContextCode('CORM'), 'CO')
assert.equal(plantIdContextCode('TISSUE_CULTURE'), 'TC')
assert.equal(childTypeForPropagationMethod('SEED'), 'SEED')
assert.equal(childTypeForPropagationMethod('CORM'), 'CORM')
assert.equal(childTypeForPropagationMethod('TISSUE_CULTURE'), 'TISSUE_CULTURE')
assert.equal(childTypeForPropagationMethod('CUTTING'), 'PROPAGATION')

assert.equal(
  plantDefinitionCode({ genus: 'Begonia', species: null, cultivarName: 'Looking Glass' } as any),
  'BEG-LOO',
  'blank species cultivar IDs must use genus+cultivar without sp. or double separators',
)
assert.equal(
  plantDefinitionCode({ genus: 'Hoya', species: '', cultivarName: 'Mathilde' } as any),
  'HOY-MAT',
  'empty species cultivar IDs must stay distinct from sp.',
)
assert.equal(
  plantDefinitionCode({ genus: 'Begonia', species: 'sp.', cultivarName: 'Looking Glass' } as any),
  'BEGSPX-LOO',
  'explicit sp. must remain represented as an unknown-species token',
)

const sownAt = new Date('2026-08-01T00:00:00.000Z')
const acquisitionDate = new Date('2026-08-15T00:00:00.000Z')
assert.equal(defaultLifecycleDateForType({ instanceType: 'SEED', acquisitionDate, sownAt }), sownAt)
assert.equal(defaultLifecycleDateForType({ instanceType: 'CORM', acquisitionDate, cormStartedAt: sownAt }), sownAt)
assert.equal(defaultLifecycleDateForType({ instanceType: 'TISSUE_CULTURE', acquisitionDate, deflaskedAt: sownAt }), sownAt)

const cascade = readFileSync('components/PlantDefinitionCascadePicker.tsx', 'utf8')
assert.match(cascade, /No species \/ genus-level cultivar/)
assert.match(cascade, /sp\. - species unknown/)
assert.match(cascade, /No cultivar/)

const schema = readFileSync('prisma/schema.prisma', 'utf8')
for (const field of ['sownAt', 'germinatedAt', 'cormStartedAt', 'deflaskedAt', 'establishedAt']) {
  assert.match(schema, new RegExp(`\\b${field}\\s+DateTime\\?`), `${field} must be a nullable PlantInstance lifecycle date`)
}

console.log('Plant instance lifecycle checks passed.')
