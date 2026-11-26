# Care Queue layout and personal views

See [the follow-up refinement](CARE_QUEUE_REFINEMENT.md) for the compact toolbar, transient feedback, Attention explanation and obligation-based Complete visible care review.

The Care Queue is an operational page: heading/date and compact summaries, primary actions, filters/search/view controls, care groups and tasks, then the complete Care forecast. Forecast is a client-loaded planning module, independent of the server-rendered actionable queue. Its existing seven-day data, location selector, Quiet Day controls, conflict details and deconfliction remain available. A top Forecast link includes the live conflict count and scrolls to planning without duplicating the forecast above care.

Global **Start workflow** is a compact disclosure with a collection-scoped selector. Group headers retain a separate location-scoped workflow disclosure and their existing nested-location behavior. Bulk care, schedule sync and weekly checklist links remain available. Empty states distinguish a clear today view, hidden/filtered care and unresolved scheduling attention.

## Personal view settings

Open **View** next to Search to change grouping or location order. Choices apply immediately in the browser, preserve the current filters and update the URL without a scheduling request. The current care data is regrouped locally. Search still uses the existing explicit submission; category/location filters retain their existing navigation.

Authenticated users have two startup modes:

- **Remember last-used view**: automatically save the most recently applied grouping and order.
- **Use saved default view**: normal visits restore the saved pair, while temporary changes remain available for the current operation.

**Save current view as default** saves the pair and enables saved-default mode. **Restore saved default** applies that pair immediately without changing the chosen startup mode. **Reset to application defaults** clears only this user’s Care Queue preference for this collection and applies Parent grouped / Tree order. Flat paths is an option, not a universal new default.

Only grouping and location order persist. Search text, task category, location filter, completed filter, selections, notes, workflow choice, forecast date and staged deconfliction are not added to long-term preferences. A normal `/care` visit defaults to Today across all locations. Contextual URLs and in-page operations may intentionally retain those transient filters.

Startup precedence is resolved on the server:

1. Each explicit, valid `grouping` / `locationSort` URL parameter.
2. Saved pair when saved-default mode is enabled.
3. Last applied pair otherwise.
4. Existing application defaults if a stored value is missing/invalid/obsolete.

Reading or following a contextual URL never writes preferences or changes the saved default. Initial rendering does not first apply a guessed client default, so a stored Flat paths view renders correctly from the server. Native history replacement records local presentation changes without an RSC navigation. Existing care return URLs include the applied view, and care actions preserve it through their existing optimistic store/refresh behavior. A normal visit in saved-default mode deliberately restores that default; browser Back/contextual return URLs retain their explicit temporary view.

## Storage and API

The implementation extends existing `UserSortPreference` storage rather than adding a competing database model. The section key is `care-queue:<collection database ID>`, unique with the authenticated user ID. Its versioned `sortKey` JSON contains only startup mode, last grouping/order and optional saved grouping/order. Renaming a collection slug does not lose its preference. A different user or collection gets an independent record. Normal backup/restore includes the existing table.

Deleted collection keys are inert: authorization prevents access and a recreated slug has a different database ID. As with other existing sort sections, user deletion cascades these rows. No new collection foreign key/cleanup job is introduced for this small preference entry.

`GET /api/care/view?collectionSlug=...` returns `{ preference }`. Authenticated collection viewers can update their own presentation, even if they cannot mutate care. `POST /api/care/view` accepts:

```json
{"collectionSlug":"example","action":"remember","view":{"grouping":"flat","locationSort":"tree"}}
```

Other actions are `saveDefault` with a view, `mode` with `last` or `default`, and `reset`. Saved-default mode requires an existing saved pair. Grouping values: `parent`, `flat`, `hierarchy`. Order values: `tree`, `alphabetical`, `items`, `overdue`. The server validates values; identity and collection ID come from the authenticated/authorized context, not request-body user IDs. POST checks origin, authentication and bounded input size; responses are private/no-store. The pure resolution/validation module and database service are reusable by other authenticated clients.

Writes serialize per user/collection under a narrow advisory lock, update only this section and skip an unchanged stored value. Independent clients use last-committed-update semantics. The client permits one in-flight write and coalesces rapid presentation changes into one latest pending command. Older responses update metadata, never roll back newer visible grouping. Save/reset/mode buttons are disabled during a write; failure retains the current local view, reports that persistence failed and offers Retry. In-flight requests use keepalive for short navigation; an unsent coalesced change cannot be guaranteed if a page is closed before its save finishes. The saving status distinguishes that boundary. No localStorage preference competes with server state.

No preference endpoint calls care scheduling, forecast generation or care-event mutation. Grouping and ordering alter neither due dates, Quiet Days, locations nor history. The forecast remains independently loaded as before; no new caching or polling system was introduced.

## Verification and deployment

Use the guarded disposable database for `npm run check:care-view` and `npm run check:care-view:ui`; tests never target production. The test fixture captures before/after desktop/mobile light/dark layouts and heading-to-first-task positions, plus flat paths, preferences, workflows, forecast placement and empty states. The integration checks cover user/collection isolation, fixed default versus temporary choices, invalid stored values, URL precedence, reset isolation, unchanged-write avoidance and concurrent updates. Browser checks also exercise a new authenticated session/context, rapid changes and a failed save/retry.

Preference menus use native disclosures and labeled controls, with Escape closing and returning focus to the summary. DOM order places actions and filters before care and forecast afterward; CSS does not visually reorder those sections. Existing theme tokens, botanical rendering and category colors are retained. Physical PWA devices and hardware screen readers are not independently certified by desktop browser emulation.

Deploy through **Web deployment**. No migration, host configuration, new worker or environment variable is required. Existing users keep Parent grouped / Tree order until they choose a different personal view. Production preferences/data were not accessed during this work.

### Measured review — November 25, 2026

The previous queue placed forecast and the full workflow panel before tasks and used URL-only presentation settings. The final hierarchy is header/actions → filters and View → location groups/tasks → forecast. Captures use the same eight-task disposable fixture at 900 px viewport height, in both themes. Distances are pixels from the page heading to the first task card (including its existing photo area).

| Viewport | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Desktop, 1440 px | 1282 | 404 | 68% |
| Mobile, 390 px | 1671 | 603 | 64% |

Task card tops moved from 1314 to 436 px on desktop and 1756 to 688 px on mobile. Existing mobile task photos remain unchanged; the Complete control can still require scrolling. Category pills scroll horizontally within their own toolbar; neither tested viewport has page-level horizontal overflow.

Screenshots and raw measurements: [before](reviews/care-queue-views/before/results.json), [after](reviews/care-queue-views/after/results.json), [desktop before](reviews/care-queue-views/before/light-1440.png), [desktop after](reviews/care-queue-views/after/light-1440.png), [mobile before](reviews/care-queue-views/before/light-390.png), [mobile after](reviews/care-queue-views/after/light-390.png). Matching dark-mode captures plus Flat paths, View settings, workflow disclosure, forecast and empty state are in the same review directories.

Passed: typography suite, TypeScript, production build, preference unit/database integration and browser checks, optimistic queue, actual care operations (including bulk/snooze/metadata), workflow invariants, care scheduling, calendar/forecast/Quiet Day invariants and the guarded deconfliction database regression. The browser suite verifies completion preserves the local grouping and removes the task, save retry, rapid-change coalescing, session/collection isolation, URL/default precedence and zero schedule/forecast requests during presentation changes. No browser exceptions were recorded. Targeted lint comparison against HEAD found no new findings. Existing files retain four no-explicit-any errors and two warnings; new preference modules and tests have no lint findings. Production build reports the existing outdated Browserslist data notice.

This is representative browser verification, not an exhaustive end-to-end certification of every photo, workflow execution, bulk-care, synchronization and deconfliction combination with every view. Those mutation paths retain their existing implementation; their applicable service regressions passed. Browser Back/contextual care links retain a temporary explicit view; bulk care, synchronization and checklist return links carry a validated presentation pair through their forms. Ordinary navigation without that context follows startup preferences. Physical installed PWAs and hardware screen readers were not tested independently.
