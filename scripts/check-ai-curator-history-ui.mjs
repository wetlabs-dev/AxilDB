import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const db = new PrismaClient(),
  browser = await chromium.launch({ channel: 'chrome' }),
  base = 'http://localhost:3107'
let collection, user
try {
  const stamp = Date.now()
  collection = await db.collection.create({
    data: {
      name: 'Curator recovery browser',
      slug: `curator-recovery-${stamp}`,
    },
  })
  user = await db.user.create({
    data: {
      email: `curator-recovery-${stamp}@example.test`,
      passwordHash: 'fixture',
      role: 'SERVER_ADMIN',
      emailVerifiedAt: new Date(),
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  const token = randomBytes(32).toString('hex')
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3600000),
      twoFactorVerifiedAt: new Date(),
    },
  })
  const reason =
    'Invalid Prisma aiCuratorJob.update invocation: Unique constraint failed on the fields: (`collectionId`,`jobType`,`phase`,`plantDefinitionId`,`targetEntityType`,`targetEntityId`,`targetField`,`status`)'
  const ids = []
  for (let n = 0; n < 11; n++) {
    const d = await db.plantDefinition.create({
      data: {
        collectionId: collection.id,
        genus: 'Begonia',
        cultivarName: `Fixture ${n}`,
      },
    })
    const j = await db.aiCuratorJob.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId: d.id,
        targetEntityType: 'PLANT_DEFINITION',
        targetEntityId: d.id,
        targetField: 'references',
        jobType: 'REFERENCE_RESEARCH',
        phase: 'ENRICHMENT',
        status: 'WAITING_FOR_HUMAN',
        blockingReason: reason,
        attempts: 3,
      },
    })
    ids.push(j.id)
    if (n === 0)
      await db.aiCuratorSuggestion.create({
        data: {
          collectionId: collection.id,
          plantDefinitionId: d.id,
          jobId: j.id,
          phase: j.phase,
          suggestionType: j.jobType,
          targetField: j.targetField,
          title: 'Keep this result',
          suggestedValue: { description: 'Existing botanical output' },
          reasoning: 'Persisted before completion failed',
        },
      })
  }
  const unrelated = await db.aiCuratorJob.create({
    data: {
      collectionId: collection.id,
      jobType: 'IMAGE_REVIEW',
      phase: 'READINESS',
      targetField: 'images',
      status: 'WAITING_FOR_HUMAN',
      blockingReason: 'Please supply a representative image',
    },
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page
    .context()
    .addCookies([{ name: 'axildb_session', value: token, url: base }])
  let request
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action'])
      request = { headers: r.headers(), body: r.postDataBuffer() }
  })
  await page.goto(`${base}/server/ai-curator`)
  await expect(
    page
      .getByText('A legacy database index blocked this job from finishing.', {
        exact: false,
      })
      .first()
  ).toBeVisible()
  await expect(page.locator('main')).not.toContainText(
    'Invalid Prisma aiCuratorJob.update invocation'
  )
  await page
    .getByRole('button', { name: 'Retry database-blocked jobs', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'existing results recovered' })
  ).toContainText('1 existing results recovered, 10 queued, 0 failed')
  assert.equal(
    await db.aiCuratorJob.count({
      where: { id: { in: ids }, status: 'QUEUED', attempts: 0 },
    }),
    10
  )
  assert.equal(
    (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: ids[0] } })).status,
    'COMPLETED'
  )
  assert.equal(
    (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: unrelated.id } }))
      .status,
    'WAITING_FOR_HUMAN'
  )
  assert.equal(
    await db.aiCuratorSuggestion.count({
      where: { collectionId: collection.id },
    }),
    1
  )
  assert.ok(request)
  const anonymous = await browser.newContext()
  await anonymous.request.post(`${base}/server/ai-curator`, {
    headers: {
      'Next-Action': request.headers['next-action'],
      'Content-Type': request.headers['content-type'],
      Origin: base,
    },
    data: request.body,
    maxRedirects: 0,
  })
  assert.equal(
    await db.aiCuratorJob.count({
      where: { id: { in: ids }, status: 'QUEUED', attempts: 0 },
    }),
    10
  )
  await anonymous.close()
  assert.equal(
    await db.auditLog.count({
      where: {
        userId: user.id,
        summary: 'Retried database-blocked Curator jobs',
      },
    }),
    1
  )
  const responseIds = []
  for (const reason of [
    'AI Curator response did not contain JSON.',
    "Expected ',' or '}' after property value in JSON at position 3818",
  ]) {
    const definition = await db.plantDefinition.create({
      data: {
        collectionId: collection.id,
        genus: 'Begonia',
        cultivarName: `Response ${responseIds.length}`,
      },
    })
    const job = await db.aiCuratorJob.create({
      data: {
        collectionId: collection.id,
        plantDefinitionId: definition.id,
        targetEntityType: 'PLANT_DEFINITION',
        targetEntityId: definition.id,
        jobType: 'REFERENCE_RESEARCH',
        phase: 'ENRICHMENT',
        targetField: 'references',
        status: 'WAITING_FOR_HUMAN',
        blockingReason: reason,
        attempts: 3,
      },
    })
    responseIds.push(job.id)
  }
  await page.reload()
  await expect(page.locator('main')).not.toContainText('at position 3818')
  await page
    .getByRole('button', { name: 'Retry response-error jobs', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Response-error jobs:' })
  ).toContainText('0 results recovered, 2 queued, 0 failed')
  assert.equal(
    await db.aiCuratorJob.count({
      where: { id: { in: responseIds }, status: 'QUEUED', attempts: 0 },
    }),
    2
  )
  assert.equal(
    (await db.aiCuratorJob.findUniqueOrThrow({ where: { id: unrelated.id } }))
      .status,
    'WAITING_FOR_HUMAN'
  )
  assert.equal(
    await db.auditLog.count({
      where: {
        userId: user.id,
        summary: 'Retried response-error Curator jobs',
      },
    }),
    1
  )
  const responseRequest = request
  const unauthenticated = await browser.newContext()
  await unauthenticated.request.post(`${base}/server/ai-curator`, {
    headers: {
      'Next-Action': responseRequest.headers['next-action'],
      'Content-Type': responseRequest.headers['content-type'],
      Origin: base,
    },
    data: responseRequest.body,
    maxRedirects: 0,
  })
  assert.equal(
    await db.auditLog.count({
      where: {
        userId: user.id,
        summary: 'Retried response-error Curator jobs',
      },
    }),
    1
  )
  await unauthenticated.close()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  )
  console.log(
    'Curator recovery browser passed: readable errors, hidden jobs beyond eight recovered, existing output retained, attempts reset, unrelated blockers untouched, administrator-only history/response recovery actions, selective JSON-error retry, audit and mobile layout.'
  )
} finally {
  if (collection) await db.collection.delete({ where: { id: collection.id } })
  if (user) await db.user.delete({ where: { id: user.id } })
  await browser.close()
  await db.$disconnect()
}
