import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  curatorInheritance,
  linkedCarePolicy,
} from '../lib/ai-curator-inheritance'
import {
  ensureAiCuratorSettings,
  expireAiCuratorWork,
  processAiCuratorWake,
  aiCuratorReviewQueue,
  hasAiCuratorSuggestionChange,
} from '../lib/ai-curator'
import { researchReviewQueues } from '../lib/dashboard-reviews'

async function main() {
  assert.match(
    process.env.DATABASE_URL || '',
    /localhost:55439\/axildb(?:\?|$)/
  )
  const db = new PrismaClient()
  const oldSettings = await db.aiCuratorSettings.findUnique({
    where: { id: 'global' },
  })
  const oldFetch = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY
  const c = await db.collection.create({
    data: {
      name: 'Linked care regression',
      slug: `linked-${Date.now()}`,
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
      },
    })
    const source = await db.plantDefinition.create({
      data: {
        collectionId: c.id,
        genus: 'Streptocarpus',
        species: 'ionanthus',
      },
    })
    await db.plantHusbandryGuide.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: source.id,
        summaryCare: 'Inherited care remains authoritative.',
        fertilizationType: 'Light feeding',
      },
    })
    const override = {
      intent: 'LOCAL_OVERRIDE',
      sourcePlantDefinitionId: source.id,
      reason:
        'This miniature cultivar has materially lower nutrient needs than the source.',
      evidence:
        'Cultivar-specific grower observations show salt damage under the source feeding regime.',
    }
    const inheritance = await curatorInheritance(db, source.id, c.id)
    assert.equal(inheritance, null)
    for (const field of ['husbandry', 'fertilizer', 'substrate']) {
      assert.equal(
        linkedCarePolicy(field, {}, 0.99, {
          sourcePlantDefinitionId: source.id,
          resolved: true,
        }),
        false
      )
      assert.equal(
        linkedCarePolicy(field, { localOverride: override }, 0.89, {
          sourcePlantDefinitionId: source.id,
          resolved: true,
        }),
        false
      )
      assert.equal(
        linkedCarePolicy(field, { localOverride: override }, 0.9, {
          sourcePlantDefinitionId: source.id,
          resolved: true,
        }),
        true
      )
      assert.equal(
        linkedCarePolicy(field, { localOverride: override }, 0.99, {
          sourcePlantDefinitionId: source.id,
          resolved: false,
        }),
        false
      )
      assert.equal(
        linkedCarePolicy(
          field,
          { localOverride: { ...override, sourcePlantDefinitionId: 'stale' } },
          0.99,
          { sourcePlantDefinitionId: source.id, resolved: true }
        ),
        false
      )
    }
    assert.equal(
      linkedCarePolicy('references', {}, 0.2, {
        sourcePlantDefinitionId: source.id,
      }),
      true
    )
    assert.equal(
      hasAiCuratorSuggestionChange(
        { focus: { currentValue: { summaryCare: 'Same' } } },
        { fields: { summaryCare: 'Same' }, localOverride: override },
        'husbandry'
      ),
      false
    )
    process.env.OPENAI_API_KEY = 'fixture'
    let answer: any, context: any
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      context = JSON.parse(body.input[0].content[0].text).context
      assert.equal(context.inheritance.sourcePlantDefinitionId, source.id)
      assert.equal(
        context.inheritance.effectiveGuide.summaryCare,
        'Inherited care remains authoritative.'
      )
      assert.match(body.instructions, /confidence >= 0.90/)
      return new Response(
        JSON.stringify({
          status: 'completed',
          output_text: JSON.stringify(answer),
          usage: { input_tokens: 50, output_tokens: 100 },
        }),
        { status: 200 }
      )
    }
    const definitions = []
    for (const [name, confidence, explicit, targetField] of [
      ['Generic', 0.99, false, 'husbandry'],
      ['Generic fertilizer', 0.99, false, 'fertilizer'],
      ['Generic substrate', 0.99, false, 'substrate'],
      ['Low confidence', 0.85, true, 'husbandry'],
      ['Specific override', 0.95, true, 'husbandry'],
    ] as const) {
      const d = await db.plantDefinition.create({
        data: {
          collectionId: c.id,
          genus: 'Streptocarpus',
          cultivarName: name,
        },
      })
      definitions.push(d)
      await db.plantHusbandryGuide.create({
        data: {
          collectionId: c.id,
          plantDefinitionId: d.id,
          sourcePlantDefinitionId: source.id,
        },
      })
      const job = await db.aiCuratorJob.create({
        data: {
          collectionId: c.id,
          plantDefinitionId: d.id,
          jobType: 'HUSBANDRY_RESEARCH',
          phase: 'ENRICHMENT',
          targetEntityType: 'PLANT_DEFINITION',
          targetEntityId: d.id,
          targetField,
          status: 'QUEUED',
          priority: 1e9,
        },
      })
      answer = {
        title: name,
        suggestedValue: {
          fields: { summaryCare: 'Cultivar-specific local care.' },
          ...(explicit ? { localOverride: override } : {}),
        },
        reasoning: override.reason,
        confidence,
        supportingReferences: [],
      }
      await processAiCuratorWake(db)
      assert.equal(
        (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: job.id } }))
          .status,
        explicit && confidence >= 0.9 ? 'COMPLETED' : 'SKIPPED'
      )
      assert.equal(
        (
          await db.plantHusbandryGuide.findUniqueOrThrow({
            where: { plantDefinitionId: d.id },
          })
        ).sourcePlantDefinitionId,
        source.id
      )
    }
    const d = definitions[0]
    const old = await db.aiCuratorSuggestion.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        phase: 'ENRICHMENT',
        suggestionType: 'HUSBANDRY_RESEARCH',
        targetField: 'husbandry',
        title: 'Legacy generic',
        suggestedValue: { fields: { summaryCare: 'Generic care' } },
        reasoning: 'Generic botanical guidance',
        confidence: 0.99,
      },
    })
    const queue = await aiCuratorReviewQueue(db)
    assert.equal(
      queue.flatMap((g) => g.suggestions).some((s) => s.id === old.id),
      false
    )
    const reviews = await researchReviewQueues(db, c.id, c.slug, true)
    assert.equal(reviews[0].count, 1)
    await expireAiCuratorWork(db)
    assert.equal((await db.aiCuratorSuggestion.findUniqueOrThrow({where:{id:old.id}})).status, 'EXPIRED')
    assert.equal(await db.aiCuratorSuggestion.count({where:{collectionId:c.id,status:'PENDING'}}), 1)

    await db.plantHusbandryGuide.update({
      where: { plantDefinitionId: source.id },
      data: { sourcePlantDefinitionId: d.id },
    })
    assert.equal(
      (await curatorInheritance(db, d.id, c.id))?.resolved,
      false,
      'Cycles fail closed'
    )
    console.log(
      'Linked care: inherited provider context, generic/low-confidence suppression, explicit evidence-backed override, no-change detection, unchanged links, legacy review/dashboard filtering and cycle protection passed.'
    )
  } finally {
    globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = oldKey
    await db.collection.delete({ where: { id: c.id } })
    if (oldSettings) {
      const { id, createdAt, updatedAt, ...data } = oldSettings
      await db.aiCuratorSettings.update({ where: { id }, data })
    }
    await db.$disconnect()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
