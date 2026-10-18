import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { getCareQueueStore } from '../lib/care-queue-store'
import { BoundedCache } from '../lib/bounded-cache'
import { RequestLimiter } from '../lib/request-limiter'
import { ResourceSlots } from '../lib/image-processing'
import {
  availableMemory,
  parseAvailableMemory,
  processMemory,
} from '../lib/process-memory'

async function main() {
  assert.notEqual(
    getCareQueueStore('SSR', 'user'),
    getCareQueueStore('SSR', 'user'),
    'SSR does not retain per-user queue stores'
  )
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  try {
    const active = getCareQueueStore('active', 'user')
    const unsubscribe = active.subscribe(() => {})
    const idle = getCareQueueStore('idle', 'user')
    for (let n = 0; n < 100; n++) getCareQueueStore(String(n), 'user')
    assert.equal(
      getCareQueueStore('active', 'user'),
      active,
      'subscribed stores survive pruning'
    )
    assert.notEqual(
      getCareQueueStore('idle', 'user'),
      idle,
      'idle snapshots are evicted'
    )
    unsubscribe()
  } finally {
    Reflect.deleteProperty(globalThis, 'window')
  }
  let now = 0
  const cache = new BoundedCache<number>(3, 100, () => now)
  for (let n = 0; n < 10_000; n++) cache.set(String(n), n)
  assert.equal(cache.size, 3)
  assert.equal(cache.get('9997'), 9997)
  cache.set('new', 1)
  assert.equal(cache.get('9998'), undefined, 'LRU entry evicted')
  now = 100
  assert.equal(cache.size, 0, 'idle entries expire without a timer')
  const limiter = new RequestLimiter(3, 1000, () => now)
  assert.equal(limiter.allow('a', 2), true)
  assert.equal(limiter.allow('a', 2), true)
  assert.equal(limiter.allow('a', 2), false)
  limiter.allow('b', 2)
  limiter.allow('c', 2)
  assert.equal(
    limiter.allow('d', 2),
    false,
    'capacity fails closed instead of evicting active limits'
  )
  assert.equal(limiter.allow('a', 2), false)
  now = 61_100
  assert.equal(limiter.allow('d', 2), true)
  assert.equal(limiter.size, 1, 'expired inactive users removed')
  assert.equal(limiter.allow('invalid', NaN), false)
  const slots = new ResourceSlots(2)
  const release = slots.acquire()!,
    other = slots.acquire()!
  assert.equal(slots.acquire(), null)
  release()
  release()
  assert.equal(slots.inUse, 1, 'release is idempotent')
  const next = slots.acquire()!
  other()
  next()
  assert.equal(slots.inUse, 0)
  assert.equal(
    parseAvailableMemory('MemFree: 123 kB\nMemAvailable: 2000 kB\n'),
    2048000
  )
  assert.equal(
    availableMemory({ systemFreeBytes: 1, systemAvailableBytes: 10 }),
    10
  )
  assert.equal(
    availableMemory({ systemFreeBytes: 1 }),
    1,
    'legacy snapshots remain readable'
  )
  assert(processMemory().rssBytes > 0)

  // Execute the real preview fetch function: rejected promises must not poison the cache.
  const source = readFileSync('components/PlantIdPreviewLink.tsx', 'utf8')
  const block = source.slice(
    source.indexOf('const previewCache'),
    source.indexOf('function formatRelativeDate')
  )
  let requests = 0
  const context = vm.createContext({
    BoundedCache,
    AbortSignal,
    fetch: async () => {
      requests++
      if (requests === 1) throw new Error('offline')
      return { ok: true, json: async () => ({ plantId: 'example' }) }
    },
  })
  vm.runInContext(
    ts.transpile(
      block +
        '\nglobalThis.load = fetchPreview; globalThis.size = () => previewCache.size'
    ),
    context
  )
  await assert.rejects(context.load('test', '1'))
  await context.load('test', '1')
  assert.equal(requests, 2)
  for (let n = 0; n < 1000; n++) await context.load('test', String(n))
  assert.equal(context.size(), 128)

  // Execute the actual route's stream construction without auth/host dependencies.
  const route = readFileSync(
    'app/api/server/application-updates/route.ts',
    'utf8'
  )
  const streamBlock = route.slice(
    route.indexOf('    const encoder'),
    route.indexOf('    return new Response(stream')
  )
  let calls = 0,
    readSignal: AbortSignal | undefined
  const streaming = vm.createContext({
    TextEncoder,
    ReadableStream,
    AbortController,
    AbortSignal,
    Date,
    req: { signal: new AbortController().signal },
    user: { id: 'admin' },
    id: 'job',
    cursor: 0,
    delay: async () => {},
    callDeploymentAgent: async (
      _operation: string,
      _actor: string,
      _fields: unknown,
      signal: AbortSignal
    ) => {
      calls++
      readSignal = signal
      return {
        events: Array.from({ length: 500 }, (_, i) => ({
          id: i + 1,
          message: 'x'.repeat(4000),
        })),
      }
    },
  })
  vm.runInContext(
    ts.transpile(streamBlock + '\nglobalThis.stream = stream'),
    streaming
  )
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(calls, 1, 'idle slow reader causes only one agent page fetch')
  const reader = streaming.stream.getReader()
  const first = await reader.read()
  assert.match(new TextDecoder().decode(first.value), /^id: 1\n/)
  await reader.cancel()
  assert.equal(
    readSignal?.aborted,
    true,
    'disconnect cancels transport and wait'
  )
  assert.equal(calls, 1)
  console.log(
    'Memory resource regressions passed: bounded cache, retry, fail-closed limiter, image slots, metric semantics, SSE demand/cancel.'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
