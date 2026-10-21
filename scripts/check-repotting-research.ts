import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { enqueueDefinitionResearchNow, enqueueReadinessCuratorJobs, canApplyCuratorSuggestion } from '../lib/ai-curator'

assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/, 'Use the isolated local test database.')
const db = new PrismaClient()
let collectionId: string | undefined, windowId: string | undefined
async function main() {
  const collection = await db.collection.create({ data: { name: 'Seasonal research fixture', slug: `repot-research-${randomUUID()}`, aiFeaturesEnabled: true, aiCuratorEnabled: true, updatedAt: new Date(0) } })
  collectionId = collection.id
  const window = await db.repottingWindow.create({ data: { name: `Research fixture ${randomUUID()}`, startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 } })
  windowId = window.id
  const missing = await db.plantDefinition.create({ data: { collectionId, genus: 'Begonia', species: 'rex' } })
  const assigned = await db.plantDefinition.create({ data: { collectionId, genus: 'Hoya', species: 'carnosa', primaryRepottingWindowId: window.id } })
  const linked = await db.plantDefinition.create({ data: { collectionId, genus: 'Hoya', species: 'carnosa', cultivarName: 'Fixture', husbandryGuide: { create: { collectionId, sourcePlantDefinitionId: assigned.id } } } })
  const scope = { collectionId, jobType: 'REPOTTING_WINDOWS', targetField: 'repottingWindows' }
  await enqueueReadinessCuratorJobs(db, { collectionLimit: 1, definitionsPerCollection: 10 })
  const jobs = await db.aiCuratorJob.findMany({ where: scope })
  assert.deepEqual(jobs.map(job => job.plantDefinitionId).sort(), [missing.id, linked.id].sort(), 'Automatic research covers missing windows, including linked husbandry definitions; assigned windows are preserved')
  assert(jobs.every(job => job.phase === 'ENRICHMENT' && job.status === 'QUEUED'))
  await enqueueReadinessCuratorJobs(db, { collectionLimit: 1, definitionsPerCollection: 10 })
  assert.equal(await db.aiCuratorJob.count({ where: scope }), 2, 'Repeated automatic scans do not duplicate active research')
  await enqueueDefinitionResearchNow(db, collectionId, missing.id)
  assert.equal(await db.aiCuratorJob.count({ where: { ...scope, plantDefinitionId: missing.id } }), 1, 'Research Now reuses pending work')
  await enqueueDefinitionResearchNow(db, collectionId, assigned.id)
  const explicit = await db.aiCuratorJob.findFirstOrThrow({ where: { ...scope, plantDefinitionId: assigned.id } })
  assert.equal(explicit.priority, 1000, 'Explicit research includes seasonal windows even when assigned')
  assert.equal((await db.plantDefinition.findUniqueOrThrow({ where: { id: assigned.id } })).primaryRepottingWindowId, window.id, 'Research never applies or removes assignments automatically')
  assert.equal(canApplyCuratorSuggestion('repottingWindows'), true, 'Seasonal recommendations use the existing human approval path')
  await db.collection.update({ where: { id: collectionId }, data: { aiCuratorEnabled: false } })
  await enqueueReadinessCuratorJobs(db, { collectionLimit: 1 })
  assert.equal(await db.aiCuratorJob.count({ where: { ...scope, status: 'QUEUED' } }), 0, 'Collection opt-out defers seasonal work with other curator jobs')
  console.log('Repotting research checks passed: automatic missing-window research, linked husbandry independence, duplicate prevention, Research Now, existing assignment protection, review support and collection opt-out. No AI provider calls were made.')
}
main().finally(async () => {
  if (collectionId) await db.collection.delete({ where: { id: collectionId } })
  if (windowId) await db.repottingWindow.delete({ where: { id: windowId } })
  await db.$disconnect()
}).catch(error => { console.error(error); process.exitCode = 1 })
