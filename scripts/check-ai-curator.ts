import assert from 'node:assert/strict'
import { aiModelPricing, estimateAiCostDollars } from '../lib/ai-pricing'
import { aiCuratorChangedFields, canApplyCuratorSuggestion, curatorJobScope, curatorPriorityScore, effectiveAiCuratorSpend, hasAiCuratorSuggestionChange, suggestedScalarValue } from '../lib/ai-curator'

const baseline = curatorPriorityScore({
  completenessScore: 70,
  category: 'references',
  instanceCount: 1,
  estimatedCostDollars: 0.01,
})
const highImpact = curatorPriorityScore({
  completenessScore: 20,
  category: 'husbandry',
  instanceCount: 10,
  estimatedCostDollars: 0.01,
})
const manuallyRequested = curatorPriorityScore({
  completenessScore: 70,
  category: 'references',
  instanceCount: 1,
  estimatedCostDollars: 0.01,
  manualBoost: true,
})

assert.ok(highImpact > baseline, 'Lower-completeness, higher-instance work should rank above lower-value work.')
assert.ok(manuallyRequested > baseline, 'Research Now jobs should be boosted above ordinary readiness jobs.')
assert.ok(curatorPriorityScore({ completenessScore: 20, category: 'substrate', estimatedCostDollars: 0.01 }) < curatorPriorityScore({ completenessScore: 20, category: 'references', estimatedCostDollars: 0.01 }), 'Dependency readiness should penalize substrate work when the definition is too sparse.')
assert.deepEqual(aiModelPricing('gpt-5.4-mini'), { inputPerMillion: 0.25, outputPerMillion: 2.00 })
assert.equal(Number(estimateAiCostDollars(1_000_000, 1_000_000, 'gpt-5.4-mini').toFixed(2)), 2.25)
assert.equal(effectiveAiCuratorSpend([
  { actualCostDollars: '0.000625', estimatedCostDollars: '0.010000' },
  { actualCostDollars: null, estimatedCostDollars: '0.010000' },
  { actualCostDollars: '0.000000', estimatedCostDollars: '0.020000' },
]), 0.030625)
const currentTaxonomyContext = {
  focus: { targetField: 'taxonomy', currentValue: null },
  taxonomy: {
    genus: 'Hoya',
    species: 'lyi',
    hybridNotation: null,
    cultivarName: null,
    authority: null,
    confidence: 'UNCERTAIN',
    provisionalTaxon: null,
    identificationStatus: 'IDENTIFIED',
    cultivarRegistrationNumber: null,
    taxonomicPlacementJson: null,
  },
}
const repeatedTaxonomy = {
  genus: 'Hoya',
  species: 'lyi',
  hybridNotation: null,
  cultivarName: null,
  authority: null,
  confidence: 'UNCERTAIN',
  provisionalTaxon: null,
  identificationStatus: 'IDENTIFIED',
}
assert.equal(hasAiCuratorSuggestionChange(currentTaxonomyContext, repeatedTaxonomy, 'taxonomy'), false)
assert.equal(hasAiCuratorSuggestionChange(currentTaxonomyContext, null, 'taxonomy'), false)
assert.deepEqual(aiCuratorChangedFields(currentTaxonomyContext, { ...repeatedTaxonomy, authority: 'Kloppenb.' }, 'taxonomy'), ['authority'])
assert.equal(canApplyCuratorSuggestion('description'), true)
assert.equal(canApplyCuratorSuggestion('husbandry'), false)
assert.equal(suggestedScalarValue({ value: 'Begonia research draft' }), 'Begonia research draft')
assert.equal(suggestedScalarValue({ value: '   ' }), null)
assert.deepEqual(curatorJobScope({
  collectionId: 'collection-1',
  plantDefinitionId: 'definition-1',
  targetField: 'taxonomy',
}), {
  plantDefinitionId: 'definition-1',
  targetEntityType: 'PLANT_DEFINITION',
  targetEntityId: 'definition-1',
  targetField: 'taxonomy',
})
assert.deepEqual(curatorJobScope({
  collectionId: 'collection-1',
  targetField: 'stewardship',
}), {
  plantDefinitionId: null,
  targetEntityType: 'COLLECTION',
  targetEntityId: 'collection-1',
  targetField: 'stewardship',
})

console.log('AI Curator checks passed.')
