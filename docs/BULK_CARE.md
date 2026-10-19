# Duplicate-aware bulk care

Bulk care review checks selected plants for equivalent completed care on the **performed date**, in the logger's saved timezone (falling back to the application timezone). The initial date/time now uses that same timezone. Dates can be backdated; changing the date or fertilizer recipe refreshes the preview. Local midnight boundaries are inclusive/exclusive and account for daylight saving.

The review shows selected, eligible, already completed, other exclusions, and records to create. Existing entries can be expanded and opened by plant. The unchecked repeat-care checkbox only applies to the current review; it is never saved as a preference. If no plants qualify, submission is disabled until the scope changes or repeat care is enabled. A preview failure also disables submission and offers retry. The preview refreshes after pending queue operations settle and when the window regains focus. Server submission always rechecks persisted history.

## Matching

Queue completion, individual entries, bulk entries, and workflow/sitter-plan entries all use `PlantCareEvent`. Watering, fertilizing, repotting, pruning, pest inspection, health inspection, propagation inspection and bloom inspection match explicit event identifiers. Fertilizing matches the exact recipe ID, including ad hoc/null as its own category. Dose/strength changes to the same recipe require the repeat-care override. Treatments do not match inspections. Free-form Other events have no reliable activity identity and are never automatically excluded. Repotting plans do not create completed repotting records and cannot exclude a plant.

The event model contains completed occurrences and has no soft-delete or void status. Physical deletion removes an occurrence from matching. This change does not rewrite, remove, merge, or hide any historical records.

## Persistence and concurrency

`lib/bulk-care.ts` provides a batched, collection-scoped lookup using the existing `(collectionId, plantInstanceId, eventType, performedAt)` index. No schema migration is needed.

Bulk operations acquire plant row locks in stable ID order, then query history and write within the existing atomic care-operation transaction. Queue completion uses the same lock. Queue completion forms mark their origin so two overlapping queue/bulk completions do not both record the same day's care, regardless of which commits first. Individual manual entries remain repeatable. Condition resolution and other distinct workflows retain their existing semantics; completed entries from them count in subsequent bulk previews/submissions.

Skipped plants receive no event, cadence adjustment or reminder advancement. New events use the existing completion pipeline, including repotting/substrate and domain-event handling. An all-skipped submission caused by a stale preview returns an accurate zero-created result rather than an error.

Bulk submissions use the existing operation receipt and preserve the batch UUID and issued timestamp in the form. The receipt atomically stores the result, including zero-created results, and rejects payload changes to a reused ID. Retrying an intentional-repeat operation returns its original result without writing twice. Receipts expire after seven days; requests with older issuance timestamps are rejected. A new review has a new operation ID. Existing batch metadata adds protection across administrator sessions.

Successful submission redirects to the existing feedback card, which reports actual created events, queue completions and same-day skips. Care Queue retains optimistic interactions; bulk review waits for confirmed persistence before displaying success.

## Verification

Run `npm run check:bulk-care` against a disposable migrated PostgreSQL database. It creates isolated fixtures and removes them afterward. Coverage includes local dates and DST, event equivalence, history preservation, zero/some exclusions, recipe separation, intentional repeats, receipt retries, simultaneous bulk operations, queue overlap, nested locations, manual skips, collection boundaries, and cadence behavior.
