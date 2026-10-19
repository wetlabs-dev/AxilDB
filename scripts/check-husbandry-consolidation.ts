import { effectiveFertilizerAssignment } from '../lib/fertilizers'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  consolidationContext,
  compatibilityDimensions,
  validCompatibilityAssessment,
  validateHusbandryLinkProposal,
  lockHusbandryGraph,
  applyHusbandryLink,
  reviewHusbandryLink,
  husbandryGraphIssues,
  restoreIndependentHusbandry,
  guideQuality,
} from '../lib/husbandry-consolidation'
import {
  processAiCuratorWake,
  ensureAiCuratorSettings,
} from '../lib/ai-curator'
import { researchReviewQueues } from '../lib/dashboard-reviews'
const full = {
  summaryLight: 'Bright indirect light',
  summaryWater: 'Allow to dry completely between watering',
  mediumPreferred: 'Aerated bark mix',
  humidityRange: '50–70%',
  temperatureColdTolerance: 'Warm growing, above 18 C',
  dormancyBehavior: 'Slow winter growth without dry dormancy',
  fertilizationType: 'Balanced liquid feed',
  repottingRootSensitivity: 'Avoid root damage',
  growthHabit: 'Climbing vine',
  summaryCare: 'Support climbing stems and avoid waterlogged roots',
  reviewStatus: 'REVIEWED',
}
const assessment = (target: string, source: string) => ({
  shouldRecommendLink: true,
  compatible: true,
  evidenceSufficient: true,
  targetPlantDefinitionId: target,
  sourcePlantDefinitionId: source,
  confidence: 0.95,
  compatibleDimensions: Object.keys(compatibilityDimensions),
  similarities: [
    'Moisture, light and temperature guidance align under comparable conditions.',
  ],
  minorDifferences: [
    'Cultivar growth rates differ slightly without changing cultivation needs.',
  ],
  criticalDifferences: [],
  botanicalReasoning:
    'Documented cultivation requirements align across the evaluated dimensions, with no material conflict.',
  sourceQualityAssessment:
    'The source has a complete, internally consistent and reviewed care guide.',
  evidenceLimitations:
    'Cultivar-specific evidence remains limited; environmental assumptions must be reviewed.',
})
async function main() {
  const recipe={frequencyDays:14,strengthLabel:'Recipe strength'}
  assert.equal(effectiveFertilizerAssignment({sourcePlantDefinitionId:'source',fertilizerRecipe:recipe,fertilizationFrequency:'Every 2 days'}).cadenceDays,14,'Archived local text cannot silently replace recipe scheduling')
  assert.equal(effectiveFertilizerAssignment({sourcePlantDefinitionId:'source',fertilizerRecipe:recipe},{fertilizationCadenceDays:3}).cadenceDays,3,'Instance overrides remain authoritative')

  assert.match(
    process.env.DATABASE_URL || '',
    /localhost:55439\/axildb(?:\?|$)/
  )
  const db = new PrismaClient(),
    oldFetch = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY,
    settingsBefore = await db.aiCuratorSettings.findUnique({
      where: { id: 'global' },
    })
  const collection = await db.collection.create({
    data: {
      name: 'Consolidation regression',
      slug: `consolidation-${Date.now()}`,
      aiCuratorEnabled: true,
    },
  })
  const user = await db.user.create({
    data: {
      email: `consolidation-${Date.now()}@example.test`,
      passwordHash: 'fixture',
      role: 'SERVER_ADMIN',
    },
  })
  const create = async (name: string, guide: any = full) =>
    db.plantDefinition.create({
      data: {
        collectionId: collection.id,
        genus: 'Hoya',
        species: 'carnosa',
        cultivarName: name,
        ...(guide
          ? {
              husbandryGuide: {
                create: { collectionId: collection.id, ...guide },
              },
            }
          : {}),
      },
      include: { husbandryGuide: true },
    })
  const validate = (targetId: string, sourceId: string) =>
    validateHusbandryLinkProposal(db, {
      collectionId: collection.id,
      targetId,
      sourceId,
    })
  const propose = async (targetId: string, sourceId: string) =>
    db.$transaction(
      async (tx) => {
        await lockHusbandryGraph(tx, collection.id)
        const valid = await validateHusbandryLinkProposal(tx, {
          collectionId: collection.id,
          targetId,
          sourceId,
        })
        if (!valid.valid) return { valid: false, reason: valid.reason }
        const context = await consolidationContext(tx, collection.id, targetId)
        if (!context.candidates.some((c) => c.id === sourceId))
          return { valid: false, reason: 'No suitable candidate' }
        const value = assessment(targetId, sourceId)
        const row = await tx.aiCuratorSuggestion.create({
          data: {
            collectionId: collection.id,
            plantDefinitionId: targetId,
            phase: 'ENRICHMENT',
            suggestionType: 'HUSBANDRY_CONSOLIDATION',
            targetField: 'husbandryLink',
            title: `Link ${targetId} to ${sourceId}`,
            reasoning: value.botanicalReasoning,
            confidence: value.confidence,
            currentValue: JSON.parse(
              JSON.stringify({ consolidation: context })
            ),
            suggestedValue: value,
          },
        })
        return { valid: true, id: row.id }
      },
      { timeout: 30000 }
    )
  try {
    const a = await create('Complete A'),
      b = await create('Independent B')
    const recipe = await db.fertilizerRecipe.create({data:{collectionId:collection.id,name:'Independent target recipe',frequencyDays:21}})
    await db.plantHusbandryGuide.update({where:{plantDefinitionId:a.id},data:{fertilizerRecipeId:recipe.id,fertilizationCadenceDays:21}})
    await db.plantDefinitionCareCadence.create({
      data: {
        plantDefinitionId: a.id,
        activity: 'REPOTTING',
        status: 'NOT_APPLICABLE',
      },
    })
    const window = await db.repottingWindow.findFirstOrThrow({
      where: { isActive: true },
    })
    await db.plantDefinition.update({
      where: { id: a.id },
      data: { primaryRepottingWindowId: window.id },
    })
    const instance = await db.plantInstance.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId: a.id,
        plantId: 'CONS-1',
        instanceType: 'ACQUIRED',
        careCadenceOverrides: {
          create: {
            activity: 'WATERING',
            mode: 'OVERRIDE',
            interval: 2,
            unit: 'WEEK',
          },
        },
        husbandryOverride: {
          create: {
            collectionId: collection.id,
            summaryWater: 'Instance-specific moisture handling',
          },
        },
      },
    })
    await db.plantCareEvent.create({
      data: {
        collectionId: collection.id,
        plantInstanceId: instance.id,
        userId: user.id,
        eventType: 'WATERED',
      },
    })
    assert.equal(guideQuality(full).adequate, true)
    const context = await consolidationContext(db, collection.id, a.id)
    assert.ok(
      context.candidates.some((c) => c.id === b.id),
      'Completed targets may be compared'
    )
    assert.equal(
      validCompatibilityAssessment(
        { ...assessment(a.id, b.id), compatible: false },
        a.id,
        context.candidates
      ),
      false
    )
    assert.equal(
      validCompatibilityAssessment(
        {
          ...assessment(a.id, b.id),
          criticalDifferences: ['Cool/moist versus warm/dry'],
        },
        a.id,
        context.candidates
      ),
      false
    )
    assert.equal(
      validCompatibilityAssessment(
        { ...assessment(a.id, b.id), evidenceSufficient: false },
        a.id,
        context.candidates
      ),
      false
    )
    assert.equal(
      validCompatibilityAssessment(
        { ...assessment(a.id, b.id), sourcePlantDefinitionId: 'invented' },
        a.id,
        context.candidates
      ),
      false
    )
    await ensureAiCuratorSettings(db)
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: {
        enabled: true,
        concurrency: 1,
        dailyBudgetDollars: 1000,
        monthlyBudgetDollars: 10000,
      },
    })
    process.env.OPENAI_API_KEY = 'fixture'
    let calls = 0
    globalThis.fetch = async (_url, init) => {
      calls++
      const request = JSON.parse(String(init?.body)),
        ctx = JSON.parse(request.input[0].content[0].text).context
      assert.ok(ctx.consolidation.candidates.some((c: any) => c.id === b.id))
      return new Response(
        JSON.stringify({
          status: 'completed',
          output_text: JSON.stringify({
            title: 'Consolidate complete cultivar husbandry',
            reasoning: assessment(a.id, b.id).botanicalReasoning,
            confidence: 0.95,
            suggestedValue: assessment(a.id, b.id),
          }),
          usage: { input_tokens: 100, output_tokens: 200 },
        }),
        { status: 200 }
      )
    }
    await db.aiCuratorJob.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId: a.id,
        phase: 'ENRICHMENT',
        jobType: 'HUSBANDRY_CONSOLIDATION',
        targetField: 'husbandryLink',
        targetEntityType: 'PLANT_DEFINITION',
        targetEntityId: a.id,
        status: 'QUEUED',
        priority: 1e9,
      },
    })
    await processAiCuratorWake(db)
    assert.equal(calls, 1)
    const proposal = await db.aiCuratorSuggestion.findFirstOrThrow({
      where: {
        plantDefinitionId: a.id,
        targetField: 'husbandryLink',
        status: 'PENDING',
      },
    })
    assert.equal(
      (
        await db.plantHusbandryGuide.findUniqueOrThrow({
          where: { plantDefinitionId: a.id },
        })
      ).sourcePlantDefinitionId,
      null,
      'Research never links'
    )
    const c = await create('Complete C')
    assert.equal(
      (await validate(c.id, a.id)).valid,
      false,
      'Pending A→B forbids C→A'
    )
    assert.equal(
      (await validate(b.id, a.id)).valid,
      false,
      'Pending cycles are blocked'
    )
    assert.equal((await validate(a.id, a.id)).valid, false)
    assert.equal((await validate(c.id, b.id)).valid, true)
    assert.equal(
      (await propose(a.id, c.id)).valid,
      false,
      'Competing active sources cannot coexist'
    )
    const cp = await propose(c.id, b.id)
    assert.ok(cp.valid)
    assert.equal(
      (await researchReviewQueues(db, collection.id, collection.slug, true))[0]
        .count,
      2
    )
    const approvals = await Promise.all([
      reviewHusbandryLink(db, proposal.id, user.id, 'ACCEPT'),
      reviewHusbandryLink(db, cp.id!, user.id, 'ACCEPT'),
    ])
    assert.deepEqual(
      approvals.map((r) => r.status),
      ['ACCEPTED', 'ACCEPTED']
    )
    const linked = await db.plantHusbandryGuide.findUniqueOrThrow({
      where: { plantDefinitionId: a.id },
    })
    assert.equal(linked.sourcePlantDefinitionId, b.id)
    assert.equal(linked.fertilizerRecipeId, recipe.id)
    assert.equal(linked.fertilizationCadenceDays,21)
    assert.equal(linked.summaryWater, full.summaryWater)
    assert.equal(linked.repottingRootSensitivity, full.repottingRootSensitivity)
    const archive = await db.auditLog.findFirstOrThrow({
      where: { entityId: linked.id, action: 'LINK' },
    })
    assert.equal(
      JSON.parse(archive.metadata!).previousGuide.summaryWater,
      full.summaryWater
    )
    assert.equal(
      (await validate(b.id, a.id)).valid,
      false,
      'Actual consumer cannot be a source'
    )
    assert.equal(
      (await validate(b.id, c.id)).valid,
      false,
      'Source with actual dependents cannot become a consumer'
    )
    assert.equal(
      (await db.plantDefinition.findUniqueOrThrow({ where: { id: a.id } }))
        .primaryRepottingWindowId,
      window.id
    )
    assert.equal(
      (
        await db.plantDefinitionCareCadence.findFirstOrThrow({
          where: { plantDefinitionId: a.id, activity: 'REPOTTING' },
        })
      ).status,
      'NOT_APPLICABLE'
    )
    assert.equal(
      (
        await db.plantInstanceCareCadenceOverride.findFirstOrThrow({
          where: { plantInstanceId: instance.id },
        })
      ).interval,
      2
    )
    assert.equal(
      (
        await db.plantHusbandryOverride.findUniqueOrThrow({
          where: { plantInstanceId: instance.id },
        })
      ).summaryWater,
      'Instance-specific moisture handling'
    )
    assert.equal(
      await db.plantCareEvent.count({
        where: { plantInstanceId: instance.id },
      }),
      1
    )
    assert.equal(
      (await reviewHusbandryLink(db, proposal.id, user.id, 'ACCEPT')).status,
      'UNCHANGED'
    )
    await db.$transaction((tx) =>
      restoreIndependentHusbandry(tx, {
        collectionId: collection.id,
        targetId: a.id,
        userId: user.id,
      })
    )
    assert.equal(
      (
        await db.plantHusbandryGuide.findUniqueOrThrow({
          where: { plantDefinitionId: a.id },
        })
      ).sourcePlantDefinitionId,
      null
    )
    const stale = await propose(a.id, b.id)
    assert.ok(stale.valid)
    await db.plantHusbandryGuide.update({
      where: { plantDefinitionId: b.id },
      data: { summaryLight: 'Source changed materially after research' },
    })
    assert.equal(
      (await reviewHusbandryLink(db, stale.id!, user.id, 'ACCEPT')).status,
      'STALE'
    )
    assert.equal(
      (
        await db.plantHusbandryGuide.findUniqueOrThrow({
          where: { plantDefinitionId: a.id },
        })
      ).sourcePlantDefinitionId,
      null
    )
    const rejected = await propose(a.id, b.id)
    assert.ok(rejected.valid)
    assert.equal((await validate(c.id, a.id)).valid, false)
    await reviewHusbandryLink(db, rejected.id!, user.id, 'REJECT')
    const d = await create('Complete D')
    assert.equal(
      (await validate(d.id, a.id)).valid,
      true,
      'Rejection releases pending source reservations'
    )
    const empty = await create('No guide', null),
      partial = await create('Partial guide', { summaryWater: 'Allow drying' })
    assert.ok(
      (await consolidationContext(db, collection.id, empty.id)).candidates.some(
        (x) => x.id === b.id
      )
    )
    assert.ok(
      (
        await consolidationContext(db, collection.id, partial.id)
      ).candidates.some((x) => x.id === b.id)
    )
    const moist = await create('Moist specialist', {
      ...full,
      summaryWater: 'Keep consistently moist; never dry',
    })
    assert.equal(
      (await consolidationContext(db, collection.id, moist.id)).candidates.some(
        (x) => x.id === b.id
      ),
      false,
      'Genus similarity cannot override incompatible moisture'
    )
    const x = await create('Race X'),
      y = await create('Race Y'),
      z = await create('Race Z')
    const racing = await Promise.all([propose(x.id, y.id), propose(z.id, x.id)])
    assert.equal(
      racing.filter((r) => r.valid).length,
      1,
      'Concurrent proposals cannot establish potential chains'
    )
    const m = await create('Manual M'),
      n = await create('Manual N'),
      o = await create('Manual O')
    const manual = await Promise.allSettled([
      db.$transaction((tx) =>
        applyHusbandryLink(tx, {
          collectionId: collection.id,
          targetId: m.id,
          sourceId: n.id,
          userId: user.id,
        })
      ),
      db.$transaction((tx) =>
        applyHusbandryLink(tx, {
          collectionId: collection.id,
          targetId: o.id,
          sourceId: m.id,
          userId: user.id,
        })
      ),
    ])
    assert.equal(
      manual.filter((r) => r.status === 'fulfilled').length,
      1,
      'Concurrent manual links cannot create chains'
    )
    assert.equal((await husbandryGraphIssues(db, collection.id)).length, 0)
    const badContexts = await Promise.all([
      consolidationContext(db, collection.id, a.id),
      consolidationContext(db, collection.id, d.id),
    ])
    assert.ok(badContexts[0].candidates.some((c) => c.id === d.id))
    assert.ok(badContexts[1].candidates.some((c) => c.id === b.id))
    const legacyBatch = []
    for (const [index, target, source] of [
      [0, a.id, d.id],
      [1, d.id, b.id],
    ] as const) {
      legacyBatch.push(
        await db.aiCuratorSuggestion.create({
          data: {
            collectionId: collection.id,
            plantDefinitionId: target,
            phase: 'ENRICHMENT',
            suggestionType: 'HUSBANDRY_CONSOLIDATION',
            targetField: 'husbandryLink',
            title: 'Legacy contradictory batch',
            reasoning: 'Legacy dependency fixture',
            confidence: 0.95,
            currentValue: JSON.parse(
              JSON.stringify({ consolidation: badContexts[index] })
            ),
            suggestedValue: assessment(target, source),
          },
        })
      )
    }
    const batchResults = []
    for (const p of legacyBatch)
      batchResults.push(await reviewHusbandryLink(db, p.id, user.id, 'ACCEPT'))
    assert.equal(
      batchResults.filter((r) => r.status === 'ACCEPTED').length,
      1,
      'A contradictory batch cannot apply both edges'
    )
    assert.equal(batchResults.filter((r) => r.status === 'STALE').length, 1)
    assert.equal((await husbandryGraphIssues(db, collection.id)).length, 0)

    await db.plantHusbandryGuide.update({
      where: { plantDefinitionId: c.id },
      data: { sourcePlantDefinitionId: a.id },
    })
    await db.plantHusbandryGuide.update({
      where: { plantDefinitionId: a.id },
      data: { sourcePlantDefinitionId: b.id },
    })
    assert.ok(
      (await husbandryGraphIssues(db, collection.id)).length > 0,
      'Legacy chains are reported without rewriting'
    )
    assert.equal(
      (
        await db.plantHusbandryGuide.findUniqueOrThrow({
          where: { plantDefinitionId: c.id },
        })
      ).sourcePlantDefinitionId,
      a.id
    )
    console.log(
      'Consolidation: complete/partial/missing eligibility, bounded mock AI research, critical conflicts, actual/pending graphs, concurrent creation/manual links/approvals, duplicate protection, stale rejection, dashboard counts, archive restoration and cadence/window/instance/history preservation passed.'
    )
  } finally {
    globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = oldKey
    await db.collection.delete({ where: { id: collection.id } })
    await db.user.delete({ where: { id: user.id } })
    if (settingsBefore) {
      const { id, createdAt, updatedAt, ...data } = settingsBefore
      await db.aiCuratorSettings.update({ where: { id }, data })
    }
    await db.$disconnect()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
