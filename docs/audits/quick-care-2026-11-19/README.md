# Quick Care review — 19 November 2026

## Result and placement

Three circular controls sit in the existing instance title/action row beside the ID-regeneration utility. Water and Fertilize reuse the care semantic palette; Photo uses the existing violet palette. Visible circles are 36 px inside 44 px targets. The existing QR, botanical typography, accession ID and primary links retain their places. No card, heading or standalone toolbar was added. Missing instance photographs produce a small exclamation badge and accessible description; upload removes both.

The long-ID/cultivar fixture measures 328 → 340 px for the left header block at 390 px width, and 156 → 164 px on desktop. The modest increase accommodates 44 px targets alongside the existing 32 px ID utility. Narrow layouts wrap rather than shrinking targets. Screenshots use synthetic records, not production data.

| View | Before | After |
| --- | --- | --- |
| Mobile light | [Before](screenshots/before-header-light-390.jpg) | [After](screenshots/after-header-light-390.jpg) |
| Mobile dark | [Before](screenshots/before-header-dark-390.jpg) | [After](screenshots/after-header-dark-390.jpg) |
| Desktop light | [Before](screenshots/before-header-light-1440.jpg) | [After](screenshots/after-header-light-1440.jpg) |
| Desktop dark | [Before](screenshots/before-header-dark-1440.jpg) | [After](screenshots/after-header-dark-1440.jpg) |

Additional captures: [pending](screenshots/pending.jpg), [completed today](screenshots/completed.jpg), [fertilizer not applicable](screenshots/not-applicable.jpg), [photo acquisition](screenshots/photo-dialog.jpg), [320 px](screenshots/responsive-320.jpg), [tablet](screenshots/responsive-820.jpg), [landscape mobile](screenshots/responsive-844.jpg).

## Tested behavior

- PostgreSQL integration: first care, server timestamp/actor/provenance, durable receipts, simultaneous independent requests, exact-payload retries, queue overlap, explicit repeat, fertilizer same-day checks, server N/A rejection, Not Scheduled availability, preserved cadence override, no-cadence care, voluntary Quiet Day care, scoped/archived rejection, historical preservation and unrelated adjustment preservation. DST bounds cover 23- and 25-hour local days.
- Twenty-five sequential service mutations complete without errors; the final local sample measured 4–6 ms per mutation. This is a disposable local database measurement, not an estimate for the production VM.
- Chrome end-to-end: four light/dark desktop/mobile comparisons, 320/390/820/844/1440 px layouts, no horizontal overflow, fixed pending-button geometry, completed time/check state, explicit-repeat cancellation, fertilizer N/A, watering/fertilizing separation, no-photo badge removal, first upload, progress upload preserving the representative, cancellation, upload rejection/retry, mutation rejection/retry, and committed-response-loss retry without duplicate repeat care.
- Twenty actual browser page visits followed by watering complete successfully. Final local navigation-plus-action samples were approximately 0.17–0.20 seconds. No client exceptions or unexpected origin errors occurred. Deliberately rejected requests returned the expected errors. Runtime operation logs returned to zero active requests/in-flight mutations between actions. The final process sample was about 342 MiB RSS versus a 425 MiB peak after repeated rounds; this bounded test is not long-duration memory-leak certification.
- Actual workflow server actions: completing a routine watering step after header watering preserves one care event; completing workflow watering first is reflected in the header’s completed state. Workflow changes use shared row locking and same-day equivalence.
- Authenticated read-only membership hides the cluster and rejects forged POSTs. Effective Not Applicable is enforced on the server as well as hidden in the UI. Existing photo authorization and source/metadata controls are retained.
- Shared regression checks pass: bulk care, durable queue operations, calendar/scheduling policy, workflow invariants, typography, and database Quiet Day/forecast checks including 1,000 additional instances, concurrent readers/writers, rollback and safe retry.

TypeScript and production build pass. Changed tracked files introduce no new Next core-web-vitals lint findings; new Quick Care components/services/API/tests were also linted directly without errors. The repository does not have a committed standalone ESLint configuration, so this is not a claim that all preexisting lint is clean.

## Reviewed boundaries and limitations

The [feature guide](../../QUICK_CARE.md) documents the shared mutation, operation receipts, date rollover/focus refresh, source metadata, scheduling, observed-care inclusion and photo architecture. Existing actual-care queries include Quick Care by event type; source labels do not exclude it. Assigned cadences, AI cooldowns, QR URLs, history and unrelated special-purpose tasks are unchanged.

The model permits fertilizer events without mandatory product/dose metadata, so Quick Fertilize records routine care without inventing details. Recipe-specific and generic fertilizer applications retain the shared domain equivalence distinction. Detailed metadata remains in the existing care workflow.

There is no safe general care-event reversal, so Undo is deliberately omitted; erroneous events need administrator-assisted correction. The care system uses authenticated user timezone preference in collection views; no new collection timezone configuration was invented. Native button/dialog behavior, names, focus restoration and live feedback were reviewed, but hardware screen readers and Safari/Firefox were not certified. Public mutation controls remain absent; public browsing and all lifecycle variants were reviewed through their existing authorization/lifecycle gates rather than individually exercised in every browser.

No schema changes, new dependencies, host changes or agent changes. Deploy via Web deployment.
