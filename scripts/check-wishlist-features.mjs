import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const schema = read('prisma/schema.prisma')
const wishlist = read('lib/wishlist.ts')
const publicPage = read('app/wishlist/page.tsx')
const exportsRoute = read('app/api/exports/wishlist/route.ts')
const actions = read('app/acquisition-actions.ts')
const exhibits = read('lib/exhibits.ts')

assert.match(schema, /model AcquisitionBatch \{/)
assert.match(schema, /@@unique\(\[collectionId, idempotencyKey\]\)/)
assert.match(schema, /model CollectionExhibitWishlistItem \{/)
assert.match(schema, /isPublic\s+Boolean\s+@default\(false\)/)
assert.match(wishlist, /showObservedPriceRange: false/)
assert.match(wishlist, /showPlannedLocationCategory: false/)
assert.match(wishlist, /where: options\.publicOnly \? \{ isPublic: true \}/)
assert.match(publicPage, /!publicVisitor && entry\.maximumPurchasePrice/)
assert.doesNotMatch(publicPage, /acquisitionInterestNotes/)
assert.doesNotMatch(publicPage, /experienceNotes|addressLine1|postalCode/)
assert.match(exportsRoute, /publicOnly \? publicRows\(entries, settings\) : privateRows\(entries\)/)
assert.match(actions, /collectionId_idempotencyKey/)
assert.match(actions, /prisma\.\$transaction\(async \(tx\)/)
assert.match(actions, /collectionId: collection\.id, id: \{ in: definitionIds \}/)
assert.match(exhibits, /wishlistItems:/)

console.log('Wishlist feature checks passed.')
