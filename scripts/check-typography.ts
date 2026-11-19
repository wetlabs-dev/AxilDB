import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { formatTypography as f, formatCultivar, formatMeasurement, normalizeTypographySearch } from '@/lib/typography'
import { acceptedPlantName, plantDisplayName, plantName } from '@/lib/utils'
import { plantLabelNameLines, LABEL_WIDTH_PT, LABEL_HEIGHT_PT } from '@/lib/plant-labels'
import { typographySearchVariants, typographySearchWhere } from '@/lib/typography-search'
import { renderBrandedEmail } from '@/lib/email-templates'

const cases = [
  ["Today's Care", 'Today’s Care'], ["Yesterday's activity", 'Yesterday’s activity'],
  ["You'll receive a notification. Don't worry; it's ready.", 'You’ll receive a notification. Don’t worry; it’s ready.'],
  ["The plants' locations", 'The plants’ locations'], ["O'Connor", 'O’Connor'],
  ["the '90s", 'the ’90s'], ["rock 'n' roll", 'rock ’n’ roll'], ["'Twas a good year", '’Twas a good year'],
  ["The term 'accession' means a record.", 'The term ‘accession’ means a record.'],
  ['Select "Option 2".', 'Select “Option 2”.'],
  ['The guide states, "The cultivar \'Chelsea\' prefers light."', 'The guide states, “The cultivar ‘Chelsea’ prefers light.”'],
  ["Epipremnum aureum 'N'Joy'", 'Epipremnum aureum ‘N’Joy’'],
  ['Already “curly”, ‘correct’, 6′ and 12″.', 'Already “curly”, ‘correct’, 6′ and 12″.'],
  ["Hawaiʻi, lʼété and d'Artagnan", 'Hawaiʻi, lʼété and d’Artagnan'],
  ["'95", "'95"], ["in '95", 'in ’95'], ["Select '95'.", 'Select ‘95’.'],
  ["The word 'em' and the letter 'n'.", 'The word ‘em’ and the letter ‘n’.'],
  ["The quoted '90s' label.", 'The quoted ‘90s’ label.'],
  ['Select \"a [guide](https://example.test/)\".', 'Select “a [guide](https://example.test/)”.'],
  ['12"', '12"'], ["A'", "A'"], ["5' end", "5' end"],
  ['Keep\n  "these lines"\tintact.', 'Keep\n  “these lines”\tintact.'],
  ['Select `const name = "Chelsea"` then "Continue".', 'Select `const name = "Chelsea"` then “Continue”.'],
  ['```js\nconst name = "Chelsea";\n```\nToday\'s care', '```js\nconst name = "Chelsea";\n```\nToday’s care'],
  ['~~~json\n{"name":"Today\'s Care"}\n~~~\nDon\'t edit code.', '~~~json\n{"name":"Today\'s Care"}\n~~~\nDon’t edit code.'],
  ['[Today\'s guide](https://example.test/?q="Chelsea")', '[Today’s guide](https://example.test/?q="Chelsea")'],
  ['<span title="Today\'s">Don\'t</span>', '<span title="Today\'s">Don’t</span>'],
  ['https://example.test/?q="Chelsea" and o\'connor@example.test', 'https://example.test/?q="Chelsea" and o\'connor@example.test'],
]
for (const [input, expected] of cases) {
  assert.equal(f(input), expected, input)
  assert.equal(f(f(input)), expected, `Idempotent: ${input}`)
}
assert.equal(f('3\" pot', { mode: 'measurement' }), '3″ pot')
assert.equal(f(null), ''); assert.equal(f(undefined), ''); assert.equal(f(''), '')
assert.equal(f('"bonjour"', { locale: 'fr' }), '"bonjour"')
const raw = 'docker compose exec app sh -c "node --version"\n{"status":"Today\'s backup"}'
assert.equal(f(raw, { mode: 'literal' }), raw)
for (const [input, expected] of [["6'", '6′'], ['12"', '12″'], ["5' 8\"", '5′ 8″'], ['2.25" × 1.25"', '2.25″ × 1.25″'], ['39° 6\' 30"', '39° 6′ 30″'], ["f'(x), f''(x)", 'f′(x), f″(x)']]) {
 assert.equal(formatMeasurement(input), expected); assert.equal(formatMeasurement(expected), expected)
}
for (const value of ['Chelsea', "'Chelsea'", '‘Chelsea’', '"Chelsea"']) assert.equal(formatCultivar(value), '‘Chelsea’')
assert.equal(formatCultivar("N'Joy"), '‘N’Joy’')
assert.equal(formatCultivar("'N'Joy'"), '‘N’Joy’')
const botanical = Object.freeze({ genus: 'Epipremnum', species: 'aureum', cultivarName: "N'Joy" })
const stored = JSON.stringify(botanical)
assert.equal(plantDisplayName(botanical), 'Epipremnum aureum ‘N’Joy’')
assert.equal(plantName(botanical), "Epipremnum aureum 'N'Joy'")
assert.equal(acceptedPlantName(botanical), plantName(botanical))
assert.equal(JSON.stringify(botanical), stored)
assert.deepEqual(plantLabelNameLines(botanical), ['Epipremnum', 'aureum', '‘N’Joy’'])
assert.deepEqual([LABEL_WIDTH_PT, LABEL_HEIGHT_PT], [162, 90])
assert.equal(normalizeTypographySearch(plantDisplayName(botanical)), plantName(botanical))
assert.ok(typographySearchVariants('N’Joy').includes("N'Joy"))
assert.ok(typographySearchVariants("N'Joy").includes('N’Joy'))
const where = { collectionId: 'literal-id', OR: [{ cultivarName: { contains: 'N’Joy', mode: 'insensitive' } }, { plantId: { contains: "ID'1" } }, { powoUrl: { contains: 'https://example.test/?q="X"' } }] }
const snapshot = JSON.stringify(where), expanded = typographySearchWhere(where)
assert.equal(JSON.stringify(where), snapshot)
assert.equal(expanded.collectionId, where.collectionId)
assert.deepEqual(expanded.OR[1], where.OR[1]); assert.deepEqual(expanded.OR[2], where.OR[2])
assert.match(JSON.stringify(expanded.OR[0]), /N'Joy/)
const mail = renderBrandedEmail({ title: "Today's Care", preview: "It's ready", body: ["The cultivar 'N'Joy' is ready.", raw.split('\n')[0].replace(/^/, '`') + '`'], actionUrl: 'https://example.test/?q="N\'Joy"' })
assert.ok(mail.text.includes('Today’s Care')); assert.ok(mail.html.includes('‘N’Joy’'))
assert.ok(mail.text.includes('https://example.test/?q="N\'Joy"'))
assert.ok(!mail.text.includes('&rsquo;'))
assert.match(readFileSync('components/CareQueueView.tsx','utf8'), /Today’s Care/)
assert.match(readFileSync('app/globals.css','utf8'), /:lang\(en\) \{ quotes: "“" "”" "‘" "’"; \}/)
const started = performance.now()
for (let i = 0; i < 20000; i++) f(cases[i % cases.length][0])
console.log(`Typography: ${cases.length} prose fixtures plus cultivar, literal, measurement, search, persistence, email and label checks passed; 20,000 formats in ${Math.round(performance.now() - started)} ms.`)
