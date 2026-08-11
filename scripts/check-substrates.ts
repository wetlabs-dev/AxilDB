import fs from 'node:fs'
import path from 'node:path'
import { starterSubstrateComponents, starterSubstrateRecipes, validRecipeTotal } from '../lib/substrates'
import { normalizeAndRankSubstrateRecommendations, substrateRecipePhysicalProfile } from '../lib/substrate-recommendations'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(starterSubstrateComponents.length === 15, 'Expected exactly 15 starter substrate components.')
assert(starterSubstrateRecipes.length === 12, 'Expected exactly 12 starter substrate recipes.')

const componentKeys = new Set(starterSubstrateComponents.map((component) => component.key))
for (const recipe of starterSubstrateRecipes) {
  const total = recipe.components.reduce((sum, [, percent]) => sum + percent, 0)
  assert(validRecipeTotal(total), `${recipe.name} totals ${total}%, not 100%.`)
  for (const [componentKey] of recipe.components) {
    assert(componentKeys.has(componentKey), `${recipe.name} references missing component ${componentKey}.`)
  }
}

const componentByKey = new Map(starterSubstrateComponents.map((component) => [component.key, component]))
const profiles = new Map(starterSubstrateRecipes.map((recipe) => [recipe.key, substrateRecipePhysicalProfile(recipe.components.map(([key, percentByVolume]) => ({ percentByVolume, component: componentByKey.get(key)! })))]))
const rankedPeperomiaStyleMixes = normalizeAndRankSubstrateRecommendations({
  substrateTargetProfile: { waterRetention: 'MODERATE', aeration: 'HIGH', drainage: 'HIGH' },
  substrateRecommendations: [
    { recipeVersionId: 'african-violet-mix', suitability: 'PREFERRED', confidence: 0.9 },
    { recipeVersionId: 'hoya-mix', suitability: 'RECOMMENDED', confidence: 0.8 },
  ],
}, profiles)
assert(rankedPeperomiaStyleMixes[0]?.recipeVersionId === 'hoya-mix', 'Physical substrate fit should outrank a weaker AI recipe ordering.')

const root = process.cwd()
const actions = fs.readFileSync(path.join(root, 'app/substrate-actions.ts'), 'utf8')
const substrateHelper = fs.readFileSync(path.join(root, 'lib/substrates.ts'), 'utf8')
const careActions = fs.readFileSync(path.join(root, 'app/actions.ts'), 'utf8')
const careQueue = fs.readFileSync(path.join(root, 'lib/care-queue.ts'), 'utf8')
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260810190000_substrate_system/migration.sql'), 'utf8')

assert(actions.includes("status !== 'DRAFT'"), 'Published substrate recipe versions must reject in-place edits.')
assert(actions.includes('collectionId: collection.id'), 'Substrate actions must scope records to the active collection.')
assert(substrateHelper.includes('plantSubstrateHistory.create'), 'Substrate assignment must preserve history.')
assert(substrateHelper.includes('repottingCareEventId'), 'Substrate history must support linkage to repotting care events.')
assert(careActions.includes("taskType === 'REPOT'"), 'Care completion must support repotting.')
assert(careQueue.includes('recommendedSubstrateRecipeVersionId'), 'Repot tasks must expose ranked recommendations.')
assert(actions.includes('applyMagicSubstrateRecommendations'), 'Magic Fill substrate recommendations must have a direct persistence action.')
assert(schema.includes('substrateRecipeVersionId String?'), 'Care events must snapshot the substrate recipe version.')
for (const match of migration.matchAll(/(?:INDEX|CONSTRAINT) "([^"]+)"/g)) {
  assert(match[1].length <= 63, `PostgreSQL identifier exceeds 63 characters: ${match[1]}`)
}

console.log('Substrate invariants passed.')
