'use server'

import { RestoreRequestStatus, ServerIncidentCategory, ServerIncidentSeverity, ServerIncidentStatus } from '@prisma/client'
import { redirect } from 'next/navigation'
import { audit, requireServerAdmin } from '@/lib/auth'
import { deleteSelectedOrphanedImages, selectedOrphanedImagePaths } from '@/lib/admin/orphanedImages'
import { deleteBackupFolder, deleteOldBackupFolders, restoreCommandForBackup, resolveBackupFolder, validateBackupForRestore } from '@/lib/admin/restore-management'
import { prisma } from '@/lib/prisma'

const incidentCategories = new Set(Object.values(ServerIncidentCategory))
const incidentSeverities = new Set(Object.values(ServerIncidentSeverity))
const incidentStatuses = new Set(Object.values(ServerIncidentStatus))
const restoreStatuses = new Set(Object.values(RestoreRequestStatus))

function value(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim()
}

function durationSeconds(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
}

function categoryValue(input: string, fallback: ServerIncidentCategory) {
  return incidentCategories.has(input as ServerIncidentCategory) ? input as ServerIncidentCategory : fallback
}

function severityValue(input: string, fallback: ServerIncidentSeverity) {
  return incidentSeverities.has(input as ServerIncidentSeverity) ? input as ServerIncidentSeverity : fallback
}

function statusValue(input: string, fallback: ServerIncidentStatus) {
  return incidentStatuses.has(input as ServerIncidentStatus) ? input as ServerIncidentStatus : fallback
}

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

export async function updateMaintenanceMode(formData: FormData) {
  const user = await requireServerAdmin()
  const enabled = value(formData, 'enabled') === 'true'
  const message = value(formData, 'message')
  const expectedReturnAtValue = value(formData, 'expectedReturnAt')
  const expectedReturnAt = expectedReturnAtValue ? new Date(expectedReturnAtValue) : null
  const current = await prisma.maintenanceMode.findFirst({ orderBy: { updatedAt: 'desc' } })
  const now = new Date()
  const record = current
    ? await prisma.maintenanceMode.update({
        where: { id: current.id },
        data: {
          enabled,
          message: message || null,
          expectedReturnAt: expectedReturnAt && !Number.isNaN(expectedReturnAt.getTime()) ? expectedReturnAt : null,
          startedAt: enabled && !current.enabled ? now : current.startedAt,
          startedByUserId: enabled && !current.enabled ? user.id : current.startedByUserId,
          endedAt: !enabled && current.enabled ? now : current.endedAt,
          endedByUserId: !enabled && current.enabled ? user.id : current.endedByUserId,
        },
      })
    : await prisma.maintenanceMode.create({
        data: {
          enabled,
          message: message || null,
          expectedReturnAt: expectedReturnAt && !Number.isNaN(expectedReturnAt.getTime()) ? expectedReturnAt : null,
          startedAt: enabled ? now : null,
          startedByUserId: enabled ? user.id : null,
          endedAt: enabled ? null : now,
          endedByUserId: enabled ? null : user.id,
        },
      })
  const action = enabled ? (current?.enabled ? 'UPDATE' : 'ENABLE') : 'DISABLE'
  await audit(user, action, 'MAINTENANCE_MODE', record.id, `${enabled ? 'Enabled/updated' : 'Disabled'} maintenance mode`, {
    enabled,
    message: message || undefined,
    expectedReturnAt: record.expectedReturnAt?.toISOString(),
  })
  redirect('/server?maintenance=updated')
}

export async function createRestoreRequest(formData: FormData) {
  const user = await requireServerAdmin()
  const backupPath = value(formData, 'backupPath')
  const notes = value(formData, 'notes')
  let backup
  try {
    backup = resolveBackupFolder(backupPath)
  } catch {
    redirect('/server?restore=invalid-backup')
  }
  const request = await prisma.restoreRequest.create({
    data: {
      backupPath: backup.relativePath,
      backupName: backup.name,
      requestedByUserId: user.id,
      notes: notes || null,
    },
  })
  await audit(user, 'CREATE', 'RESTORE_REQUEST', request.id, `Created restore request for ${backup.name}`, { backupPath: backup.relativePath })
  redirect('/server?restore=requested')
}

export async function deleteSelectedBackup(formData: FormData) {
  const user = await requireServerAdmin()
  const backupPath = value(formData, 'backupPath')
  const expectedName = value(formData, 'expectedName')
  const confirmation = value(formData, 'confirmation')
  let backup
  try {
    backup = resolveBackupFolder(backupPath)
  } catch {
    redirect('/server?backup=invalid-delete')
  }
  if (confirmation !== expectedName || expectedName !== backup.name) redirect(`/server?selectedBackup=${encodeURIComponent(backup.name)}&backup=delete-confirmation-required`)

  let deleted
  try {
    deleted = await deleteBackupFolder(prisma, backup.relativePath, user.id)
  } catch (error) {
    const params = new URLSearchParams({
      selectedBackup: backup.name,
      backup: 'delete-failed',
      reason: error instanceof Error ? error.message : 'unknown',
    })
    redirect(`/server?${params.toString()}`)
  }
  await audit(user, 'DELETE', 'BACKUP_FOLDER', deleted.relativePath, `Deleted backup folder ${deleted.name}`, {
    backupPath: deleted.relativePath,
    sizeBytes: deleted.sizeBytes,
  })
  redirect('/server?backup=deleted')
}

export async function deleteOldBackups(formData: FormData) {
  const user = await requireServerAdmin()
  const months = Number(value(formData, 'months') || '6')
  const confirmation = value(formData, 'confirmation')
  if (confirmation !== 'DELETE OLD BACKUPS') redirect(`/server?cleanupPreview=1&cleanupMonths=${Number.isFinite(months) ? months : 6}&backup=cleanup-confirmation-required`)

  const result = await deleteOldBackupFolders(prisma, months, user.id)
  await audit(user, 'CLEANUP', 'BACKUP_FOLDER', null, `Deleted ${result.deleted.length} old backup folder(s)`, {
    months,
    deletedCount: result.deleted.length,
    failedCount: result.failed.length,
    bytesReclaimed: result.bytesReclaimed,
    deleted: result.deleted.map((folder) => folder.relativePath),
    failed: result.failed,
  })
  const params = new URLSearchParams({
    backup: 'cleanup-done',
    deleted: String(result.deleted.length),
    failed: String(result.failed.length),
    bytes: String(result.bytesReclaimed),
  })
  redirect(`/server?${params.toString()}`)
}

export async function validateRestoreRequest(formData: FormData) {
  const user = await requireServerAdmin()
  const id = value(formData, 'id')
  const request = await prisma.restoreRequest.findUniqueOrThrow({ where: { id } })
  const validation = await validateBackupForRestore(prisma, request.backupPath)
  await prisma.restoreRequest.update({
    where: { id },
    data: {
      status: RestoreRequestStatus.VALIDATED,
      validationJson: validation,
    },
  })
  await audit(user, 'VALIDATE', 'RESTORE_REQUEST', id, `Validated restore request for ${request.backupName}`, {
    readiness: validation.readiness,
    failed: validation.failed.length,
    warnings: validation.warnings.length,
  })
  redirect('/server?restore=validated')
}

export async function generateRestoreCommand(formData: FormData) {
  const user = await requireServerAdmin()
  const id = value(formData, 'id')
  const request = await prisma.restoreRequest.findUniqueOrThrow({ where: { id } })
  const command = restoreCommandForBackup(request.backupPath)
  await prisma.restoreRequest.update({
    where: { id },
    data: {
      status: RestoreRequestStatus.COMMAND_GENERATED,
      generatedCommand: command,
      commandGeneratedAt: new Date(),
    },
  })
  await audit(user, 'GENERATE', 'RESTORE_REQUEST_COMMAND', id, `Generated server-side restore command for ${request.backupName}`, { backupPath: request.backupPath })
  redirect('/server?restore=command-generated')
}

export async function updateRestoreRequest(formData: FormData) {
  const user = await requireServerAdmin()
  const id = value(formData, 'id')
  const status = value(formData, 'status')
  const notes = value(formData, 'notes')
  const request = await prisma.restoreRequest.findUniqueOrThrow({ where: { id } })
  const nextStatus = restoreStatuses.has(status as RestoreRequestStatus) ? status as RestoreRequestStatus : request.status
  const now = new Date()
  await prisma.restoreRequest.update({
    where: { id },
    data: {
      status: nextStatus,
      notes: notes || null,
      completedAt: nextStatus === RestoreRequestStatus.COMPLETED_EXTERNALLY ? request.completedAt || now : request.completedAt,
      completedByUserId: nextStatus === RestoreRequestStatus.COMPLETED_EXTERNALLY ? user.id : request.completedByUserId,
      cancelledAt: nextStatus === RestoreRequestStatus.CANCELLED ? request.cancelledAt || now : request.cancelledAt,
      cancelledByUserId: nextStatus === RestoreRequestStatus.CANCELLED ? user.id : request.cancelledByUserId,
    },
  })
  const action = nextStatus === RestoreRequestStatus.COMPLETED_EXTERNALLY
    ? 'COMPLETE_EXTERNALLY'
    : nextStatus === RestoreRequestStatus.CANCELLED
      ? 'CANCEL'
      : 'UPDATE'
  await audit(user, action, 'RESTORE_REQUEST', id, `Updated restore request for ${request.backupName}`, { status: nextStatus, notes: notes || undefined })
  redirect('/server?restore=updated')
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

export async function createManualServerIncident(formData: FormData) {
  const user = await requireServerAdmin()
  const title = value(formData, 'title')
  if (!title) redirect('/server/incidents?created=missing-title')
  const category = categoryValue(value(formData, 'category'), ServerIncidentCategory.MANUAL)
  const severity = severityValue(value(formData, 'severity'), ServerIncidentSeverity.INFO)
  const status = statusValue(value(formData, 'status'), ServerIncidentStatus.OPEN)
  const detectedAt = value(formData, 'detectedAt') ? new Date(value(formData, 'detectedAt')) : new Date()
  const resolvedAt = status === 'RESOLVED' ? (value(formData, 'resolvedAt') ? new Date(value(formData, 'resolvedAt')) : new Date()) : null
  const incident = await prisma.serverIncident.create({
    data: {
      type: `MANUAL_${Date.now()}`,
      category,
      severity,
      status,
      title,
      description: value(formData, 'description') || null,
      detectedAt,
      resolvedAt,
      durationSeconds: resolvedAt ? durationSeconds(detectedAt, resolvedAt) : null,
      createdByUserId: user.id,
      metadata: { source: 'manual' },
    },
  })
  await audit(user, 'CREATE', 'SERVER_INCIDENT', incident.id, `Created manual incident ${incident.title}`, { category, severity, status })
  redirect(`/server/incidents/${incident.id}`)
}

export async function updateServerIncident(formData: FormData) {
  const user = await requireServerAdmin()
  const id = value(formData, 'id')
  const incident = await prisma.serverIncident.findUniqueOrThrow({ where: { id } })
  const title = value(formData, 'title') || incident.title
  const category = categoryValue(value(formData, 'category'), incident.category)
  const severity = severityValue(value(formData, 'severity'), incident.severity)
  const status = statusValue(value(formData, 'status'), incident.status)
  const detectedAt = value(formData, 'detectedAt') ? new Date(value(formData, 'detectedAt')) : incident.detectedAt
  const resolvedAt = status === 'RESOLVED'
    ? (value(formData, 'resolvedAt') ? new Date(value(formData, 'resolvedAt')) : incident.resolvedAt || new Date())
    : null

  await prisma.serverIncident.update({
    where: { id },
    data: {
      title,
      category,
      severity,
      status,
      description: value(formData, 'description') || null,
      detectedAt,
      resolvedAt,
      durationSeconds: resolvedAt ? durationSeconds(detectedAt, resolvedAt) : null,
    },
  })
  await audit(user, 'UPDATE', 'SERVER_INCIDENT', id, `Updated incident ${title}`, { previousStatus: incident.status, status, category, severity })
  redirect(`/server/incidents/${id}`)
}

export async function resolveServerIncident(formData: FormData) {
  const user = await requireServerAdmin()
  const id = value(formData, 'id')
  const incident = await prisma.serverIncident.findUniqueOrThrow({ where: { id } })
  const resolvedAt = new Date()
  await prisma.serverIncident.update({
    where: { id },
    data: {
      status: 'RESOLVED',
      resolvedAt,
      durationSeconds: durationSeconds(incident.detectedAt, resolvedAt),
    },
  })
  await audit(user, 'RESOLVE', 'SERVER_INCIDENT', id, `Resolved incident ${incident.title}`)
  redirect(`/server/incidents/${id}`)
}

export async function addServerIncidentNote(formData: FormData) {
  const user = await requireServerAdmin()
  const incidentId = value(formData, 'incidentId')
  const body = value(formData, 'body')
  if (!body) redirect(`/server/incidents/${incidentId}`)
  const note = await prisma.serverIncidentNote.create({
    data: {
      incidentId,
      authorUserId: user.id,
      body,
    },
  })
  await audit(user, 'CREATE', 'SERVER_INCIDENT_NOTE', note.id, 'Added server incident note', { incidentId })
  redirect(`/server/incidents/${incidentId}`)
}
