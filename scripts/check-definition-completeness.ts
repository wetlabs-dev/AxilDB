import assert from 'node:assert/strict'
import {
  PLANT_DEFINITION_COMPLETENESS_WEIGHTS,
  completenessMatchesMissing,
  completenessMatchesReadiness,
  readinessStatusForScore,
  weightedCompletenessScore,
  type PlantDefinitionCompleteness,
} from '../lib/plant-definition-completeness'

const weightTotal = Object.values(PLANT_DEFINITION_COMPLETENESS_WEIGHTS).reduce((total, weight) => total + weight, 0)
assert.equal(weightTotal, 100, 'Completeness category weights must total 100.')

assert.equal(weightedCompletenessScore({ taxonomy: 100, husbandry: 100, references: 100, images: 100, authority: 100, fertilizer: 100, substrate: 100, tags: 100, validation: 100 }), 100)
assert.equal(weightedCompletenessScore({}), 0)
assert.equal(weightedCompletenessScore({ taxonomy: 200, husbandry: -20 }), 25, 'Category inputs must be bounded before weighting.')
assert.deepEqual(readinessStatusForScore(90, false), { status: 'COMPLETE', statusLabel: 'Complete' })
assert.deepEqual(readinessStatusForScore(75, false), { status: 'MOSTLY_COMPLETE', statusLabel: 'Mostly complete' })
assert.deepEqual(readinessStatusForScore(50, false), { status: 'NEEDS_WORK', statusLabel: 'Needs work' })
assert.deepEqual(readinessStatusForScore(25, false), { status: 'SPARSE', statusLabel: 'Sparse' })
assert.deepEqual(readinessStatusForScore(100, true), { status: 'PROVISIONAL', statusLabel: 'Provisional' }, 'Provisional identity remains distinct from content completeness.')

const fixture = {
  status: 'NEEDS_WORK',
  missingCategoryKeys: ['husbandry', 'substrate'],
} as PlantDefinitionCompleteness
assert.equal(completenessMatchesReadiness(fixture, 'NEEDS_WORK'), true)
assert.equal(completenessMatchesReadiness(fixture, 'COMPLETE'), false)
assert.equal(completenessMatchesMissing(fixture, 'substrate'), true)
assert.equal(completenessMatchesMissing(fixture, 'images'), false)

console.log('Plant Definition completeness checks passed.')
