# Unified Event Engine

AxilDB uses a durable domain-event stream as a shared activity foundation. It is not an event-sourced application: Prisma domain models remain the authoritative current state, and events are immutable historical facts written alongside normal mutations.

## Transactional outbox

`DomainEvent` is both the immutable event envelope and the transactional outbox. Mutation code uses an interactive Prisma transaction:

```ts
const record = await prisma.$transaction(async (tx) => {
  const plant = await tx.plantInstance.create({ data })
  await emitDomainEvent(tx, {
    eventType: 'plant.created',
    collectionId: plant.collectionId,
    aggregateId: plant.id,
    actor: { id: user.id, role: user.role },
    idempotencyKey: `plant:${plant.id}:created`,
    payload: { subjectId: plant.id, plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId },
  })
  return plant
})
```

External work never runs inside that transaction. If a consumer fails, the domain mutation stays committed and the event remains retryable.

## Adding or upgrading an event

1. Add the stable namespaced type to `lib/events/event-types.ts`.
2. Declare version, aggregate, default visibility, and timeline/dashboard eligibility in the registry.
3. Define required compact payload facts. Every payload needs `subjectId`; use identifiers, historical display snapshots, and only consumer-relevant metadata.
4. Extend runtime validation in `lib/events/schemas/` when the payload has additional invariants.
5. Add summary presentation in `lib/events/summaries.ts` or a domain adapter.
6. Emit inside the same Prisma transaction as the authoritative mutation.
7. Add invariant and integration coverage to `scripts/check-domain-events.ts`.

Never change the meaning of an existing version. Add a new version and keep consumers able to handle old stored versions. Do not emit generic `record.updated` events when a semantic type exists.

## Payload and privacy rules

Payloads are validated plain JSON, limited to 64 KiB, and reject secret/password/token/SMTP-like fields. Store compact historical facts, not full duplicated rows. Full private notes should not be copied unless necessary and visibility explicitly permits them.

Visibility is centralized in `lib/events/visibility.ts`:

- `PUBLIC`: requires both public collection context and public event visibility.
- `COLLECTION_MEMBER`: active collection access.
- `STAFF`: gardener/manager work such as conditions, quarantine, and workflows.
- `SERVER_ADMIN`: site administration and sensitive governance.
- `INTERNAL`: technical consumers only.

## Idempotency, correlation, and causation

Every emitter call needs a stable idempotency key. Record-backed events use the source ID and semantic transition; backfills use `backfill:<model>:<id>:<transition>`. Bulk actions share a correlation ID. Derived events set `causationId` to the event or workflow that caused them. Duplicate inserts return the existing event.

## Processing and consumers

The `events` Compose service runs `npm run events:process`. It:

- recovers stale `PROCESSING` claims;
- claims eligible events in chronological order with `FOR UPDATE SKIP LOCKED`;
- records each processing attempt;
- invokes registered consumers;
- retries with bounded exponential backoff;
- moves exhausted events to `DEAD_LETTER`.

Register consumers through `registerEventConsumer` in `lib/events/consumers.ts`. Keep each consumer small, versioned, independently idempotent, and subscribed to explicit event types. A consumer failure must throw so the event remains retryable.

Future consumers intentionally not migrated in v1 are followed-plant notifications, email alerts, Web Push, care queue and collection digests, exhibit subscriber updates, analytics/projections, AI Collection Briefing and Collection Historian inputs, incident correlation, and search indexing.

## Read models

Plant Health Timeline adapts authorized `DomainEvent` rows to its existing presentation shape, then retains legacy adapters only when an equivalent event is absent. Dashboard activity reads eligible collection events and falls back to legacy rows not represented in the stream. List queries are indexed, paginated, and use compact `summaryJson`; payloads are shown only on detail pages.

## Backfill

Backfill only trustworthy timestamps and relationships:

```bash
npm run events:backfill -- --dry-run
npm run events:backfill
```

Backfilled rows use `source=BACKFILL`, `reconstructed=true`, and deterministic keys. The command reports per-type counts, already-present events, and ambiguous/unsupported records. Do not infer facts from freeform notes or invent precise times for date-only source data.

## Corrections and redaction

Events are never directly edited for display corrections. Managers create `event.corrected`; the original links to its superseding event. Server admins create `event.redacted`; the original envelope remains, its payload is hidden by policy, and AuditLog records actor, reason, and timestamp. Ignoring a failed delivery changes processing metadata only and requires a reason.

## Operations

Server Management → Event Processing shows queue counts, oldest queued work, recent throughput/failures, processing history, retry controls, dead-letter detail, and reasoned ignore controls. Worker runs also appear in the existing `ServerWorkerRun` and incident-health foundation.

Configuration:

```text
AXILDB_EVENT_ENGINE_ENABLED=true
EVENT_WORKER_INTERVAL_SECONDS=15
EVENT_WORKER_BATCH_SIZE=50
EVENT_WORKER_MAX_ATTEMPTS=8
EVENT_WORKER_STALE_MINUTES=15
```
