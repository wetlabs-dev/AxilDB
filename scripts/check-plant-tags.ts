import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acceptedPlantTagColors, normalizePlantTagName, plantTagColors, plantTagIcons, plantTagSlug, tagCategoryLabel } from '@/lib/plant-tags'

assert.equal(normalizePlantTagName('  Cat   Safe  '), 'Cat Safe')
assert.equal(plantTagSlug('Cat Safe'), 'cat-safe')
assert.equal(plantTagSlug('CAT-safe'), 'cat-safe')
assert.equal(plantTagSlug(' cat_safe '), 'cat-safe')
assert.equal(tagCategoryLabel('PET_SAFETY'), 'Pet Safety')
assert.ok(plantTagIcons.includes('paw-print'))
assert.ok(plantTagIcons.includes('triangle-alert'))
assert.ok(plantTagColors.includes('ocean'))
assert.ok(!plantTagColors.includes('moss' as never))
assert.ok(acceptedPlantTagColors.includes('moss'))

const schema = readFileSync('prisma/schema.prisma', 'utf8')
const tagModel = schema.match(/model PlantTag \{[\s\S]*?\n\}/)?.[0] || ''
const assignmentModel = schema.match(/model PlantDefinitionTag \{[\s\S]*?\n\}/)?.[0] || ''
assert.match(tagModel, /@@unique\(\[collectionId, slug\]\)/)
assert.match(tagModel, /@@index\(\[collectionId, category\]\)/)
assert.match(assignmentModel, /@@unique\(\[plantDefinitionId, plantTagId\]\)/)
assert.match(assignmentModel, /collectionId\s+String/)

const migration = readFileSync('prisma/migrations/20260720210000_plant_definition_tags/migration.sql', 'utf8')
assert.match(migration, /CREATE TABLE "PlantTag"/)
assert.match(migration, /CREATE TABLE "PlantDefinitionTag"/)
assert.match(migration, /PlantDefinitionTag_plantDefinitionId_plantTagId_key/)

const actions = readFileSync('app/plant-tag-actions.ts', 'utf8')
assert.match(actions, /collectionId: collection\.id, active: true/)
assert.match(actions, /A tag named \$\{duplicate\.name\} already exists/)
assert.match(actions, /active: false, archivedAt: new Date\(\)/)
assert.match(actions, /eventType: 'tag\.merged'/)

const preview = readFileSync('lib/plant-preview.ts', 'utf8')
assert.match(preview, /options\.publicOnly \? \{ publicVisible: true \}/)
const wishlist = readFileSync('lib/wishlist.ts', 'utf8')
assert.match(wishlist, /publicOnly \? \{ plantTag: \{ publicVisible: true, active: true \} \}/)
const exhibits = readFileSync('lib/exhibits.ts', 'utf8')
assert.match(exhibits, /plantTag: \{ publicVisible: true, active: true \}/)
const definitionActions = readFileSync('app/actions.ts', 'utf8')
assert.match(definitionActions, /source: magicFillTagIds\.has\(tag\.id\) \? 'MAGIC_FILL' : 'USER'/)
assert.match(definitionActions, /collectionId: collection\.id, active: true/)
const magicFill = readFileSync('components/AIDescriptionField.tsx', 'utf8')
assert.match(magicFill, /Confirm create and select/)
assert.match(magicFill, /source: 'MAGIC_FILL'/)
const tagFilter = readFileSync('components/PlantTagFilter.tsx', 'utf8')
assert.match(tagFilter, /router\.replace/)
assert.match(tagFilter, /aria-pressed/)
assert.match(tagFilter, /updateFilter\(new Set\(tags\.map/)
assert.match(tagFilter, /updateFilter\(new Set\(\)\)/)
assert.match(tagFilter, /PlantTagChip/)
const definitionsPage = readFileSync('app\/plants\/page.tsx', 'utf8')
assert.match(definitionsPage, /<PlantTagFilter/)
assert.doesNotMatch(definitionsPage, /name="tag" multiple/)

console.log('Plant Definition Tag checks passed.')
