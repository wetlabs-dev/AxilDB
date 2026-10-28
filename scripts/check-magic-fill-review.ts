import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { validateRecommendations } from '../lib/cadence-recommendations'
import { persistCadenceRecommendations, approveCadenceProposal, magicFillReplacementBaseline } from '../lib/cadence-research'
import { applyMagicFillTags } from '../lib/magic-fill-tags'
import { plantTagConfiguration } from '../lib/plant-tags'

const url = new URL(process.env.DATABASE_URL || '')
assert.ok(url.hostname === 'localhost' && url.port === '55439' && url.pathname === '/axildb', 'Disposable database only')
async function main() {
const db = new PrismaClient()
const collection = await db.collection.create({ data: { name: 'Magic review fixture', slug: `magic-review-${randomUUID()}` } })
const user = await db.user.create({ data: { email: `magic-${randomUUID()}@example.test`, passwordHash: 'fixture' } })
const recommendation = (activity: string, applicability = 'RECOMMENDED', interval: number | null = 7) => ({ activity, applicability, recommendedInterval: applicability === 'RECOMMENDED' ? interval : null, recommendedUnit: applicability === 'RECOMMENDED' ? 'DAY' : null, confidence: 'HIGH', rationale: `Fixture evidence for ${activity}`, sourceReferences: [] })
try {
  const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Magic', species: 'testii', careCadences: { create: { activity: 'WATERING', interval: 10, unit: 'DAY' } } } })
  const plant = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: 'MAGIC-001', instanceType: 'ACQUIRED', careCadenceOverrides: { create: { activity: 'WATERING', mode: 'OVERRIDE', interval: 15, unit: 'DAY' } } } })
  const overrides = await db.plantInstanceCareCadenceOverride.findMany({ where: { plantInstanceId: plant.id } })
  for (const activity of ['WATERING', 'PEST_INSPECTION', 'GENERAL_INSPECTION']) assert.throws(() => validateRecommendations([recommendation(activity, 'NOT_APPLICABLE')], false))
  for (const activity of ['FERTILIZING', 'REPOTTING', 'PRUNING']) assert.equal(validateRecommendations([recommendation(activity, 'NOT_APPLICABLE')], false)[0].applicability, 'NOT_APPLICABLE')
  const blocked = validateRecommendations([recommendation('FERTILIZING')], false)[0]
  assert.equal(blocked.applicability, 'BLOCKED_BY_DEPENDENCY'); assert.equal(blocked.recommendedInterval, null)
  assert.throws(() => validateRecommendations([recommendation('WATERING', 'RECOMMENDED', 0)], false))
  const research = () => persistCadenceRecommendations(db, { definitionId: definition.id, collectionId: collection.id, recommendations: [recommendation('WATERING'), recommendation('PEST_INSPECTION'), recommendation('GENERAL_INSPECTION'), recommendation('REPOTTING', 'NOT_APPLICABLE'), recommendation('PRUNING', 'NOT_APPLICABLE'), recommendation('FERTILIZING')], source: 'MAGIC_FILL', reviewConfigured: true })
  const first = await research(), second = await research()
  assert.equal(first.length, 6)
  assert.equal(new Set([...first, ...second].filter(row => ['RECOMMENDED', 'NOT_APPLICABLE'].includes(row.applicability)).map(row => row.id)).size, 5, 'Actionable pending proposals are reused')
  assert.equal(await db.plantDefinitionCareCadence.count({ where: { plantDefinitionId: definition.id } }), 1, 'Research never applies decisions')
  let water = second.find(row => row.activity === 'WATERING')!
  assert.equal(await approveCadenceProposal(db, water.id, user.id), 'Already configured')
  assert.equal((await db.plantDefinitionCareCadence.findFirstOrThrow({ where: { plantDefinitionId: definition.id, activity: 'WATERING' } })).interval, 10)
  water = (await research()).find(row => row.activity === 'WATERING')!
  const baseline = magicFillReplacementBaseline(water.reviewNote)!
  await db.plantDefinitionCareCadence.updateMany({ where: { plantDefinitionId: definition.id, activity: 'WATERING' }, data: { interval: 12 } })
  assert.match(await approveCadenceProposal(db, water.id, user.id, undefined, { expected: baseline }), /changed|No longer pending/)
  assert.equal((await db.plantDefinitionCareCadence.findFirstOrThrow({ where: { plantDefinitionId: definition.id, activity: 'WATERING' } })).interval, 12)
  water = (await research()).find(row => row.activity === 'WATERING')!
  assert.equal(await approveCadenceProposal(db, water.id, user.id, undefined, { expected: magicFillReplacementBaseline(water.reviewNote)! }), 'APPROVED')
  assert.equal((await db.plantDefinitionCareCadence.findFirstOrThrow({ where: { plantDefinitionId: definition.id, activity: 'WATERING' } })).interval, 7)
  assert.deepEqual(await db.plantInstanceCareCadenceOverride.findMany({ where: { plantInstanceId: plant.id } }), overrides)
  const pest = second.find(row => row.activity === 'PEST_INSPECTION')!
  await Promise.all([1, 2].map(() => approveCadenceProposal(db, pest.id, user.id)))
  assert.equal(await db.plantDefinitionCareCadence.count({ where: { plantDefinitionId: definition.id, activity: 'PEST_INSPECTION' } }), 1)
  const fert = (await research()).find(row => row.activity === 'FERTILIZING')!
  assert.equal(await approveCadenceProposal(db, fert.id, user.id), 'No actionable recommendation')
  assert.equal(await db.plantDefinitionCareCadence.count({ where: { plantDefinitionId: definition.id, activity: 'FERTILIZING' } }), 0)
  const na = second.find(row => row.activity === 'PRUNING')!
  assert.equal(await approveCadenceProposal(db, na.id, user.id), 'APPROVED')
  assert.equal((await db.plantDefinitionCareCadence.findFirstOrThrow({ where: { plantDefinitionId: definition.id, activity: 'PRUNING' } })).status, 'NOT_APPLICABLE')

  const apply = (suggestions: Array<Record<string, unknown>>, existingIds: string[] = [], definitionId = definition.id) => applyMagicFillTags(db, { collectionId: collection.id, definitionId, userId: user.id, userRole: user.role, suggestions, existingIds })
  const configured = { name: 'Golden Growth', category: 'COLOR_EFFECT', icon: 'gem', colorToken: 'amber', description: 'Reviewed botanical description', publicVisible: false }
  const [privateTag] = await apply([configured])
  for (const [key, value] of Object.entries(configured)) assert.equal(privateTag[key as keyof typeof privateTag], value)
  const [publicTag] = await apply([{ name: 'Public default' }]); assert.equal(publicTag.publicVisible, true)
  const before = await db.plantTag.findUniqueOrThrow({ where: { id: privateTag.id } })
  const [reused] = await apply([{ ...configured, name: '  GOLDEN   growth ', publicVisible: true, icon: 'sun', colorToken: 'fern' }])
  assert.equal(reused.id, privateTag.id); assert.deepEqual(await db.plantTag.findUniqueOrThrow({ where: { id: reused.id } }), before)
  const concurrent = await Promise.all([1, 2].map(() => apply([{ name: 'Concurrent Tag' }])))
  assert.equal(concurrent[0][0].id, concurrent[1][0].id)
  assert.equal(await db.plantTag.count({ where: { collectionId: collection.id, slug: 'concurrent-tag' } }), 1)
  assert.equal(await db.plantDefinitionTag.count({ where: { plantDefinitionId: definition.id, plantTagId: concurrent[0][0].id } }), 1)
  await assert.rejects(apply([{ name: 'Must roll back' }], ['foreign-tag']))
  assert.equal(await db.plantTag.count({ where: { collectionId: collection.id, slug: 'must-roll-back' } }), 0)
  await assert.rejects(apply([{ name: 'Bad icon', icon: 'not-a-real-icon' }]))
  await db.plantTag.update({ where: { id: publicTag.id }, data: { active: false } })
  await assert.rejects(apply([{ name: 'Public default' }]))
  assert.equal(plantTagConfiguration({ name: 'Old format', icon: 'bogus', colorToken: 'bogus' }).icon, 'tag')
  assert.equal(plantTagConfiguration({ name: 'Old format' }).publicVisible, true)
  assert.equal(await db.plantTag.count({ where: { collectionId: collection.id, publicVisible: true, id: privateTag.id } }), 0)
  console.log('Magic Fill review: canonical cadence states/dependencies, no auto-apply, deduplication, explicit/stale replacements, preserved overrides, concurrent approvals, tag configuration/visibility/reuse/concurrent creation/atomic assignment passed.')
} finally { await db.collection.delete({ where: { id: collection.id } }); await db.user.delete({ where: { id: user.id } }); await db.$disconnect() }

}
main().catch(error => { console.error(error); process.exitCode = 1 })
