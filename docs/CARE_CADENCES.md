# Inherited care cadences

Definition care cadences and specimen overrides are stored in two related tables, each unique by owner and activity. An absent specimen record means inherit; explicit DISABLED records survive future definition changes. Existing husbandry guidance and care events are preserved. The shared resolver in `lib/care-cadences.ts` supplies the editor, specimen detail, and Care Queue.

## Deployment

Back up the PostgreSQL database, then use the normal Docker migrate service (`npm run db:migrate:deploy`) before starting the new application. Migration `20261018130000_inherited_care_cadences` adds both tables, constraints, compatibility triggers, and fertilizer dependency safeguards. No database reset is needed. This repository's Prisma provider and migrations target PostgreSQL; SQLite is not supported by this migration.

The migration preserves explicit numeric fertilizer intervals with valid assigned definition recipes, specimen fertilizer pauses, and supported schedule-sync overrides. Free-text husbandry and inferred intervals are retained as guidance but no longer create recurring queue tasks. Legacy numeric fertilizer values without a valid definition recipe remain in husbandry history/settings and must be reviewed before enabling a structured cadence. No intervals are invented for existing plants.

Days/weeks use local calendar days. Months/years clamp to the destination month's final valid day, so January 31 + one month is February 28 (29 in leap years). No completion history means no calculated due date; the editor and existing Schedule Sync can set an initial date. Actual completion from all existing care event entry points clears manual due dates and snoozes. Historical care records are never rewritten.

Existing Schedule Sync and numeric fertilizer writers feed structured cadence records through compatibility triggers. The new cadence editor clears obsolete sync cadence/disabled flags while retaining manually aligned dates and snoozes. Existing text-based husbandry inheritance remains independent from explicit care cadence inheritance.

Fertilizing requires an active recipe assigned directly to the definition in the same collection, even for specimen-specific intervals. Existing specimen recipe choices still control which recipe is used for care. PostgreSQL triggers serialize dependency mutations and prevent removing or archiving the final definition recipe while definition or specimen fertilizing cadences remain active. Disable those cadences first. Other active condition follow-ups, propagation checks, and user-created reminders continue independently.

## Verification

- `npm run check:care-cadences`: inheritance, three modes, interval validation, timezone and month-end calculations.
- `DATABASE_URL=... npm run check:care-cadences:db`: use a disposable migrated PostgreSQL database; creates and removes its own fixtures. Tests constraints, fertilizer dependency races, queue integration, legacy sync interoperability, cascading deletion, and preserved history.
- `DATABASE_URL=... npm run check:care-cadences:ui`: seeded disposable database at localhost:55439/axildb_final, local app at port 3107, and installed Chrome. Tests saving, inheritance, disabling/reset/cancel, unauthorized server actions, navigation, and 360/390/768/1280px widths.
- Run the existing care scheduling, timezone, workflow, collection scope, and production checks alongside a production build.

## Implementation verification (October 18, 2026)

Prisma validation/client generation, fresh PostgreSQL migrations, a legacy-data upgrade, database constraints/concurrency/integration checks, care cadence and existing scheduling/timezone/workflow checks, TypeScript, and a production build passed. Browser checks passed for editing, cancellation, inheritance, disabled/reset states, unauthenticated mutation rejection, both instance navigation actions, and four viewport widths. Desktop and mobile screenshots were inspected.

`npm run lint` opens the existing ESLint setup prompt because the repository has no ESLint configuration. The collection-scope checker reports seven findings in unchanged AI Curator and listing queries; these are outside this change. The collection default-slug check passes. Production deployment still needs the normal migration service before starting the updated app. Seasonal profiles remain outside this implementation.

## Compact cadence dashboard

The shared `components/CareCadences.tsx` renders six botanical tiles on definition and specimen pages, using existing theme variables and the existing cadence formatter/resolver. The module responds to its own width: one column below 320px of inner space, two from 320px, and three from 720px. Values remain in their stored units. Unscheduled activities remain visible; instance inheritance, custom/disabled states, definition defaults and due labels remain visible as secondary context.

Editable tiles are semantic buttons with activity-specific accessible names and keyboard focus. They open a native modal dialog containing the existing activity controls. **Edit all** opens all six controls in the same dialog. Native modal focus containment, Escape/cancel, focus restoration, controlled drafts, pending controls, inline errors and success announcements support keyboard and touch use. A failed save keeps the draft available to retry. There is no asynchronous data-loading step requiring a separate skeleton.

Without a recipe, Fertilizing shows **Recipe required** and its tile links directly to the existing assignment interface instead of allowing a cadence edit. Read-only viewers get noninteractive tiles. The bulk editor still enforces the recipe prerequisite, and server/database dependency validation remains authoritative.

The existing save action accepts an optional validated `activity` for focused edits; it writes only that activity and only clears legacy fertilizer fields when fertilizing is edited. Existing bulk requests keep their original behavior. This prevents a focused save from replacing unrelated cadence/override values changed concurrently. There are no schema, formatting, cadence resolution, queue calculation or AI provenance changes.

`npm run check:care-cadences:redesign` creates/removes isolated fixtures at localhost:55439/axildb and uses the local app at port 3107 with installed Chrome. It covers tile rendering, container widths, desktop/mobile and themes, keyboard/cancel/focus restoration, individual save with an unrelated concurrent change, real recipe-removal validation and draft retry, bulk save, inheritance/reset/disabled settings, read-only access and preserved research/care history.
