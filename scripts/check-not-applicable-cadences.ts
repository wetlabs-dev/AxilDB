import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  cadenceActivities,
  cadenceDueAt,
  cadenceLabel,
  evaluateCareScheduleCompleteness,
  resolveCadence,
  supportsNotApplicable,
  validateCadenceState,
} from '../lib/care-cadences'
import { configureDefinitionCadence } from '../lib/care-cadence-service'
import { validateRecommendations } from '../lib/cadence-recommendations'
import {
  approveCadenceBatch,
  approveCadenceProposal,
  missingActivities,
  persistCadenceRecommendations,
  researchDefinitionInclude,
} from '../lib/cadence-research'
import {
  actionableCadenceWhere,
  isActionableCadenceProposal,
} from '../lib/cadence-review'
import { getCareQueue } from '../lib/care-queue'

assert.match(
  process.env.DATABASE_URL || '',
  /localhost:55439\/axildb(?:\?|$)/,
  'Use the disposable local database'
)
const na = (activity: string) => ({
  activity,
  status: 'NOT_APPLICABLE',
  interval: null,
  unit: null,
})
const scheduled = (activity: string) => ({
  activity,
  status: 'SCHEDULED',
  interval: 7,
  unit: 'DAY',
})
const full = cadenceActivities.map(({ activity }) =>
  supportsNotApplicable(activity) ? na(activity) : scheduled(activity)
)
assert.equal(evaluateCareScheduleCompleteness(full, [], false).complete, true)
assert.equal(evaluateCareScheduleCompleteness(full.slice(1)).resolved, 5)
assert.deepEqual(evaluateCareScheduleCompleteness([na('WATERING')]).invalid, [
  'WATERING',
])
assert.equal(
  evaluateCareScheduleCompleteness([
    { ...scheduled('WATERING'), interval: null },
  ]).complete,
  false
)
for (const { activity } of cadenceActivities) {
  if (supportsNotApplicable(activity))
    validateCadenceState(activity, 'NOT_APPLICABLE')
  else assert.throws(() => validateCadenceState(activity, 'NOT_APPLICABLE'))
}
assert.throws(() => validateCadenceState('PRUNING', 'NOT_APPLICABLE', 7, 'DAY'))
assert.throws(() => validateCadenceState('WATERING', 'SCHEDULED', 0, 'DAY'))
assert.equal(cadenceLabel(na('PRUNING')), 'Not applicable')
assert.equal(
  resolveCadence('PRUNING', [na('PRUNING')]).status,
  'NOT_APPLICABLE'
)
assert.equal(
  resolveCadence(
    'PRUNING',
    [na('PRUNING')],
    [{ activity: 'PRUNING', mode: 'OVERRIDE', interval: 3, unit: 'MONTH' }]
  ).cadence?.interval,
  3
)
assert.equal(
  resolveCadence(
    'REPOTTING',
    [scheduled('REPOTTING')],
    [
      {
        activity: 'REPOTTING',
        mode: 'NOT_APPLICABLE',
        interval: null,
        unit: null,
      },
    ]
  ).cadence,
  null
)
assert.equal(
  resolveCadence(
    'PRUNING',
    [na('PRUNING')],
    [{ activity: 'PRUNING', mode: 'DISABLED', interval: null, unit: null }]
  ).status,
  'NOT_SCHEDULED'
)
assert.equal(
  cadenceDueAt(new Date(), resolveCadence('PRUNING', [na('PRUNING')]).cadence),
  null
)
const recommendation = (
  activity: string,
  applicability = 'NOT_APPLICABLE'
) => ({
  activity,
  applicability,
  recommendedInterval: applicability === 'RECOMMENDED' ? 7 : null,
  recommendedUnit: applicability === 'RECOMMENDED' ? 'DAY' : null,
  confidence: 'MEDIUM',
  rationale:
    'Recurring care is inappropriate in the documented conditions; inspect and act when needed.',
  sourceReferences: [],
})
assert.equal(
  validateRecommendations([recommendation('FERTILIZING')], false)[0]
    .applicability,
  'NOT_APPLICABLE'
)
assert.equal(
  validateRecommendations(
    [recommendation('FERTILIZING', 'RECOMMENDED')],
    false
  )[0].applicability,
  'BLOCKED_BY_DEPENDENCY'
)
assert.throws(() => validateRecommendations([recommendation('WATERING')], true))
async function main() {
  const db = new PrismaClient()
  const c = await db.collection.create({
    data: { name: 'N/A regression', slug: `na-${Date.now()}` },
  })
  const user = await db.user.create({
    data: { email: `na-${Date.now()}@example.test`, passwordHash: 'fixture' },
  })
  try {
    const baseline = await db.plantDefinitionCareCadence.findUnique({
      where: { id: 'na-migration' },
    })
    if (baseline) {
      assert.equal(baseline.status, 'SCHEDULED')
      assert.equal(baseline.interval, 12)
      assert.equal(baseline.unit, 'MONTH')
      assert.equal(
        (
          await db.plantInstanceCareCadenceOverride.findUniqueOrThrow({
            where: { id: 'na-migration' },
          })
        ).mode,
        'DISABLED'
      )
      assert.equal(
        await db.plantDefinitionCareCadence.count({
          where: { plantDefinitionId: 'na-migration', activity: 'PRUNING' },
        }),
        0
      )
    }
    const d = await db.plantDefinition.create({
      data: { collectionId: c.id, genus: 'Test' },
    })
    const i = await db.plantInstance.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        plantId: 'N/A-1',
        instanceType: 'ACQUIRED',
      },
    })
    const configure = (
      activity: string,
      status: string,
      interval?: number,
      unit?: string
    ) =>
      db.$transaction((tx) =>
        configureDefinitionCadence(tx, {
          definitionId: d.id,
          activity,
          status,
          interval,
          unit,
        })
      )
    const queue = () =>
      getCareQueue(db, {
        collectionId: c.id,
        collectionSlug: c.slug,
        now: new Date('2026-10-18T12:00:00Z'),
        timezone: 'UTC',
      })
    await db.plantCareEvent.create({
      data: {
        collectionId: c.id,
        plantInstanceId: i.id,
        eventType: 'PRUNED',
        performedAt: new Date('2026-01-01'),
      },
    })
    await configure('PRUNING', 'SCHEDULED', 7, 'DAY')
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      1
    )
    await configure('PRUNING', 'NOT_APPLICABLE')
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      0
    )
    assert.equal(
      await db.plantCareEvent.count({ where: { plantInstanceId: i.id } }),
      1
    )
    await db.plantCareEvent.create({
      data: {
        collectionId: c.id,
        plantInstanceId: i.id,
        eventType: 'PRUNED',
        performedAt: new Date('2026-10-17'),
      },
    })
    assert.equal(
      (
        await db.plantDefinitionCareCadence.findFirstOrThrow({
          where: { plantDefinitionId: d.id, activity: 'PRUNING' },
        })
      ).status,
      'NOT_APPLICABLE'
    )
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      0
    )
    await db.plantInstanceCareCadenceOverride.create({
      data: {
        plantInstanceId: i.id,
        activity: 'PRUNING',
        mode: 'OVERRIDE',
        interval: 7,
        unit: 'DAY',
      },
    })
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      1
    )
    await db.plantInstanceCareCadenceOverride.deleteMany({
      where: { plantInstanceId: i.id },
    })
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      0
    )
    await configure('PRUNING', 'SCHEDULED', 7, 'DAY')
    await db.plantInstanceCareCadenceOverride.create({
      data: {
        plantInstanceId: i.id,
        activity: 'PRUNING',
        mode: 'NOT_APPLICABLE',
      },
    })
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      0
    )
    await db.plantInstanceCareCadenceOverride.deleteMany({
      where: { plantInstanceId: i.id },
    })
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      1
    )
    await configure('PRUNING', 'NOT_SCHEDULED')
    assert.equal(
      (await queue()).filter((q) => q.taskType === 'PRUNE').length,
      0
    )
    for (const activity of [
      'WATERING',
      'PEST_INSPECTION',
      'GENERAL_INSPECTION',
    ]) {
      await assert.rejects(configure(activity, 'NOT_APPLICABLE'))
      await assert.rejects(
        db.plantDefinitionCareCadence.create({
          data: { plantDefinitionId: d.id, ...na(activity) },
        })
      )
      await assert.rejects(
        db.plantInstanceCareCadenceOverride.create({
          data: { plantInstanceId: i.id, activity, mode: 'NOT_APPLICABLE' },
        })
      )
    }
    await assert.rejects(
      db.plantDefinitionCareCadence.create({
        data: { plantDefinitionId: d.id, ...na('PRUNING'), interval: 7 },
      })
    )
    await assert.rejects(configure('FERTILIZING', 'SCHEDULED', 7, 'DAY'))
    await configure('FERTILIZING', 'NOT_APPLICABLE')
    const recipe = await db.fertilizerRecipe.create({
      data: { collectionId: c.id, name: 'N/A transition recipe' },
    })
    const guide = await db.plantHusbandryGuide.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        fertilizerRecipeId: recipe.id,
      },
    })
    await configure('FERTILIZING', 'SCHEDULED', 7, 'DAY')
    await db.plantHusbandryGuide.update({
      where: { id: guide.id },
      data: { fertilizationCadenceDays: 9 },
    })
    assert.equal(
      (
        await db.plantDefinitionCareCadence.findFirstOrThrow({
          where: { plantDefinitionId: d.id, activity: 'FERTILIZING' },
        })
      ).interval,
      9,
      'Legacy sync preserves scheduled status with the new column'
    )
    await configure('FERTILIZING', 'NOT_APPLICABLE')
    await db.plantHusbandryGuide.update({
      where: { id: guide.id },
      data: { fertilizerRecipeId: null },
    })
    await db.fertilizerRecipe.update({
      where: { id: recipe.id },
      data: { active: false },
    })
    let definition = await db.plantDefinition.findUniqueOrThrow({
      where: { id: d.id },
      include: researchDefinitionInclude,
    })
    assert.ok(!missingActivities(definition).includes('FERTILIZING'))
    const save = (recommendations: unknown) =>
      persistCadenceRecommendations(db, {
        definitionId: d.id,
        collectionId: c.id,
        source: 'MAGIC_FILL',
        recommendations,
        explicit: true,
      })
    assert.equal(
      (await save([recommendation('FERTILIZING')])).length,
      0,
      'Magic Fill preserves explicit N/A'
    )
    await configure('FERTILIZING', 'NOT_SCHEDULED')
    const [fert, repot, water] = await save([
      recommendation('FERTILIZING'),
      recommendation('REPOTTING'),
      recommendation('WATERING', 'RECOMMENDED'),
      recommendation('GENERAL_INSPECTION', 'INSUFFICIENT_INFORMATION'),
    ])
    assert.equal(
      await db.careCadenceProposal.count({
        where: actionableCadenceWhere(c.id),
      }),
      3
    )
    assert.equal(await approveCadenceProposal(db, fert.id, user.id), 'APPROVED')
    assert.equal(
      (
        await db.plantDefinitionCareCadence.findFirstOrThrow({
          where: { plantDefinitionId: d.id, activity: 'FERTILIZING' },
        })
      ).status,
      'NOT_APPLICABLE'
    )
    assert.equal(
      await db.careCadenceProposal.count({
        where: actionableCadenceWhere(c.id),
      }),
      2
    )
    const result = await approveCadenceBatch(db, [repot.id, water.id], user.id)
    assert.equal(result.APPROVED, 2)
    assert.equal(
      await db.careCadenceProposal.count({
        where: actionableCadenceWhere(c.id),
      }),
      0
    )
    assert.equal(
      (
        await save(
          [recommendation('WATERING')].map((r) => ({
            ...r,
            activity: 'REPOTTING',
          }))
        )
      ).length,
      0
    )
    const [stale] = await save([recommendation('PRUNING')])
    await configure('PRUNING', 'NOT_SCHEDULED')
    assert.equal(
      await approveCadenceProposal(db, stale.id, user.id),
      'No longer pending'
    )
    const [rejected] = await save([recommendation('PRUNING')])
    await db.careCadenceProposal.update({
      where: { id: rejected.id },
      data: { status: 'REJECTED' },
    })
    assert.equal(
      await db.plantDefinitionCareCadence.count({
        where: { plantDefinitionId: d.id, activity: 'PRUNING' },
      }),
      0
    )
    assert.equal(
      await approveCadenceProposal(db, rejected.id, user.id),
      'No longer pending'
    )
    definition = await db.plantDefinition.findUniqueOrThrow({
      where: { id: d.id },
      include: researchDefinitionInclude,
    })
    assert.ok(!missingActivities(definition, true).includes('REPOTTING'))
    assert.equal(
      isActionableCadenceProposal(
        { ...rejected, status: 'PENDING' },
        definition
      ),
      true
    )
    assert.equal(
      await db.plantCareEvent.count({ where: { plantInstanceId: i.id } }),
      2
    )
    console.log(
      'N/A state validation, inheritance, completeness, migration preservation, recipe rules, recurring queue/history, Magic Fill, research exclusion, mixed approval, stale/rejected proposals and dashboard counts passed.'
    )
  } finally {
    await db.collection.delete({ where: { id: c.id } })
    await db.user.delete({ where: { id: user.id } })
    await db.$disconnect()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
