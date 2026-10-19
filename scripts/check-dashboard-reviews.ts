import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpenReviewItems } from '../components/OpenReviewItems'
import {
  researchReviewQueues,
  summarizeReviewQueues,
  type OpenReviewItem,
} from '../lib/dashboard-reviews'
import { isActionableCadenceProposal } from '../lib/cadence-review'
import type { PrismaClient } from '@prisma/client'

const queue = (label: string, count: number | null): OpenReviewItem => ({
  label,
  count,
  href: '/review',
  description: 'Review these recommendations.',
})
// The standalone tsx harness uses classic JSX; Next provides React automatically.
Object.assign(globalThis, { React })
async function main() {
  for (const [curator, cadences, total, queues] of [
    [111, 37, 148, 2],
    [111, 0, 111, 1],
    [0, 37, 37, 1],
    [0, 0, 0, 0],
    [0, 1, 1, 1],
  ]) {
    const items = [
      queue('AI Curator suggestions', curator),
      queue('Care cadence suggestions', cadences),
    ]
    const s = summarizeReviewQueues(items)
    assert.equal(s.count, total)
    assert.equal(s.queues, queues)
    const html = renderToStaticMarkup(
      React.createElement(OpenReviewItems, { items })
    )
    if (!total) assert.equal(html, '', 'preserve hidden empty panel')
    else {
      assert(
        html.includes(
          `${total} item${total === 1 ? '' : 's'} waiting for a decision.`
        )
      )
      assert(html.includes(`${queues} queue${queues === 1 ? '' : 's'}`))
      assert.equal(html.includes('Care cadence suggestions'), cadences > 0)
      assert.equal(html.includes('AI Curator suggestions'), curator > 0)
      assert(html.includes('focus-visible:ring-2'))
    }
  }
  assert.equal(
    summarizeReviewQueues([queue('a', 1), queue('b', 5)]).items[0].label,
    'b'
  )
  assert.deepEqual(
    summarizeReviewQueues([queue('a', 5), queue('b', 5)]).items.map(
      (q) => q.label
    ),
    ['a', 'b']
  )
  for (const items of [
    [queue('a', 3), queue('b', null)],
    [queue('a', null), queue('b', 2)],
    [queue('a', null), queue('b', null)],
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(OpenReviewItems, { items })
    )
    assert(html.includes('known items waiting'))
    assert(html.includes('temporarily unavailable'))
    assert(html.includes('Unavailable'))
    assert(!html.includes('All caught up'))
    assert(summarizeReviewQueues(items).unavailable)
  }
  let calls = 0,
    curatorFails = false,
    cadenceFails = true
  const mock = {
    aiCuratorSuggestion: {
      findMany: async () => {
        calls++
        if (curatorFails) throw new Error('DB unavailable')
        return [
          {
            currentValue: 'old',
            suggestedValue: 'new',
            targetField: 'description',
          },
        ]
      },
    },
    careCadenceProposal: {
      count: async () => {
        calls++
        if (cadenceFails) throw new Error('DB unavailable')
        return 2
      },
    },
  } as unknown as PrismaClient
  assert.deepEqual(await researchReviewQueues(mock, 'c', 'slug', false), [])
  assert.equal(calls, 0)
  let result = await researchReviewQueues(mock, 'c', 'slug', true)
  assert.equal(result[0].count, 1)
  assert.equal(result[1].count, null)
  curatorFails = true
  cadenceFails = false
  result = await researchReviewQueues(mock, 'c', 'slug', true)
  assert.equal(result[0].count, null)
  assert.equal(result[1].count, 2)
  cadenceFails = true
  result = await researchReviewQueues(mock, 'c', 'slug', true)
  assert.deepEqual(result.map(queue => queue.count), [null, null])
  curatorFails = false; cadenceFails = false
  result = await researchReviewQueues(mock, 'c', 'slug', true)
  assert.deepEqual(result.map(queue => queue.count), [1, 2], 'retry reconciles authoritative sources without cached failure')
  assert.equal(
    result[1].href,
    '/server/care-cadence-research?tab=review&collection=slug'
  )
  const d = { collectionId: 'c', careCadences: [], husbandryGuide: null }
  const p = {
    status: 'PENDING',
    applicability: 'RECOMMENDED',
    activity: 'WATERING',
    interval: 7,
    unit: 'DAY',
  }
  assert(isActionableCadenceProposal(p, d))
  for (const status of [
    'APPROVED',
    'REJECTED',
    'DISMISSED',
    'SUPERSEDED',
    'FAILED',
  ])
    assert(!isActionableCadenceProposal({ ...p, status }, d))
  for (const jobStatus of [
    'QUEUED',
    'RUNNING',
    'DEFERRED',
    'WAITING_FOR_HUMAN',
    'CANCELLED',
    'EXPIRED',
  ])
    assert(
      !isActionableCadenceProposal(
        { ...p, jobId: 'j', job: { status: jobStatus } },
        d
      )
    )
  assert(
    isActionableCadenceProposal(
      { ...p, jobId: 'j', job: { status: 'COMPLETED' } },
      d
    )
  )
  assert(!isActionableCadenceProposal({ ...p, interval: 0 }, d))
  assert(!isActionableCadenceProposal({ ...p, activity: 'FERTILIZING' }, d))
  assert(
    !isActionableCadenceProposal(
      { ...p, activity: 'FERTILIZING' },
      {
        ...d,
        husbandryGuide: {
          fertilizerRecipe: { active: true, collectionId: 'other' },
        },
      }
    )
  )
  assert(
    isActionableCadenceProposal(
      { ...p, activity: 'FERTILIZING' },
      {
        ...d,
        husbandryGuide: {
          fertilizerRecipe: { active: true, collectionId: 'c' },
        },
      }
    )
  )
  console.log(
    'Dashboard review summaries/rendering, empty/singular/plural, sorting, partial failures, retry, authorization and cadence eligibility checks passed.'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
