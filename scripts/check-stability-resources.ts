import assert from 'node:assert/strict'
import { normalizeTimeZone, startOfDayInTimeZone, formatDate } from '../lib/time'
import { observeHttp, observeOperation, runtimeDiagnostics, errorCategory } from '../lib/runtime-diagnostics'
async function main() {
  const original = Intl.DateTimeFormat
  let allocations = 0
  Intl.DateTimeFormat = new Proxy(original, { construct(target, args) { allocations++; return Reflect.construct(target, args) } })
  try {
    for (let i = 0; i < 1000; i++) {
      assert.equal(normalizeTimeZone('Pacific/Rarotonga'), 'Pacific/Rarotonga')
      startOfDayInTimeZone(new Date('2026-10-22T12:00Z'), 'Pacific/Rarotonga')
      formatDate('2026-10-22', 'Pacific/Rarotonga')
      assert.equal(normalizeTimeZone('invalid-test-zone'), 'America/New_York')
    }
    assert.ok(allocations <= 5, `Repeated calendar work allocated ${allocations} formatters`)
  } finally { Intl.DateTimeFormat = original }
  const before = runtimeDiagnostics()
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const pending = Array.from({ length: 32 }, () => observeHttp('test.mutation', true, async () => { await gate; return new Response(null, { status: 200 }) }))
  const overloaded = await observeHttp('test.mutation', true, async () => { throw new Error('Overload must not start work') })
  assert.equal(overloaded.status, 503)
  finish(); assert.ok((await Promise.all(pending)).every(response => response.status === 200))
  await assert.rejects(observeOperation('test.failure', true, async () => { throw { code: 'P2024' } }))
  assert.equal(runtimeDiagnostics().activeRequests, before.activeRequests)
  assert.equal(runtimeDiagnostics().inFlightMutations, before.inFlightMutations)
  assert.equal(errorCategory({ code: 'P2024' }), 'database_pool_timeout')
  assert.equal(errorCategory({ code: 'P1001' }), 'database_connection')
  assert.equal(errorCategory({ code: 'P2034' }), 'database_transaction')
  console.log('Stability resources: formatter reuse, overload rejects before work, mutation capacity, counters released on errors, and sanitized database classifications passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
