# Unified Quiet Days

## Existing architecture retained

Quiet Days already supported named one-time dates, weekly recurrence, inclusive ranges, active/inactive settings, care-category shift limits, local calendar dates, preview/confirmation with stale-preview detection, durable occurrence adjustments, and seven-day forecasts. The Care Queue already preserves manual schedules, snoozes, overdue work, actual care history, cadence inheritance, and time-sensitive repotting appointments. These paths remain authoritative; there is no second scheduler.

## Scope and management

`CollectionQuietDay.locationId = NULL` means collection-wide. A location ID means directly assigned plants at that location. The composite foreign key enforces collection ownership and deletes local rules when their location is deleted. Hierarchical locations exist, but Quiet Days do not inherit from parent locations.

The effective schedule is the union of collection and direct-location rules. `effectiveQuietRules` and `quietDateReasons` centralize resolution and retain overlapping rule provenance. Each task is scheduled once regardless of overlapping rules. Existing Sunday=0 through Saturday=6 identifiers are preserved; the selector displays Monday first with explicit weekday names.

Collection Settings provides scope selection, summaries across locations, recurring weekday buttons, and named single dates/ranges with notes, editing, and deletion. Location detail provides the same manager, restricted to that location, plus read-only inherited collection settings and a combined recurring schedule. Collection managers can change rules; existing viewers can inspect applicable rules. Every mutation still requires collection management permission on the server, with location ownership verified independently.

## Scheduling

The existing bounded candidate search rejects every effective quiet date, evaluating dates outside the entire consecutive block instead of stepping tasks from one quiet date to another. Search extends beyond the seven-day display. Non-watering groups include location, category, and original date. Short watering cadences favor earlier assessments; long cadences favor later assessments. Cadence remains a heuristic for assessment scheduling, not a botanical moisture requirement.

Watering flexibility is capped by cadence and fourteen days. Daily assessments allow at most one day, a three-day cadence allows up to two, and a 21-day cadence up to seven. Explicit configured bounds remain authoritative. The defaults migration upgrades only untouched generated SMART one-day rules (`createdAt = updatedAt`); edited rules are preserved. A restrictive custom rule can therefore leave required weekend exceptions.

When no safe eligible destination exists, the task remains outstanding with its exception reason. Preview additionally identifies plants and care categories whose upcoming range exceeds their cadence, including closures beyond the forecast window. This is a conservative planning warning, not a guarantee of plant safety. No caretaker system or automatic watering decision is introduced.

Location changes invalidate only the affected location's future plan revision on the next queue/forecast reconciliation. Durable occurrence keys remain unchanged, so actionable advanced tasks remain outstanding. Manual dates, completed care, history, and cadence overrides retain their existing authority. Unrelated locations keep their saved plans. Preview warnings and changes are restricted to the changed scope, and confirmation hashes include current plant locations.

Forecast responses include task locations and all matching rule provenance per date. All-location totals remain collection-wide; a local closure gets a subtle location-count indicator. Location filtering derives counts from the same projected tasks and labels dates using collection plus location restrictions. A collection-only restriction filter is also available. Care Schedule Sync preserves the explicitly selected date and surfaces conflicts through the same scoped resolver, matching its saved result. Manual care recording and Bulk Care are unchanged and remain available on Quiet Days.

## Migrations and deployment

- `20261022120000_location_quiet_days`: adds nullable location scope, collection/location indexes, and the ownership foreign key. Existing rules remain collection-wide without rewriting their dates or recurrence.
- `20261022123000_quiet_day_watering_defaults`: upgrades untouched generated watering limits; preserves user-edited settings.

Use the existing **Web deployment / Application Updates** workflow. It already builds the application, takes the deployment checkpoint, runs Prisma migrations, and restarts services. No host configuration, service unit, worker schedule, environment variable, dependency, or deployment-agent change is needed. The existing SQL review may request confirmation because the foreign key contains `ON DELETE CASCADE`; that review is supported in the Web workflow.

## Validation

Automated calendar policy checks cover office weekends, unaffected locations, additive overlap/provenance, year-crossing closures, safety exceptions, manual dates, recurrence validation, local-day boundaries and DST. Database checks cover persistent plans, concurrency, restarts, early completion, snoozes, cadence overrides, preview isolation, moving plants into/out of restricted locations, idempotency, preserved history, and location deletion.

Browser/API checks cover preview/cancel/confirm, same-day warnings, stale and concurrent confirmations, origin checks, viewer/anonymous authorization, recurring local weekdays, creating/editing/deleting ranges, inherited settings, and mobile layouts in light/dark modes. TypeScript and production builds are checked. Changed production files are linted with the installed Next core-web-vitals rules; the repository's bare `npm run lint` currently opens an unconfigured-linter setup prompt.
