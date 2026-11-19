import assert from 'node:assert/strict'
import { typographyCandidates } from './typography-source.mjs'
const audit = source => typographyCandidates('fixture.tsx', source)
assert.equal(audit('<h1>Today&apos;s Care</h1>').length,1)
assert.equal(audit('<Button aria-label="View this plant\'s record" />').length,1)
assert.equal(audit('const help = { help: "The plant\'s name" }').length,1)
assert.equal(audit('const message = `It\'s ${count} items`;').length,1)
assert.equal(audit('<h1>Today’s Care</h1>').length,0)
assert.equal(audit('<pre>{`docker exec app sh -c "node --version"`}</pre>').length,0)
assert.equal(audit('<input defaultValue="Today\'s exact value" />').length,0)
assert.equal(audit('<a href="https://example.test/?q=\'x\'">Link</a>').length,0)
assert.equal(audit('// typography-literal: Exact text for a clipboard command example.\n<p>"Today\'s"</p>').length,0)
console.log('Typography audit detection, input/URL/code exclusions and documented literal exceptions passed.')
