# Care Queue specimen and progress photos

Implemented 28 October 2026. Both briefs are handled together: empty thumbnails offer an initial photo; populated thumbnails offer an additional progress photo.

## Workflow and reuse

Authorized Care Queue cards have a 44-pixel camera target with a descriptive accessible name, muted styling, and visible keyboard focus. Empty mobile thumbnails also say “Add photo”; their height is modestly reduced from 160 to 128 pixels. Desktop thumbnail/card dimensions and care buttons are unchanged. Existing image rendering is preserved; a failed image request does not reclassify a plant as having no photos.

`CareQueuePhoto` opens a native modal dialog through a portal. It loads only the selected instance’s image options, waits for those options before mounting the form, locks background scrolling, traps focus through native dialog behavior, supports Escape when idle, and restores focus without scrolling when the original button still exists. Saving prevents duplicate submissions; dismissal is disabled while an outcome is pending.

`PlantPhotoUploadForm` is shared by the modal and the existing specimen-detail uploader. It reuses `PhotoFramingEditor` and `/api/photos`, including focus/crop controls, captions, source information, Sharp processing, storage, moderation, domain events, audit, and follower notifications. A separate optional camera input preserves normal library selection; the selected input is tracked explicitly. Actual camera capture depends on the device/browser; no native-camera library is added.

The common route retains native form redirects while supporting JSON for in-place saves. Target collection/instance authorization happens before decoding/writing; existing two-factor requirements remain enforced. Viewer/read-only users cannot upload. Representative selection uses the same permission threshold as the existing detail-page action, with shared `selectSpecimenCover` logic and a per-target transaction lock. The bounded processing slots remain shared with existing image work.

The accepted formats remain JPEG, PNG, WebP, GIF, TIFF and AVIF. HEIC was already unsupported by the server and remains unsupported; convert a HEIC library image to a supported format first. Files are capped at 25 MiB, and multipart parsing stops at that limit plus 1 MiB overhead even without Content-Length. Unsupported/oversized files are rejected before generating a browser preview. Output retains the existing auto-rotation, 2,000-pixel bounding size and JPEG quality. This is framing metadata, not destructive cropping of the stored original composition.

## Representative images and history

The first specimen photo becomes its cover. A progress upload preserves the existing cover by default. For older galleries without a designated cover, the previously displayed newest photo is pinned as cover before the new progress photo is added. Authorized users may explicitly check “Set as representative photo,” or choose an existing photo in the dialog. Previous photos are preserved. A specimen upload never sets the Plant Definition type image.

Photos remain in the existing gallery and timeline; no new gallery or parallel photographic-history system was added. The existing `Photo.createdAt` upload timestamp remains authoritative and is not overwritten. There is no capture-date/EXIF editor in the current pipeline, so capture-date editing/extraction is deferred rather than stored ambiguously in an unrelated field. Existing default gallery ordering is preserved, with stable selection tie-breaking where thumbnails are read. The timeline supplies chronological documentation entries.

**Care-event association is explicitly deferred.** The current Photo model has no durable care-task/event relationship. The dialog explains that a photo stays with the plant and does not link to or complete the activity. No client-only pending relationship, time-proximity inference, synthetic care event, or caption/quick-note conflation is introduced. Supporting that optional feature later needs a deliberate persistent relationship and lifecycle design.

## State, retries and resource handling

Successful inline operations publish a scoped instance-photo event. Mounted thumbnails for that instance update locally; unrelated cards are untouched. No router refresh, care snapshot, forecast request, or scheduling recalculation is triggered by the photo workflow. Filters, location expansion, search, quick notes, scroll position and optimistic operations remain mounted. Other views see the saved photo on normal navigation/refresh; existing hover-preview caches retain their normal short lifetime.

Uploads use a stable UUID as the existing Photo record ID. A retry checks the server for that upload identity; simultaneous duplicate submissions are serialized and return the same record. The identity is checked against collection, target and uploader. Unique storage filenames avoid overwrites; failed writes/rolled-back database operations and redundant concurrent files are cleaned up. Once committed, a later notification/audit failure does not delete the photograph. Selected files/metadata remain available after errors; completion/cancellation releases object URLs through the existing framing cleanup.

## Verification and deployment

Use `npm run check:care-photos` against a disposable local database on localhost:55439/axildb and local app on port 3107. It refuses other database targets. It exercises initial/progress uploads, crop/caption/source persistence, explicit and existing-photo cover selection, legacy no-cover preservation, missing-response reconciliation, concurrent duplicate IDs, twenty sequential uploads, unchanged care/cadence/definition state, pending optimistic care, camera-input selection, narrow layout, focus/Escape, object URL cleanup, permission/origin/target rejection, malformed images, native detail uploads, and definition/bloom pipeline regression. Test fixtures and their uploaded files are removed.

`npm run check:photo-form` verifies valid multipart metadata/file preservation and bounded cancellation of an oversized chunked body without Content-Length. Existing workflow and optimistic queue regressions, lint/type checks and the production build are also run. Physical iOS/Android camera capture is not claimed as automated hardware testing.

**Web deployment is sufficient.** There are no schema migrations, dependencies, Compose changes, deployment-protocol changes, mandatory host changes, or deployment-agent updates. Existing photo records remain compatible.
