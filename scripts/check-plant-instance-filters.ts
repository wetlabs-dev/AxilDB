import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const filterComponent = readFileSync('components/PlantInstanceFilters.tsx', 'utf8')
assert.match(filterComponent, /router\.replace/)
assert.match(filterComponent, /scroll: false/)
assert.match(filterComponent, /Select a genus first/)
assert.match(filterComponent, /params\.delete\('species'\)/)
assert.match(filterComponent, /params\.delete\('definition'\)/)
assert.match(filterComponent, /Include child locations/)
assert.match(filterComponent, /Clear filters/)
assert.doesNotMatch(filterComponent, />Apply</)

const instancesPage = readFileSync('app/instances/page.tsx', 'utf8')
assert.match(instancesPage, /<PlantInstanceFilters/)
assert.match(instancesPage, /genus=\{genusFilter\}/)
assert.match(instancesPage, /species=\{speciesFilter\}/)
assert.match(instancesPage, /getAvailableGenera\(instanceTaxonomyDefinitions\)/)
assert.match(instancesPage, /getSpeciesOptionsByGenus\(instanceTaxonomyDefinitions\)/)
assert.match(instancesPage, /plantDefinition: \{ genus:/)
assert.match(instancesPage, /plantDefinition: speciesWhere/)
assert.match(instancesPage, /filterParams\.set\('genus'/)
assert.match(instancesPage, /filterParams\.set\('species'/)
assert.doesNotMatch(instancesPage, /<Button className="px-3 py-2">Apply<\/Button>/)

console.log('Plant instance filter checks passed.')
