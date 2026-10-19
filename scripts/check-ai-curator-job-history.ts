import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import {
  ensureAiCuratorSettings,
  processAiCuratorWake,
} from '../lib/ai-curator'
import {
  retryCuratorJob,
  retryDatabaseBlockedCuratorJobs,
  isCuratorHistoryConflict,
} from '../lib/ai-curator-job-recovery'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const db = new PrismaClient()
const sql = awaitRead()
function awaitRead() {
  return readFile(
    'prisma/migrations/20261019160000_curator_terminal_history/migration.sql',
    'utf8'
  )
}
const error =
  'Unique constraint failed on the fields: (`collectionId`,`jobType`,`phase`,`plantDefinitionId`,`targetEntityType`,`targetEntityId`,`targetField`,`status`)'
assert.equal(isCuratorHistoryConflict(error), true)
assert.equal(
  isCuratorHistoryConflict('Unique constraint failed on (email)'),
  false
)
async function main() {
  const c = await db.collection.create({
    data: {
      name: 'Curator history regression',
      slug: `curator-history-${Date.now()}`,
      aiCuratorEnabled: true,
    },
  })
  const settingsBefore = await db.aiCuratorSettings.findUnique({
    where: { id: 'global' },
  })
  const fetchBefore = globalThis.fetch,
    keyBefore = process.env.OPENAI_API_KEY
  try {
    const d = await db.plantDefinition.create({
      data: { collectionId: c.id, genus: 'Begonia', cultivarName: 'Fixture' },
    })
    const scope = {
      collectionId: c.id,
      plantDefinitionId: d.id,
      jobType: 'REFERENCE_RESEARCH',
      phase: 'ENRICHMENT',
      targetEntityType: 'PLANT_DEFINITION',
      targetEntityId: d.id,
      targetField: 'references',
      priority: 1e9,
    }
    await db.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "Curator_legacy_fixture" ON "AiCuratorJob" ("collectionId","jobType",phase,"plantDefinitionId","targetEntityType","targetEntityId","targetField",status)'
    )
    await db.$executeRawUnsafe('ALTER TABLE "AiCuratorJob" ADD CONSTRAINT "Curator_legacy_constraint_fixture" UNIQUE ("collectionId","jobType",phase,"plantDefinitionId","targetEntityType","targetEntityId","targetField",status)')
    const old = await db.aiCuratorJob.create({
      data: {
        ...scope,
        status: 'SKIPPED',
        completedAt: new Date(),
        resultSummary: 'Preserve historical skip',
      },
    })
    const blocked = await db.aiCuratorJob.create({
      data: { ...scope, status: 'RUNNING' },
    })
    await assert.rejects(
      db.aiCuratorJob.update({
        where: { id: blocked.id },
        data: { status: 'SKIPPED' },
      }),
      (e: any) => e.code === 'P2002'
    )
    await db.aiCuratorJob.update({
      where: { id: blocked.id },
      data: { status: 'WAITING_FOR_HUMAN', attempts: 3, blockingReason: error },
    })
    await assert.rejects(
      retryCuratorJob(db, blocked.id),
      /Deploy the Curator database repair/
    )
    await db.$executeRawUnsafe(await sql)
    const [remaining] = await db.$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM pg_indexes WHERE indexname IN ('Curator_legacy_fixture','Curator_legacy_constraint_fixture')`
    assert.equal(Number(remaining.count),0)

    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: old.id } }))
        .resultSummary,
      'Preserve historical skip'
    )
    assert.equal(await retryCuratorJob(db, blocked.id), 'QUEUED')
    const queued = await db.aiCuratorJob.findUniqueOrThrow({
      where: { id: blocked.id },
    })
    assert.equal(queued.attempts, 0)
    assert.equal(queued.claimedAt, null)
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
    let calls = 0,
      result: any = {
        suggestedValue: null,
        reasoning: 'No change required',
        confidence: 0.9,
        title: 'No change',
      }
    globalThis.fetch = async () => {
      calls++
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify(result),
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
        { status: 200 }
      )
    }
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: { dailyBudgetDollars: 0 },
    })
    assert.equal((await processAiCuratorWake(db)).status, 'WAITING')
    assert.equal(calls, 0, 'Explicit retry still obeys the budget')
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: { dailyBudgetDollars: 1000 },
    })
    await processAiCuratorWake(db)
    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: blocked.id } }))
        .status,
      'SKIPPED'
    )
    assert.equal(
      await db.aiCuratorJob.count({ where: { ...scope, status: 'SKIPPED' } }),
      2
    )
    const create = await db.aiCuratorJob.create({
      data: { ...scope, status: 'QUEUED' },
    })
    result = {
      suggestedValue: {
        description: 'A botanical description for the fixture.',
      },
      reasoning: 'Useful missing description',
      confidence: 0.9,
      title: 'Description',
    }
    await processAiCuratorWake(db)
    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: create.id } }))
        .status,
      'COMPLETED'
    )
    const second = await db.aiCuratorJob.create({
      data: { ...scope, status: 'QUEUED' },
    })
    await processAiCuratorWake(db)
    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: second.id } }))
        .status,
      'COMPLETED'
    )
    assert.equal(
      await db.aiCuratorSuggestion.count({
        where: { plantDefinitionId: d.id },
      }),
      2
    )
    const recovered = await db.aiCuratorJob.create({
      data: { ...scope, status: 'WAITING_FOR_HUMAN', blockingReason: error },
    })
    const suggestion = await db.aiCuratorSuggestion.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        jobId: recovered.id,
        phase: scope.phase,
        suggestionType: scope.jobType,
        targetField: 'references',
        title: 'Existing result',
        suggestedValue: { description: 'Preserve existing output' },
        reasoning: 'Previously persisted result',
        status: 'PENDING',
      },
    })
    const countBefore = calls
    assert.equal(await retryCuratorJob(db, recovered.id), 'RECOVERED')
    assert.equal(calls, countBefore)
    assert.equal(
      (
        await db.aiCuratorSuggestion.findUniqueOrThrow({
          where: { id: suggestion.id },
        })
      ).status,
      'PENDING'
    )
    const cadence = await db.aiCuratorJob.create({
      data: {
        ...scope,
        jobType: 'CADENCE_RESEARCH',
        targetField: 'careCadences',
        status: 'WAITING_FOR_HUMAN',
        blockingReason: error,
      },
    })
    await db.careCadenceProposal.create({
      data: {
        plantDefinitionId: d.id,
        jobId: cadence.id,
        activity: 'PRUNING',
        applicability: 'NOT_APPLICABLE',
        confidence: 'MEDIUM',
        rationale: 'Condition based care',
        sourceReferences: [],
        source: 'AI_RESEARCH',
      },
    })
    assert.equal(await retryCuratorJob(db, cadence.id), 'RECOVERED')
    assert.equal(calls, countBefore)
    const atomic = await db.aiCuratorJob.create({
      data: { ...scope, jobType: 'ATOMIC_FIXTURE', status: 'QUEUED' },
    })
    await db.$executeRawUnsafe(
      `CREATE FUNCTION curator_history_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${atomic.id}' AND NEW.status='COMPLETED' THEN RAISE EXCEPTION 'Fixture completion failure'; END IF; RETURN NEW; END $$`
    )
    await db.$executeRawUnsafe(
      'CREATE TRIGGER curator_history_test_failure BEFORE UPDATE ON "AiCuratorJob" FOR EACH ROW EXECUTE FUNCTION curator_history_test_failure()'
    )
    try {
      await processAiCuratorWake(db)
      assert.equal(
        (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: atomic.id } }))
          .status,
        'DEFERRED'
      )
      assert.equal(
        await db.aiCuratorSuggestion.count({ where: { jobId: atomic.id } }),
        0,
        'A failed completion must roll back its suggestion'
      )
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER curator_history_test_failure ON "AiCuratorJob"'
      )
      await db.$executeRawUnsafe('DROP FUNCTION curator_history_test_failure()')
    }
    const many = await db.plantDefinition.create({
      data: { collectionId: c.id, genus: 'Other' },
    })
    await db.aiCuratorJob.create({
      data: {
        ...scope,
        plantDefinitionId: many.id,
        targetEntityId: many.id,
        status: 'WAITING_FOR_HUMAN',
        blockingReason: error,
      },
    })
    const unrelated = await db.aiCuratorJob.create({
      data: {
        ...scope,
        plantDefinitionId: many.id,
        targetEntityId: many.id,
        targetField: 'images',
        status: 'WAITING_FOR_HUMAN',
        blockingReason: 'Needs a representative photograph',
      },
    })
    const results = await retryDatabaseBlockedCuratorJobs(db)
    assert.equal(results.QUEUED, 1)
    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: unrelated.id } }))
        .status,
      'WAITING_FOR_HUMAN'
    )
    assert.equal(await retryCuratorJob(db, second.id), 'UNCHANGED')
    console.log(
      'Reproduced legacy SKIPPED uniqueness failure; migration repair, retained history/results, repeated real worker SKIPPED/COMPLETED outcomes, manual retry budgets, no-call result recovery and scoped bulk retry passed.'
    )
  } finally {
    globalThis.fetch = fetchBefore
    if (keyBefore === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = keyBefore
    await db.$executeRawUnsafe('DROP INDEX IF EXISTS "Curator_legacy_fixture"')
    await db.$executeRawUnsafe('ALTER TABLE "AiCuratorJob" DROP CONSTRAINT IF EXISTS "Curator_legacy_constraint_fixture"')
    await db.collection.delete({ where: { id: c.id } })
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
