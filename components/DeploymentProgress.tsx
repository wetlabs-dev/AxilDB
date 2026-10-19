'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, Circle, Copy, LoaderCircle, Minus, TriangleAlert } from 'lucide-react'
import type { DeploymentEvent, DeploymentJob } from '@/lib/deployment-agent'
import { deploymentProgress, deploymentStatusLabel, terminalDeployment } from '@/lib/deployment-progress'

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
export function DeploymentProgress({ job, events, reconnecting, connectionLost }: { job: DeploymentJob; events: DeploymentEvent[]; reconnecting: boolean; connectionLost: boolean }) {
  const progress = deploymentProgress(job)
  const [copied, setCopied] = useState('')
  const [clock, setClock] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const previous = useRef(`${job.id}:${job.stage}:${job.status}`)
  const previousRows = useRef(new Map(progress.rows.map(row => [row.id, row.status])))
  const [justCompleted, setJustCompleted] = useState<string[]>([])
  useEffect(() => {
    const next = `${job.id}:${job.stage}:${job.status}`
    if (next !== previous.current) setAnnouncement(`${deploymentStatusLabel(job.status)}. ${progress.active?.label || (progress.success ? 'Upgrade completed successfully.' : job.data.failedStage || job.stage)}`)
    previous.current = next
    const newlyCompleted = progress.rows.filter(row => row.status === 'completed' && previousRows.current.get(row.id) === 'active').map(row => row.id)
    previousRows.current = new Map(progress.rows.map(row => [row.id, row.status]))
    setJustCompleted(newlyCompleted)
    const timer = setTimeout(() => setJustCompleted([]), 250)
    return () => clearTimeout(timer)
  }, [job.id, job.stage, job.status, job.data.migrationStatus])
  useEffect(() => {
    if (job.status !== 'RUNNING') { setClock(null); return }
    setClock(Date.now())
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [job.id, job.status])
  const stageStart = events.find(event => event.stage === progress.active?.id && event.message === progress.active?.label)?.timestamp
  const elapsed = stageStart && clock !== null ? Math.max(0, Math.floor((clock - Date.parse(stageStart)) / 1000)) : null
  const failed = progress.rows.find(row => row.status === 'failed')
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(`${label} copied.`) }
    catch { setCopied(`Could not copy ${label.toLowerCase()}. Select the text to copy it.`) }
  }
  return <div className="deployment-progress" data-deployment-progress>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
    <header className="deployment-progress-header">
      <div><p className="deployment-eyebrow">Application upgrade</p><h2 className="text-xl font-bold">Deployment progress</h2><p className="deployment-caption">Target revision <span className="font-mono">{job.revision.slice(0, 7)}</span></p></div>
      <span className={`deployment-status ${progress.success ? 'deployment-status-success' : failed ? 'deployment-status-failure' : ''}`}>{deploymentStatusLabel(job.status)}</span>
    </header>
    <div className={`deployment-meter ${!progress.determinate ? 'deployment-meter-indeterminate' : ''}`} role="progressbar" aria-label="Deployment stages processed" aria-valuemin={progress.determinate ? 0 : undefined} aria-valuemax={progress.determinate ? progress.total : undefined} aria-valuenow={progress.determinate ? progress.settled : undefined} aria-valuetext={progress.determinate ? `${progress.completed} completed, ${progress.skipped} skipped, of ${progress.total} stages` : 'Waiting for authoritative stage information'}>
      <div style={{ width: progress.determinate ? `${progress.settled / progress.total * 100}%` : '30%' }} />
    </div>
    <p className="deployment-caption">{progress.determinate ? `${progress.settled} of ${progress.total} stages processed · ${progress.completed} completed${progress.skipped ? ` · ${progress.skipped} skipped` : ''}` : 'Waiting for stage information…'}</p>
    {reconnecting && !terminalDeployment(job.status) && <p className="deployment-connection" role="status">{connectionLost ? 'Deployment status is temporarily unknown. Keep this page open or check the host agent if connectivity does not return. The last confirmed progress is preserved.' : 'Reconnecting to AxilDB… The application may briefly disconnect while updated containers start. Connection will resume automatically.'}</p>}
    {job.status === 'RUNNING' && !progress.active && <p className="deployment-caption">{job.stage === 'COMPLETED' ? 'Finalizing the deployment result…' : 'Waiting for the next confirmed operation…'}</p>}
    <ol className="deployment-timeline" aria-label="Application upgrade stages">
      {progress.rows.map((stage, index) => {
        const Icon = stage.status === 'completed' ? Check : stage.status === 'active' ? LoaderCircle : stage.status === 'failed' ? TriangleAlert : stage.status === 'skipped' ? Minus : Circle
        const label = stage.status === 'active' ? 'In progress' : stage.status === 'completed' ? 'Completed' : stage.status === 'failed' ? 'Failed' : stage.status === 'skipped' ? 'Skipped' : 'Pending'
        return <li key={stage.id} className={`deployment-stage deployment-stage-${stage.status}`} data-stage={stage.id} data-stage-status={stage.status} aria-current={stage.status === 'active' ? 'step' : undefined}>
          {index < progress.rows.length - 1 && <span className={`deployment-connector ${['completed', 'skipped'].includes(stage.status) ? 'deployment-connector-done' : ''}`} aria-hidden="true" />}
          <span className="deployment-stage-indicator" aria-hidden="true"><Icon className={`${stage.status === 'active' ? 'deployment-spinner' : ''} ${justCompleted.includes(stage.id) ? 'deployment-check-enter' : ''}`} size={15} strokeWidth={2} /></span>
          <div className="deployment-stage-content"><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="font-semibold">{stage.label}</span><span className="deployment-stage-label">{label}{stage.status === 'active' && elapsed !== null ? ` · ${duration(elapsed)}` : ''}</span></div>
            {stage.status !== 'pending' && <p className="deployment-caption">{stage.status === 'completed' ? stage.done : stage.status === 'skipped' ? 'No database migrations required' : stage.status === 'failed' ? 'This operation did not finish. Inspect the error and detailed logs below.' : stage.description}</p>}
          </div>
        </li>
      })}
    </ol>
    {progress.success && <p className="deployment-success"><Check size={17} aria-hidden="true" /><span>Upgrade completed successfully. AxilDB is running revision <b className="font-mono">{job.revision.slice(0, 7)}</b>.</span></p>}
    {job.data.error && <div role="alert" className="deployment-failure"><p className="font-semibold">{failed?.label || 'Deployment'} failed</p><p className="mt-1 break-words">{job.data.error.length > 240 ? `${job.data.error.slice(0, 237)}…` : job.data.error}</p><a className="mt-2 inline-block underline" href="#deployment-logs">Inspect detailed deployment logs</a></div>}
    <details className="deployment-details"><summary>Deployment details</summary><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt>Requested by</dt><dd className="break-all">{job.actor}</dd></div>
      <div><dt>Requested</dt><dd>{new Date(job.created).toLocaleString()}</dd></div>
      <div><dt>Started</dt><dd>{job.started ? new Date(job.started).toLocaleString() : 'Not started'}</dd></div>
      <div><dt>Current stage</dt><dd>{job.stage}</dd></div>
      {job.finished && job.started && <div><dt>Total elapsed time</dt><dd>{duration(Math.max(0, Math.round((Date.parse(job.finished) - Date.parse(job.started)) / 1000)))}</dd></div>}
      <div><dt>Backup checkpoint</dt><dd className="break-all font-mono text-xs">{job.data.backup || 'Not created'}</dd></div>
      {job.data.migrationStatus && <div><dt>Migration result</dt><dd className="break-all">{job.data.migrationStatus.replaceAll('_', ' ')}</dd></div>}
      {[['Previous revision', job.previous], ['Target revision', job.revision], ['Job identifier', job.id]].map(([label, value]) => <div key={label} className="min-w-0 sm:col-span-2"><dt>{label}</dt><dd className="flex min-w-0 items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs">{value || 'Not captured'}</code>{value && <button type="button" className="deployment-copy" aria-label={`Copy ${label!.toLowerCase()}`} onClick={() => void copy(label!, value)}><Copy size={15} aria-hidden="true" /></button>}</dd></div>)}
    </dl><p role="status" className="mt-2 text-xs">{copied}</p></details>
  </div>
}
