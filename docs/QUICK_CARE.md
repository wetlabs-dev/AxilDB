# Plant instance Quick Care

Open a plant instance directly or through its existing QR label. Authorized collection loggers and higher roles see circular Water, Fertilize and Photo controls beside the accession ID utility. No QR URL changes are required, and opening a page never records care.

Water records actual watering immediately, even before it is due, without a cadence, or on a Quiet Day. It uses the same care-event mutation as queue/manual logging. The event becomes the next routine scheduling baseline, clears that activity’s snooze/manual due adjustment, appears in care history and feeds observed-care analysis. Definition cadences and instance overrides are not changed. Quiet Day and calendar-midnight rules still apply to future scheduled work. Reminders, conditions, treatments and workflow steps are not completed by the header action.

A droplet or sprout with a check indicates care already recorded today. Its accessible name includes the time. Activate it to review the additional-care confirmation; Cancel preserves the original event. Record additional care only after intentionally performing a second watering or fertilization. There is no general safe care-event reversal in the existing application, so Quick Care does not offer Undo. An erroneous event currently needs an administrator-assisted correction; the Green Thumb note deletion control does not delete watering events.

Fertilize is hidden only when the effective definition/instance setting is explicitly Not Applicable. Not Scheduled still permits actual fertilization. The existing model permits routine fertilization with optional recipe/dose details, so the header records it without inventing a recipe, product, dose, strength or water volume. Use the detailed existing care workflow when those details are needed. A generic fertilizer event is distinct from a recipe-specific application under the shared equivalence rules. Fertilizing never implicitly records watering.

A small exclamation badge marks the Photo button when the instance has no photos; accessible text also announces that state. The badge disappears after the first upload. Photo opens the same acquisition dialog used by the care queue: camera/file selection, preview/framing, note/source metadata, representative-photo selection for eligible editors, cancellation, processing feedback and safe upload retries. The first image becomes representative; subsequent uploads preserve the representative image unless explicitly changed. Photo does not complete a care task and remains available throughout the day. Photo visibility follows the existing collection/exhibit rules; this feature adds no new privacy control.

## Implementation

- `PlantInstanceQuickCare` provides one responsive action group, keyboard buttons, semantic theme colors, fixed touch targets, pending/completed states and live feedback. The existing ID-regeneration control keeps its original meaning. Long mobile IDs use the existing wrapping row rather than smaller touch targets.
- `CareQueuePhoto` has an optional compact trigger and continues to own the shared photo dialog; `PlantPhotoUploadForm` and `/api/photos` remain the upload boundary.
- `loadQuickCare` provides bounded latest-event state. The initial page reuses its existing cadence data and adds one consolidated care-history query. Focus/visibility and a single local-midnight timer update status; there is no permanent polling.
- `runCareQueueMutation` / `executeCareOperation` enforce logger access, origin validation at the API, collection scope, active-instance lifecycle, durable operation receipts, calendar-operation locking and plant row locks. Quick Care uses current server time, records `QUICK_CARE` provenance in existing metadata and checks effective fertilizer eligibility server-side.
- Same-day equivalence is shared with bulk/queue care and ignores the source of previous care. Intentional-repeat receipts survive an ambiguous response in the mounted client, so retrying the identical operation does not repeat care. Reopening the page still gets the normal same-day protection.
- Routine workflow watering/fertilizing now checks the same equivalence under the plant lock, closing an overlap with header/queue completion. Historical data is unchanged.
- The shared API invalidates its existing relevant routes; one server-component refresh updates the current instance without a document reload. No collection-wide schedule regeneration or AI request is triggered by the header.
- Date interpretation follows the existing care system’s authenticated user timezone preference (default America/New_York), including in collection views. There is currently no separate canonical collection timezone setting. This feature does not introduce a conflicting timezone policy.

No dependencies, schema migrations, QR changes or host configuration are required. Deploy through Web deployment.

See [validation and screenshots](audits/quick-care-2026-11-19/README.md). Run `npm run check:quick-care` and `npm run check:quick-care:ui` only with the explicitly guarded disposable local database described in their scripts.
