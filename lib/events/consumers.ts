import type { DomainEvent } from '@prisma/client'
import type { DomainEventType } from './event-types'

export type EventConsumer = {
  name: string
  version: number
  subscribedEventTypes: readonly DomainEventType[] | '*'
  handler: (event: DomainEvent) => Promise<void>
}

const consumers: EventConsumer[] = []

export function registerEventConsumer(consumer: EventConsumer) {
  if (consumers.some((registered) => registered.name === consumer.name && registered.version === consumer.version)) {
    throw new Error(`Event consumer ${consumer.name}@${consumer.version} is already registered.`)
  }
  consumers.push(consumer)
  return consumer
}

export function consumersForEvent(eventType: string) {
  return consumers.filter((consumer) => consumer.subscribedEventTypes === '*' || consumer.subscribedEventTypes.includes(eventType as DomainEventType))
}

// Notifications, email/Web Push, care and collection digests, exhibit subscribers,
// analytics, AI briefing/historian inputs, incident correlation, and search indexing
// intentionally register here in later migrations. V1 only establishes delivery.
