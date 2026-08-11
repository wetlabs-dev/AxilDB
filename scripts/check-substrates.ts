import fs from 'node:fs'
import path from 'node:path'
import { starterSubstrateComponents, starterSubstrateRecipes, validRecipeTotal } from '../lib/substrates'
import { normalizeAndRankSubstrateRecommendations, substrateRecipePhysicalProfile } from '../lib/substrate-recommendations'
import { resolveSubstrateVisual, starterSubstrateVisuals, substrateVisualDefaults } from '../lib/substrate-visuals'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(starterSubstrateComponents.length === 15, 'Expected exactly 15 starter substrate components.')
assert(starterSubstrateRecipes.length === 12, 'Expected exactly 12 starter substrate recipes.')
assert(Object.keys(starterSubstrateVisuals).length === 15, 'Every starter substrate component needs a visual identity.')

const fallbackA = substrateVisualDefaults({ id: 'custom-1', name: 'Custom aggregate' })
const fallbackB = substrateVisualDefaults({ id: 'custom-1', name: 'Custom aggregate' })
assert(JSON.stringify(fallbackA) === JSON.stringify(fallbackB), 'Custom substrate visual fallback must be deterministic.')
assert(resolveSubstrateVisual({ id: 'custom-1', name: 'Custom aggregate', displayColor: '#123456', displayPattern: 'WAVES' }).color === '#123456', 'Edited visual color must take precedence over fallback.')
assert(starterSubstrateVisuals['perlite-fine'].color === starterSubstrateVisuals['perlite-coarse'].color && starterSubstrateVisuals['perlite-fine'].pattern !== starterSubstrateVisuals['perlite-coarse'].pattern, 'Perlite variants need a coordinated but distinct identity.')
assert(starterSubstrateVisuals['orchid-bark-fine'].pattern !== starterSubstrateVisuals['orchid-bark-medium'].pattern, 'Bark grades need distinct patterns.')
assert(starterSubstrateVisuals['sphagnum-bulk'].pattern !== starterSubstrateVisuals['sphagnum-premium'].pattern, 'Sphagnum grades need distinct patterns.')

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
const visualMigration = fs.readFileSync(path.join(root, 'prisma/migrations/20260811160000_substrate_visual_identity/migration.sql'), 'utf8')
const compositionBar = fs.readFileSync(path.join(root, 'components/SubstrateCompositionBar.tsx'), 'utf8')
const recipeEditor = fs.readFileSync(path.join(root, 'components/SubstrateRecipeEditor.tsx'), 'utf8')

assert(actions.includes("status !== 'DRAFT'"), 'Published substrate recipe versions must reject in-place edits.')
assert(actions.includes('collectionId: collection.id'), 'Substrate actions must scope records to the active collection.')
assert(substrateHelper.includes('plantSubstrateHistory.create'), 'Substrate assignment must preserve history.')
assert(substrateHelper.includes('repottingCareEventId'), 'Substrate history must support linkage to repotting care events.')
assert(careActions.includes("taskType === 'REPOT'"), 'Care completion must support repotting.')
assert(careQueue.includes('recommendedSubstrateRecipeVersionId'), 'Repot tasks must expose ranked recommendations.')
assert(actions.includes('applyMagicSubstrateRecommendations'), 'Magic Fill substrate recommendations must have a direct persistence action.')
assert(schema.includes('substrateRecipeVersionId String?'), 'Care events must snapshot the substrate recipe version.')
assert(schema.includes('displayPattern'), 'Substrate components must persist their visual pattern.')
assert(visualMigration.includes("'perlite-fine', '#C7CBC4', 'DOTS'"), 'Visual migration must backfill deterministic starter identities.')
assert(compositionBar.includes('aria-label={`${label}. Total'), 'Composition bars need an accessible full-composition label.')
assert(compositionBar.includes("minWidth: row.percent > 0 ? '2px'"), 'Tiny recipe segments must remain represented.')
assert(compositionBar.includes('Unallocated'), 'Draft bars must show unallocated remainder.')
assert(recipeEditor.includes('allocation'), 'Recipe editor must visualize raw allocation without silent normalization.')
for (const match of migration.matchAll(/(?:INDEX|CONSTRAINT) "([^"]+)"/g)) {
  assert(match[1].length <= 63, `PostgreSQL identifier exceeds 63 characters: ${match[1]}`)
}

console.log('Substrate invariants passed.')
