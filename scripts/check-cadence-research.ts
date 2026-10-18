import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  validateRecommendations,
  explicitLegacyInterval,
  cadenceResearchInstructions,
} from '../lib/cadence-recommendations'
import {
  approveCadenceBatch,
  approveCadenceProposal,
  cadenceResearchContext,
  missingActivities,
  persistCadenceRecommendations,
  recoverLegacyCadences,
  researchDefinitionInclude,
} from '../lib/cadence-research'
import {
  enqueueCadenceResearch,
  processAiCuratorWake,
  recoverCadenceResearchLeases,
} from '../lib/ai-curator'
import { getCareQueue } from '../lib/care-queue'

const recommendation = {
  activity: 'WATERING',
  recommendedInterval: 10,
  recommendedUnit: 'DAY',
  confidence: 'MEDIUM',
  rationale:
    'Conservative starting interval; inspect moisture and adjust for substrate and season.',
  sourceReferences: [],
  applicability: 'RECOMMENDED',
}
assert.equal(
  validateRecommendations([recommendation], false)[0].recommendedInterval,
  10
)
for (const patch of [
  { recommendedInterval: 0 },
  { recommendedInterval: 1.2 },
  { recommendedInterval: '7' },
  { recommendedUnit: null },
  { activity: 'MIST' },
  { confidence: 'CERTAIN' },
  { applicability: 'NOT_APPLICABLE' },
])
  assert.throws(() =>
    validateRecommendations([{ ...recommendation, ...patch }], true)
  )
assert.equal(
  validateRecommendations(
    [{ ...recommendation, activity: 'FERTILIZING' }],
    false
  )[0].applicability,
  'BLOCKED_BY_DEPENDENCY'
)
assert.equal(
  validateRecommendations(
    [
      {
        ...recommendation,
        applicability: 'NOT_APPLICABLE',
        recommendedInterval: null,
        recommendedUnit: null,
      },
    ],
    false
  )[0].recommendedInterval,
  null
)
assert.deepEqual(
  explicitLegacyInterval('Every 18 months during active growth'),
  { interval: 18, unit: 'MONTH' }
)
assert.equal(explicitLegacyInterval('Every 2–3 weeks'), null)
assert.equal(explicitLegacyInterval('Moderate, allow to dry'), null)
assert.ok(cadenceResearchInstructions.includes('Never fabricate citations'))

assert.match(
  process.env.DATABASE_URL || '',
  /localhost:55439\/axildb(?:\?|$)/,
  'Use only the disposable local test database.'
)
const db = new PrismaClient()
async function main() {
  const stamp = Date.now()
  const user = await db.user.create({
    data: {
      email: `cadence-research-${stamp}@test.invalid`,
      passwordHash: 'fixture',
    },
  })
  const c = await db.collection.create({
    data: {
      name: 'Cadence research fixture',
      slug: `research-${stamp}`,
      aiFeaturesEnabled: true,
      aiCuratorEnabled: true,
    },
  })
  const settingsBefore = await db.aiCuratorSettings.findUnique({
    where: { id: 'global' },
  })
  const originalFetch = globalThis.fetch
  const originalKey = process.env.OPENAI_API_KEY
  try {
    const d = await db.plantDefinition.create({
      data: {
        collectionId: c.id,
        genus: 'Hoya',
        species: 'carnosa',
        notes: 'private acquisition data must not be sent',
        husbandryGuide: {
          create: {
            collectionId: c.id,
            wateringCadence: 'Every 10 days',
            repottingInterval: 'Every 2 years',
            growthHabit: 'Epiphytic climber',
          },
        },
      },
    })
    const save = (recommendations: unknown, source = 'MAGIC_FILL') =>
      persistCadenceRecommendations(db, {
        definitionId: d.id,
        collectionId: c.id,
        source,
        model: 'fixture-model',
        recommendations,
      })
    const [p] = await save([recommendation])
    assert.equal(p.source, 'MAGIC_FILL')
    assert.equal(
      await db.plantDefinitionCareCadence.count({
        where: { plantDefinitionId: d.id },
      }),
      0
    )
    assert.equal((await save([recommendation])).length, 0)
    assert.equal(
      await approveCadenceProposal(db, p.id, user.id, {
        interval: 14,
        unit: 'DAY',
      }),
      'APPROVED'
    )
    const reviewed = await db.careCadenceProposal.findUniqueOrThrow({
      where: { id: p.id },
    })
    assert.equal(reviewed.interval, 10)
    assert.equal(reviewed.approvedInterval, 14)
    assert.equal(reviewed.reviewedByUserId, user.id)
    assert.equal((await save([recommendation])).length, 0)
    const instance = await db.plantInstance.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        plantId: `RESEARCH-${stamp}`,
        instanceType: 'ACQUIRED',
      },
    })
    await db.plantCareEvent.create({
      data: {
        collectionId: c.id,
        plantInstanceId: instance.id,
        eventType: 'WATERED',
        performedAt: new Date('2026-10-01T12:00:00Z'),
      },
    })
    const queue = () =>
      getCareQueue(db, {
        collectionId: c.id,
        collectionSlug: c.slug,
        now: new Date('2026-10-18T12:00:00Z'),
        timezone: 'UTC',
      })
    assert.equal(
      (await queue()).find((r) => r.taskType === 'WATER')?.dueAt.toISOString(),
      '2026-10-15T00:00:00.000Z'
    )
    await db.plantInstanceCareCadenceOverride.create({
      data: {
        plantInstanceId: instance.id,
        activity: 'WATERING',
        mode: 'DISABLED',
      },
    })
    assert.equal(
      (await queue()).some((r) => r.taskType === 'WATER'),
      false
    )
    const recovered = await recoverLegacyCadences(db)
    assert.equal(recovered, 1)
    assert.equal(await recoverLegacyCadences(db), 0)
    const repot = await db.careCadenceProposal.findFirstOrThrow({
      where: { plantDefinitionId: d.id, source: 'LEGACY_RECOVERY' },
    })
    assert.equal(repot.unit, 'YEAR')
    assert.equal(repot.interval, 2)
    assert.ok(repot.rationale.includes('Recovered from previous cadence data'))
    await db.plantDefinitionCareCadence.create({
      data: {
        plantDefinitionId: d.id,
        activity: 'REPOTTING',
        interval: 3,
        unit: 'YEAR',
      },
    })
    assert.equal(
      await approveCadenceProposal(db, repot.id, user.id),
      'No longer pending'
    )
    const [pruning] = await save(
      [{ ...recommendation, activity: 'PRUNING' }],
      'AI_RESEARCH'
    )
    const results = await Promise.all([
      approveCadenceProposal(db, pruning.id, user.id),
      approveCadenceProposal(db, pruning.id, user.id),
    ])
    assert.equal(results.filter((r) => r === 'APPROVED').length, 1)
    assert.equal(
      await db.plantInstanceCareCadenceOverride.count({
        where: { plantInstanceId: instance.id, mode: 'DISABLED' },
      }),
      1
    )
    const recipe = await db.fertilizerRecipe.create({
      data: { collectionId: c.id, name: `Recipe ${stamp}` },
    })
    await db.plantHusbandryGuide.update({
      where: { plantDefinitionId: d.id },
      data: { fertilizerRecipeId: recipe.id },
    })
    const [fert] = await save([{ ...recommendation, activity: 'FERTILIZING' }])
    await db.plantHusbandryGuide.update({
      where: { plantDefinitionId: d.id },
      data: { fertilizerRecipeId: null },
    })
    const [inspection] = await save([
      { ...recommendation, activity: 'PEST_INSPECTION' },
    ])
    const batch = await approveCadenceBatch(
      db,
      [fert.id, inspection.id, p.id],
      user.id
    )
    assert.equal(batch.APPROVED, 1)
    assert.equal(batch['Fertilizer recipe is no longer assigned or active'], 1)
    assert.equal(batch['No longer pending'], 1)
    const [uncertain] = await save([
      {
        ...recommendation,
        activity: 'GENERAL_INSPECTION',
        applicability: 'INSUFFICIENT_INFORMATION',
        recommendedInterval: null,
        recommendedUnit: null,
      },
    ])
    let full = await db.plantDefinition.findUniqueOrThrow({
      where: { id: d.id },
      include: researchDefinitionInclude,
    })
    assert.deepEqual(missingActivities(full), [])
    assert.deepEqual(missingActivities(full, true), ['GENERAL_INSPECTION'])
    await db.careCadenceProposal.update({
      where: { id: uncertain.id },
      data: { status: 'REJECTED' },
    })
    const context = await cadenceResearchContext(db, c.id, d.id, true)
    assert.ok(!JSON.stringify(context).includes('private acquisition'))
    assert.ok(JSON.stringify(context).includes('Epiphytic climber'))
    const counts = await Promise.all([
      enqueueCadenceResearch(db, { definitionId: d.id, explicit: true }),
      enqueueCadenceResearch(db, { definitionId: d.id, explicit: true }),
    ])
    assert.equal(
      counts.reduce((a, b) => a + b, 0),
      1
    )
    let job = await db.aiCuratorJob.findFirstOrThrow({
      where: { plantDefinitionId: d.id, targetField: 'careCadences' },
    })
    assert.ok(job.priority >= 1000)
    await db.aiCuratorJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        claimedAt: new Date(Date.now() - 11 * 60_000),
        attempts: 1,
      },
    })
    assert.equal(await recoverCadenceResearchLeases(db), 1)
    job = await db.aiCuratorJob.findUniqueOrThrow({ where: { id: job.id } })
    assert.equal(job.status, 'DEFERRED')
    await db.aiCuratorJob.update({
      where: { id: job.id },
      data: { nextRetryAt: null },
    })
    await db.aiCuratorSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', enabled: true, model: 'fixture-model' },
      update: {
        enabled: true,
        model: 'fixture-model',
        concurrency: 1,
        dailyBudgetDollars: 100,
        monthlyBudgetDollars: 100,
      },
    })
    process.env.OPENAI_API_KEY = 'fixture-key'
    let providerCalls = 0
    globalThis.fetch = async (_url, init) => {
      providerCalls++
      const locks = await db.$queryRaw<Array<{ xact_start: Date | null }>>`
        SELECT activity.xact_start FROM pg_locks locks
        JOIN pg_stat_activity activity ON activity.pid = locks.pid
        WHERE locks.locktype = 'advisory' AND locks.classid = 186104
          AND locks.objid = 2 AND locks.granted`
      assert.equal(locks.length, 1, 'worker owns its serialization lock')
      assert.equal(locks[0].xact_start, null, 'no transaction held across provider HTTP')
      const payload = JSON.parse(String(init?.body))
      assert.ok(payload.instructions.includes('Never fabricate citations'))
      assert.ok(JSON.stringify(payload).includes('GENERAL_INSPECTION'))
      assert.ok(!JSON.stringify(payload).includes('private acquisition'))
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            suggestedValue: {
              careCadenceRecommendations: [
                { ...recommendation, activity: 'GENERAL_INSPECTION' },
              ],
            },
          }),
          usage: { input_tokens: 100, output_tokens: 100 },
        }),
        { status: 200 }
      )
    }
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: { dailyBudgetDollars: 0 },
    })
    assert.equal((await processAiCuratorWake(db)).status, 'WAITING')
    assert.equal(providerCalls, 0)
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: { dailyBudgetDollars: 100 },
    })
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 2)`
      assert.equal((await processAiCuratorWake(db)).status, 'WAITING')
      assert.equal(providerCalls, 0)
    })
    await processAiCuratorWake(db)
    assert.equal(providerCalls, 1)
    const [remainingLock] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'
        AND classid = 186104 AND objid = 2 AND granted`
    assert.equal(Number(remainingLock.count), 0, 'owned session closes after worker wake')
    const completedJob = await db.aiCuratorJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    assert.equal(completedJob.status, 'COMPLETED')
    assert.equal(
      await db.careCadenceProposal.count({
        where: { jobId: job.id, source: 'BULK_RESEARCH', status: 'PENDING' },
      }),
      1
    )
    assert.equal(
      await db.plantDefinitionCareCadence.count({
        where: { plantDefinitionId: d.id, activity: 'GENERAL_INSPECTION' },
      }),
      0
    )
    assert.equal(
      await db.aiUsageEvent.count({
        where: { collectionId: c.id, feature: 'AI_CURATOR' },
      }),
      1
    )
    const resultProposal = await db.careCadenceProposal.findFirstOrThrow({
      where: { jobId: job.id },
    })
    await db.careCadenceProposal.update({
      where: { id: resultProposal.id },
      data: { status: 'REJECTED' },
    })
    await enqueueCadenceResearch(db, { definitionId: d.id, explicit: true })
    await processAiCuratorWake(db)
    assert.equal(
      await db.aiCuratorJob.count({
        where: {
          plantDefinitionId: d.id,
          targetField: 'careCadences',
          status: 'COMPLETED',
        },
      }),
      2
    )
    // Provider failures back off and exhaust rather than losing work.
    await db.careCadenceProposal.updateMany({
      where: { plantDefinitionId: d.id, activity: 'GENERAL_INSPECTION' },
      data: { status: 'REJECTED' },
    })
    await enqueueCadenceResearch(db, { definitionId: d.id, explicit: true })
    globalThis.fetch = async () => {
      throw new Error('Simulated provider outage')
    }
    const retryJob = await db.aiCuratorJob.findFirstOrThrow({
      where: {
        plantDefinitionId: d.id,
        status: 'QUEUED',
        targetField: 'careCadences',
      },
    })
    await processAiCuratorWake(db)
    const deferred = await db.aiCuratorJob.findUniqueOrThrow({
      where: { id: retryJob.id },
    })
    assert.equal(deferred.status, 'DEFERRED')
    assert.ok(deferred.nextRetryAt)
    await db.aiCuratorJob.update({
      where: { id: retryJob.id },
      data: { nextRetryAt: null, attempts: deferred.maxAttempts - 1 },
    })
    await processAiCuratorWake(db)
    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: retryJob.id } }))
        .status,
      'WAITING_FOR_HUMAN'
    )
    const archivedDefinition = await db.plantDefinition.create({
      data: { collectionId: c.id, genus: 'Archive' },
    })
    await db.aiCuratorSuggestion.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: archivedDefinition.id,
        phase: 'ENRICHMENT',
        suggestionType: 'HUSBANDRY',
        targetField: 'husbandry',
        title: 'Archived guide',
        suggestedValue: {
          fields: {
            repottingInterval: 'Every 3 years',
            wateringCadence: 'Every 1.5 days',
          },
        },
        reasoning: 'Historical draft',
      },
    })
    assert.equal(await recoverLegacyCadences(db), 1)
    assert.equal(await recoverLegacyCadences(db), 0)
    const archivedProposal = await db.careCadenceProposal.findFirstOrThrow({
      where: { plantDefinitionId: archivedDefinition.id },
    })
    assert.equal(archivedProposal.unit, 'YEAR')
    assert.equal(archivedProposal.interval, 3)
    assert.equal(
      await db.plantCareEvent.count({
        where: { plantInstanceId: instance.id },
      }),
      1
    )
    console.log(
      'Cadence research: validation, recovery, missing-only persistence, edited/concurrent/partial approval, dependency changes, inheritance, priority, duplicate jobs, restart recovery, provider contract, usage and bounded retries passed.'
    )
  } catch (error) {
    console.error('TEST FAILURE:', error)
    throw error
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
      await tx.collection.delete({ where: { id: c.id } })
    })
    await db.user.delete({ where: { id: user.id } })
    if (settingsBefore)
      await db.aiCuratorSettings.update({
        where: { id: 'global' },
        data: settingsBefore,
      })
    else await db.aiCuratorSettings.deleteMany({ where: { id: 'global' } })
    await db.$disconnect()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
