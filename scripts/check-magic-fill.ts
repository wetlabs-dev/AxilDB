import assert from 'node:assert/strict'
import { applyMagicFillValues, getMagicFillConflictState, isMagicFillValueEmpty } from '../lib/magic-fill'
import { readFileSync } from 'node:fs'

assert.equal(isMagicFillValueEmpty(null), true)
assert.equal(isMagicFillValueEmpty(undefined), true)
assert.equal(isMagicFillValueEmpty('   '), true)
assert.equal(isMagicFillValueEmpty([]), true)
assert.equal(isMagicFillValueEmpty({ watering: '', nested: { light: null } }), true)
assert.equal(isMagicFillValueEmpty(false), false)
assert.equal(isMagicFillValueEmpty(0), false)
assert.equal(isMagicFillValueEmpty(['alias']), false)
assert.equal(isMagicFillValueEmpty({ relationshipId: 'recipe-1' }), false)

assert.deepEqual(
  getMagicFillConflictState({ watering: 'Moist', light: '', enabled: false }, ['watering', 'light', 'enabled']),
  { hasConflict: true, populatedCount: 2, emptyCount: 1 },
)

const current = {
  watering: 'Keep evenly moist',
  light: '',
  humidity: '60-70%',
  cadence: 0,
  enabled: false,
  aliases: ['African violet'],
  relationshipId: '',
  nested: { temperature: 'Warm', airflow: '' },
  unmanaged: 'keep me',
}
const draft = {
  watering: 'Water when the upper layer dries',
  light: 'Bright indirect',
  humidity: 'High humidity',
  cadence: 7,
  enabled: true,
  aliases: ['Saintpaulia'],
  relationshipId: 'recipe-1',
  nested: { temperature: '18-25 C', airflow: 'Gentle' },
  unmanaged: 'replace me',
}
const managed = ['watering', 'light', 'humidity', 'cadence', 'enabled', 'aliases', 'relationshipId', 'nested']

assert.deepEqual(applyMagicFillValues(current, draft, managed, 'FILL_MISSING'), {
  watering: 'Keep evenly moist',
  light: 'Bright indirect',
  humidity: '60-70%',
  cadence: 0,
  enabled: false,
  aliases: ['African violet'],
  relationshipId: 'recipe-1',
  nested: { temperature: 'Warm', airflow: 'Gentle' },
  unmanaged: 'keep me',
})

assert.deepEqual(applyMagicFillValues(current, draft, managed, 'REPLACE_ALL'), {
  watering: 'Water when the upper layer dries',
  light: 'Bright indirect',
  humidity: 'High humidity',
  cadence: 7,
  enabled: true,
  aliases: ['Saintpaulia'],
  relationshipId: 'recipe-1',
  nested: { temperature: '18-25 C', airflow: 'Gentle' },
  unmanaged: 'keep me',
})

assert.equal(applyMagicFillValues({ notes: 'Keep' }, { notes: null }, ['notes'], 'FILL_MISSING').notes, 'Keep')
assert.equal(applyMagicFillValues({ notes: 'Keep' }, { notes: null }, ['notes'], 'REPLACE_ALL').notes, null)
assert.equal(applyMagicFillValues({ notes: 'Keep' }, { notes: undefined }, ['notes'], 'REPLACE_ALL').notes, 'Keep')

const definitionFillRoute = readFileSync('app/api/ai/plant-definition-fill/route.ts', 'utf8')
assert.match(definitionFillRoute, /intentionally omit a species epithet/)
assert.match(definitionFillRoute, /species value sp\. only when the species is genuinely undetermined/)
assert.doesNotMatch(definitionFillRoute, /if \(!genus \|\| !species\)/)

console.log('Magic Fill merge checks passed.')
