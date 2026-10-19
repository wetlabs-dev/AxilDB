# Seasonal Repotting Planner

Repotting cadence answers when to assess a specimen. A definition's annual windows describe suitable seasons. A planner booking records an individual specimen's intent to repot in a specific window and start year. Only actual completion records REPOTTED care history.

## Setup and use

1. Deploy the application and workers together through Application Updates. Review additive migration `20261020120000_seasonal_repotting` when prompted. No host-agent update is required.
2. Server Management → Manage Repotting Windows configures the global catalog. Twelve editable monthly defaults describe temperate Northern Hemisphere seasons. They are organizational defaults, not botanical rules. Edit month/day boundaries, names, descriptions and order; custom, overlapping and December–January windows are supported. February 29 clamps to February 28 in non-leap years.
3. On a Plant Definition's edit or husbandry page, Repotting Windows selects an optional primary and alternate. An alternate requires a primary; the two must differ. Existing definitions remain unassigned. Window completeness is optional enrichment and does not affect cadence completeness.
4. On an instance, Add to Repotting Queue previews the recommendation and selection reason. Choose a different active window/year if needed, add a note and confirm. The year is the start year of a cross-year window. Closing the editor cancels without saving. Existing bookings link to the planner.
5. Care Queue and the weekly checklist offer Add to Next Repotting Window for a repotting assessment with active assigned windows. It uses the existing optimistic action/receipt workflow: immediate removal, rollback on failure, safe retry. No completed care event or last-completed timestamp is created by scheduling. Active bookings suppress duplicate derived assessments. Removing a booking allows the assessment to reappear. Without windows, ordinary repotting completion remains available. N/A cadence prevents recurring assessments but does not prevent manual planning.
6. Care → Repotting Planner groups specimens by window and assigned year. Filter by window/year/location/status. Open a group, select up to 50 specimens and confirm Mark Repotted, Reschedule or Remove. A one-item selection uses the same workflow. Completion uses the existing care-event/substrate machinery, accepts actual completion date and notes, records substrate changes, and updates cadence history. Unknown substrate is explicit; select a known recipe or description where available. Completed/canceled records remain visible through the status filter.

## Selection and changes

The shared scheduler uses the configured timezone, inclusive end dates, and the current or next annual occurrence. Choose the earliest eligible window, except prefer a primary that starts within three calendar months after the alternate's start. The exact boundary is included, month ends clamp (January 31 → April 30), and a currently open primary always wins. Simultaneously open or equal-start windows prefer primary. Cross-year windows retain their start year.

Changing definition assignments never moves existing bookings. The planner reports the changed assignment and recalculates a suggestion; choose its window/year explicitly to accept a reschedule, or keep the booking. Editing catalog dates updates booking dates in the same assigned year, possibly making the booking overdue. Overdue entries remain visible. Deactivation is blocked while active bookings reference a window; reschedule/cancel them first. Deleting any referenced window, including retained history, is blocked. Prefer deactivation.

## AI and husbandry

Curator researches optional missing windows independently of cadence completeness. Research Now also requests windows. The model receives active catalog IDs and the definition's taxonomy, husbandry and available cultivation context. It must explain geographic, indoor-light, tropical or dormancy assumptions and may return no recommendation. Primary and alternate confidence/reasoning are independent. Magic Fill may save a window recommendation in the same Curator review queue; saving husbandry never applies it. Existing dashboard Curator counts include actionable window proposals.

Server admins approve or reject through the existing Curator interface. Advanced edit supports primary-only approval by clearing alternateWindowId. Approval revalidates collection/definition, original assignments, active IDs and researched date boundaries; stale recommendations require new research. Review displays current dates and flags changed boundaries. No manually selected assignment is silently overwritten.

Husbandry Repotting Interval displays the definition cadence (or effective instance override), including Not applicable and Not scheduled, and links to the cadence editor. It is no longer independently authored by husbandry forms, inline edits, Curator or Magic Fill. Existing stored repottingInterval text is retained and shown as legacy guidance on detail views. Pot type, root sensitivity, dormancy and division notes remain editable. No legacy text is converted to a numeric cadence or overwritten by the migration.

## Persistence, permissions and operations

New global RepottingWindow rows, nullable definition foreign keys and instance RepottingQueueItem records are additive. Queue records retain occurrence year, source, optional assessment/reminder reference, assignment snapshot, notes, terminal timestamps and a unique completed care-event reference. An exclusive partial unique index prevents multiple active bookings per instance. Transactions and an instance advisory lock protect concurrent queue creation; the existing care operation receipt protects repeated assessment requests. Planner bulk mutations lock and validate each selected row and roll back as one operation on failure.

Catalog operations require server administration. Assignments require collection administration. Queue mutations require existing collection logger access; viewing follows collection visibility. Every mutation checks collection scope server-side and records audit history. Server actions retain framework origin protection; optimistic API calls use the existing exact-origin protection. The application never supplies host privileges or invokes a deployment from this feature.

No plants, photographs, husbandry, cadence overrides, existing suggestions or historical care events are deleted. No bookings are fabricated for historical events. Back up and deploy normally; no production rollout or database operation is performed by the implementation tests.

## Validation

`check:repotting` uses localhost:55439/axildb only, disposable fixtures and a mocked provider. It covers calendar thresholds, overlap/open windows, leap years, timezone edges, concurrent duplicate prevention, care operation receipts, assessment suppression/cancellation, actual completion/substrate history, invalid/stale AI recommendations and preservation of legacy notes. `check:repotting:ui` uses the local test app on port 3107 and Chrome for confirmation, optimistic queueing, rescheduling, completion, authorization and mobile/dark layout. Existing cadence, care queue and AI regression suites remain applicable. The full migration chain is also validated on an empty isolated database.
