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

- Watering at 7 days or less preferentially advances one day. At 14 days or more it preferentially delays one day. Intermediate cadences choose the lighter eligible adjacent day. These are assessment heuristics, not botanical tolerance facts; check substrate moisture before watering.
- Watering shifts are capped at one day even if older settings specify wider bounds. A short-cadence task without a safe earlier date stays visible as an exception. No assessment advances onto or before the day of its last actual or projected completion.
- Other automatically derived categories move together to a lighter nearby day within the existing per-category bounds, capped at 14 days. Custom explicit direction rules are respected. Groups larger than 40 can split into deterministic coherent chunks to avoid one very large spike; smaller groups are not scattered to equalize counts.
- Manual dates, snoozes, condition follow-ups, treatment deadlines, quarantine and explicit reminders are protected. They can remain on Quiet Days as required exceptions. Overdue work is never repeatedly pushed forward.
- Once an adjusted occurrence becomes actionable, its saved effective date remains outstanding until actual care changes its occurrence identity, even if Quiet Day is later changed or removed. Future changes replan from the original due date, never from an already shifted date.

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
