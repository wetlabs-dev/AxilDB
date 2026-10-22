import { randomUUID } from 'node:crypto'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { processMemory } from '@/lib/process-memory'

type Metric = { count: number; errors: number; totalMs: number; maxMs: number }
function createState() {
  const delay = monitorEventLoopDelay({ resolution: 50 }); delay.enable()
  return { delay, startedAt: new Date().toISOString(), active: 0, mutations: 0, peakActive: 0, operations: new Map<string, Metric>() }
}
const root = globalThis as unknown as { axildbRuntime?: ReturnType<typeof createState> }
function state() { return root.axildbRuntime ||= createState() }
export function runtimeDiagnostics() {
  const s = state()
  return { startedAt: s.startedAt, ...processMemory(), activeRequests: s.active, inFlightMutations: s.mutations, peakActiveRequests: s.peakActive, eventLoop: { p99Ms: s.delay.count ? s.delay.percentile(99) / 1e6 : 0, maxMs: s.delay.count ? s.delay.max / 1e6 : 0, utilization: performance.eventLoopUtilization().utilization }, operations: Object.fromEntries(s.operations) }
}
export function errorCategory(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (['P1001', 'P1002', 'P1017'].includes(code)) return 'database_connection'
  if (code === 'P2024') return 'database_pool_timeout'
  if (['P2028', 'P2034'].includes(code)) return 'database_transaction'
  if (code.startsWith('P')) return 'database'
  return error instanceof TypeError ? 'network_or_type' : 'application'
}
// Names are supplied by code, never URLs, user IDs, or raw request data.
export async function observeOperation<T>(name: string, mutation: boolean, work: () => Promise<T>, status: (result: T) => number = () => 200): Promise<T> {
  const s = state(), started = performance.now(), requestId = randomUUID()
  s.active++; if (mutation) s.mutations++; s.peakActive = Math.max(s.peakActive, s.active)
  let httpStatus = 200, category: string | undefined
  try { const result = await work(); httpStatus = status(result); return result }
  catch (error) { httpStatus = 500; category = errorCategory(error); throw error }
  finally {
    const durationMs = performance.now() - started
    s.active--; if (mutation) s.mutations--
    // Fixed call sites currently use fewer than ten keys; enforce a hard bound anyway.
    const key = s.operations.has(name) || s.operations.size < 32 ? name : 'other'
    const metric = s.operations.get(key) || { count: 0, errors: 0, totalMs: 0, maxMs: 0 }
    metric.count++; if (httpStatus >= 400) metric.errors++; metric.totalMs += durationMs; metric.maxMs = Math.max(metric.maxMs, durationMs); s.operations.set(key, metric)
    console.info(JSON.stringify({ event: 'application_operation', timestamp: new Date().toISOString(), requestId, operation: key, durationMs: Math.round(durationMs), status: httpStatus, category, activeRequests: s.active, inFlightMutations: s.mutations, ...(durationMs > 1000 || httpStatus >= 400 || metric.count % 20 === 0 ? { memory: processMemory() } : {}) }))
  }
}

/** Bound expensive work without retaining request bodies in a process-local wait queue. */
export async function observeHttp(name: string, mutation: boolean, work: () => Promise<Response>) {
  return observeOperation(name, mutation, async () => {
    const current = state()
    if (mutation ? current.mutations > 32 : current.active - current.mutations > 8) {
      return new Response(JSON.stringify({ error: 'The server is busy. Check whether your action was saved before retrying.', category: 'overload' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '1', 'Cache-Control': 'no-store' } })
    }
    return work()
  }, response => response.status)
}
