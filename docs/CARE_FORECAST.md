# Calendar care planning

## Existing architecture inspected

- `lib/care-cadences.ts` resolves definition cadences and instance overrides, Not Applicable states, recipe prerequisites and calendar due dates.
- `lib/care-queue.ts` derives tasks from the latest completed care, adjustments, active conditions/blooms, quarantine, reminders and treatment steps. Most derived tasks already start at local midnight. Dashboard, API, checklist and bulk care reuse this service.
- `PlantCareAdjustment` stores explicit next-due dates, snoozes and disabled state. Snoozes previously disappeared until their exact timestamp; reminder dates could retain time-of-day thresholds.
- Quiet Day supports multiple one-time, weekly and date-range entries, with per-category direction and shift bounds. Queue shifts were recalculated on every read; smart watering direction depended on whether the original date had arrived. Only schedule-sync shifts had durable `CareQuietDayAdjustment` records. Ordinary reads did not persist shifts or balance category workload.
- `CareQueueOperation` provides transactional mutation receipts and optimistic reconciliation. Bulk care shares completed events and serializes plant writes. Seasonal repotting appointments are separate from queue assessments. No historical event conversion is needed.
- Existing timezone policy uses the saved user preference, with `AXILDB_DEFAULT_TIMEZONE` / the application fallback. The extension preserves that policy and includes timezone in scheduling provenance.

Implementation policy and verification are documented below as the feature is completed.

## Scheduling policy

The existing daily queue is an evaluated plan, not a frozen duplicate task table. Every due timestamp is normalized to the beginning of its local calendar date. Exact care timestamps and reminder delivery times remain unchanged. Snoozes and explicit next-due dates use their selected local day and remain authoritative. A browser rollover timer refreshes an open view at the next local midnight; correctness comes from server-side calendar calculations, not that timer or an exactly-on-midnight worker. Offline/restarted servers derive the correct current day on their first request. Overdue work retains its date.

Quiet Day scheduling is centralized in `lib/care-calendar.ts`, called by the existing `getCareQueue` service. The forecast uses those authoritative tasks and the same adjustment policy for conditional later occurrences. Today plus six dates are displayed, with overdue carryover included in today's count. Regular cadence occurrences and recurring reminders project forward assuming on-schedule completion. State-dependent condition, propagation, bloom and quarantine follow-ups project their next known assessment; future changes of workflow state are not assumed. Seasonal repotting appointments remain in the separate planner; only unscheduled assessments enter this queue.

The existing saved-user timezone policy is preserved, with the existing application default as fallback. Queue, forecast, preview and confirmation resolve it consistently. Forecast headers identify the timezone. DST, local midnight and month/year/leap-day boundaries use shared timezone utilities.

### Bounded, explainable redistribution

- Watering at 7 days or less prefers earlier eligible dates; at 14 days or more it prefers later eligible dates. Intermediate cadences choose lighter nearby eligible dates. All applicable restrictions are checked together at each candidate. These are assessment heuristics, not botanical tolerance facts; check substrate moisture before watering.
- Watering shifts use the smaller of the configured bound and a cadence-sensitive bound: at most the cadence interval, capped at 14 days, normally one third of the interval with a two-day minimum. A short-cadence task without a safe earlier date remains an explicit scheduling conflict. No assessment advances onto or before the day of its last actual or projected completion.
- Other automatically derived categories move together to a lighter nearby day within the existing per-category bounds, capped at 14 days. Custom explicit direction rules are respected. Groups larger than 40 can split into deterministic coherent chunks to avoid one very large spike; smaller groups are not scattered to equalize counts.
- Manual dates, snoozes, condition follow-ups, treatment deadlines, quarantine and explicit reminders are protected. They can remain on Quiet Days as required exceptions. Unchanged plans retain overdue work. Calendar edits reconsider routine work within bounds of its original cadence date; if no safe date remains, it becomes a conflict rather than being postponed indefinitely.
- Ordinary reads retain saved effective dates. Explicit Quiet Day changes, including removal, invalidate affected plans even if they are already actionable. Replanning starts from the original cadence date, never an adjusted date. Completed care and explicit manual schedules remain protected.

## Durable state and concurrency

The additive migration `20261020200000_calendar_care_plans` adds nullable `scheduleKey`, `taskKey`, and `timezone` to the existing `CareQuietDayAdjustment` table, plus a unique index on `scheduleKey`. Legacy adjustment history is untouched. No care-event migration, timestamp conversion, or new care history is introduced.

An occurrence key includes collection, timezone, task, original date and its completed-care/cadence/manual-state anchor. Insert-on-conflict and a readback make simultaneous plan reconciliation converge. Actual completion changes the anchor, so an early-completed assessment cannot reappear merely because its original date was tomorrow. No snapshot freezes explicit changes or completed tasks.

Quiet Day previews do not write settings or schedules. Confirmation revalidates a digest of the current state and forecast in a serializable transaction, with a collection scheduling lock. Changed previews require renewed confirmation; concurrent confirmations cannot create duplicate shifts. Settings creation/deletion and rule edits route through the same review interface. All existing one-time, weekly and date-range rules remain supported. Removing a recurring/range rule is explicitly labeled as removing the entire rule.

Forecast refreshes are event/focus driven and debounced; there is no continuous forecast polling. Queries use the existing batched latest-care lookups and unique occurrence index. Work is bounded to the seven-day horizon plus the maximum adjustment halo. Ordinary reconciliation retains saved choices rather than reshuffling other tasks after every completion.

## Rollout and recovery

Deploy through Application Updates and review the additive migration normally. No host-agent upgrade or manual bootstrap is required. Keep normal backups. Existing events, cadences, instance overrides, snoozes, manual tasks and repotting appointments are preserved. A restart requires no special recovery command. Required work is never hidden to force a Quiet Day to display zero.

Quiet Day changes are authorized for collection managers, checked server-side, origin protected, audited, previewed and atomically committed. Forecast viewing uses existing collection-view permissions. Upcoming entries are labeled as projections or scheduled future work; the forecast does not provide future completion controls.

## Verification

`check:care-calendar` tests calendar policy, grouped load, bounded watering, manual and overdue exceptions, retained advanced work, recurrent forecasts, horizon boundaries, DST, leap dates and month/year rollover. `check:care-calendar:db` uses an isolated collection in a disposable migrated database to verify midnight behavior, concurrent persistence, reconnection, completion, inherited cadences and overrides. `check:care-calendar:ui` uses Chrome and a local app against disposable fixtures to verify seven-day interactions, tomorrow warnings, cancel/confirm, immediate actionable work, stale previews, concurrent changes, desktop/mobile layout and authorization. Existing bulk-care, care-cadence, optimistic queue and scheduling suites provide regression coverage.

Validation results for this change: the incremental migration and the entire 54-migration chain both applied successfully to disposable databases. Prisma's broad schema-diff check reports existing unrelated differences (numeric precision, historical constraint/index names and defaults). Comparing the pre-change 53-migration database/schema with the post-change 54-migration database/schema produced byte-identical drift scripts: this feature adds no new drift. Standalone lint still prompts for initial ESLint configuration; it cannot currently run non-interactively in this repository.


## November 2026 reliability correction

Confirmed reproduction: a Thursday routine watering occurrence shifts to Friday. On Friday, adding Friday as Quiet Day used to preserve that saved decision because `adjustedDueAt <= today`, regardless of the changed configuration revision. Both the store and calendar had this unconditional freeze, and the `reviseQuietPlan` option did nothing. The regression fails against the previous implementation and passes after removing the freeze. Initial candidate selection already checked all applicable rules; the defect was in reusing prior decisions. A second failure path labeled lack of a safe destination as an automatic exception on a prohibited date.

The existing canonical calendar engine now invalidates all affected saved decisions on a configuration revision, including today's plans. A policy revision also reconciles pre-update records on first access. Stable occurrence keys, original due dates and completion/cadence anchors remain in the existing table; no schema change is required. Conflicts are durable decisions with `shiftDirection=CONFLICT`; their date is the unresolved cadence date, not an authorized scheduled destination. Queue cards highlight them, and forecasts list them separately from scheduled counts. Necessary care is retained and can be explicitly rescheduled, performed manually, or resolved by editing Quiet Days. Conflicted hypothetical occurrences do not generate further assumed completions. Hypothetical recurrence advances from the original cadence basis rather than accumulating quiet-day displacement.

Collection and exact-location restrictions remain additive; parent location inheritance is intentionally unchanged (none). Weekly, one-off and range restrictions share date-only timezone utilities. The established saved-user timezone is preserved because collections have no scheduling timezone setting; the displayed forecast timezone identifies the basis.

Queue evaluation, forecast loading and previews hold a shared transaction-level collection calendar lock. Reads can run concurrently. Quiet Day confirmations and idempotent queue mutations hold its exclusive form; configuration and adjusted plans commit atomically. The combined queue/forecast API uses one transaction and lock, preventing an old queue from being paired with a newer calendar. Failed confirmation rolls back both configuration and reconciliation and reports the error; retry uses a fresh preview. There is no separate reconciliation job, midnight task table or partial saved-config state to recover. Daily queues are dynamically evaluated through `getCareQueue`, including background briefings/digests, dashboard, checklist, bulk actions and API reads. Location changes and cadence overrides change the evaluated state on the next read; completed events are never rewritten.

Searches remain bounded (at most 28 candidates/group); collection queries remain batched and unaffected location revisions retain their decisions. No new worker, timer or global recalculation was added. Large collections retain the existing 30-second transactional bound: failure is surfaced and rolled back, never reported as a successful partial update.

Regression coverage adds sequential and reverse/batched edits, already-actionable shifts, edit/remove/re-add idempotency, full quiet weeks and visible conflicts, mixed categories/cadences, additive scope and protected tasks, 100 seeded generated calendars across DST/month/year/leap boundaries, database anchors and duplicate prevention, concurrent readers/calendar writers, transaction interruption/retry, and persisted queue/forecast agreement. Browser checks cover actual preview/commit actions and conflict presentation.

Deploy this correction via Web/Application Updates. No migration, Compose changes, host-agent update or manual server command is needed. Existing decisions reconcile on access using the policy revision.


Validation for the reliability correction: calendar and seeded invariants, database regression/concurrency/recovery checks, inherited cadence DB checks, bulk-care DB checks, optimistic queue checks and Chrome browser/API checks passed. The 1,000-additional-instance fixture reconciled a calendar edit in approximately 0.8 seconds locally (not a production VM benchmark). Changed-file Next core-web-vitals lint passed. TypeScript and the production build passed. Explicit completion and snooze races with Quiet Day edits also passed.
