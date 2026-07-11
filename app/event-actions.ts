'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit, requireServerAdmin } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionManager } from '@/lib/collections'
import { emitDomainEvent } from '@/lib/events/emit'
import { canChooseManualVisibility } from '@/lib/events/visibility'
import { prisma } from '@/lib/prisma'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()

export async function addManualHistoricalEvent(fd: FormData) {
  const context = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const plantInstanceId = val(fd, 'plantInstanceId')
  const plant = await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: context.collection.id }, select: { id: true, plantId: true } })
  const visibility = val(fd, 'visibility') || 'COLLECTION_MEMBER'
  if (!canChooseManualVisibility(context.membership?.role, visibility)) throw new Error('That visibility is not available for this role.')
  if (visibility === 'PUBLIC' && context.collection.visibility !== 'PUBLIC') throw new Error('Private collections cannot publish manual events.')
  const occurredAt = new Date(val(fd, 'occurredAt'))
  if (Number.isNaN(occurredAt.getTime())) throw new Error('A valid historical date and time is required.')
  const id = randomUUID()
  await prisma.$transaction((tx) => emitDomainEvent(tx, {
    eventType: 'plant.historical_observation_added', collectionId: context.collection.id, aggregateId: plant.id,
    actor: { id: context.user.id, role: context.user.role }, source: 'MANUAL', visibility, occurredAt,
    idempotencyKey: `manual-history:${id}`, metadata: { manualEntry: true, dateOnly: val(fd, 'dateOnly') === 'on' },
    payload: { subjectId: id, plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, title: val(fd, 'title') || 'Historical observation', summary: val(fd, 'description'), category: val(fd, 'category') || 'observation', context: val(fd, 'context') || undefined },
  }))
  await audit(context.user, 'CREATE', 'DOMAIN_EVENT', id, `Added manual historical entry for ${plant.plantId}`, { occurredAt, visibility }, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, `/instances/${plant.id}`))
  redirect(collectionPath(context.collection.slug, '/activity?manual=added'))
}

export async function correctDomainEvent(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const eventId = val(fd, 'eventId')
  const original = await prisma.domainEvent.findFirstOrThrow({ where: { id: eventId, collectionId: context.collection.id } })
  const correctionId = randomUUID()
  const correction = await prisma.$transaction(async (tx) => {
    const created = await emitDomainEvent(tx, {
      eventType: 'event.corrected', collectionId: context.collection.id, aggregateId: original.id,
      actor: { id: context.user.id, role: context.user.role }, visibility: original.visibility as any,
      idempotencyKey: `event-correction:${correctionId}`, causationId: original.id,
      payload: { subjectId: correctionId, targetEventId: original.id, displayName: original.eventType, title: val(fd, 'title') || 'Event correction', summary: val(fd, 'reason'), correctedSummary: val(fd, 'correctedSummary') },
    })
    if (!created) throw new Error('Event engine is disabled.')
    await tx.domainEvent.update({ where: { id: original.id }, data: { supersededByEventId: created.id } })
    return created
  })
  await audit(context.user, 'CORRECT', 'DOMAIN_EVENT', original.id, `Corrected ${original.eventType}`, { correctionEventId: correction.id, reason: val(fd, 'reason') }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/activity/${original.id}`))
}

export async function redactDomainEvent(fd: FormData) {
  const user = await requireServerAdmin()
  const eventId = val(fd, 'eventId')
  const reason = val(fd, 'reason')
  if (!reason) throw new Error('A redaction reason is required.')
  const original = await prisma.domainEvent.findUniqueOrThrow({ where: { id: eventId } })
  const redactedAt = new Date()
  const redactionId = randomUUID()
  const redaction = await prisma.$transaction(async (tx) => {
    const created = await emitDomainEvent(tx, {
      eventType: 'event.redacted', collectionId: original.collectionId, aggregateId: original.id,
      actor: { id: user.id, role: user.role }, visibility: 'SERVER_ADMIN', occurredAt: redactedAt,
      idempotencyKey: `event-redaction:${redactionId}`, causationId: original.id,
      payload: { subjectId: redactionId, targetEventId: original.id, displayName: original.eventType, title: 'Event redacted', summary: reason },
    })
    if (!created) throw new Error('Event engine is disabled.')
    await tx.domainEvent.update({ where: { id: original.id }, data: { redactedAt, supersededByEventId: created.id } })
    return created
  })
  await audit(user, 'REDACT', 'DOMAIN_EVENT', original.id, `Redacted ${original.eventType}`, { redactionEventId: redaction.id, reason }, original.collectionId)
  redirect(`/server/events/${original.id}`)
}

export async function retryDomainEvent(fd: FormData) {
  const user = await requireServerAdmin()
  const eventId = val(fd, 'eventId')
  const event = await prisma.domainEvent.findUniqueOrThrow({ where: { id: eventId } })
  await prisma.domainEvent.update({ where: { id: event.id }, data: { processingStatus: 'PENDING', nextAttemptAt: new Date(), lastProcessingError: null, ignoredAt: null, ignoredByUserId: null, ignoreReason: null } })
  await audit(user, 'RETRY', 'DOMAIN_EVENT', event.id, `Queued ${event.eventType} for retry`, undefined, event.collectionId)
  revalidatePath('/server/events')
}

export async function ignoreDomainEvent(fd: FormData) {
  const user = await requireServerAdmin()
  const eventId = val(fd, 'eventId')
  const reason = val(fd, 'reason')
  if (!reason) throw new Error('An ignore reason is required.')
  const event = await prisma.domainEvent.findUniqueOrThrow({ where: { id: eventId } })
  await prisma.domainEvent.update({ where: { id: event.id }, data: { processingStatus: 'PROCESSED', processedAt: new Date(), ignoredAt: new Date(), ignoredByUserId: user.id, ignoreReason: reason, nextAttemptAt: null } })
  await audit(user, 'IGNORE', 'DOMAIN_EVENT', event.id, `Ignored ${event.eventType}`, { reason }, event.collectionId)
  revalidatePath('/server/events')
}
