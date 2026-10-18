# Responsive Care Queue

Care Queue and Weekly Checklist share an in-memory optimistic overlay scoped to the signed-in user and collection. The authoritative queue stays separate. Pending removals hide matching cards immediately and all summaries, filters, location totals, overdue counts, and checklist totals derive from that overlay. Cards stay mounted until reconciliation, preserving notes and expanded controls when a request fails. Condition updates patch severity, status, and follow-up dates using the existing condition scheduling helpers.

## Actions and reconciliation

The existing Complete, Snooze, Resolve condition, Update condition, Still needs attention, Mark established, and reviewed bulk care submissions use the same `CareActionForm` and store. The queue does not currently expose dismissal or skip mutations, so none were added. Treatment-plan links continue to open their existing workflow. Bulk care retains its atomic transaction and existing per-plant skip behavior.

The mutation endpoint runs the existing business logic extracted from `app/actions.ts` into `lib/care-queue-mutations.ts`; the original server actions remain progressive-enhancement fallbacks. HTTP requests can execute concurrently, avoiding the client-side serialization of Next server actions. Existing collection roles, reminder ownership checks, care history, fertilizer associations, substrate history, audits, and domain events remain authoritative on the server.

Each unresolved operation locks its plant/care-type or reminder identity, while unrelated plants remain interactive. Snoozing hides every matching task affected by the shared adjustment. Definite failures restore only that operation. Lost responses are checked against the operation receipt before treating them as unknown; Check again always reuses the original ID and payload. No browser storage, offline queue, or simulated care history is used. The store survives ordinary client navigation and never cancels a valid request when a component unmounts. Reloading or closing the tab discards local pending state; returning fetches the saved queue.

After in-flight requests settle, one background GET fetches an uncached authoritative snapshot. Generation checks discard responses overlapping newer mutations, and overlays remain until the accepted snapshot arrives. A consolidated RSC refresh then updates other server-rendered context without navigation or resetting scroll. Returning to the app or reconnecting also reconciles. If refresh fails, confirmed operations stay hidden and a Refresh queue control is offered.

Focus moves to a nearby item or the empty-state heading when the focused card disappears, without scrolling to the page top. Status and failure announcements use live regions; no blocking dialog or stream of success toasts is added. Removal is immediate with no motion, including reduced-motion preferences.

## Idempotency and migration

Migration `20261018160000_care_queue_operation_receipts` adds `CareQueueOperation`. Its primary key scopes each operation ID to the user and collection. Receipt insertion, result storage, care updates, history, audits, and domain events commit in the same transaction. Concurrent identical requests return the original result; a reused identifier with different details is rejected. Bulk batch IDs additionally serialize simultaneous submissions from different tabs.

Receipts expire after seven days and expired rows are pruned during subsequent mutations. Requests carrying expired timestamps are rejected instead of recreating an old operation after pruning. The endpoint requires authentication, existing collection permissions, JSON input, and an exact scheme/host/port origin match without trusting forwarded-host headers. Receipt lookups remain scoped to the current user and collection.

Back up the database and run the normal migration deployment service before starting the updated app. No existing care history is modified by the migration. There are no new dependencies or background services.

## Files and checks

- `components/CareQueueOptimistic.tsx`, `lib/care-queue-store.ts`, and `lib/care-queue-optimistic.ts`: overlay, per-item locking, failure/retry feedback, focus, and concurrent lifecycle.
- `components/CareQueueView.tsx`, `CareQueueChecklist.tsx`, `CareQueueLocationBoard.tsx`, and `CareQueueItemCard.tsx`: existing layouts with shared actions and immediate counters.
- `app/api/care-queue/route.ts`, `lib/care-queue-mutations.ts`, and `lib/care-queue-operations.ts`: uncached snapshots, authorization, shared mutations, and transactional receipts.
- `lib/care-queue-view.ts` and `lib/collection-path.ts`: browser-safe versions of existing filtering, counting, condition scheduling, labeling, and path helpers.

Run `npm run check:care-queue-optimistic` for controlled-promise lifecycle tests. Use a disposable migrated PostgreSQL database with `DATABASE_URL=... npm run check:care-queue-operations` for actual mutation, metadata, receipt, concurrency, and rollback checks. `npm run check:care-queue-ui` creates and removes its own fixtures and requires the disposable database at localhost:55439/axildb, the local app on port 3107, and installed Chrome. It deliberately holds network requests to prove that visual updates precede persistence, and tests recovery, counters, focus, navigation, offline behavior, lost responses, access/origin protection, bulk care, and mobile/desktop layouts.

The repository's lint command currently opens the ESLint setup prompt because no configuration is checked in. The collection-scope checker also has existing findings in unrelated AI Curator and listing queries. These are separate from this responsiveness pass.

## Verification results

Fresh PostgreSQL migrations and Prisma client generation passed. Controlled-promise tests, actual database mutation/receipt tests, care cadence tests, existing scheduling/timezone/workflow/domain-event/substrate checks, TypeScript, and production compilation passed. Browser checks passed with held requests, out-of-order rollback, preserved notes/expansion, stale refreshes, navigation during pending work, offline recovery, lost responses after commit, condition changes/resolution, keyboard establishment, mobile touch completion, bulk care, duplicate replay, unauthorized/read-only requests, exact-origin rejection, and 360/390/768/1280px layouts. No new browser React errors were reported; desktop and mobile screenshots were inspected.

`npm run lint` could not run because it opens the repository's existing setup prompt. The collection-scope guard reports the same seven pre-existing AI Curator/listing findings; the collection-defaults guard passes. Offline durable persistence, notifications delivery, and a new dismissal action remain outside this change.
