import type { DomainEventType, EventPayload } from '../event-types'
import { EVENT_REGISTRY } from '../event-types'

const FORBIDDEN_KEYS = new Set(['password', 'passwordHash', 'token', 'tokenHash', 'secret', 'secretUrl', 'smtp', 'authorization'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function inspectValue(value: unknown, path: string, seen: Set<unknown>) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return
  if (value instanceof Date) return
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error(`Event payload contains a circular value at ${path}.`)
    seen.add(value)
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, seen))
    return
  }
  if (!isPlainObject(value)) throw new Error(`Event payload contains an unsupported value at ${path}.`)
  if (seen.has(value)) throw new Error(`Event payload contains a circular value at ${path}.`)
  seen.add(value)
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key) || /password|token|secret|smtp/i.test(key)) {
      throw new Error(`Event payload contains forbidden sensitive field ${path}.${key}.`)
    }
    inspectValue(child, `${path}.${key}`, seen)
  }
}

export function validateEventPayload(type: DomainEventType, version: number, payload: unknown): EventPayload {
  const definition = EVENT_REGISTRY[type]
  if (version !== definition.version) throw new Error(`Unsupported ${type} event version ${version}.`)
  if (!isPlainObject(payload)) throw new Error('Event payload must be a plain object.')
  if (typeof payload.subjectId !== 'string' || !payload.subjectId.trim()) throw new Error('Event payload requires subjectId.')
  for (const key of definition.requiredPayloadKeys || []) {
    if (typeof payload[key] !== 'string' || !String(payload[key]).trim()) throw new Error(`Event payload requires ${key}.`)
  }
  inspectValue(payload, 'payload', new Set())
  const serialized = JSON.stringify(payload)
  if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) throw new Error('Event payload exceeds the 64 KiB limit.')
  return payload as EventPayload
}
