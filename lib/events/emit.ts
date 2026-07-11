import { Prisma } from '@prisma/client'
import { EVENT_REGISTRY, isDomainEventType, type DomainEventType, type EventPayload, type EventSource, type EventVisibility } from './event-types'
import { validateEventPayload } from './schemas'
import { buildEventSummary } from './summaries'

export type EventTransaction = Prisma.TransactionClient

export type EmitDomainEventInput<T extends DomainEventType = DomainEventType> = {
  eventType: T
  eventVersion?: number
  collectionId?: string | null
  aggregateType?: string
  aggregateId: string
  actor?: { id: string; role?: string | null } | null
  source?: EventSource
  visibility?: EventVisibility
  occurredAt?: Date
  payload: EventPayload
  metadata?: Record<string, unknown> | null
  idempotencyKey: string
  correlationId?: string | null
  causationId?: string | null
  reconstructed?: boolean
}

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

export function eventEngineEnabled() {
  return process.env.AXILDB_EVENT_ENGINE_ENABLED !== 'false'
}

export async function emitDomainEvent<T extends DomainEventType>(tx: EventTransaction, input: EmitDomainEventInput<T>) {
  if (!eventEngineEnabled()) return null
  if (!isDomainEventType(input.eventType)) throw new Error(`Unsupported domain event type ${input.eventType}.`)
  const definition = EVENT_REGISTRY[input.eventType]
  const eventVersion = input.eventVersion ?? definition.version
  const payload = validateEventPayload(input.eventType, eventVersion, input.payload)
  const data = {
    eventType: input.eventType,
    eventVersion,
    collectionId: input.collectionId || null,
    aggregateType: input.aggregateType || definition.aggregateType,
    aggregateId: input.aggregateId,
    actorUserId: input.actor?.id || null,
    actorRole: input.actor?.role || null,
    source: input.source || 'APPLICATION',
    visibility: input.visibility || definition.defaultVisibility,
    occurredAt: input.occurredAt || new Date(),
    payloadJson: jsonValue(payload),
    summaryJson: jsonValue(buildEventSummary(input.eventType, payload)),
    metadataJson: input.metadata ? jsonValue(input.metadata) : Prisma.JsonNull,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId || null,
    causationId: input.causationId || null,
    reconstructed: input.reconstructed || false,
  }
  return tx.domainEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: data,
    update: {},
  })
}

export function eventPayload(input: EventPayload) {
  return input
}
