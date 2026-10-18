'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DeploymentEvent,
  DeploymentJob,
  DeploymentStatus,
  Preflight,
  RecoveryOptions,
  UpdateCheck,
} from '@/lib/deployment-agent'

const endpoint = '/api/server/application-updates'
const stages = [
  'PREFLIGHT',
  'BACKUP',
  'FETCHING',
  'PREPARING',
  'BUILDING',
  'MIGRATING',
  'DEPLOYING',
  'VERIFYING',
  'COMPLETED',
]
const short = (value?: string | null) =>
  value ? value.slice(0, 12) : 'Unknown'
async function responseJson(response: Response) {
  const data = await response.json()
  if (!response.ok)
    throw new Error(data.error || 'Deployment connection interrupted.')
  return data
}
export function ApplicationUpdates({ configured }: { configured: boolean }) {
  const [status, setStatus] = useState<DeploymentStatus | null>(null)
  const [update, setUpdate] = useState<UpdateCheck | null>(null)
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [jobId, setJobId] = useState('')
  const [events, setEvents] = useState<DeploymentEvent[]>([])
  const cursor = useRef(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [recovery, setRecovery] = useState<RecoveryOptions | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [confirmation, setConfirmation] = useState<{
    operation: 'START_UPGRADE' | 'ROLLBACK' | 'RECONCILE'
    revision?: string
    jobId?: string
  } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const logs = useRef<HTMLPreElement>(null)
  const job =
    status?.history.find((j) => j.id === jobId) ||
    (status?.activeJob?.id === jobId ? status.activeJob : null)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next: DeploymentStatus = await responseJson(
      await fetch(endpoint, { cache: 'no-store', signal })
    )
    if (signal?.aborted) return next
    setStatus(next)
    setReconnecting(false)
    if (next.checked) setUpdate(next.checked)
    setJobId((old) => {
      const remembered = old || localStorage.getItem('axildb-deployment-job')
      if (old && next.history.some((j) => j.id === old)) return old
      return (
        next.activeJob?.id ||
        (remembered && next.history.some((j) => j.id === remembered)
          ? remembered
          : next.history[0]?.id) ||
        ''
      )
    })
    return next
  }, [])
  useEffect(() => {
    if (!configured) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    let delay = 3000
    async function poll() {
      try {
        await refresh(controller.signal)
        delay = 3000
      } catch {
        if (!stopped) setReconnecting(true)
        delay = Math.min(30_000, delay * 2)
      }
      if (!stopped) timer = setTimeout(poll, delay)
    }
    void poll()
    return () => {
      stopped = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [configured, refresh])
  useEffect(() => {
    if (confirmation) dialog.current?.showModal()
    else dialog.current?.close()
  }, [confirmation])
  useEffect(() => {
    if (!jobId) return
    localStorage.setItem('axildb-deployment-job', jobId)
    cursor.current = 0
    setEvents([])
    setRecovery(null)
    let stopped = false
    let stream: EventSource | undefined
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    let delay = 1500
    function receive(batch: DeploymentEvent[]) {
      const fresh = batch.filter((e) => e.id > cursor.current)
      if (!fresh.length) return
      cursor.current = fresh[fresh.length - 1].id
      setEvents((old) => [...old, ...fresh].slice(-2000))
    }
    function connect() {
      if (stopped) return
      stream = new EventSource(
        `${endpoint}?mode=events&stream=1&jobId=${jobId}&after=${cursor.current}`
      )
      stream.onmessage = (event) => {
        if (stopped) return
        try {
          receive([JSON.parse(event.data)])
          delay = 1500
        } catch {}
      }
      stream.onerror = async () => {
        stream?.close()
        // Polling is also a fallback for proxies that buffer or do not support SSE.
        try {
          const result = await responseJson(
            await fetch(
              `${endpoint}?mode=events&jobId=${jobId}&after=${cursor.current}`,
              { cache: 'no-store', signal: controller.signal }
            )
          )
          if (!stopped) receive(result.events)
        } catch {
          if (!stopped) setReconnecting(true)
        }
        if (!stopped) {
          timer = setTimeout(connect, delay)
          delay = Math.min(30_000, delay * 2)
        }
      }
    }
    connect()
    return () => {
      stopped = true
      stream?.close()
      controller.abort()
      clearTimeout(timer)
    }
  }, [jobId])
  useEffect(() => {
    if (autoScroll && logs.current)
      logs.current.scrollTop = logs.current.scrollHeight
  }, [events, autoScroll])
  useEffect(() => {
    if (job?.status !== 'RECOVERY_REQUIRED') return
    const controller = new AbortController()
    let alive = true
    fetch(`${endpoint}?mode=recovery&jobId=${job.id}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(responseJson)
      .then((value) => {
        if (alive) setRecovery(value)
      })
      .catch(() => {})
    return () => {
      alive = false
      controller.abort()
    }
  }, [job?.id, job?.status])
  async function operate(
    operation: string,
    fields: Record<string, unknown> = {}
  ) {
    setBusy(true)
    setMessage('')
    try {
      const result = await responseJson(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation, ...fields }),
        })
      )
      if (operation === 'CHECK_UPDATES') {
        setUpdate(result)
        setPreflight(null)
        setMessage(
          result.eligible ? 'Update ready for review.' : 'AxilDB is up to date.'
        )
      }
      if (operation === 'PREFLIGHT') setPreflight(result)
      if (operation === 'START_UPGRADE') {
        setJobId(result.id)
        localStorage.setItem('axildb-deployment-job', result.id)
        setMessage(
          'Upgrade queued. The host agent continues independently of this browser.'
        )
        localStorage.removeItem('axildb-deployment-request')
      }
      if (operation === 'ROLLBACK' || operation === 'RECONCILE')
        setMessage(
          'Recovery request recorded. Watch the job for the verified result.'
        )
      await refresh()
    } catch (error) {
      if (
        operation === 'START_UPGRADE' &&
        error instanceof Error &&
        /unavailable|interrupted|restarting|timed out|fetch/i.test(
          error.message
        )
      )
        setReconnecting(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not confirm this request. Reconnect and check the active job before retrying.'
      )
    } finally {
      setBusy(false)
    }
  }
  async function confirm() {
    if (!confirmation) return
    const current = confirmation
    setConfirmation(null)
    if (current.operation === 'START_UPGRADE') {
      let requestId = crypto.randomUUID()
      try {
        const saved = JSON.parse(
          localStorage.getItem('axildb-deployment-request') || 'null'
        )
        if (saved?.revision === current.revision) requestId = saved.id
      } catch {}
      localStorage.setItem(
        'axildb-deployment-request',
        JSON.stringify({ id: requestId, revision: current.revision })
      )
      await operate('START_UPGRADE', {
        revision: current.revision,
        confirmed: true,
        requestId,
      })
    } else
      await operate(current.operation, {
        jobId: current.jobId,
        confirmed: true,
      })
  }
  const logText = (entries: DeploymentEvent[]) =>
    entries
      .map((e) => `${e.timestamp} [${e.stage}] ${e.level} ${e.message}`)
      .join('\n')
  async function allLogs() {
    const result: DeploymentEvent[] = []
    let after = 0
    while (jobId) {
      const page = await responseJson(
        await fetch(`${endpoint}?mode=events&jobId=${jobId}&after=${after}`, {
          cache: 'no-store',
        })
      )
      if (!page.events.length) break
      result.push(...page.events)
      after = result[result.length - 1].id
      if (page.events.length < 500) break
    }
    return logText(result)
  }
  if (!configured)
    return (
      <div className="rounded-lg border p-5">
        <h2 className="text-xl font-bold">
          Host deployment agent not configured
        </h2>
        <p>
          The first installation requires local host administration. Follow
          docs/APPLICATION_UPDATES.md to install the independent service,
          private socket and backend authentication key. The web application
          cannot install its own host privileges.
        </p>
      </div>
    )
  return (
    <div className="space-y-5 [&_button]:rounded-md [&_button]:border [&_button]:border-stone-300 [&_button]:px-3 [&_button]:py-2 [&_button]:font-semibold [&_button:disabled]:opacity-50">
      {reconnecting && (
        <p role="status" className="rounded-lg bg-amber-50 p-3">
          AxilDB may be restarting with the updated application. Connection will
          resume automatically. A lost connection does not mean the deployment
          failed.
        </p>
      )}
      <p role="status">{busy ? 'Contacting the deployment agent…' : message}</p>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xl font-bold">Current installation</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt>Current revision</dt>
            <dd className="break-all font-mono">
              {status?.revision || 'Waiting for agent'}
            </dd>
          </div>
          <div>
            <dt>Release channel</dt>
            <dd>{status?.branch || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Health</dt>
            <dd>
              {status?.health.status || 'Checking'}
              {status?.health.message && <p>{status.health.message}</p>}
            </dd>
          </div>
          <div>
            <dt>Deployed</dt>
            <dd>
              {status?.deployedAt
                ? new Date(status.deployedAt).toLocaleString()
                : 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt>Last successful upgrade</dt>
            <dd>
              {status?.lastSuccessfulUpgrade
                ? `${short(status.lastSuccessfulUpgrade.revision)} · ${new Date(status.lastSuccessfulUpgrade.finished!).toLocaleString()}`
                : 'None recorded'}
            </dd>
          </div>
          <div>
            <dt>Active job</dt>
            <dd>
              {status?.activeJob
                ? `${status.activeJob.stage} · ${status.activeJob.status}`
                : 'None'}
            </dd>
          </div>
        </dl>
        <button
          disabled={busy || Boolean(status?.activeJob)}
          onClick={() => operate('CHECK_UPDATES')}
        >
          Check for Updates
        </button>
      </section>
      {update && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-xl font-bold">
            {update.eligible && status?.revision !== update.revision
              ? 'Available update'
              : 'AxilDB is up to date'}
          </h2>
          <p>
            Current: {short(status?.revision || update.current)} · Target:{' '}
            <span className="break-all font-mono">{update.revision}</span> ·{' '}
            {update.ahead} commits ·{' '}
            {update.fastForward ? 'Fast-forward' : 'Diverged'} ·{' '}
            {update.clean ? 'Clean working tree' : 'Working tree modified'}
          </p>
          <ul className="list-disc pl-5">
            {update.commits.map((commit) => (
              <li key={commit.revision}>
                {short(commit.revision)} · {commit.subject}
              </li>
            ))}
          </ul>
          {update.eligible && status?.revision !== update.revision && (
            <button
              disabled={busy || Boolean(status?.activeJob)}
              onClick={() =>
                operate('PREFLIGHT', { revision: update.revision })
              }
            >
              Run Preflight
            </button>
          )}
        </section>
      )}
      {preflight && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-xl font-bold">Preflight checks</h2>
          <ul>
            {preflight.checks.map((check) => (
              <li key={check.name}>
                {check.ok ? '✓' : '✕'} {check.name}
                {check.message && `: ${check.message}`}
              </li>
            ))}
          </ul>
          <p>
            {preflight.migrations.length
              ? `${preflight.migrations.length} new migrations require deployment. Schema compatibility with the previous application is unproven; automatic database rollback is unavailable.`
              : 'No new migration files.'}
          </p>
          <ul>
            {preflight.migrations.map((file) => (
              <li key={file} className="break-all font-mono text-sm">
                {file}
              </li>
            ))}
          </ul>
          <button
            disabled={
              busy ||
              !preflight.ready ||
              preflight.revision !== update?.revision ||
              Boolean(status?.activeJob)
            }
            onClick={() =>
              setConfirmation({
                operation: 'START_UPGRADE',
                revision: preflight.revision,
              })
            }
          >
            Review Upgrade
          </button>
        </section>
      )}
      {job && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-xl font-bold">
            Upgrade progress · {job.status.replaceAll('_', ' ')}
          </h2>
          <p className="break-all">
            Job {job.id} · Target {job.revision} · Previous{' '}
            {job.previous || 'Not captured'}
          </p>
          <p>
            Requested by administrator {job.actor} ·{' '}
            {new Date(job.created).toLocaleString()}
            {job.finished &&
              job.started &&
              ` · ${Math.round((Date.parse(job.finished) - Date.parse(job.started)) / 1000)} seconds`}
          </p>
          <ol className="grid gap-2 sm:grid-cols-3">
            {stages.map((stage, i) => (
              <li key={stage}>
                {job.status === 'COMPLETED' || stages.indexOf(job.stage) > i
                  ? '✓'
                  : job.stage === stage
                    ? '●'
                    : '○'}{' '}
                {stage.toLowerCase()}
              </li>
            ))}
          </ol>
          <p>
            Current stage: {job.stage}.{' '}
            {job.data.migrationStatus &&
              `Migrations: ${job.data.migrationStatus}.`}{' '}
            Backup: {job.data.backup || 'Not completed'}
          </p>
          {job.data.error && (
            <p role="alert" className="rounded bg-red-50 p-3">
              {job.data.failedStage}: {job.data.error}
            </p>
          )}
          {job.data.recoveryResult && <p>{job.data.recoveryResult}</p>}
          {job.status === 'RECOVERY_REQUIRED' && (
            <div className="space-y-2 rounded bg-amber-50 p-3">
              <h3 className="font-bold">Recovery Required</h3>
              <p>
                {recovery?.manualRecovery ||
                  'Inspect the host agent and actual service state before recovery.'}
              </p>
              <ul>
                {recovery?.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <button
                disabled={busy || !recovery?.applicationRollback}
                onClick={() =>
                  setConfirmation({ operation: 'ROLLBACK', jobId: job.id })
                }
              >
                Review Application-only Recovery
              </button>
              <button
                disabled={
                  busy ||
                  job.data.migrationStatus === 'MAY_HAVE_PARTIALLY_COMMITTED'
                }
                onClick={() =>
                  setConfirmation({ operation: 'RECONCILE', jobId: job.id })
                }
              >
                Verify and Reconcile Running Target
              </button>
              <p>
                Database restore is a separate explicitly authorized host
                operation. See{' '}
                <a className="underline" href="/server/migrations">
                  Migration and restore management
                </a>
                .
              </p>
            </div>
          )}
          <details>
            <summary className="cursor-pointer font-semibold">
              Detailed deployment logs
            </summary>
            <div className="my-2 flex flex-wrap gap-3">
              <label>
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(event) => setAutoScroll(event.target.checked)}
                />{' '}
                Auto-scroll
              </label>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(await allLogs())
                    setMessage('Sanitized logs copied.')
                  } catch {
                    setMessage('Could not copy logs. Use download instead.')
                  }
                }}
              >
                Copy sanitized logs
              </button>
              <button
                onClick={async () => {
                  try {
                    const url = URL.createObjectURL(
                      new Blob([await allLogs()], { type: 'text/plain' })
                    )
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `axildb-deployment-${jobId}.log`
                    link.click()
                    URL.revokeObjectURL(url)
                  } catch {
                    setMessage('Logs unavailable. Reconnect and try again.')
                  }
                }}
              >
                Download sanitized logs
              </button>
            </div>
            <p className="text-xs">
              Latest {events.length} entries shown. Download includes all
              retained entries.
            </p>
            <pre
              ref={logs}
              className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded !bg-stone-900 p-3 text-xs !text-stone-100"
            >
              {logText(events) || 'Waiting for retained events…'}
            </pre>
          </details>
        </section>
      )}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xl font-bold">Deployment history</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {['Date', 'Target', 'Administrator', 'Status', 'Details'].map(
                  (name) => (
                    <th key={name} className="p-2">
                      {name}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {status?.history.map((item) => (
                <tr key={item.id}>
                  <td className="p-2">
                    {new Date(item.created).toLocaleString()}
                  </td>
                  <td className="p-2 font-mono">{short(item.revision)}</td>
                  <td className="p-2">{item.actor}</td>
                  <td className="p-2">{item.status.replaceAll('_', ' ')}</td>
                  <td className="p-2">
                    <button onClick={() => setJobId(item.id)}>View job</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {confirmation && (
        <dialog
          ref={dialog}
          onCancel={() => setConfirmation(null)}
          className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 backdrop:bg-black/40"
        >
          <h2 className="text-xl font-bold">
            {confirmation.operation === 'START_UPGRADE'
              ? 'Upgrade AxilDB'
              : 'Confirm recovery request'}
          </h2>
          <p>
            Current revision: {short(status?.revision)} · Target:{' '}
            {short(confirmation.revision || job?.previous)}
          </p>
          <p>
            {confirmation.operation === 'START_UPGRADE'
              ? 'The host agent will revalidate preflight, create and verify a backup checkpoint, build the exact approved revision, apply required migrations, restart affected application services and verify readiness. AxilDB may be temporarily unavailable.'
              : confirmation.operation === 'ROLLBACK'
                ? 'Restore only the captured previous application images after rechecking unchanged schema history. This does not restore or reverse the database.'
                : 'Verify the target revision, database and proxy readiness before recording an interrupted deployment as completed. No deployment or migration operation is replayed.'}
          </p>
          <div className="flex gap-3">
            <button autoFocus onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button disabled={busy} onClick={confirm}>
              {confirmation.operation === 'START_UPGRADE'
                ? 'Start Upgrade'
                : 'Confirm Recovery'}
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
