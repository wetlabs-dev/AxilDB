# Care Schedule Deconfliction

## Workflow

Select **Resolve conflicts** in the Care forecast. The inline panel lists conflicts across the current seven-day forecast, grouped initially by location and Quiet Day period. Change grouping to original date, category or quiet period if useful.

Each row has the previous eligible date on the left, task identity and explanation in the center, and next eligible date on the right. Mobile stacks task details above the two choices. Existing care-category icons/colors and the botanical name renderer are reused. Select either date to stage it. If only one direction is available, it is staged automatically; saving still requires confirmation.

Use bulk direction/recommendation buttons for the displayed tasks, a group, or checked rows. A batch holds at most 200 staged decisions; larger groups stage the first eligible 200. The list displays at most 500 current conflicts, with a limit notice. Apply those and refresh for the remainder. Clear staged selections changes no database state.

**Review resolutions** requests a fresh server preview. The impact list uses the same calculated occurrences as the forecast; it does not invent daily totals. Counts beyond its 21-day projection horizon are explicitly unavailable, while the number of staged moves remains visible. A workload increase is flagged when a destination gains at least ten tasks and rises by more than 50%. Chosen dates are never silently redistributed.

Candidates outside automatic shift limits are labeled **Manual exception** and require the explicit confirmation checkbox. Selection, review and apply are separate steps. Failed requests retain selections and permit retry. Changed scheduling state requires refreshed suggestions; still-valid selections survive refresh. Success removes resolved rows and updates the forecast/queue through existing care snapshot events without reloading the page.

## Architecture and scheduling policy

The existing queue is derived, with durable quiet shifts in `CareQuietDayAdjustment`; the forecast conditionally projects recurrence. There is no daily table of normal task rows to duplicate. `projectCareOccurrences` is the existing forecast projection loop extracted for shared preview/use; `careForecast` still creates the same seven daily summaries.

`calendarShiftPolicy` centralizes the existing bounds and watering preferences. Automatic planning and the new suggestion policy both call it. No automatic tolerance was expanded. Suggestions use existing local-calendar arithmetic and `effectiveQuietRules`/`isQuietDate` across collection, exact location, recurring, one-off and overlapping restrictions. Searches are bounded to 366 candidate calendar days in each direction. Dates before today or before the occurrence’s `notBeforeDate` are ineligible. For old overdue work, the forward search starts at today rather than exhausting its window in the past.

The nearest quiet-eligible date is offered on each side of the blocked occurrence, even if it requires manual approval outside normal bounds. Short watering recommends earlier and long watering later under the existing policy; configured direction preferences are retained. Otherwise the nearest direction is recommended, with an earlier tie-break. The UI exposes workload changes so explicit bulk choices remain deliberate. It does not add a second automatic load-balancing planner or override a chosen destination.

Only routine derived watering, fertilizing, pruning, repotting assessments and pest/general inspection occurrences are eligible. Active-condition follow-ups, treatment plans, propagation/bloom/quarantine work, reminders and seasonal work retain their existing dedicated constraints and controls; unsupported conflicts remain visible with a link to those controls. Routine repot assessments do not bypass seasonal repotting windows or create actual repot work. A manual choice reschedules an assessment, never records watering or other completed care.

## Occurrence identity and precedence

`manualCareKey` identifies an occurrence using the root task key, its natural local due date, cadence/recurrence, exact location and timezone. Hypothetical `:projection` suffixes are excluded. This allows a decision for a conditional future occurrence to carry forward if it later becomes the actual matching occurrence. A projection remains conditional: resolving it does not create an additional current queue task. If actual care/cadence changes make its natural date differ, the decision does not attach to unrelated work.

Precedence follows existing semantics:

1. Actual completion changes the outstanding occurrence and its natural due date.
2. Explicit dates, disabled states and snoozes retain existing priority; deconfliction does not overwrite them.
3. A matching confirmed manual decision takes precedence over an automatic Quiet Day shift.
4. Otherwise normal cadence and automatic calendar planning apply.

A later location, timezone or cadence change creates a different occurrence identity. A newly blocked manual destination is surfaced as a conflict requiring a new decision, rather than silently moved onto a Quiet Day or discarded. An unblocked manual choice survives normal recalculation, restart and ordinary Quiet Day edits. Existing automatic fingerprints and decisions retain their behavior.

## Persistence, authorization and retries

`/api/care/deconflict` uses existing collection-manager authorization, including the standard server-admin authentication requirements. Reads are private/no-store; POST checks the request origin and authentication. The browser cannot submit an arbitrary destination: it submits occurrence key, snapshot token and direction, and the server recalculates the eligible date.

Confirmed decisions reuse the unique `CareQuietDayAdjustment.scheduleKey` slot with `ruleUsed = MANUAL_DECONFLICTION`. Original date, selected date, task/instance, direction, timezone and source are retained. The existing audit log records the approving user, timestamp, decision fingerprint, original/destination dates, direction and explicit exception approval. No schema duplication or new migration is needed.

Apply runs in one transaction under the existing exclusive collection calendar lock, the existing cadence dependency lock and selected-plant row locks. A busy row fails immediately rather than waiting in a lock cycle; no partial batch is saved. The server re-reads current outstanding/projected state and applicable quiet rules, verifies tokens, and recalculates candidates before writing. Completion, prior resolution, location/cadence/configuration changes or protected manual state invalidate stale choices. A changed preview cannot be blindly confirmed. The preview identifies changed selections; after review, valid subsets can be applied and changed rows retained for further review.

Existing operation receipts provide seven-day idempotency for the exact confirmation payload. Concurrent or interrupted-response retries return the original result without duplicate decision/audit rows. Reusing an identifier with different details is rejected. A transaction error rolls back the batch, so the UI never claims a partially failed transaction was saved. Receipts do not overwrite a subsequent explicit user action.

No audit or reconciliation sweep is added to normal pages. Manual shift lookups are batched; normal queue reads query exact occurrence keys. Future manual decisions are loaded once within the forecast halo, bounded at 2,000 matching rows with an explicit error if exceeded. Client state is bounded, and requests are aborted on unmount/replacement. UI application refreshes the module and dispatches the existing care-saved event; the queue store reconciles and broadcasts its authoritative forecast snapshot.

## Verification — November 23, 2026

Executed against an isolated migrated PostgreSQL database and a local production build:

- New policy/integration regression: consecutive restrictions, unavailable previous/both directions, overlapping exact-location rules, DST, overdue searches, short/long watering preferences and protected care types.
- Persistence: actual and conditional occurrences, fresh read/recalculation, projected-to-actual transition, explicit dates, completion, changed quiet configuration, stale rejection, a busy-row failure/retry and concurrent idempotent retry; no fabricated care events.
- A synthetic batch of 150 conflicts was previewed and applied locally in approximately 0.25–0.45 seconds. This is a local benchmark, not a production latency guarantee or physical-device CPU/memory measurement.
- Existing calendar unit and database suites passed, including durable shifts, forecast consistency, quiet-day edit races, completion/snoozes, location rules and a 1,000-instance planning fixture.
- Browser checks: forecast entry, automatic later staging when previous is unavailable, read-only staging, manual exception confirmation, actual apply/reload persistence, an interrupted response followed by retry, access/origin rejection, mobile/desktop layouts and light/dark themes. Screenshots use synthetic records.
- TypeScript, production build, typography and targeted lint checks passed. Physical iPhone/Android browsers and hardware screen-reader behavior were not exercised; keyboard controls use native buttons/inputs with focus styling and status announcements. No scanning or elaborate motion animation is added.

This is not a claim that all 45 suggested cases were independently tested. Partial server failures are atomic rollbacks; changed subsets are handled by preview/review. The occurrence identity intentionally invalidates conditional decisions when actual care changes the forecast assumption.

## Deployment

Deploy through **Web deployment**. No migration, new worker, scheduled job, environment setting or host configuration is required. Existing tables and indexes are reused. No production data is altered during testing. Reload an already-open forecast after deployment to load the new controls.

Visual review: [mobile light](audits/deconfliction-2026-11-23/light-390.png), [mobile dark](audits/deconfliction-2026-11-23/dark-390.png), [desktop light](audits/deconfliction-2026-11-23/light-1440.png), [desktop dark](audits/deconfliction-2026-11-23/dark-1440.png), [browser verification](audits/deconfliction-2026-11-23/results.json). Mobile checks verify that the fixed, safe-area-aware confirmation bar remains within the viewport. The screenshots contain synthetic plants, not production data.

## Early watering

Watering cadence is a scheduling guide, not a mandatory waiting period. For an actual outstanding watering with known completion history, the earliest eligible local day is the day after the last completion; the normal cadence threshold does not block an earlier choice. Past dates and Quiet Days remain excluded. Separate conditional forecast occurrences retain their ordering boundary so selecting early care cannot duplicate a preceding projected watering.

Earlier watering choices are labeled **Early watering**, require confirmation and warn users to check substrate moisture first. The warning persists with the manual decision and remains visible in the resulting queue/forecast. Automatically advanced watering also displays an early-watering warning, including existing durable shifts.

Regression: an isolated fixture with Plant ID `COLSCU-STO-20260731-AC-001`, completed watering November 23, 2026, three-day cadence, natural due November 26 and November 26–29 quiet, offers Wednesday November 25 as early watering and Monday November 30 as the later choice. Production records were not accessed; this reproduces the supplied dates rather than claiming the exact live cause was established. The previous implementation already allowed Wednesday in a fresh actual-occurrence calculation; stale state, additional rules or a separate hypothetical occurrence could explain a different live option list.

Early-watering verification: the exact-date backend regression and browser choice/warning/confirmation/persistence checks passed, along with calendar regressions, typography, targeted lint, TypeScript and production build. No schema or host changes are required.
