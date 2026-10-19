import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  parseCuratorResponse,
  CuratorResponseError,
  isCuratorResponseFailure,
} from '../lib/ai-curator-response'
import {
  processAiCuratorWake,
  ensureAiCuratorSettings,
} from '../lib/ai-curator'
import {
  retryCuratorJob,
  retryResponseBlockedCuratorJobs,
} from '../lib/ai-curator-job-recovery'
const result = {
  title: 'Description',
  suggestedValue: { description: 'Botanical fixture description.' },
  reasoning: 'Missing supported description',
  confidence: 0.8,
  supportingReferences: [],
}
const valid = JSON.stringify(result)
assert.deepEqual(
  parseCuratorResponse({ status: 'completed', output_text: valid }, 1200),
  result
)
assert.deepEqual(
  parseCuratorResponse(
    {
      output_text: '',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: valid }] },
      ],
    },
    1200
  ),
  result
)
assert.deepEqual(
  parseCuratorResponse({ output_text: '```json\n' + valid + '\n```' }, 1200),
  result
)
for (const text of [
  'plain text',
  '{"suggestedValue":{"description":"cut off"',
  '[]',
  'null',
  '{"reasoning":"missing result"}',
])
  assert.throws(
    () => parseCuratorResponse({ output_text: text }, 1200),
    CuratorResponseError
  )
assert.throws(
  () =>
    parseCuratorResponse(
      {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output_text: valid,
      },
      1200
    ),
  (e: any) => e.kind === 'OUTPUT_LIMIT'
)
assert.throws(
  () =>
    parseCuratorResponse(
      {
        status: 'completed',
        output: [{ content: [{ type: 'refusal', refusal: 'Declined' }] }],
      },
      1200
    ),
  (e: any) => e.kind === 'REFUSAL'
)
assert.throws(
  () =>
    parseCuratorResponse(
      { status: 'completed', output: [{ type: 'reasoning' }] },
      1200
    ),
  (e: any) => e.kind === 'EMPTY'
)
assert.equal(
  isCuratorResponseFailure(
    "Expected ',' or '}' after property value in JSON at position 3818"
  ),
  true
)
assert.equal(
  isCuratorResponseFailure('AI Curator response did not contain JSON.'),
  true
)
assert.equal(isCuratorResponseFailure('Missing representative photo'), false)
async function main() {
  assert.match(
    process.env.DATABASE_URL || '',
    /localhost:55439\/axildb(?:\?|$)/
  )
  const db = new PrismaClient(),
    fetchBefore = globalThis.fetch,
    keyBefore = process.env.OPENAI_API_KEY
  const settingsBefore = await db.aiCuratorSettings.findUnique({
    where: { id: 'global' },
  })
  const collection = await db.collection.create({
    data: {
      name: 'Response regression',
      slug: `response-${Date.now()}`,
      aiCuratorEnabled: true,
    },
  })
  try {
    await ensureAiCuratorSettings(db)
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: {
        enabled: true,
        concurrency: 1,
        dailyBudgetDollars: 1000,
        monthlyBudgetDollars: 10000,
        maxTokens: 1200,
      },
    })
    process.env.OPENAI_API_KEY = 'fixture'
    let calls = 0,
      payload: any = {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'reasoning' }],
        usage: { input_tokens: 30, output_tokens: 1200 },
      }
    let expectedCap = 1200
    globalThis.fetch = async (_url, init) => {
      calls++
      const body = JSON.parse(String(init?.body))
      assert.deepEqual(body.text, { format: { type: 'json_object' } })
      assert.equal(body.max_output_tokens, expectedCap)
      assert.ok(body.instructions.includes('compact JSON'))
      return new Response(JSON.stringify(payload), { status: 200 })
    }
    const create = async (name: string) => {
      const definition = await db.plantDefinition.create({
        data: {
          collectionId: collection.id,
          genus: 'Begonia',
          cultivarName: name,
        },
      })
      return db.aiCuratorJob.create({
        data: {
          collectionId: collection.id,
          plantDefinitionId: definition.id,
          jobType: 'REFERENCE_RESEARCH',
          phase: 'ENRICHMENT',
          targetEntityType: 'PLANT_DEFINITION',
          targetEntityId: definition.id,
          targetField: 'references',
          priority: 1e9,
          status: 'QUEUED',
          maxAttempts: 3,
        },
      })
    }
    const limited = await create('Output limit')
    await processAiCuratorWake(db)
    let job = await db.aiCuratorJob.findUniqueOrThrow({
      where: { id: limited.id },
    })
    assert.equal(job.status, 'WAITING_FOR_HUMAN')
    assert.equal(job.attempts, 1)
    assert.ok(job.blockingReason?.includes('1200 tokens'))
    assert.equal(
      await db.aiCuratorSuggestion.count({ where: { jobId: limited.id } }),
      0
    )
    const failed = await db.aiUsageEvent.findFirstOrThrow({
      where: { collectionId: collection.id, success: false },
    })
    assert.equal(failed.outputTokens, 1200)
    assert.ok(Number(failed.estimatedCostDollars) > 0)
    assert.equal(
      await retryCuratorJob(db, limited.id),
      'OUTPUT_LIMIT_UNCHANGED'
    )
    assert.equal(calls, 1)
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: { dailyBudgetDollars: 0.000001 },
    })
    assert.equal((await processAiCuratorWake(db)).status, 'WAITING')
    assert.equal(calls, 1, 'Failed response usage must enforce the budget')
    await db.aiCuratorSettings.update({
      where: { id: 'global' },
      data: { dailyBudgetDollars: 1000, maxTokens: 6000 },
    })
    expectedCap = 6000
    assert.equal(await retryCuratorJob(db, limited.id), 'QUEUED')
    payload = {
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: valid }] },
      ],
      usage: { input_tokens: 30, output_tokens: 100 },
    }
    await processAiCuratorWake(db)
    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: limited.id } }))
        .status,
      'COMPLETED'
    )
    assert.equal(
      await db.aiCuratorSuggestion.count({ where: { jobId: limited.id } }),
      1
    )
    assert.equal(
      await db.aiUsageEvent.count({
        where: { collectionId: collection.id, success: false },
      }),
      1,
      'Retried success retains prior failed usage'
    )
    for (const [name, body] of [
      [
        'Malformed',
        { status: 'completed', output_text: '{"suggestedValue":[' },
      ],
      ['Empty', { status: 'completed', output: [{ type: 'reasoning' }] }],
      [
        'Incomplete JSON',
        {
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output_text: valid,
        },
      ],
      [
        'Refusal',
        {
          status: 'completed',
          output: [{ content: [{ type: 'refusal', refusal: 'Declined' }] }],
        },
      ],
    ] as const) {
      const test = await create(name)
      await db.aiCuratorJob.update({
        where: { id: test.id },
        data: { maxAttempts: 1 },
      })
      payload = { ...body, usage: { input_tokens: 5, output_tokens: 10 } }
      await processAiCuratorWake(db)
      assert.equal(
        (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: test.id } }))
          .status,
        'WAITING_FOR_HUMAN'
      )
      assert.equal(
        await db.aiCuratorSuggestion.count({ where: { jobId: test.id } }),
        0
      )
      assert.equal(
        (
          await db.plantDefinition.findUniqueOrThrow({
            where: { id: test.plantDefinitionId! },
          })
        ).description,
        null
      )
    }
    const refusal = await db.aiCuratorJob.findFirstOrThrow({
      where: {
        collectionId: collection.id,
        blockingReason: { contains: 'declined this request' },
      },
    })
    const countBefore = calls
    const retries = await retryResponseBlockedCuratorJobs(db)
    assert.equal(retries.QUEUED, 2)
    assert.equal(retries.OUTPUT_LIMIT_UNCHANGED, 1)
    assert.equal(
      (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: refusal.id } }))
        .status,
      'WAITING_FOR_HUMAN'
    )
    assert.equal(
      calls,
      countBefore,
      'Bulk action queues work; it never calls a provider'
    )
    console.log(
      'Curator JSON mode, strict response parsing, truncation/refusal/empty handling, one-attempt limit pause, explicit cap changes, failed-usage budget accounting, no partial suggestions and selective response-job recovery passed.'
    )
  } finally {
    globalThis.fetch = fetchBefore
    if (keyBefore === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = keyBefore
    await db.collection.delete({ where: { id: collection.id } })
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
