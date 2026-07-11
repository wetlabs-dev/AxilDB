import { eventTitle, type DomainEventType, type EventPayload } from './event-types'

export function buildEventSummary(type: DomainEventType, payload: EventPayload) {
  return {
    title: String(payload.title || eventTitle(type)).slice(0, 160),
    summary: String(payload.summary || payload.displayName || '').slice(0, 500),
    displayName: payload.displayName ? String(payload.displayName).slice(0, 240) : null,
    plantInstanceId: payload.plantInstanceId ? String(payload.plantInstanceId) : null,
    plantId: payload.plantId ? String(payload.plantId).slice(0, 120) : null,
  }
}
