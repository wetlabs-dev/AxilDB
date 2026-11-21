# Care Schedule Integrity

## Root cause and evidence

`getCareQueue` in `lib/care-queue.ts` previously passed only the latest qualifying completed care timestamp to `cadenceDueAt`. That primitive intentionally returns null without an anchor. The caller then skipped null dates. The instance detail page repeated the same calculation. Consequently, an inherited cadence could be valid while both its queue item and next due date were absent until a manual due date or real completion existed.

An equivalent regression uses `MONDEL-LEM-20261014-AC-001`, a seven-day inherited watering cadence, acquisition October 13, 2026 and no care events. It now produces one outstanding watering obligation with a natural due date of October 20, subject to the existing Quiet Day planner. No care event is invented. Production was not queried: actual overrides, quiet rules and historical activation for the reported specimen remain unverified, and the number of affected production plants is unknown.

## Actual architecture

- `PlantDefinitionCareCadence` holds structured definition decisions; `PlantInstanceCareCadenceOverride` holds custom, disabled or N/A decisions. `resolveCadence` remains the common inheritance resolver. Free-text guidance does not become a schedule.
- Six recurring categories share initial scheduling: watering, fertilizing, repotting, pest/general inspection and pruning. Fertilizing retains the active effective recipe requirement and database dependency safeguards. N/A and unscheduled decisions create no recurring occurrence.
- The normal queue is **derived on demand**, not a table of daily task rows. `getCareQueue` reads active instances, grouped latest care, adjustments, conditions, reminders, seasonal repotting work and other existing sources. There is no midnight job whose omission permanently loses an initial task.
- Natural dates are normalized to collection-view local calendar midnight using the existing timezone preference passed by callers. The repository currently supplies the viewer’s timezone preference to queue and forecast, rather than a separately persisted collection timezone. This change preserves that behavior; administrators must use the same timezone in the audit. DST, month-end and year arithmetic remain shared calendar calculations.
- `resolveCalendarPlan` combines collection/location quiet rules, bounded category-aware movement and durable `CareQuietDayAdjustment` decisions. Manual dates and snoozes remain protected. Unresolvable quiet windows retain an explicit conflict. No obligation is dropped because the server missed its due date.
- `PlantCareAdjustment` stores explicit dates, snoozes, suppression and optional pinned initial anchors. Care events are the authoritative history. Seasonal repotting queue entries supersede routine repot assessments; open conditions supersede corresponding routine inspection items. These are intentional coverage rules.
- Completion, Quick Care and bulk paths create actual care events; existing triggers clear explicit next dates/snoozes. Operation receipts and calendar locks protect retries. Disabled overrides remain disabled until the user restores inheritance/custom scheduling; reconciliation does not infer that they are mistakes.
- Forecast uses `loadCareForecast` → `getCareQueue` → `careForecast`, projecting the same recurrence. Overdue initial work appears once as outstanding work, not once for each missed historical interval. Future forecast projections are estimates, not completed history.
- Filtering/grouping happens after derivation (`care-queue-view`, location helpers). Today includes due/overdue work; category views can show future work. API snapshots are private/no-store. The optimistic store reconciles user actions and cadence saves invalidate layout data. Reloading obtains authoritative state; deployment itself does not rewrite browser snapshots already open.

## Initial scheduling contract

`resolveInitialCareSchedule` in `lib/care-cadences.ts` is the shared raw due-date resolver for queue, instance display and integrity audit:

1. No effective scheduled cadence, a disabled adjustment or inactive specimen means no normal recurring task. Fertilizer without an active effective recipe is an incomplete configuration, not a fabricated schedule.
2. Preserve an explicit next due date. A later snooze postpones availability under the existing queue policy.
3. Otherwise, existing qualifying completed care remains the recurrence anchor, including care predating a later cadence edit. This deliberately preserves established history-based behavior.
4. Without completed care, use a pinned initial anchor when present; otherwise propagation date, acquisition date or creation date in existing lifecycle order. Compare it with known cadence activation and use the later date.
5. Add the configured calendar interval, then apply local-day normalization and the existing Quiet Day planner. Initial shifts cannot precede their anchor day; subsequent shifts cannot precede the day after completion.

Activation is stored for future definition/instance decisions. Interval edits preserve the activation boundary, including legacy sync writers; transitioning from disabled/N/A to a new scheduled decision establishes a new boundary. Removing an override restores the definition’s existing activation boundary. Historical rows keep null activation dates rather than pretending that migration day was activation day. Their lifecycle fallback is an inference and the audit flags it for review. Changing accession dates is never part of repair.

Inactive specimens are excluded. Reactivation deliberately resumes an existing outstanding obligation, rather than silently resetting arrears or claiming new care. No independent reactivation date exists in this schema; users who intend a new start can set an explicit due date. The fallback never uses request time, so repeated reads and server restarts cannot push the first date forward.

Instance cards calculate dates through the same resolver, display the basis and use a bounded six-item read-only calendar preview. Existing matching durable quiet decisions are reused. Before a queue has published a durable grouped decision, the card’s preview is provisional; collection-wide workload balancing can choose a different eligible day when the queue is first resolved. The card does not run collection-wide reconciliation or persist preview shifts. Queue and seven-day forecast always use the same full planning pipeline.

## Administrative audit and safe reconciliation

Use the existing server shell from the deployed Compose directory. The `metrics` worker uses the builder image, which includes the scripts, TypeScript runtime and configured database environment; the slim application runner does not. After Web deployment updates workers, run the command there. For development, the same npm command can run directly with an explicit local `DATABASE_URL`. This is a backend administrative command, not an unauthenticated web endpoint. A separate Server Management job/UI would add disproportionate machinery for a derived queue; command output provides timestamps, cursor progress, findings and the final breakdown. Save JSON lines as your audit record; no audit runs merely by loading a page.

Dry run first (replace the slug/timezone with the actual collection view):

```bash
docker compose exec metrics npm run care:audit -- --collection sibley --timezone America/New_York
```

After reviewing inferred dates, optionally pin legacy anchors:

```bash
docker compose exec metrics npm run care:audit -- --collection sibley --timezone America/New_York --apply
```

Defaults: 100 active instances per transaction, maximum 250, sequential batches. `--batch-size 50` reduces each transaction’s work. Restart after the last successful batch with `--after INSTANCE_DATABASE_ID`; a failed batch rolls back, exits nonzero and can be retried. A full rerun is safe. Collection scope and database IDs are exact. The process streams findings; it does not retain the entire collection in memory.

`auditCareScheduleBatch` detects invalid cadence state, missing recipes, unresolved scheduling, explicit adjustment suppression, unknown legacy anchors and quiet-window conflicts. Each finding includes instance/definition/location, category, cadence/source, completed-care timestamp, anchor, expected base due date, queue-state explanation and proposed action. No automatic repair is attempted for configuration conflicts or deliberate suppression. Historical activation uncertainty is flagged even though the deployed engine can already derive the task.

Apply only pins legacy no-history anchors to `PlantCareAdjustment.initialAnchorAt`. It does not change `nextDueAt`, snoozes, disabled/N/A state, intervals, accession dates, care events, completed work or durable Quiet Day decisions. Batch transactions serialize with cadence edits and queue operations, re-read current state and preserve user decisions. First real completion supersedes the pinned initial anchor naturally. Interval and activation changes are resolved at read time.

There is no persisted normal-task table to backfill, deduplicate or sweep for inactive/orphaned tasks. Keys identify one outstanding occurrence per category/specimen; quiet decisions for old recurrence fingerprints do not suppress new work. This audit does not claim to certify every reminder, seasonal repot job, external client snapshot or historical quiet-cache row. Existing tests separately cover those planning and mutation paths.

## Deployment

Use **Web deployment**, including its normal migration step. Migration `20261121120000_initial_care_scheduling` adds nullable activation timestamps and a nullable initial anchor, sets defaults only for future cadence rows and updates legacy sync compatibility. It performs no history rewrite, inferred-date backfill or full-table reconciliation. No new worker, timer, host configuration or mandatory environment variable is required.

Existing eligible no-history plants recover automatically on the first fresh queue/forecast read after deployment. Refresh an already-open queue. The optional audit/apply command is for reviewing and pinning inferred legacy dates, not a prerequisite for displaying recovered tasks. Back up normally before migration. Old application writers can omit the additive columns during rollout; the updated app requires the migration before it starts.

## Verification — November 21, 2026

An isolated local PostgreSQL database received all migrations; no production database was contacted or changed. Executed coverage:

- New initial-care integration: reported-equivalent failure, lifecycle/creation fallback, newly assigned cadence, explicit dates/snoozes, custom/inherited/removal, first completion, duplicate operation receipt, concurrent completion/reconciliation, deliberate suppression, N/A, active recipe fertilization, activation preservation across structured/legacy edits, reactivation and quiet-day shifts.
- 302 active plants processed in batches of 50; 1,200 legacy anchors pinned in approximately 0.7–0.8 s. Repeated/concurrent apply produced zero additional pins and no invented care events. This is a local synthetic benchmark, not production sizing.
- Existing calendar database suite: local-midnight availability, durable concurrent shifts, overdue/restart retention, forecast consistency, snoozes, location changes, sequential quiet edits and interruption/retry. Its additional 1,000-instance workload completed in approximately 0.8 s.
- Calendar/cadence/scheduling unit suites: inherited/custom states, month/year arithmetic, initial DST transitions, consecutive/global/location quiet days, bounded conflicts, grouped movement, repeated forecasts and generated calendar invariants.
- Authenticated browser integration: meaningful October 20 due date and initial-basis text, one queue watering task, matching forecast, no invented history, light/dark and mobile/desktop layouts.

Production counts, the actual specimen’s complete state, physical mobile browsers and a new exhaustive 40-scenario matrix have not been independently verified. Existing regression suites supply much of the completion/bulk/calendar coverage; test names and limitations should not be read as production certification.

Visual evidence: [mobile light](audits/initial-care-2026-11-21/cadences-light-390.png), [mobile dark](audits/initial-care-2026-11-21/cadences-dark-390.png), [desktop light](audits/initial-care-2026-11-21/cadences-light-1440.png), [desktop dark](audits/initial-care-2026-11-21/cadences-dark-1440.png), [browser result](audits/initial-care-2026-11-21/results.json). Screenshots contain synthetic test records.

Final checks: fresh final migration chain, initial-care regression rerun, cadence dependency database regression, TypeScript/production build, typography and targeted ESLint passed. The existing no-history database expectation was updated from zero tasks to one task; disabling a cadence still expects zero.
