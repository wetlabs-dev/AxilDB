import Link from 'next/link'
import { formatDateTime } from '@/lib/time'
import { prisma } from '@/lib/prisma'
import { requireServerAdmin } from '@/lib/auth'
import { migrationJobs, migrationPreflight, migrationRoot } from '@/lib/admin/instance-migration'
import { requestMigration, deleteMigration } from './actions'

export const dynamic = 'force-dynamic'
const bytes = (n: number) => `${(n / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`
const button = 'rounded-lg bg-green-900 px-4 py-2 text-sm font-semibold text-white'
const card = 'rounded-xl border border-stone-200 bg-white/70 p-5 space-y-4'
export default async function MigrationPage({ searchParams }: { searchParams: Promise<{ queued?: string }> }) {
  const admin = await requireServerAdmin()
  const [jobs, preflight, preferences, params] = await Promise.all([migrationJobs(), migrationPreflight(), prisma.emailPreference.findUnique({ where: { userId: admin.id } }), searchParams])
  const timezone = preferences?.timezone || undefined
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <Link href="/server" className="text-sm underline">← Server management · Backup &amp; Restore</Link>
    <h1 className="font-serif text-3xl font-semibold">Full Instance Migration</h1>
    <p className="text-stone-700">Create a portable archive containing this installation’s database, uploads, labels, application settings, and retained routine backups.</p>
    {params.queued && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">Request saved. The host worker will process it; refresh to check progress.</p>}
    <section className={card}>
      <h2 className="font-serif text-xl font-semibold">Prepare a migration</h2>
      <p className="text-sm">The host migration worker stops the application and background services during export. This page will be temporarily unavailable. For the final cutover, keep the source stopped until DNS has moved.</p>
      <p className="text-sm">Start the host worker from the deployment checkout: <code>npm run migration -- worker</code>. Requests are saved durably and run outside the web process. Refresh this page to see progress and results.</p>
      <form action={requestMigration}><input type="hidden" name="command" value="preflight" /><button className={button}>Refresh size estimate</button></form>
      {preflight && <div>
        <p className="text-sm text-stone-600">Estimate from {formatDateTime(preflight.createdAt, timezone)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt>Database</dt><dd>{bytes(preflight.databaseBytes)}</dd>
          {Object.entries(preflight.storage).map(([name, value]) => <div key={name} className="contents"><dt className="capitalize">{name}</dt><dd>{value.files} files · {bytes(value.bytes)}</dd></div>)}
          <dt className="font-semibold">Estimated uncompressed total</dt><dd>{bytes(preflight.estimatedBytes)}</dd>
        </dl>
        <details className="mt-3 text-sm"><summary className="cursor-pointer">Database record counts</summary><pre className="max-h-64 overflow-auto p-3">{JSON.stringify(preflight.recordCounts, null, 2)}</pre></details>
      </div>}
      <form action={requestMigration} className="space-y-3 border-t border-stone-200 pt-4">
        <input type="hidden" name="command" value="create" />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="downtime" value="accepted" required /> I understand the worker will stop this installation while it creates and verifies the bundle.</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="keepStopped" /> Final cutover: keep source services stopped after export.</label>
        <button className={button}>Create migration bundle</button>
      </form>
    </section>
    <section className={card}>
      <h2 className="font-serif text-xl font-semibold">Restore on another server</h2>
      <p className="text-sm">Restore runs from the destination host, including when the database is empty or sign-in is unavailable. It validates the entire archive, creates a safety backup, restores a staging database, verifies all tables and media, then switches the destination. Mail and background services remain held.</p>
      <pre className="overflow-auto rounded-lg bg-stone-100 p-3 text-xs">{'npm run migration -- inspect /secure/bundle.tar.gz\nnpm run migration -- restore /secure/bundle.tar.gz --confirm-destructive-restore\nnpm run migration -- verify-restored /secure/bundle.tar.gz'}</pre>
      <p className="text-sm font-semibold">Transfer the original TOTP encryption key separately to preserve two-factor sign-in. Configure the destination URL, timezone, mail, AI, and push keys before releasing the hold.</p>
      <p className="text-sm">See <code>docs/SERVER_MIGRATION.md</code> for cutover, recovery, and release commands. Import only archives from a trusted administrator: database dumps contain executable SQL.</p>
    </section>
    <section className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">Migration and restore history</h2>
      {jobs.length === 0 && <p className="text-sm text-stone-600">No migration operations yet.</p>}
      {jobs.map(job => <article key={`${job.reportSource}-${job.id}`} className={card}>
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold capitalize">{job.command} · {job.status}</h3><span className="text-sm">{formatDateTime(job.requestedAt, timezone)}</span></div>
        <p className="text-sm">{job.stage || 'Waiting for host worker'} · Requested by {job.requestedBy}</p>
        {job.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{job.error}</p>}
        {job.recoveryError && <p className="text-sm text-red-900">Recovery requires attention: {job.recoveryError}</p>}
        {job.archive && <>
          <p className="break-all text-xs">{migrationRoot()}/{job.archive}</p>
          <p className="text-sm">{bytes(job.archiveBytes || 0)} · Verified at creation</p>
          <div className="flex flex-wrap items-center gap-3">
            <a className={button} href={`/api/server/migrations/download?name=${encodeURIComponent(job.archive)}`}>Download</a>
            <form action={requestMigration}><input type="hidden" name="command" value="verify" /><input type="hidden" name="archive" value={job.archive} /><button className="text-sm underline">Validate again</button></form>
          </div>
          <details><summary className="cursor-pointer text-sm text-red-800">Delete archive</summary>
            <form action={deleteMigration} className="mt-3 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <input type="hidden" name="archive" value={job.archive} />
              <label className="block text-sm">Type the exact archive name to permanently delete this file.<input name="confirmation" required className="mt-2 block w-full rounded border p-2" placeholder={job.archive} /></label>
              <button className="rounded bg-red-800 px-3 py-2 text-sm text-white">Delete migration archive</button>
            </form>
          </details>
        </>}
        {job.archiveDeleted && <p className="text-sm text-stone-600">Archive not on this server; history retained.</p>}
        <a className="text-sm underline" href={`/api/server/migrations/report?id=${job.id}&source=${job.reportSource || 'local'}`}>Inspect manifest and detailed report</a>
      </article>)}
    </section>
  </main>
}
