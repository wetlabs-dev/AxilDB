import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  decodeSpeciesFilter,
  encodeSpeciesFilter,
  getAvailableGenera,
  getAvailableSpeciesForGenus,
  getSpeciesOptionsByGenus,
  matchingRawGenera,
  matchingRawSpecies,
  noSpeciesFilterToken,
  normalizeTaxonomyFilter,
  speciesFilterLabel,
} from '../lib/taxonomy'

const definitions = [
  { genus: ' Begonia ', species: null },
  { genus: 'begonia', species: '' },
  { genus: 'Begonia', species: 'sp.' },
  { genus: 'Begonia', species: ' ferox ' },
  { genus: 'Hoya', species: 'carnosa' },
  { genus: 'Hoya', species: 'sp.' },
]

assert.equal(normalizeTaxonomyFilter(' Begonia '), 'begonia')
assert.equal(encodeSpeciesFilter(null), noSpeciesFilterToken)
assert.equal(encodeSpeciesFilter(''), noSpeciesFilterToken)
assert.equal(encodeSpeciesFilter('sp.'), 'sp.')
assert.equal(decodeSpeciesFilter(noSpeciesFilterToken), noSpeciesFilterToken)
assert.equal(speciesFilterLabel(noSpeciesFilterToken), 'No species / genus-level cultivar')
assert.equal(speciesFilterLabel('sp.'), 'sp. - species unknown')

const genera = getAvailableGenera(definitions)
assert.deepEqual(genera.map((option) => option.label), ['Begonia', 'Hoya'])
assert.equal(genera.find((option) => option.label === 'Begonia')?.count, 4)

const begoniaSpecies = getAvailableSpeciesForGenus(definitions, 'Begonia')
assert.deepEqual(
  begoniaSpecies.map((option) => option.value),
  ['ferox', noSpeciesFilterToken, 'sp.'],
  'blank species, real species, and sp. must stay distinct',
)
assert.equal(begoniaSpecies.find((option) => option.value === noSpeciesFilterToken)?.count, 2)

const byGenus = getSpeciesOptionsByGenus(definitions)
assert.deepEqual(byGenus.begonia.map((option) => option.value), ['ferox', noSpeciesFilterToken, 'sp.'])
assert.deepEqual(byGenus.hoya.map((option) => option.value), ['carnosa', 'sp.'])
assert.deepEqual(matchingRawGenera(definitions, 'BEGONIA'), [' Begonia ', 'begonia', 'Begonia'])
assert.deepEqual(matchingRawSpecies(definitions, 'begonia', noSpeciesFilterToken), { values: [''], includesNull: true })

const filterComponent = readFileSync('components/PlantDefinitionFilters.tsx', 'utf8')
assert.match(filterComponent, /router\.replace/)
assert.match(filterComponent, /scroll: false/)
assert.match(filterComponent, /Select a genus first/)
assert.match(filterComponent, /Clear filters/)
assert.doesNotMatch(filterComponent, />Apply filters</)
assert.match(filterComponent, /params\.delete\('species'\)/)

const plantsPage = readFileSync('app/plants/page.tsx', 'utf8')
assert.match(plantsPage, /<PlantDefinitionFilters/)
assert.match(plantsPage, /q=\{q\}/)
assert.match(plantsPage, /genus=\{genusFilter\}/)
assert.match(plantsPage, /species=\{speciesFilter\}/)
assert.match(plantsPage, /speciesWhere/)
assert.match(plantsPage, /aliases: \{ some:/)
assert.match(plantsPage, /tags: \{ some:/)
assert.doesNotMatch(plantsPage, />Apply filters</)

console.log('Plant definition filter checks passed.')
