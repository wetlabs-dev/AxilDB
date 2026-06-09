'use server'

import { redirect } from 'next/navigation'
import { audit, requireServerAdmin } from '@/lib/auth'
import { deleteSelectedOrphanedImages, selectedOrphanedImagePaths } from '@/lib/admin/orphanedImages'
import { prisma } from '@/lib/prisma'

export async function requestSitewideBackup(formData: FormData) {
  const user = await requireServerAdmin()
  const notes = String(formData.get('notes') || '').trim()
  const existing = await prisma.backupRun.findFirst({
    where: { status: { in: ['REQUESTED', 'RUNNING'] }, scope: 'SITEWIDE' },
    orderBy: { requestedAt: 'desc' },
  })

  if (existing) redirect('/server?backup=already-queued')

  const run = await prisma.backupRun.create({
    data: {
      scope: 'SITEWIDE',
      status: 'REQUESTED',
      requestedById: user.id,
      notes: notes || null,
    },
  })
  await audit(user, 'REQUEST', 'BACKUP_RUN', run.id, 'Requested sitewide backup', { notes: notes || undefined })
  redirect('/server?backup=requested')
}

export async function deleteOrphanedImages(formData: FormData) {
  const user = await requireServerAdmin()
  const confirmation = String(formData.get('confirmation') || '').trim()
  const selected = selectedOrphanedImagePaths(formData)
  if (selected.length === 0) redirect('/server/orphaned-images?scan=1&cleanup=none-selected')
  if (confirmation !== 'DELETE ORPHANED IMAGES') redirect('/server/orphaned-images?scan=1&cleanup=confirmation-required')

  const result = await deleteSelectedOrphanedImages(prisma, user, selected)
  await audit(user, 'CLEANUP', 'ORPHANED_IMAGE_FILE', null, `Deleted ${result.deleted.length} orphaned image file(s)`, {
    requestedCount: selected.length,
    deletedCount: result.deleted.length,
    skippedCount: result.skipped.length,
    failedCount: result.failed.length,
    bytesReclaimed: result.bytesReclaimed,
    deleted: result.deleted.map((file) => file.relativePath),
    skipped: result.skipped,
    failed: result.failed,
  })

  const params = new URLSearchParams({
    scan: '1',
    cleanup: 'done',
    deleted: String(result.deleted.length),
    skipped: String(result.skipped.length),
    failed: String(result.failed.length),
    bytes: String(result.bytesReclaimed),
  })
  redirect(`/server/orphaned-images?${params.toString()}`)
}
