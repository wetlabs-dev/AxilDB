import { validRequestOrigin } from '@/lib/request-origin'
import { NextRequest, NextResponse } from 'next/server'
import { setTimeout as delay } from 'node:timers/promises'
import { getCurrentUser, requireServerAdmin, audit } from '@/lib/auth'
import {
  callDeploymentAgent,
  type DeploymentEvent,
  type DeploymentOperation,
} from '@/lib/deployment-agent'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
async function authorize() {
  if (!(await getCurrentUser()))
    throw new Error('Sign in with a verified server administrator account.')
  return requireServerAdmin()
}
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Deployment operation failed.'
  if (/NEXT_REDIRECT|permission|admin|Sign in/i.test(message))
    return json(
      { error: 'Verified server administrator access is required.' },
      403
    )
  return json({ error: message }, 409)
}
export async function GET(req: NextRequest) {
  try {
    const user = await authorize()
    const mode = req.nextUrl.searchParams.get('mode') || 'status'
    const id = req.nextUrl.searchParams.get('jobId') || ''
    if (!['status', 'job', 'events', 'recovery'].includes(mode))
      return json({ error: 'Invalid deployment operation.' }, 400)
    if (mode !== 'status' && !/^[a-f0-9]{32}$/.test(id))
      return json({ error: 'Invalid deployment job.' }, 400)
    if (mode === 'status')
      return json(await callDeploymentAgent('STATUS', user.id, {}, req.signal))
    if (mode === 'job') return json(await callDeploymentAgent('JOB', user.id, { jobId: id }, req.signal))
    if (mode === 'recovery')
      return json(
        await callDeploymentAgent(
          'RECOVERY_OPTIONS',
          user.id,
          { jobId: id },
          req.signal
        )
      )
    const rawCursor =
      req.headers.get('last-event-id') ||
      req.nextUrl.searchParams.get('after') ||
      '0'
    if (!/^\d{1,16}$/.test(rawCursor))
      return json({ error: 'Invalid event cursor.' }, 400)
    let cursor = Number(rawCursor)
    if (!Number.isSafeInteger(cursor))
      return json({ error: 'Invalid event cursor.' }, 400)
    if (req.nextUrl.searchParams.get('stream') !== '1')
      return json(
        await callDeploymentAgent(
          'EVENTS',
          user.id,
          {
            jobId: id,
            after: cursor,
          },
          req.signal
        )
      )
    const encoder = new TextEncoder()
    const cancellation = new AbortController()
    const signal = AbortSignal.any([
      req.signal,
      cancellation.signal,
      AbortSignal.timeout(25_000),
    ])
    let pending: DeploymentEvent[] = []
    let polled = false
    // Read only on demand: at most one bounded agent page plus one queued event.
    // Durable events are replayed by cursor, so a slow reader loses no history.
    const stream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          signal.addEventListener(
            'abort',
            () => {
              pending = []
              try {
                controller.close()
              } catch {}
            },
            { once: true }
          )
        },
        async pull(controller) {
          try {
            if (signal.aborted) {
              controller.close()
              return
            }
            if (!pending.length) {
              if (polled) await delay(1500, undefined, { signal })
              const result = await callDeploymentAgent<{
                events: DeploymentEvent[]
              }>('EVENTS', user.id, { jobId: id, after: cursor }, signal)
              pending = result.events
              polled = true
            }
            if (signal.aborted) {
              pending = []
              controller.close()
              return
            }
            const event = pending.shift()
            if (event) {
              cursor = event.id
              controller.enqueue(
                encoder.encode(
                  `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`
                )
              )
            } else controller.enqueue(encoder.encode(': connected\n\n'))
          } catch {
            pending = []
            try {
              controller.close()
            } catch {}
          }
        },
        cancel() {
          cancellation.abort()
          pending = []
        },
      },
      { highWaterMark: 1 }
    )
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'private, no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return failure(error)
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!validRequestOrigin(req))
      return json({ error: 'Invalid request origin.' }, 403)
    const user = await authorize()
    if (!req.headers.get('content-type')?.includes('application/json'))
      return json({ error: 'Expected JSON.' }, 400)
    const raw = await req.text()
    if (raw.length > 4096) return json({ error: 'Payload too large.' }, 400)
    const input = JSON.parse(raw)
    const allowed: Record<string, string[]> = {
      CHECK_UPDATES: [],
      PREFLIGHT: ['revision'],
      START_UPGRADE: [
        'revision',
        'requestId',
        'confirmed',
        'migrationApproval',
      ],
      ROLLBACK: ['jobId', 'confirmed'],
      RECONCILE: ['jobId', 'confirmed'],
    }
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      typeof input.operation !== 'string' ||
      !Object.prototype.hasOwnProperty.call(allowed, input.operation) ||
      Object.keys(input).some(
        (key) => key !== 'operation' && !allowed[input.operation].includes(key)
      )
    )
      return json({ error: 'Invalid deployment operation payload.' }, 400)
    if (
      ['PREFLIGHT', 'START_UPGRADE'].includes(input.operation) &&
      !/^[a-f0-9]{40}$/.test(input.revision || '')
    )
      return json({ error: 'Choose an exact approved revision.' }, 400)
    if (
      ['ROLLBACK', 'RECONCILE'].includes(input.operation) &&
      !/^[a-f0-9]{32}$/.test(input.jobId || '')
    )
      return json({ error: 'Invalid deployment job.' }, 400)
    if (
      ['START_UPGRADE', 'ROLLBACK', 'RECONCILE'].includes(input.operation) &&
      input.confirmed !== true
    )
      return json({ error: 'Explicit confirmation is required.' }, 400)
    if (
      input.operation === 'START_UPGRADE' &&
      !/^[a-f0-9-]{32,36}$/.test(input.requestId || '')
    )
      return json({ error: 'Invalid request identifier.' }, 400)
    if (
      input.migrationApproval !== undefined &&
      (typeof input.migrationApproval !== 'string' ||
        !/^[a-f0-9]{64}$/.test(input.migrationApproval))
    )
      return json({ error: 'Invalid migration approval.' }, 400)
    const { operation, ...fields } = input
    if (operation === 'START_UPGRADE') delete fields.confirmed
    await audit(
      user,
      'UPDATE',
      'APPLICATION_DEPLOYMENT',
      fields.jobId || null,
      `Requested ${operation}`,
      {
        revision: fields.revision,
        requestId: fields.requestId,
        migrationApproval: fields.migrationApproval,
      }
    )
    const result = await callDeploymentAgent(
      operation as DeploymentOperation,
      user.id,
      fields
    )
    return json(result)
  } catch (error) {
    return failure(error)
  }
}
