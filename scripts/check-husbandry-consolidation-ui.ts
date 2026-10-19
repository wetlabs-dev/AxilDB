import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'
import {
  consolidationContext,
  compatibilityDimensions,
} from '../lib/husbandry-consolidation'
import { researchReviewQueues } from '../lib/dashboard-reviews'
async function main() {
  assert.match(
    process.env.DATABASE_URL || '',
    /localhost:55439\/axildb(?:\?|$)/
  )
  const db = new PrismaClient(),
    browser = await chromium.launch({ channel: 'chrome' }),
    base = 'http://localhost:3107',
    stamp = Date.now()
  const c = await db.collection.create({
    data: { name: 'Consolidation UI', slug: `consolidation-ui-${stamp}` },
  })
  const user = await db.user.create({
    data: {
      email: `consolidation-ui-${stamp}@example.test`,
      passwordHash: 'fixture',
      role: 'SERVER_ADMIN',
      emailVerifiedAt: new Date(),
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  try {
    await db.collectionMembership.create({
      data: {
        collectionId: c.id,
        userId: user.id,
        role: 'MANAGER',
        status: 'ACTIVE',
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
    const full = {
      summaryWater: 'Allow to dry completely',
      summaryLight: 'Bright indirect light',
      mediumPreferred: 'Aerated bark mix',
      humidityRange: '50–70%',
      temperatureColdTolerance: 'Above 18 C',
      dormancyBehavior: 'Continuous growth',
      fertilizationType: 'Light feeding',
      repottingRootSensitivity: 'Avoid root damage',
      growthHabit: 'Climbing vine',
      summaryCare: 'Provide support and avoid stagnant moisture',
      reviewStatus: 'REVIEWED',
    }
    const create = (name: string) =>
      db.plantDefinition.create({
        data: {
          collectionId: c.id,
          genus: 'Hoya',
          species: 'carnosa',
          cultivarName: name,
          husbandryGuide: { create: { collectionId: c.id, ...full } },
        },
      })
    const [a, b, d] = await Promise.all([
      create('Target A'),
      create('Source B'),
      create('Target D'),
    ])
    const propose = async (target: any, title: string) => {
      const context = await consolidationContext(db, c.id, target.id)
      assert.ok(context.candidates.some((s) => s.id === b.id))
      return db.aiCuratorSuggestion.create({
        data: {
          collectionId: c.id,
          plantDefinitionId: target.id,
          targetField: 'husbandryLink',
          phase: 'ENRICHMENT',
          suggestionType: 'HUSBANDRY_CONSOLIDATION',
          title,
          reasoning:
            'These independently evaluated plants have compatible cultivation requirements.',
          confidence: 0.95,
          currentValue: JSON.parse(JSON.stringify({ consolidation: context })),
          suggestedValue: {
            shouldRecommendLink: true,
            compatible: true,
            evidenceSufficient: true,
            targetPlantDefinitionId: target.id,
            sourcePlantDefinitionId: b.id,
            confidence: 0.95,
            compatibleDimensions: Object.keys(compatibilityDimensions),
            similarities: ['Compatible moisture, temperature and light needs.'],
            minorDifferences: ['Growth rate varies slightly by cultivar.'],
            criticalDifferences: [],
            botanicalReasoning:
              'Cultivation evidence supports the same guidance across all evaluated dimensions.',
            sourceQualityAssessment:
              'A reviewed source with representative, complete care guidance.',
            evidenceLimitations:
              'Limited cultivar-specific studies require explicit human review.',
          },
        },
      })
    }
    const initial = await propose(a, 'Browser husbandry consolidation')
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    await page
      .context()
      .addCookies([{ name: 'axildb_session', value: token, url: base }])
    let request: any
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.headers()['next-action'])
        request = { headers: r.headers(), body: r.postDataBuffer() }
    })
    await page.goto(`${base}/server/ai-curator`)
    const card = page
      .locator('details')
      .filter({
        has: page.getByText('Browser husbandry consolidation', { exact: true }),
      })
      .first()
    await card.locator('summary').first().click()
    await expect(card).toContainText('Its independent guide will be preserved')
    await card
      .locator('summary')
      .filter({ hasText: 'View side-by-side care comparison' })
      .click()
    await expect(card).toContainText('Identical stored guidance')
    await card
      .getByRole('button', { name: 'Approve Link', exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (
            await db.aiCuratorSuggestion.findUniqueOrThrow({
              where: { id: initial.id },
            })
          ).status
      )
      .toBe('ACCEPTED')
    assert.equal(
      (
        await db.plantHusbandryGuide.findUniqueOrThrow({
          where: { plantDefinitionId: a.id },
        })
      ).summaryWater,
      full.summaryWater
    )
    await page.goto(`${base}/c/${c.slug}/plants/${a.id}/edit`)
    await page
      .getByRole('button', {
        name: 'Restore preserved independent guide',
        exact: true,
      })
      .click()
    await expect
      .poll(
        async () =>
          (
            await db.plantHusbandryGuide.findUniqueOrThrow({
              where: { plantDefinitionId: a.id },
            })
          ).sourcePlantDefinitionId
      )
      .toBe(null)
    const stale = await propose(d, 'Browser stale comparison')
    await db.plantHusbandryGuide.update({
      where: { plantDefinitionId: b.id },
      data: {
        summaryWater: 'Allow to dry completely; inspect roots periodically',
      },
    })
    await page.goto(`${base}/server/ai-curator`)
    const staleCard = page
      .locator('details')
      .filter({
        has: page.getByText('Browser stale comparison', { exact: true }),
      })
      .first()
    await staleCard.locator('summary').first().click()
    await staleCard
      .getByRole('button', { name: 'Approve Link', exact: true })
      .click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'husbandry link was not applied' })
    ).toBeVisible()
    assert.equal(
      (
        await db.aiCuratorSuggestion.findUniqueOrThrow({
          where: { id: stale.id },
        })
      ).status,
      'STALE'
    )
    assert.equal(
      (
        await db.plantHusbandryGuide.findUniqueOrThrow({
          where: { plantDefinitionId: d.id },
        })
      ).sourcePlantDefinitionId,
      null
    )
    const first = await propose(a, 'Batch A'),
      second = await propose(d, 'Batch D')
    await page.reload()
    await page
      .locator('summary')
      .filter({ hasText: 'Batch review (up to 50 pending comparisons)' })
      .click()
    await page.locator(`input[type=checkbox][name=suggestionId][value="${first.id}"]`).check()
    await page.locator(`input[type=checkbox][name=suggestionId][value="${second.id}"]`).check()
    await page.locator('input[name=confirmed]').check()
    await page
      .getByRole('button', { name: 'Approve selected links', exact: true })
      .click()
    await expect
      .poll(() =>
        db.aiCuratorSuggestion.count({
          where: { id: { in: [first.id, second.id] }, status: 'ACCEPTED' },
        })
      )
      .toBe(2)
    assert.equal(
      (await researchReviewQueues(db, c.id, c.slug, true))[0].count,
      0
    )
    const auditCount = await db.auditLog.count({
      where: { collectionId: c.id },
    })
    assert.ok(request)
    const anon = await browser.newContext()
    await anon.request.post(`${base}/server/ai-curator`, {
      headers: {
        'Next-Action': request.headers['next-action'],
        'Content-Type': request.headers['content-type'],
        Origin: base,
      },
      data: request.body,
      maxRedirects: 0,
    })
    await anon.close()
    assert.equal(
      await db.auditLog.count({ where: { collectionId: c.id } }),
      auditCount
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    )
    await page.screenshot({
      path: '/tmp/axildb-consolidation-mobile.png',
      fullPage: true,
    })
    console.log(
      'Consolidation browser: comparison, approved link preservation, explicit restore, stale explanation, safe batch approval, dashboard counts, unauthorized rejection and mobile/dark layout passed.'
    )
  } finally {
    await db.collection.delete({ where: { id: c.id } })
    await db.user.delete({ where: { id: user.id } })
    await browser.close()
    await db.$disconnect()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
