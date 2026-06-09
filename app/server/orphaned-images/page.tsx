import { deleteOrphanedImages } from '@/app/server-actions'
import { Button, Card, LinkButton } from '@/components/ui'
import { scanOrphanedImages } from '@/lib/admin/orphanedImages'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatBytes } from '@/lib/server-metrics'
import { formatDateTime } from '@/lib/time'

function cleanupMessage(sp: { cleanup?: string; deleted?: string; skipped?: string; failed?: string; bytes?: string }) {
  if (sp.cleanup === 'none-selected') return 'Choose at least one orphaned image before deleting.'
  if (sp.cleanup === 'confirmation-required') return 'Type DELETE ORPHANED IMAGES to confirm deletion.'
  if (sp.cleanup === 'done') {
    return `Deleted ${sp.deleted || 0}; skipped ${sp.skipped || 0}; failed ${sp.failed || 0}; reclaimed ${formatBytes(Number(sp.bytes || 0))}.`
  }
  return null
}

export default async function OrphanedImageCleanup({
  searchParams,
}: {
  searchParams: Promise<{ scan?: string; cleanup?: string; deleted?: string; skipped?: string; failed?: string; bytes?: string }>
}) {
  const admin = await requireServerAdmin()
  const sp = await searchParams
  const shouldScan = sp.scan === '1'
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: admin.id } })
  const scan = shouldScan ? await scanOrphanedImages(prisma) : null
  const message = cleanupMessage(sp)
  const timezone = preferences?.timezone

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Orphaned Image Cleanup</h2>
          <p className="mt-1 text-sm text-stone-600">
            Scan uploaded image storage for files that are no longer referenced by AxilDB records, then delete selected files after review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/server">Server Management</LinkButton>
          <LinkButton href="/server/orphaned-images?scan=1">Scan only</LinkButton>
        </div>
      </div>

      {message && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">{message}</p>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold">Scan status</h3>
            <p className="mt-1 text-sm text-stone-600">
              Scans are dry-run by default. Nothing is deleted until you select files and confirm deletion.
            </p>
          </div>
          <span className="rounded-full border border-stone-200 bg-white/60 px-3 py-1 text-sm font-semibold text-stone-800">
            {scan ? 'Dry run complete' : 'Not scanned'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-stone-200 bg-white/50 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">Image files scanned</p>
            <p className="mt-1 text-2xl font-bold">{scan?.totalImageFiles ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/50 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">Referenced files</p>
            <p className="mt-1 text-2xl font-bold">{scan?.totalReferencedFiles ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/50 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">Suspected orphaned</p>
            <p className="mt-1 text-2xl font-bold">{scan?.orphanedFiles.length ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/50 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">Orphaned storage</p>
            <p className="mt-1 text-2xl font-bold">{scan ? formatBytes(scan.orphanedBytes) : '—'}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white/50 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">Last scan</p>
            <p className="mt-1 text-sm font-semibold">{scan ? formatDateTime(scan.scannedAt, timezone) : '—'}</p>
          </div>
        </div>

        {scan?.missingUploadDir && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Upload directory not found: {scan.uploadDir}
          </p>
        )}
        {scan && !scan.missingUploadDir && (
          <p className="mt-4 text-xs text-stone-500">Upload directory scanned: {scan.uploadDir}</p>
        )}
      </Card>

      {scan && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl font-semibold">Dry-run results</h3>
              <p className="mt-1 text-sm text-stone-600">
                Review every file before deleting. AxilDB re-checks database references immediately before deletion to avoid races with new uploads.
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">
              {scan.orphanedFiles.length} orphaned
            </span>
          </div>

          {scan.orphanedFiles.length === 0 ? (
            <p className="mt-4 rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No orphaned upload images were found.</p>
          ) : (
            <form action={deleteOrphanedImages} className="mt-4 space-y-4">
              <div className="grid gap-3">
                {scan.orphanedFiles.map((file) => (
                  <label key={file.relativePath} className="grid gap-3 rounded-lg border border-stone-200 bg-white/55 p-3 sm:grid-cols-[auto_5rem_minmax(0,1fr)]">
                    <input className="mt-1 h-4 w-4" type="checkbox" name="relativePath" value={file.relativePath} />
                    <span className="block aspect-square overflow-hidden rounded-md border border-stone-200 bg-[#d6dfc9]/45">
                      {file.relativePath.includes('/') ? (
                        <span className="flex h-full w-full items-center justify-center px-2 text-center text-[0.65rem] font-medium text-stone-600">Nested file</span>
                      ) : (
                        <img src={file.urlPath} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-all text-sm font-semibold text-stone-900">{file.relativePath}</span>
                      <span className="mt-1 block text-xs text-stone-600">
                        {formatBytes(file.sizeBytes)} · modified {formatDateTime(file.modifiedAt, timezone)}
                      </span>
                      <span className="mt-1 block break-all text-xs text-stone-500">{file.urlPath}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50/80 p-3">
                <p className="text-sm font-semibold text-red-950">Deletion is permanent. Back up before bulk cleanup.</p>
                <label className="mt-3 grid max-w-md gap-1 text-sm font-medium text-red-950">
                  Type DELETE ORPHANED IMAGES to confirm
                  <input
                    name="confirmation"
                    className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-stone-950"
                    autoComplete="off"
                  />
                </label>
                <Button className="mt-3 bg-[#9a3f35] hover:bg-[#7d3028]">Delete selected</Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  )
}
