import assert from 'node:assert/strict'
import { labelFormats, labelPdfStorageKey, normalizeLabelPreferences, readLabelPreferences, saveLabelPreferences } from '../lib/label-pdf-preferences'
import { defaultLabelOrientation } from '../lib/plant-labels'
const key = labelPdfStorageKey('one')
assert.notEqual(key, labelPdfStorageKey('two'))
const defaults = normalizeLabelPreferences(null)
assert.equal(defaults.lastCategory, 'plants')
assert.deepEqual(defaults.categories.plants, { sort: 'plant-id', format: 'fixed', orientation: 'landscape' })
assert.equal('sort' in defaults.categories.locations, false)
assert.deepEqual(normalizeLabelPreferences({ version: 2, lastCategory: 'both' }), defaults)
for (const value of [null, [], 'bad', { version: 1, categories: null }, { version: 1, lastCategory: 'invalid' }]) assert.equal(normalizeLabelPreferences(value).lastCategory, 'plants')
const mixed = normalizeLabelPreferences({ version: 1, lastCategory: 'both', categories: { both: { sort: 'removed', format: 'removed', orientation: 'portrait' }, plants: { sort: 'added-newest', format: 'sheet', orientation: 'removed' }, locations: { sort: 'added-oldest', format: 'brother-dk-2210', orientation: 'landscape' } } })
assert.deepEqual(mixed.categories.both, { sort: 'plant-id', format: 'fixed', orientation: 'portrait' })
assert.deepEqual(mixed.categories.plants, { sort: 'added-newest', format: 'sheet', orientation: 'portrait' })
assert.equal('sort' in mixed.categories.locations, false)
for (const format of labelFormats) {
  const saved = normalizeLabelPreferences({ version: 1, categories: { plants: { format } } })
  assert.equal(saved.categories.plants.orientation, defaultLabelOrientation(format))
  for (const orientation of ['portrait', 'landscape']) assert.equal(normalizeLabelPreferences({ version: 1, categories: { plants: { format, orientation } } }).categories.plants.orientation, orientation)
}
let raw: string | null = null
const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value } }
assert.deepEqual(readLabelPreferences(storage, key), defaults)
raw = '{bad json'
assert.deepEqual(readLabelPreferences(storage, key), defaults)
saveLabelPreferences(storage, key, 'plants', { sort: 'added-oldest', format: 'sheet', orientation: 'portrait' })
saveLabelPreferences(storage, key, 'locations', { format: 'brother-dk-2210', orientation: 'landscape' })
saveLabelPreferences(storage, key, 'both', { format: 'fixed', orientation: 'portrait' })
const result = readLabelPreferences(storage, key)
assert.equal(result.lastCategory, 'both')
assert.equal(result.categories.plants.sort, 'added-oldest')
assert.equal(result.categories.plants.format, 'sheet')
assert.equal(result.categories.locations.format, 'brother-dk-2210')
// Another tab changes only plants; its write keeps the other categories intact.
saveLabelPreferences(storage, key, 'plants', { orientation: 'landscape' })
assert.equal(readLabelPreferences(storage, key).categories.locations.format, 'brother-dk-2210')
assert.deepEqual(readLabelPreferences({ getItem: () => { throw new Error('denied') } }, key), defaults)
console.log('Label preference validation, format defaults, category independence, user scoping, unavailable storage and merge checks passed.')
