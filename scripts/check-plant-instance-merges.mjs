import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const schema = read('prisma/schema.prisma')
const migration = read('prisma/migrations/20260819120000_plant_instance_merges/migration.sql')
const action = read('app/plant-instance-merge-actions.ts')
const detail = read('app/instances/[id]/page.tsx')
const timeline = read('lib/timeline/plantTimeline.ts')

const checks = [
  ['immutable merge model', schema.includes('model PlantInstanceMerge') && schema.includes('model PlantInstanceMergeConstituent')],
  ['production migration', migration.includes('CREATE TABLE "PlantInstanceMerge"') && migration.includes('ON DELETE RESTRICT')],
  ['same-definition eligibility', action.includes('definitionIds.size !== 1')],
  ['active-only eligibility', action.includes("instance.status !== 'ACTIVE'")],
  ['historical constituent transition', action.includes('HISTORICAL_CONSTITUENT')],
  ['future reminders paused', action.includes('pausedAt: mergeDate')],
  ['open conditions carried forward', action.includes('plantCondition.update') && action.includes('Originally recorded on')],
  ['domain event emitted', action.includes("eventType: 'plant.merged'")],
  ['constituent read-only banner', detail.includes('Historical constituent') && detail.includes('Open surviving specimen')],
  ['survivor constituent panel', detail.includes('Potted-together history')],
  ['unified timeline', timeline.includes('timelineInstanceIds') && timeline.includes('originalPlantId')],
]

const failed = checks.filter(([, passed]) => !passed)
for (const [label, passed] of checks) console.log(`${passed ? 'ok' : 'FAIL'} - ${label}`)
if (failed.length) process.exit(1)
