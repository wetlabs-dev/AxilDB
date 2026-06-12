'use server'

import { redirect } from 'next/navigation'
import { audit, requireServerAdmin } from '@/lib/auth'
import { deleteSelectedOrphanedImages, selectedOrphanedImagePaths } from '@/lib/admin/orphanedImages'
import { prisma } from '@/lib/prisma'

const incidentCategories = new Set(['MEMORY', 'DISK', 'WORKER', 'EMAIL', 'AI', 'NETWORK', 'MANUAL'])
const incidentSeverities = new Set(['INFO', 'WARNING', 'CRITICAL'])
const incidentStatuses = new Set(['OPEN', 'RESOLVED'])

function value(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim()
}

function durationSeconds(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
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
  const category = incidentCategories.has(value(formData, 'category')) ? value(formData, 'category') : 'MANUAL'
  const severity = incidentSeverities.has(value(formData, 'severity')) ? value(formData, 'severity') : 'INFO'
  const status = incidentStatuses.has(value(formData, 'status')) ? value(formData, 'status') : 'OPEN'
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
  const category = incidentCategories.has(value(formData, 'category')) ? value(formData, 'category') : incident.category
  const severity = incidentSeverities.has(value(formData, 'severity')) ? value(formData, 'severity') : incident.severity
  const status = incidentStatuses.has(value(formData, 'status')) ? value(formData, 'status') : incident.status
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
