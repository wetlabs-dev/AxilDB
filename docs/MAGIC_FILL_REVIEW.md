# Magic Fill cadence and configurable tag review

Implemented 28 October 2026.

## Research and review

Plant Definition Magic Fill now includes all six canonical care activities in its existing botanical research request. It reuses the shared cadence instructions, response shape, `validateRecommendations`, `cadenceResearchContext`, `persistCadenceRecommendations`, and `approveCadenceProposal` services. There is one AI request, not a separate call per activity or cosmetic tag option. Existing rate limits and the 120-second provider timeout remain; at most two Magic Fill research requests execute concurrently per web process. The output budget accommodates the additional reviewed data.

Saved definition metadata, current decisions, local husbandry, and same-collection linked husbandry supply context. A linked guide is supporting evidence; its cadences are not copied. Recipe eligibility uses the existing assigned, active, same-collection recipe rule, not an AI-proposed recipe or unsaved form selection.

Research saves recommendations in the existing CareCadenceProposal model, with confidence, rationale, source references, model and research time. It never activates care decisions or creates/assigns tags. Actionable pending recommendations are reused across Magic Fill and existing research entry points; stale/non-actionable pending findings can be superseded by explicit review. No second queue or research engine was added. Invalid cadence output produces a visible warning while leaving taxonomy/tag review available.

The compact `MagicFillReview` panel displays current and proposed care decisions, unresolved findings, confidence, rationale, provenance and genuine provided references. All six activities remain visible. High-confidence unresolved actionable decisions can be selected by default; existing decisions and low-confidence findings require explicit selection. Nothing is applied automatically.

## Approval and preservation

`approveMagicFillCadences` uses the same collection permission as manual definition cadence editing, including existing two-factor requirements. Existing server-management and husbandry review permissions remain unchanged. Each selected item uses the shared atomic approval service, with per-item results for a batch of at most six. Partial success is reported; already-confirmed decisions are not undone by another item's failure or a later failed tag action.

The shared approval service now accepts an explicit replacement option. Magic Fill stores a snapshot of the current decision in the proposal's existing review-note metadata. Approval compares that snapshot, current record identity/status/interval/unit, and current recipe eligibility. Changed or superseded recommendations cannot overwrite a newer decision. Ordinary approval callers retain missing-only behavior. Database cadence triggers remain authoritative. Successful approvals supersede conflicting pending recommendations and reuse the existing configuration service; instance overrides are never rewritten.

Watering, pest inspection and general inspection cannot be Not Applicable. Fertilizing, repotting and pruning can be Not Applicable when justified. Missing fertilizer recipes block scheduled fertilizing and never imply N/A. Non-actionable/invalid recommendations cannot create arbitrary schedules. Readiness counts persisted decisions only. Targeted Next revalidation updates the current Care Cadences/readiness display and affected collection routes without a manual browser reload; inheritance and queue calculations use their existing paths on normal reads.

## Configurable Plant Tags

New suggestions default to **Public** in application code, regardless of AI output. Each expandable row reuses `PlantTagFields`, its canonical category/icon/color lists and pickers, and `PlantTagChip`. Name, category, themed icon, color, optional description and visibility are editable, with a live badge preview. Controls are prefixed to avoid contaminating the surrounding definition form. Collapsing a row preserves edits and selection. New tags are not selected for creation automatically.

Existing-tag suggestions show the actual configured badge and offer assignment only. Their shared metadata cannot be edited through Magic Fill. Editing a proposed name to match a catalog tag shows a reuse warning; the server checks again against the full collection, including concurrent changes. The approval result uses the persisted tag configuration rather than pretending the AI's cosmetics changed an existing tag.

`createMagicFillPlantTags` delegates to `applyMagicFillTags`. Canonical name/whitespace/slug normalization, a collection transaction lock, existing unique constraints, and upserts prevent duplicate tags. Existing active tags are reused without updating appearance, description or visibility; archived equivalents require restoration. Creation and assignment occur in one transaction, without removing any other assignments. Source/event/audit records retain MAGIC_FILL provenance. Duplicate retries reuse tag identities and assignment uniqueness. Config validation errors return structured user-facing messages in production; other failures preserve edits and give a safe reconciliation/retry message.

Tag actions retain the existing gardener permission for creating and assigning tags, with server enforcement. Public/private maps to the existing publicVisible field. Public preview, wishlist and exhibit tag filters remain unchanged; private tags do not become public merely because they were suggested. Public visibility also does not enable any public collection/exhibit feature.

## Form behavior and compatibility

Cadences and tags have independent Apply controls and persistence outcomes. Tag errors do not roll back confirmed cadences. Existing taxonomy, aliases, descriptions, acquisition planning and conflict modes continue to work. Browser tests confirm a dirty unsaved description survives both independent approvals; tags update the existing picker through its scoped event. Research refresh asks before discarding the current review's unapproved configuration. Failed research leaves the previous review available; abandoned client research requests are aborted on unmount.

Older tag suggestions missing cosmetics/visibility get canonical defaults; optional missing cadence arrays leave older responses usable without fabricated intervals. Existing stored proposals do not require deletion/regeneration. Unsaved/new definitions can still use taxonomy Magic Fill, view non-persistent cadence drafts, configure proposed tags, and stage existing tag selections. Save a new definition before researching persistent cadence proposals or creating/assigning new tags; the UI explains this requirement, preventing unattached tag drafts.

## Verification and deployment

Passed:

- New disposable-database service tests: canonical states, recipe blocking, no generation-time application, pending deduplication, explicit/stale replacements, concurrent approvals, preserved overrides, tag cosmetics/visibility, existing metadata preservation, concurrent creation, and atomic assignment validation.
- New browser tests against a production build with **mocked AI output and real server actions/database writes**: review defaults, explicit replacement, updated Care Cadences module, all tag controls and live preview, Public/Private persistence, collapse/edit retention, cancelled refresh, independent validation failure, dirty-form preservation, mobile width, and dedicated tag editor regression.
- Existing cadence research integration/browser, Plant Tag privacy/assignment contracts, Magic Fill merge, N/A cadence, care cadence database, readiness, and calendar regression checks.
- Type checks, changed-file lint, and production build.

Commands: `npm run check:magic-fill-review` and `npm run check:magic-fill-review:ui` require the disposable localhost:55439/axildb database; the browser suite uses a local production app on port 3107. Tests refuse remote database targets and remove only their own fixtures. No production data or paid live AI request was used. Tests establish workflow/data correctness and bounded request design; they do not constitute a new long-duration production memory profile.

**Web deployment is sufficient.** No schema migration, new dependency, Compose/host topology change, deployment protocol change or deployment-agent update is required. The existing proposal review-note field holds internal replacement snapshots; no competing cadence/tag schema was introduced.
