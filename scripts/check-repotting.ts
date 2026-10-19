import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  selectRepottingWindow,
  windowOccurrence,
  validateAnnualWindow,
} from '../lib/repotting-windows'
import {
  queueRepotting,
  applyWindowRecommendation,
  validWindowRecommendation,
  validateWindowAssignments,
} from '../lib/repotting'
import {
  applyCareQueueMutation,
  type MutationContext,
} from '../lib/care-queue-mutations'
import { executeCareOperation } from '../lib/care-queue-operations'
import { getCareQueue } from '../lib/care-queue'
import { repottingCadenceLabel } from '../lib/repotting-label'
import {
  processAiCuratorWake,
  ensureAiCuratorSettings,
} from '../lib/ai-curator'
const tz = 'America/New_York'
const w = (id: string, m: number, d = 1, endM = m, endD = 28) => ({
  id,
  name: id,
  startMonth: m,
  startDay: d,
  endMonth: endM,
  endDay: endD,
  isActive: true,
})
const select = (p: any, a: any, at = '2027-02-01T12:00:00Z', timezone = tz) =>
  selectRepottingWindow({
    primaryWindow: p,
    alternateWindow: a,
    referenceDate: new Date(at),
    timezone,
  })
assert.equal(
  select(w('primary', 6), w('alternate', 4, 15, 5, 15))?.windowId,
  'primary'
)
assert.equal(select(w('primary', 9), w('alternate', 3))?.windowId, 'alternate')
assert.equal(select(w('primary', 5), w('alternate', 8))?.windowId, 'primary')
assert.equal(
  select(w('primary', 6), w('alternate', 3))?.selectionReason,
  'PRIMARY_PREFERRED_WITHIN_THRESHOLD'
)
assert.equal(
  select(w('primary', 6, 2), w('alternate', 3))?.windowId,
  'alternate'
)
assert.equal(
  select(w('primary', 6), w('alternate', 4, 15, 5, 15), '2027-04-20T12:00:00Z')
    ?.windowId,
  'primary'
)
assert.equal(
  select(w('primary', 6), w('alternate', 6, 5), '2027-06-10T12:00:00Z')
    ?.windowId,
  'primary'
)
assert.equal(
  select(w('primary', 6), w('alternate', 4), '2026-10-19T12:00:00Z')?.year,
  2027
)
assert.equal(
  select(w('primary', 2), w('alternate', 12), '2027-11-01T12:00:00Z')?.year,
  2028
)
assert.equal(
  select(w('winter', 12, 15, 1, 31), null, '2027-01-15T12:00:00Z')?.year,
  2026
)
assert.equal(
  select(w('leap', 2, 29, 2, 29), null, '2028-02-29T12:00:00Z')?.year,
  2028
)
assert.equal(
  select(w('leap', 2, 29, 2, 29), null, '2027-02-28T12:00:00Z')?.year,
  2027
)
assert.equal(select(null, w('alt', 3))?.windowId, 'alt')
assert.equal(select(null, null), null)
assert.equal(select({ ...w('inactive', 3), isActive: false }, null), null)
assert.throws(() => validateAnnualWindow(w('bad', 2, 30)), /valid month/)
assert.equal(
  select(
    w('January', 1, 1, 1, 31),
    null,
    '2027-02-01T01:00:00Z',
    'America/Los_Angeles'
  )?.year,
  2027
)
assert.equal(
  select(w('January', 1, 1, 1, 31), null, '2027-02-01T01:00:00Z', 'UTC')?.year,
  2028
)
assert.equal(
  select(w('April', 4, 30), w('January', 1, 31), '2026-12-01T12:00:00Z')
    ?.windowId,
  'April',
  'Calendar months clamp month ends'
)
assert.equal(repottingCadenceLabel([]), 'Not scheduled')
assert.equal(
  repottingCadenceLabel([
    {
      activity: 'REPOTTING',
      status: 'NOT_APPLICABLE',
      interval: null,
      unit: null,
    },
  ]),
  'Not applicable'
)
assert.match(
  repottingCadenceLabel([
    { activity: 'REPOTTING', interval: 24, unit: 'MONTH' },
  ]),
  /24/
)
async function main() {
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
  const c = await db.collection.create({
    data: {
      name: 'Repotting regression',
      slug: `repot-${Date.now()}`,
      aiCuratorEnabled: true,
    },
  })
  const user = await db.user.create({
    data: {
      email: `repot-${Date.now()}@example.test`,
      passwordHash: 'fixture',
    },
  })
  const window = await db.repottingWindow.create({
    data: {
      name: `Fixture ${Date.now()}`,
      startMonth: 1,
      startDay: 1,
      endMonth: 12,
      endDay: 31,
    },
  })
  try {
    await db.$transaction(async (tx) => {
      const original = await tx.repottingWindow.findUniqueOrThrow({
        where: { id: 'repot-default-3' },
      })
      await tx.repottingWindow.update({
        where: { id: original.id },
        data: { startDay: 2 },
      })
      const seeds = readFileSync(
        'prisma/migrations/20261020120000_seasonal_repotting/migration.sql',
        'utf8'
      )
        .split('\n')
        .filter((line) => line.startsWith('INSERT INTO "RepottingWindow"'))
      for (const sql of seeds) await tx.$executeRawUnsafe(sql)
      assert.equal(
        (
          await tx.repottingWindow.findUniqueOrThrow({
            where: { id: original.id },
          })
        ).startDay,
        2,
        'Default seeding preserves edited boundaries'
      )
      assert.equal(
        await tx.repottingWindow.count({
          where: { id: { startsWith: 'repot-default-' } },
        }),
        12
      )
      await tx.repottingWindow.update({
        where: { id: original.id },
        data: { startDay: original.startDay },
      })
    })
    const d = await db.plantDefinition.create({
      data: {
        collectionId: c.id,
        genus: 'Monstera',
        primaryRepottingWindowId: window.id,
      },
    })
    await db.plantHusbandryGuide.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        repottingInterval: 'Unique legacy botanical note',
        repottingRootSensitivity: 'Preserve roots',
      },
    })
    await db.plantDefinitionCareCadence.create({
      data: {
        plantDefinitionId: d.id,
        activity: 'REPOTTING',
        interval: 12,
        unit: 'MONTH',
      },
    })
    const plant = await db.plantInstance.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        plantId: 'REPOT-1',
        instanceType: 'ACQUIRED',
      },
    })
    const membership = await db.collectionMembership.create({
      data: {
        collectionId: c.id,
        userId: user.id,
        role: 'LOGGER',
        status: 'ACTIVE',
      },
    })
    const context: MutationContext = {
      collection: c,
      user,
      membership,
      role: 'LOGGER',
    }
    await db.plantCareAdjustment.create({
      data: {
        collectionId: c.id,
        plantInstanceId: plant.id,
        taskType: 'REPOT',
        nextDueAt: new Date(Date.now() - 86400000),
      },
    })
    assert.ok(
      (
        await getCareQueue(db, { collectionId: c.id, collectionSlug: c.slug })
      ).some((i) => i.taskType === 'REPOT' && i.repottingPlanAvailable)
    )
    const requests = await Promise.all(
      Array.from({ length: 4 }, () =>
        db.$transaction(
          (tx) =>
            queueRepotting(tx, { collectionId: c.id, instanceId: plant.id }),
          { timeout: 20000 }
        )
      )
    )
    assert.equal(new Set(requests.map((r) => r.id)).size, 1)
    assert.equal(
      await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }),
      0
    )
    assert.equal(
      (
        await getCareQueue(db, { collectionId: c.id, collectionSlug: c.slug })
      ).some((i) => i.taskType === 'REPOT'),
      false
    )
    const item = requests[0]
    const year = item.scheduledYear
    await db.plantDefinition.update({
      where: { id: d.id },
      data: { primaryRepottingWindowId: null },
    })
    assert.equal(
      (
        await db.repottingQueueItem.findUniqueOrThrow({
          where: { id: item.id },
        })
      ).scheduledYear,
      year
    )
    await db.repottingQueueItem.update({
      where: { id: item.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    })
    assert.ok(
      (
        await getCareQueue(db, { collectionId: c.id, collectionSlug: c.slug })
      ).some((i) => i.taskType === 'REPOT')
    )
    await assert.rejects(
      db.$transaction((tx) =>
        queueRepotting(tx, { collectionId: c.id, instanceId: plant.id })
      ),
      /No eligible/
    )
    assert.equal(
      await db.repottingQueueItem.count({
        where: { plantInstanceId: plant.id, status: 'QUEUED' },
      }),
      0
    )
    await db.plantDefinition.update({
      where: { id: d.id },
      data: { primaryRepottingWindowId: window.id },
    })
    const fd = new FormData()
    fd.set('collectionSlug', c.slug)
    fd.set('plantInstanceId', plant.id)
    fd.set('taskType', 'REPOT')
    const run = (
      action: any,
      identity = { operationId: randomUUID(), issuedAt: Date.now() }
    ) =>
      executeCareOperation(
        db,
        { collectionId: c.id, userId: user.id, action, fd, identity },
        (tx) => applyCareQueueMutation(tx, context, action, fd)
      )
    const identity = { operationId: randomUUID(), issuedAt: Date.now() }
    await Promise.all([
      run('planRepotting', identity),
      run('planRepotting', identity),
    ])
    assert.equal(
      await db.plantCareEvent.count({ where: { plantInstanceId: plant.id } }),
      0
    )
    fd.set('substrateMode', 'RECEIVED_SUBSTRATE')
    fd.set('receivedSubstrateDescription', 'Fresh chunky mix')
    fd.set('notes', 'Real repotting')
    const completeId = { operationId: randomUUID(), issuedAt: Date.now() }
    await Promise.all([
      run('complete', completeId),
      run('complete', completeId),
    ])
    assert.equal(
      await db.plantCareEvent.count({
        where: { plantInstanceId: plant.id, eventType: 'REPOTTED' },
      }),
      1
    )
    const completed = await db.repottingQueueItem.findFirstOrThrow({
      where: { plantInstanceId: plant.id, status: 'COMPLETED' },
    })
    assert.ok(completed.careEventId)
    assert.equal(
      await db.plantSubstrateHistory.count({
        where: { plantInstanceId: plant.id },
      }),
      1
    )
    assert.ok(
      (
        await getCareQueue(db, { collectionId: c.id, collectionSlug: c.slug })
      ).find((i) => i.taskType === 'REPOT')!.dueAt > new Date(),
      'Actual repotting advances the cadence'
    )
    await db.plantDefinitionCareCadence.update({
      where: {
        plantDefinitionId_activity: {
          plantDefinitionId: d.id,
          activity: 'REPOTTING',
        },
      },
      data: { status: 'NOT_APPLICABLE', interval: null, unit: null },
    })
    const manualNa = await db.$transaction((tx) =>
      queueRepotting(tx, { collectionId: c.id, instanceId: plant.id })
    )
    assert.equal(
      manualNa.status,
      'QUEUED',
      'N/A cadence still permits manual intent'
    )
    assert.equal(
      await db.plantCareEvent.count({
        where: { plantInstanceId: plant.id, eventType: 'REPOTTED' },
      }),
      1
    )
    await db.repottingQueueItem.update({
      where: { id: manualNa.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    })
    await assert.rejects(
      db.$transaction((tx) =>
        validateWindowAssignments(tx, window.id, window.id)
      ),
      /different/
    )
    await assert.rejects(
      db.$transaction((tx) => validateWindowAssignments(tx, null, window.id)),
      /primary/
    )
    const proposal = {
      primaryWindowId: window.id,
      alternateWindowId: null,
      primaryConfidence: 0.92,
      alternateConfidence: null,
      primaryReasoning: 'Active indoor growth supports root recovery.',
      alternateReasoning: null,
      researchAssumptions: [
        'Stable indoor cultivation is assumed, not observed.',
      ],
    }
    assert.equal(
      validWindowRecommendation({ ...proposal, primaryWindowId: 'invented' }, [
        window,
      ]),
      false
    )
    const snapshot = {
      plantDefinitionId: d.id,
      collectionId: c.id,
      currentValue: {
        focus: {
          currentValue: { primaryWindowId: window.id, alternateWindowId: null },
        },
        repottingWindows: [window],
      },
    }
    await db.$transaction((tx) =>
      applyWindowRecommendation(tx, snapshot, proposal)
    )
    await db.repottingWindow.update({
      where: { id: window.id },
      data: { startDay: 2 },
    })
    await assert.rejects(
      db.$transaction((tx) =>
        applyWindowRecommendation(tx, snapshot, proposal)
      ),
      /dates/
    )
    await db.repottingWindow.update({
      where: { id: window.id },
      data: { startDay: 1 },
    })
    await db.plantDefinition.update({
      where: { id: d.id },
      data: { primaryRepottingWindowId: null },
    })
    await assert.rejects(
      db.$transaction((tx) =>
        applyWindowRecommendation(tx, snapshot, proposal)
      ),
      /assignments changed/
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
      const body = JSON.parse(String(init?.body)),
        context = JSON.parse(body.input[0].content[0].text).context
      assert.ok(context.repottingWindows.some((w: any) => w.id === window.id))
      return new Response(
        JSON.stringify({
          status: 'completed',
          output_text: JSON.stringify({
            title: 'Seasonal windows',
            suggestedValue: proposal,
            confidence: 0.92,
            reasoning: proposal.primaryReasoning,
          }),
          usage: { input_tokens: 10, output_tokens: 100 },
        }),
        { status: 200 }
      )
    }
    await db.aiCuratorJob.create({
      data: {
        collectionId: c.id,
        plantDefinitionId: d.id,
        phase: 'ENRICHMENT',
        jobType: 'REPOTTING_WINDOWS',
        targetField: 'repottingWindows',
        targetEntityType: 'PLANT_DEFINITION',
        targetEntityId: d.id,
        status: 'QUEUED',
        priority: 1e9,
      },
    })
    await processAiCuratorWake(db)
    assert.equal(calls, 1)
    assert.equal(
      await db.aiCuratorSuggestion.count({
        where: {
          collectionId: c.id,
          targetField: 'repottingWindows',
          status: 'PENDING',
        },
      }),
      1
    )
    assert.equal(
      (await db.plantDefinition.findUniqueOrThrow({ where: { id: d.id } }))
        .primaryRepottingWindowId,
      null,
      'AI never assigns without approval'
    )
    assert.equal(
      (
        await db.plantHusbandryGuide.findUniqueOrThrow({
          where: { plantDefinitionId: d.id },
        })
      ).repottingInterval,
      'Unique legacy botanical note'
    )
    console.log(
      'Seasonal scheduler boundaries/timezones/leap years; concurrent queue/receipt safety; assessment vs completion; care/substrate history; cancellation; stale AI approval; actual mock Curator research; preserved legacy data passed.'
    )
  } finally {
    globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = oldKey
    await db.repottingQueueItem.deleteMany({
      where: { plantInstance: { collectionId: c.id } },
    })
    await db.collection.delete({ where: { id: c.id } })
    await db.user.delete({ where: { id: user.id } })
    await db.repottingWindow.delete({ where: { id: window.id } })
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
