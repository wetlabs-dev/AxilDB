'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cleanBackupGarbage, refreshBackupStorage } from '@/app/server-actions'

type Scan = Awaited<ReturnType<typeof refreshBackupStorage>>
function bytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return 'Unavailable'
  return `${(n / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`
}
export function BackupStoragePanel() {
  const [data, setData] = useState<Scan | null>(null), [preview, setPreview] = useState<Scan | null>(null)
  const [message, setMessage] = useState(''), [confirmation, setConfirmation] = useState('')
  const [busy, start] = useTransition(), loading = useRef(false), router = useRouter()
  const load = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try { const scan = await refreshBackupStorage(); setData(scan); return scan }
    catch { setMessage('Backup storage could not be measured. Check server logs and the backup mount.') }
    finally { loading.current = false }
  }, [])
  const active = data?.recentJobs.some(j => ['REQUESTED', 'RUNNING'].includes(j.status))
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => { if (!document.hidden) void load().then(scan => { if (scan && !scan.recentJobs.some(j => ['REQUESTED', 'RUNNING'].includes(j.status))) router.refresh() }) }, 5000)
    return () => clearInterval(timer)
  }, [active, load, router])
  const measured = data?.entries.filter(e => !['Missing artifact', 'Metadata reconciliation'].includes(e.status) && (/^(axildb|manual|deploy)-/.test(e.name) || e.intentId))
  const managedBytes = measured?.some(e => e.allocatedBytes == null) ? null : measured?.reduce((n, e) => n + (e.allocatedBytes || 0), 0)
  return <section id="backup-storage" className="mt-4 min-w-0 space-y-3 rounded-lg border border-[#8fa58f] bg-[#f5f7ee] p-4 text-sm">
    <h4 className="font-serif text-lg font-semibold">Backup storage</h4>
    <p>Live guest filesystem measurements for the configured backup directory. Ubuntu free space does not measure or shrink the VirtualBox disk file on Windows.</p>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[['Managed backup allocation', data?.filesystem ? bytes(managedBytes) : 'Unavailable'], ['Filesystem used', bytes(data?.filesystem?.usedBytes)], ['Filesystem available', bytes(data?.filesystem?.availableBytes)], ['Filesystem capacity', bytes(data?.filesystem?.totalBytes)]].map(([label, value]) => <div key={label} className="rounded border bg-white/60 p-2"><p>{label}</p><strong>{value}</strong></div>)}
    </div>
    <p className="text-xs">Last checked: {data?.checkedAt ? new Date(data.checkedAt).toLocaleString() : 'Not measured yet'}. PostgreSQL records have no recorded-size field; recorded-versus-actual size comparison is unavailable.</p>
    {data?.error && <p role="alert">{data.error}</p>}
    {data?.uploadFilesystemSame === false && <p className="font-semibold text-amber-900">Backups and uploads use different filesystems. The historical dashboard storage chart measures uploads.</p>}
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} className="rounded border bg-white px-3 py-2" onClick={() => start(async () => { await load(); router.refresh() })}>Refresh storage</button>
      <button disabled={busy} className="rounded border bg-white px-3 py-2" onClick={() => start(async () => { const scan = await load(); if (scan) { setPreview(scan); setConfirmation('') } })}>Scan for garbage</button>
    </div>
    {preview && <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3">
      <h5 className="font-semibold">Garbage collection preview — no files changed</h5>
      <p>{preview.entries.filter(e => e.status === 'Pending cleanup').length} pending deletion · {preview.entries.filter(e => e.status === 'Deletion failed').length} failed deletions · {preview.entries.filter(e => e.status === 'Metadata reconciliation').length} metadata-only reconciliations</p>
      <p>{preview.entries.filter(e => e.status === 'Orphaned artifact').length} recognized orphans · {preview.entries.filter(e => e.status === 'Incomplete artifact').length} incomplete artifacts · {preview.entries.filter(e => e.status === 'Protected').length} protected · {preview.entries.filter(e => ['Manual review', 'Storage unavailable'].includes(e.status)).length} requiring manual review. No temporary artifacts are automatically eligible without explicit deletion intent.</p>
      <p>Estimated eligible allocation: {bytes(preview.estimateBytes)}. Only the explicitly selected deletion intents below may be purged. Removed artifacts cannot be recovered through AxilDB. Unknown, orphaned, protected, deployment and migration data are excluded.</p>
      <ul>{preview.entries.filter(e => ['Pending cleanup', 'Deletion failed', 'Metadata reconciliation'].includes(e.status)).map(e => <li className="break-all" key={e.intentId}>{e.name} — {e.status}</li>)}</ul>
      <label className="grid gap-1">Type PURGE DELETED BACKUPS<input value={confirmation} onChange={e => setConfirmation(e.target.value)} className="min-w-0 rounded border px-2 py-1" /></label>
      <button disabled={busy || !preview.entries.some(e => ['Pending cleanup', 'Deletion failed', 'Metadata reconciliation'].includes(e.status)) || confirmation !== 'PURGE DELETED BACKUPS'} className="rounded border border-red-300 px-3 py-2 disabled:opacity-50" onClick={() => start(async () => {
        try { const result = await cleanBackupGarbage(preview.digest, confirmation); setMessage(`Cleanup job ${result.id} queued for the backup worker.`); setPreview(null); await load() }
        catch (e) { setMessage(e instanceof Error ? e.message : 'Cleanup request failed; scan again.') }
      })}>Clean up eligible files</button>
    </div>}
    <p role="status" aria-live="polite">{busy ? 'Checking storage…' : message}</p>
    <div className="space-y-2">{data?.recentJobs.map(j => {
      const progress = j.progress as any
      return <div key={j.id} className="break-words rounded border bg-white/60 p-2">
        <p className="font-semibold">{j.name} · {j.status === 'DELETED' || j.status === 'SUCCEEDED' ? '✓' : ['REQUESTED', 'RUNNING'].includes(j.status) ? '◌' : ''} {j.status}</p>
        <p>{progress?.stage || (j.status === 'REQUESTED' ? 'Deletion pending — waiting for backup worker' : '')}</p>
        {progress?.processed != null && <p>{progress.processed} processed · {progress.removed} artifacts removed or metadata reconciled · {progress.failed} failed</p>}
        {progress?.availableDelta != null && <p>Measured filesystem available-space change: {progress.availableDelta < 0 ? '−' : '+'}{bytes(Math.abs(progress.availableDelta))}. {progress.availableDelta <= 0 ? 'Files may be absent without an increase in available space. Check open files, other writes, hard links and snapshots.' : 'This is the observed filesystem change, not nominal archive size; concurrent writes may affect it.'}</p>}
        {j.error && <p className="text-red-900">{j.error}</p>}
        <p className="text-xs">Job {j.id} · updated {new Date(j.updatedAt).toLocaleString()}</p>
      </div>
    })}</div>
    <details><summary className="cursor-pointer font-semibold">Storage diagnostics and inventory</summary>
      <p className="break-all">Configured: {data?.filesystem?.configured || 'Unavailable'} · resolved: {data?.filesystem?.resolved || 'Unavailable'} · filesystem device: {data?.filesystem?.device || 'Unavailable'} · reserved free blocks: {bytes(data?.filesystem?.reservedBytes)}</p>
      <p className="break-all">Mount: {data?.filesystem?.mount?.mountPoint || 'Unavailable'} · type: {data?.filesystem?.mount?.filesystemType || 'Unavailable'} · container-visible source: {data?.filesystem?.mount?.source || 'Unavailable'}</p>
      <p>Container mount paths do not reveal the host bind source reliably. See the host diagnostics runbook. Allocated bytes use filesystem blocks; hard links are deduplicated. No Docker pruning, retention changes or virtual-disk compaction is performed.</p>
      <ul className="max-h-80 space-y-1 overflow-auto">{data?.entries.map((e, index) => <li className="break-words border-b py-1" key={`${e.name}-${index}`}><strong>{e.name}</strong> · {e.status} · allocated {bytes(e.allocatedBytes)} · logical {bytes(e.nominalBytes)}<p>{e.reason}</p></li>)}</ul>
      <p>Open deleted files: {data?.openDeleted ? `${data.openDeleted.files.length} visible on this filesystem; ${data.openDeleted.inaccessible} process directories inaccessible. ${data.openDeleted.scope}` : 'Unavailable in this environment. Use host diagnostics.'}</p>
      {data?.openDeleted?.files.map(f => <p key={`${f.pid}:${f.fd}`}>PID {f.pid}, descriptor {f.fd}: {bytes(f.bytes)} retained allocation. Let the owning process close it; no process is automatically stopped.</p>)}
    </details>
  </section>
}
