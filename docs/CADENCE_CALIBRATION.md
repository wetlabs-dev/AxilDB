# Adaptive care cadence research

Cadence Calibration compares configured definition care intervals with actual completed care in the same collection. It produces proposals in the existing Curator cadence-review queue. A person must approve every change. Observed maintenance patterns are not evidence that care is biologically optimal.

## Architecture and future metrics

- `lib/metrics/interval-analysis.ts` is a pure, metric-independent statistical engine. It accepts date-indexed observations, not Prisma entities, queues, or AI responses. It implements duplicate normalization, completed intervals, robust and recency estimators, and equal-specimen aggregation.
- `lib/metrics/care-history-adapter.ts` translates canonical care categories and scoped completed events into observations. It owns acquisition, identity, condition, recipe, override, seasonality and quiet-day evidence rules, and care-specific discrepancy assessment.
- `MetricCalibrationState` is metric-independent persistence, keyed by collection, definition and `metricKey`. Care uses `care:<canonical activity>`. Its evidence JSON supports other metrics without adding category-specific columns.
- `lib/cadence-calibration.ts` connects the adapter to existing Curator jobs, leases, category-specific eligibility, proposal publication, approval, rejection and stale checks. An interpreter callback is optional and cannot supply statistics or change the proposed interval.
- `lib/calibration-policy.ts` centralizes validated defaults and bounded processing limits.
- `components/ObservedCare.tsx` adds compact tile summaries, expandable evidence and prioritized research; `CalibrationOverview` adds bounded admin progress and prioritization. The private statistics API and server actions enforce collection authorization.

To add another metric, implement its own observation adapter and assessment policy using the pure engine where appropriate, allocate a new metric-key namespace, and connect its proposal/application adapter to the Curator worker. Reuse the state table and eligibility pattern. Do not make the statistical engine depend on a new care category, raw ORM entities or an LLM. Scalar/non-interval metrics can use their own estimator while retaining the generic state/lifecycle. This implementation intentionally does not introduce automatic specimen overrides or seasonal schedules.

## Data audit and semantics

`PlantCareEvent.performedAt` records completed care independently of `createdAt`; queue completion, bulk care, manual logs and care-producing workflows ultimately use these events. Snoozes/explicit dates live in separate adjustments, incomplete seasonal appointments in the repotting queue, and reminders in their own records. None becomes a completed observation. All event reads require the collection ID as well as currently associated specimen IDs.

The six existing `cadenceActivities` mappings are authoritative. Watering, fertilizing, pest/general inspection, pruning and repotting retain their established event semantics. Recorded `REPOTTED` and `PRUNED` events represent physical interventions; the system cannot infer checks that were performed without an event. Evidence explicitly labels this distinction. Booking a repotting window does not count as repotting.

Eligible observations exclude future events, inactive specimens, intentional structured cadence overrides, fertilizer assignment overrides, other/unknown fertilizer recipes, pre-acquisition records, and identifiable exceptional/invalid/unreliable-import metadata. Same-specimen/category/calendar-day observations consolidate analytically without deleting records. Unknown dates and nonfinite observations cannot form intervals. Incomplete time since last care is separate from completed averages.

Recorded moves, substrate history, repotting (for watering/fertilizing), and identifiable identity-change audits segment the observation window. Repotting intervals are not segmented by the substrate change inherent in repotting itself. Legacy records lack complete historical identity/provenance and exception flags. Unknown emergencies, undocumented re-identification and uncertain imports cannot be reliably distinguished; the UI and interpretation include that limitation. This is conservative evidence filtering, not a reconstruction of unrecorded history.

Historical `CareQuietDayAdjustment` rows identify actual recorded displacement. Today's quiet-day configuration is never projected backward to invent historical restrictions. Bulk batch metadata identifies synchronized care. These affect confidence/explanations; no synthetic care events are created from snoozes or schedules. Applying a change uses the existing scheduling service, which combines collection and exact-location quiet days and skips consecutive blocked dates.

Timezone uses the existing application default (`AXILDB_DEFAULT_TIMEZONE`, otherwise America/New_York); collections currently have no authoritative scheduling-timezone field. The statistics display their timezone. Calendar-day indexes handle DST and browser/server timezone differences. Calendar MONTH/YEAR decisions preserve their unit on application; days are an analytical comparison at the assessment date, not a replacement fixed-day schedule.

## Methodology and evidence policy

Each specimen's sorted, distinct completion dates produce intervals only within that specimen. Ordinary arithmetic mean, median, min/max, sample standard deviation, IQR, earliest/latest observations, span, completed interval/event counts, incomplete ongoing time and exclusions are retained. Recent/historical averages, quarterly seasonal summaries and at most 12 recent intervals support explanation without duplicating all care history.

Recency weights decay with a default 75-day half-life. The robust estimator excludes intervals farther from the specimen median than the maximum of two days, half that median and three median absolute deviations. Ordinary averages retain those outliers for transparent display. Definition means average specimen means equally; the representative estimate is the median of specimen robust estimates. A heavily logged specimen cannot dominate by event count. Per-specimen and location-cohort summaries expose disagreement rather than treating pooled intervals as one plant.

Default minimum completed intervals / history span:

| Activity | Intervals | Minimum days |
| --- | ---: | ---: |
| Watering | 5 | 30 |
| Pest/general inspection | 4 | 30 |
| Fertilizing | 4 | 60 |
| Pruning | 3 | 90 |
| Repotting | 2 | 180 |

The history must also cover at least twice the configured interval and have a contributor with at least two completed intervals. Frequent categories normally use 180 days, fertilizing 365, pruning 730, repotting 3,650; windows expand to three configured intervals, capped at 36,500 days. Thus yearly care needs longitudinal evidence, not merely 180 days without recorded repotting. Post-approval windows additionally respect the configurable minimum new intervals (three by default) and category floors.

Meaningful differences require at least 20% relative deviation and a category/cadence-sensitive absolute floor (one day for <=3-day schedules, otherwise at least two days or 10% of cadence). Large ratios outside 1/3 to 3, substantial specimen disagreement, seasonal divergence, heavy outliers, inconsistent individual series, or stale ongoing care are inconclusive and require investigation. Recorded quiet-day displacement within two days remains inside the stability band. Practical recommendations round in the configured unit; they do not force all observations into weekly buckets or convert calendar years to fixed 365-day schedules.

Confidence is explicitly a heuristic, not a statistical probability. Counts, agreement and specimen coverage increase it; grouping and recorded displacement reduce it. A single specimen is capped at 74%. Evidence shortage never becomes Stable or Not Applicable. N/A is preserved; missing schedules defer to botanical research, and fertilizing requires the existing active assigned recipe.

## Curator and recommendation lifecycle

The existing worker gradually seeds six independent category states for a bounded number of enabled definitions, then queues due `CADENCE_CALIBRATION` stewardship jobs. Global Curator enablement, active collection, AI-feature and collection-Curator enablement all apply. Unique job scopes, the existing worker lease/session lock, bounded retries/backoff and the cadence mutation lock protect work. Interrupted calibration leases use the existing recovery path; no per-definition timer or new worker exists.

Stable, insufficient and clearly inconclusive assessments are deterministic and cost no AI request. When credentials exist, meaningful proposed adjustments use the existing metered Curator model call for botanical interpretation of anonymous aggregates and allowlisted husbandry context. It returns only whether it supports human review and a bounded rationale. It cannot change observed data, counts, confidence or the proposed interval. A veto becomes inconclusive. Without credentials, deterministic findings can still become clearly labeled statistical proposals for human review. Provider failures use existing backoff; raw care histories, user IDs and precise private location IDs are not sent. Budgets still govern worker execution. No real provider request was made during automated tests.

One pending calibration proposal per definition/activity is protected by a partial unique index. Any pending botanical/Magic Fill cadence proposal blocks new calibration publication for that category. Botanical research remains missing-only and cannot overwrite an established calibrated cadence. Manual configuration supersedes pending proposals through the existing canonical service.

Before approval the service checks the current scoped definition, cadence baseline, recipe, cohort and evidence fingerprint, including edits/deletions, recorded condition changes, policy and identity/husbandry context. A changed snapshot is conservatively marked stale; reassess it. Cancelled/lease-replaced jobs cannot publish. Concurrent approvals apply once. Edited approval retains the original proposal and records the actually applied interval. Rejection preserves evidence and optional review note. Proposal and audit histories explain previous/proposed/applied values and reviewer/time; full raw event copies are not retained.

Default cooldowns, independently per activity:

| Outcome | Days |
| --- | ---: |
| Applied adjustment | 30 |
| Stable | 180 |
| Insufficient | 30 |
| Inconclusive | 60 |
| Rejected / keep current | 180 |
| Manual cadence change | 30 |
| Pending review | Suspended |
| N/A / missing cadence | Suspended until configuration changes |

Approved and manually changed categories get a new observation boundary. A 30-day wait alone does not authorize another recommendation: enough new completed intervals must exist after the boundary. Viewing live statistics does not consume a research cooldown. Manual reassessment may bypass a routine cooldown but is limited to one request per 24 hours and never bypasses evidence, prerequisites, pending-review protection or the post-adjustment boundary. Recorded location/substrate changes can advance older assessments, subject to the manual-change, approval and rejection cooldowns. Ordinary care events do not trigger full recalculation or AI calls.

Live statistics refresh lazily on authorized definition viewing/focus/care-saved events with a one-minute persistent cache and visible calculation time. Formal post-adjustment evidence is separate from the full observed summary. No analysis is added to the completion/bulk-care write path. Readiness and today's queue change only after an approved canonical cadence write. Inheriting specimens derive one current task from actual last completed care; explicit overrides, manual schedules, urgent work and completed history remain protected.

## Resource bounds, privacy and backup

Default discovery/job batch is six; configurable maximum 25. Each assessment reads at most 501 specimens and 10,001 events, marking cap overflow as non-actionable. It never loads lifetime collection history. Existing collection/specimen/type/time care-event indexes serve targeted reads. The new state has unique collection/definition/metric identity and an indexed next-eligibility query. State and last summary update in place; historical proposals retain compact evidence. Concurrency and overall time slices remain the existing Curator settings. Statistical work is bounded; no provider call holds a database transaction.

Authenticated collection members may inspect their private statistics; public definition visibility does not grant access. Existing server-admin cadence-review authorization applies to approval/rejection and infrastructure settings. Members with the existing cadence-management role can prioritize their collection's research. Cross-collection IDs are checked before querying evidence or applying a proposal.

Full-instance/routine backup uses PostgreSQL custom-format dumps of the whole database; the new table, proposal evidence and settings are automatically included. Restore retains pending proposals/cooldowns and validates evidence again before approval. Existing CSV collection exports are botanical snapshots, not a private research-state transfer format; calibration state is intentionally not added to those public/portable exports. Migration does not run assessments or apply changes.

## Deployment and verification

Deploy via Web/Application Updates, including the normal existing Curator worker image refresh and additive migration `20261118120000_metric_calibration`. No Compose, host-agent, VM configuration, extra service or manual host installation is required. Normal global/collection Curator enablement controls gradual discovery. Server Management → AI Curator has the validated JSON calibration policy, status counts and bounded priority list. Care Cadences has observed summaries and private details; pending calibrations appear in the existing review page and dashboard review count.

Commands: `npm run check:calibration`, `npm run check:calibration:db`, `npm run check:calibration:ui`; `node --expose-gc --import tsx scripts/profile-calibration.ts` profiles a disposable database. Database suites refuse unintended database names. Coverage includes normalization, outliers, recency, unequal history, evidence floors, recipe/N/A protection, duplicate jobs/proposals, pending conflicts, edited/concurrent approval, rejections, category cooldowns/new boundaries, stale history, private collection isolation, unchanged care records, Curator interpretation/usage tracking, lease recovery, UI review and mobile layout.

Local performance fixture: 200 definitions, 1,000 specimens, 100,000 events; 40 targeted evidence reads completed in 516 ms total. Forced-GC heap settled from 11.1 MB to 9.5 MB; process RSS was 188 MB. The existing composite event index served the measured query (0.065 ms execution). These are local measurements, not production VM guarantees. Existing response, linked-care inheritance and botanical cadence-research suites also passed against the migrated disposable database.

Known limits: absence of physical care logs cannot establish assessment frequency; legacy provenance is incomplete; seasonality uses conservative quarterly comparisons rather than seasonal schedules; very large single-definition cohorts are intentionally withheld at caps; changed evidence can require a fresh review rather than quietly accepting a stale recommendation. Defaults are starting policies, not botanically validated thresholds. The feature calibrates recorded maintenance alignment while retaining human oversight.

Final verification: the full 58-migration chain applied to disposable databases; TypeScript, changed-file Next core-web-vitals lint, the production build, calibration unit/database/browser suites and existing Curator/cadence suites passed. A PostgreSQL custom backup manifest confirmed schema and table data for MetricCalibrationState. No production history was inspected or modified, no real AI request was made, and local test fixtures were removed.
