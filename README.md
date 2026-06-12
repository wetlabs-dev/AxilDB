# AxilDB — Botanical Accession System

AxilDB is a personal horticultural accession database for tracking plant definitions, living specimens, propagations, blooms, photos, sport candidates, QR labels, and lineage history.

It is designed for real collection work: messy taxonomy, acquisition names, aliases, provisional labels, uncertain IDs, photos over time, and plant lines that change as they are propagated.

## Current Features

- Public splash page at `https://axildb.com`.
- Main application at `https://app.axildb.com`.
- Multi-collection workspaces at `/c/[collectionSlug]`, with private/public visibility and collection-scoped memberships.
- Plant definitions with genus, species, hybrid notation, cultivar name, authority, governing body, registration number, confidence, provisional taxon, acquisition label, reference URLs, notes, and aliases.
- Site-level Validated Plant Definitions with reviewed taxonomy, aliases, type images, and husbandry that can be reused across collections without depending on the originating collection.
- Alias tracking for synonyms, old taxonomy, trade names, common names, shorthand, and misapplied names.
- Structured plant husbandry guides for definitions, with watering, light, temperature, humidity, medium, fertilization, repotting, propagation, pest/disease, toxicity, dormancy, bloom, growth habit, and conservation fields.
- Live-linked husbandry guides so similar definitions can reuse the same care guidance, with fork-to-local-copy support.
- Specimen-level husbandry overrides that highlight local care differences from the inherited definition guide.
- AI Magic Fill for complete husbandry guide drafts, stored as editable draft content with model/review metadata.
- ID My Plant assistant for cautious AI-assisted plant definition identification from user-provided descriptions, known names, and optional images, with durable personal and collection-manager history.
- Daily Collection Briefing on the dashboard, with collection-manager opt-in, one cached briefing per local day, concise conversational AI notes when enabled, and deterministic fallback summaries when AI is unavailable.
- Collection Update Digest for managers and gardeners, summarizing site-wide validated plant definition edits that affect specimens in their collection, separate from the Care Queue Digest.
- Smart Care Queue that combines husbandry cadence, watering history, propagation stage, open health conditions, bloom follow-ups, pest checks, and manual reminders into a prioritized collection worklist.
- Care event history for watering, fertilizing, repotting, pest checks, health checks, propagation checks, bloom checks, and other care tasks.
- Plant condition tracking for issues like wilting, yellowing leaves, crispy leaves, pests, disease, root issues, sunburn, nutrient issues, and mechanical damage, with severity/status follow-up.
- Care sheets that combine selected specimens, photos, quick care badges, selected husbandry sections, and local care adjustments into a shareable web view or printable PDF.
- Weekly greenhouse checklist generation from the care queue, grouped by location and covering overdue, due-today, and upcoming care tasks.
- Plant sitter mode with expiring/revocable token links that expose only selected plants and tasks, allow limited checklist completion, and log sitter actions back into AxilDB.
- Plant instances with generated plant IDs, acquisition/propagation dates, source/distributor metadata, hierarchical locations, archive status, notes, and photos.
- Collection-scoped Location mapping with customizable location types, stable generated codes, direct/nested plant views, batch moves, move history, quarantine workflow records, and QR labels.
- Sunshine appreciation for plant instances only, as a quiet appreciation/bookmark marker with private giver identity, public counts on plant records, subtle Well Loved treatment at five sunshine, My Sunshine history, dashboard activity, and optional email/push alerts that default off.
- Plant Health Timeline on specimen pages, combining existing accession, propagation, care, condition, bloom, photo, note, reminder, archive, and sport records into a compact horizontal history with deterministic insights and a Life Story list.
- Automatic plant ID generation based on plant definition, date, context, and sequence number.
- Propagation events with parent/child links, method, date, success status, and generated child plant IDs.
- Bloom tracker with bloom start, peak, closure, first-bloom marker, flower counts, notes, and bloom photos.
- Specimen cover photos for plant cards.
- Type photos for plant definitions, including direct upload of reference-sourced images with source/source URL metadata.
- Photo upload resizing through Sharp to keep files space-conscious.
- Two-layer image moderation for uploaded images: OpenAI Moderation screens unsafe content first, then a separate plant-content vision check handles no-plant and uncertain-plant review states.
- Dashboard activity timeline combining propagations, blooms, sport notes, acquisitions, and archive actions.
- Lineage graph with searchable sidebar, ancestor/descendant tree view, selected-plant highlighting, and propagation-method line styles.
- Sport review workflow for suspected, candidate, stable, registered, unstable, and reverted sport lines.
- Stable sport/cultivar wizard that creates a new cultivar definition and preserves lineage history.
- QR label generation and bulk PDF label export.
- Collection search across definitions, instances, aliases, notes, husbandry text, source metadata, and plant IDs.
- Archive/restore workflow for plants that leave the active collection.
- Local user accounts with self-service viewer registration.
- Collection roles for managers, gardeners, loggers, and viewers, with member approval, invitations, and role-management tools.
- Registered users can request new collections; server admins approve requests, create the collection, and promote the requester to collection manager.
- Server-admin management area for collection lifecycle, global users, server health checks, storage estimates, and sitewide backup initiation.
- Server-admin image moderation queue for censored uploads, no-plant/uncertain review oversight, false-alarm overrides, removal, and uploader blocking.
- Server-admin orphaned image cleanup that scans uploaded image storage, shows dry-run results, re-checks references before deletion, and logs cleanup actions.
- QR-code two-factor authentication with one-time recovery codes, compatible with Apple Passwords and standard authenticator apps.
- SMTP-ready email foundation with welcome/verification emails, secure single-use tokens, branded HTML/plain-text templates, and user email preferences.
- User reminders for general tasks, plant check-ins, bloom follow-ups, and propagation follow-ups, with one-time or recurring schedules.
- Reminder delivery history and a lightweight scheduled reminder worker.
- Followed plant updates for individual specimens, plant types, and connected lineages, with email notifications for blooms, propagations, sport updates, photos, notes, archives, and new specimens of followed types.
- Follower counts on followable plant types, specimens, and lineages.
- Read-only browsing for public collections by unauthenticated visitors.
- Collection-gardener edit/delete tools, governing bodies page, and audit log.
- Server-admin-only site user management and collection archive/permanent-delete tools.
- Confirmation modals for destructive delete actions.
- Collection-scoped plant definition CSV export from Admin Tools for offline review, backup, and duplicate cleanup planning.
- Duplicate plant definition merge tool that safely moves dependent records into a selected definition before deleting the duplicate.
- Demo data generator for populating realistic test records.
- Web-based Help page and generated Markdown user manual, with repeatable Playwright screenshot capture for documentation.

Plant Health Timeline v1 derives history from records AxilDB already stores, including plant location moves recorded through the structured location workflow. Explicit label-change events, restore events, and fine-grained sport status transitions remain future enhancements unless they are represented by existing notes, audit records, or current instance state.

## Collections And Roles

AxilDB now treats plant records as belonging to a **Collection**. Existing installs are backfilled into a default private collection:

```text
Name: AxilDB
Slug: axildb
Visibility: private
```

Collection routes use:

```text
/c/[collectionSlug]/...
```

Legacy app routes redirect to the default collection, for example `/plants` redirects to `/c/axildb/plants`.
The default collection is tracked internally, so its slug can be renamed without AxilDB recreating a fresh empty `axildb` collection during bootstrap.

Collection visibility:

- **Public collections** can be browsed read-only without signing in.
- **Private collections** require active collection membership.

Global roles:

- **User** is the normal account role. Collection permissions come from collection memberships.
- **Server Admin** can create collections, archive/restore/permanently delete archived collections, manage site users, manage memberships across collections, and view server health/usage panels.

Collection roles:

- **Viewer** can view the collection, follow records, and manage their own reminders/preferences.
- **Logger** can add records such as plants, blooms, propagations, notes, photos, and sport observations.
- **Gardener** can edit, delete, archive/restore, manage governing bodies, select cover/type photos, review audit logs, and run collection tools.
- **Manager** can do gardener work plus manage collection settings, approve/reject membership requests, invite members by email, and change collection member roles. AxilDB prevents removing the final manager.

Server administration is intentionally separate from collection work. Normal plant work is collection-scoped through collection memberships.
Public collections are browseable without signing in, but following records requires an active collection membership.

The bootstrap script creates the first admin user:

```text
Email: admin@axildb.com
Password: password
```

Change this password after the first deployment.

The bootstrap script also creates the default collection, makes `admin@axildb.com` a server admin, converts existing collection owners to managers, converts existing collection admins to gardeners, and backfills existing records with the default `collectionId`.

## Architecture

AxilDB is a Next.js app using the App Router, React server components, server actions, Prisma, Postgres, and Caddy.

Tenant-like collection context is handled by middleware. Requests to `/c/[slug]/...` are rewritten internally to the existing App Router pages while an `x-axildb-collection` request header carries the current collection slug. Server components and server actions load the current collection, check membership, and scope queries by `collectionId`.

Production is managed with Docker Compose:

- `caddy`: public reverse proxy, HTTP-to-HTTPS redirects, and automatic Let's Encrypt certificates.
- `db`: Postgres 16 database with a persistent Docker volume.
- `migrate`: one-shot setup container that deploys Prisma migrations and bootstraps the initial admin user.
- `app`: Next.js production server exposed internally on port 3000.
- `reminders`: scheduled worker that checks for due reminders, sends opt-out-aware care queue digest emails, and sends email through the configured SMTP provider.
- `image-moderation`: scheduled worker that checks newly uploaded images with OpenAI Moderation first, hides unsafe images pending server-admin review, and runs a separate plant-content vision check only for images that pass the safety layer.
- `metrics`: scheduled worker that samples best-effort server metrics and collection storage estimates for the server dashboard, opens/resolves lightweight server incidents when thresholds are crossed, and sends rate-limited server health emails to verified server admins when health is degraded.
- `backups`: scheduled worker that processes server-admin sitewide backup requests into timestamped backup folders.

Persistent production data lives in Docker volumes and bind mounts:

- `axildb_pgdata`: Postgres data.
- `caddy_data`: Caddy certificates and ACME state.
- `caddy_config`: Caddy runtime config.
- `./public/uploads:/app/public/uploads`: uploaded plant/bloom/type images.
- `./public/labels:/app/public/labels`: generated label artifacts.
- `./backups:/app/backups`: sitewide backup output generated by the backup worker.

Production schema changes are deployed with Prisma migrations. Existing AxilDB databases that were originally created with `prisma db push` are baselined by the migration deploy script only after it confirms the live schema matches the current Prisma schema.

## Important URLs

In production:

- `https://axildb.com` serves the public splash page.
- `https://www.axildb.com` redirects to the public splash page.
- `https://app.axildb.com` serves the AxilDB application.

App-generated QR and label links should use:

```text
NEXT_PUBLIC_APP_URL=https://app.axildb.com
```

## Local Setup

```bash
cp .env.example .env
npm install
npx prisma generate
npm run db:migrate:dev
npm run db:seed
npm run dev
```

Open `http://localhost` locally unless you override `PORT`.

Useful scripts:

```bash
npm run build
npm run docs:manual
npm run docs:screenshots
npm run docs:build
npm run prisma:generate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:push
npm run db:seed
npm run db:bootstrap
npm run backup
npm run backup:worker -- --once
npm run check:collection-defaults
npm run check:collection-scope
npm run check:collection-integrity
npm run check:mobile-overflow
npm run check:production
```

`check:collection-defaults` is a static guardrail for legacy slug assumptions. The default collection can be renamed, so normal app code should use the current collection context rather than hard-coding `axildb`.

`check:collection-scope` is a static guardrail for the multi-collection model. It flags collection-owned Prisma reads that are missing an explicit collection boundary, including ID-based lookups that could otherwise accidentally cross collection lines.

`check:collection-integrity` is a database guardrail. Run it on the server after schema changes or data repairs to confirm collection-owned records have `collectionId` values, exactly one default collection exists, every active collection has an active manager, the initial server admin exists, legacy roles are migrated, and linked records, photos, notes, follows, reminders, audit logs, and propagation graph edges do not cross collection boundaries.

`check:mobile-overflow` is a Playwright guardrail for mobile layout containment. Run it against a live app with `AXILDB_OVERFLOW_BASE_URL`, optional comma-separated `AXILDB_OVERFLOW_PATHS`, and optional `AXILDB_OVERFLOW_WIDTHS` to confirm `document.documentElement.scrollWidth` does not exceed the mobile viewport and to print offending elements when it does.

`check:production` runs the repeatable pre-deploy safety pass: TypeScript, collection static scans, the database integrity scan when `DATABASE_URL` is available, and a production build.

## User Manual

The in-app Help page is available at `/help` and uses the same structured content as the generated Markdown manual. Regenerate the Markdown files after documentation changes:

```bash
npm run docs:manual
```

This writes both `docs/USER_MANUAL.md` for the repository and `public/manual/USER_MANUAL.md` for the web app.

Screenshots can be refreshed against a running app:

```bash
AXILDB_DOCS_BASE_URL=https://app.axildb.com AXILDB_DOCS_COLLECTION_SLUG=axildb npm run docs:screenshots
```

If the capture account is required to use 2FA, create a dedicated low-privilege documentation account or set `AXILDB_DOCS_SKIP_LOGIN=1` with an already-authenticated browser context. Screenshots are saved under `public/manual/screenshots/`.

On a Docker production server, use the optional docs runner instead of the slim app container:

```bash
docker compose --profile docs run --rm docs
```

The app bind-mounts `public/manual`, so refreshed manual files and screenshots are visible to the running app without rebuilding the main application container.

The docs runner reads the same uncommitted env files as the app. Store documentation credentials in `/etc/axildb/axildb.env`, not in git:

```bash
sudo install -d -m 700 /etc/axildb
sudo nano /etc/axildb/axildb.env
sudo chmod 600 /etc/axildb/axildb.env
```

Add values like:

```text
AXILDB_DOCS_BASE_URL=https://app.axildb.com
AXILDB_DOCS_COLLECTION_SLUG=axildb
AXILDB_DOCS_EMAIL=docs@axildb.com
AXILDB_DOCS_PASSWORD=use-a-long-random-password
AXILDB_DOCS_TOTP_SECRET=
AXILDB_DOCS_SKIP_LOGIN=0
```

Use a dedicated documentation account with the minimum collection role needed for the screenshots you want. A manager/gardener account captures more admin-oriented pages; a viewer account captures safer public/member workflows.

If the documentation account has a role that requires two-factor authentication, add the account’s authenticator setup secret as `AXILDB_DOCS_TOTP_SECRET`. This should be a docs-only account secret, not your personal authenticator secret. For a one-off run, you can instead set `AXILDB_DOCS_TOTP_CODE` immediately before running the docs profile.

## Backup And Restore

Back up before production schema changes, major pulls, or server maintenance. AxilDB backups are **sitewide**: full collection-specific export/import is intentionally deferred. Admin Tools includes a read-only plant definition CSV export for offline review and lightweight data portability.

Server admins can request a backup from **Server Management → Backups**. The `backups` Docker service checks for queued requests and writes a timestamped folder under `backups/` containing:

- a compressed Postgres custom-format dump
- uploaded images from `public/uploads`
- generated label files from `public/labels`
- a small manifest with timestamp and git commit

To process one queued backup manually from a containerized deployment:

```bash
docker compose run --rm backups npm run backup:worker -- --once
```

The backup script can also be run directly from the server repo root:

```bash
npm run backup
```

Or choose a destination directory:

```bash
scripts/backup.sh /home/ubuntu/axildb-backups
```

Copy backup folders off the server periodically. For example:

```bash
scp -r ubuntu@app.axildb.com:/home/ubuntu/AxilDB/backups/axildb-YYYYMMDDTHHMMSSZ .
```

Restore is intentionally command-line only because it replaces database contents. Planned restore strategy:

1. Announce a maintenance window and stop app traffic if this is production.
2. Confirm the backup folder contains `axildb.dump`, `uploads.tar.gz`, `labels.tar.gz`, and `manifest.txt`.
3. Run the guarded restore command from the server repo root.
4. Rebuild/restart containers and run production checks.

The guarded restore command:

```bash
AXILDB_RESTORE_CONFIRM=YES scripts/restore.sh backups/axildb-YYYYMMDDTHHMMSSZ
docker compose up -d --build
```

The restore script restores Postgres and extracts uploaded images/labels. It does not restore Caddy certificates, SMTP config, or other server-level files. Keep `/etc/axildb/axildb.env` backed up separately somewhere secure.

## Docker Deployment

Point DNS for `axildb.com`, `www.axildb.com`, and `app.axildb.com` at the server. Make sure inbound ports 80 and 443 are open.

Then on the server:

```bash
git pull --ff-only
docker compose up -d --build
```

Check status and logs:

```bash
docker compose ps
docker compose logs --tail=120 app
docker compose logs --tail=120 caddy
docker compose logs --tail=120 migrate
docker compose logs --tail=120 backups
```

Before deploying a substantive update, run the integrity/build checks and request or create a backup:

```bash
npm run check:production
npm run backup
```

In Docker-only production, the production check runs inside a container:

```bash
docker compose run --rm migrate npm run check:production
```

The `migrate` service runs `npm run db:migrate:deploy` before bootstrapping. On an existing production database with AxilDB tables but no Prisma migration history, the deploy script first compares the live schema with `prisma/schema.prisma`; if there is no drift, it marks the initial baseline migration as applied and then runs `prisma migrate deploy`. If drift is found, it exits without changing migration state.

And a sitewide backup can be requested from the server dashboard or processed manually:

```bash
docker compose run --rm backups npm run backup:worker -- --once
```

## Reset Local Docker Data

This deletes local Docker database data, so use it only for local testing or a disposable server.

```bash
docker compose down -v
docker compose up -d --build
```

## Data Model Overview

Core models:

- `Collection`: tenant-like workspace with slug, name, visibility, active/archived status, and description.
- `CollectionMembership`: user membership, collection role, and pending/active/rejected status.
- `CollectionInvitation`: single-use collection invitation tokens for adding new users by email.
- `CollectionRequest`: registered-user request for a server-admin-approved collection.
- `PlantDefinition`: taxonomic/cultivar definition and reference metadata.
- `PlantAlias`: alternate names with type, source, confidence, and notes.
- `PlantInstance`: an individual plant/specimen in the collection.
- `LocationType`: collection-defined location categories such as Room, Cabinet, Shelf, or Greenhouse, with stable abbreviations used for location codes.
- `Location`: collection-scoped hierarchical locations with stable generated codes such as `LOC-SH-01`; locations can contain other locations and direct plant assignments.
- `PlantLocationMove`: move history for plants reassigned between structured locations.
- `PlantQuarantine`: plant-level quarantine workflow records with risk level, checklist, target release review date, release/cancel status, and optional quarantine location.
- `PropagationEvent`: a propagation action with parent and child links.
- `ParentageLink` and `PropagationChild`: graph edges for lineage.
- `BloomEvent`: bloom lifecycle records.
- `Photo`: photos attached to definitions, instances, and bloom events.
- `Sunshine`: collection-scoped appreciation rows. New Sunshine records are validated for plant instances only; legacy bloom/photo target rows may remain preserved in the table but are ignored by current UI/actions. Rows are unique per user and target, with giver identity kept private in the UI.
- `ValidatedDefinitionChange`: old/new change summaries for site-wide validated plant definition edits.
- `CollectionUpdateDigestDelivery`: per-collection, per-user, per-channel delivery guard for daily collection update digests.
- `Note`: freeform notes attached to entities.
- `SportStabilityRecord`: evidence for sport-line stability.
- `User`, `Session`, and `AuditLog`: local auth, sessions, and mutation history.
- `UserTwoFactor`, `TwoFactorChallenge`, and `TwoFactorRecoveryCode`: encrypted authenticator secrets, short-lived login challenges, and one-time recovery-code hashes.
- `EmailToken`: hashed single-use tokens for email verification, password resets, and magic links.
- `EmailPreference`: user-configurable email/push categories, daily care digest time, timezone, and quiet-hours settings.
- `Reminder` and `ReminderDelivery`: reminder scheduling metadata and delivery history.
- `Follow` and `FollowNotification`: event-based subscriptions and delivery history for followed specimens, plant types, and lineages.
- `CareSheet`, `CareSheetPlant`, `CareSheetTask`, and `CareSheetAccessLog`: generated care sheets, weekly checklists, limited sitter sessions, token access logs, and interactive checklist task state.
- `ServerMetricSnapshot`: rolling 36-hour best-effort server metrics and storage estimates.
- `ServerIncident`, `ServerIncidentNote`, and `ServerIncidentNotification`: durable server incident history, notes/postmortems, graph markers, resolution state, and server-health alert traceability.
- `BackupRun`: sitewide backup request, worker status, output path, logs, and manifest metadata.
- `GoverningBody`: registration or standards organizations.

Validated Plant Definitions are site-level `PlantDefinition` records with `collectionId = null` and `isValidated = true`. They are not owned by the collection that nominated them, so deleting or archiving a collection does not delete approved validated definitions or break plant instances linked to them. Collection managers can nominate a local definition for validation, server admins review nominations under Server Management, and approval creates a site-level validated definition with copied taxonomy, aliases, husbandry, type-image metadata, and governing body metadata. Managers can dispute validated definitions or create a local copy for selected specimens when they need to detach from future validated updates. Specimen-level husbandry overrides remain available, so collections do not need to detach solely for local care differences.

Most domain records carry `collectionId`, including local plant definitions, aliases, plant instances, locations, location types, plant location moves, propagations, blooms, notes, photos, reminders, follows, sunshine, governing bodies, and audit logs. Suggestions/autocomplete, search, gallery, lineage graphs, labels, dashboard activity, follow counts, and sunshine counts are scoped per collection. Validated plant definitions, their aliases, husbandry guides, and type-image metadata intentionally remain site-level.

## Location Mapping

Open **Locations** from the collection sidebar to manage structured plant locations. Managers can create location types, create/edit/archive locations, quick-create locations from plant forms, drag/reorder/reparent locations, and move locations under other locations. Gardeners can move active plants between existing active locations individually, by dragging plants onto locations, or with a previewed batch move. Viewers and loggers can view the location hierarchy, but cannot move plants or restructure it.

Location types are collection-defined labels such as Room, Cabinet, Shelf, or Greenhouse. Each type has an abbreviation used when AxilDB creates a stable code, for example `LOC-RM-01`, `LOC-CAB-01`, or `LOC-SH-01`. Codes are unique inside the collection and do not change automatically if the type abbreviation changes later. If a manager changes a location type and the existing code no longer matches the type abbreviation, the location detail page offers a confirmed code regeneration action.

Locations can be nested under any other location; AxilDB does not hard-code allowed parent/child combinations. Circular parent relationships are blocked. Location detail pages show the parent, breadcrumb path, child locations, plants directly assigned to the location, and plants nested inside child locations in separate sections.

The migration/backfill creates one top-level “Legacy Location” record for each distinct non-empty legacy plant instance location string and assigns matching plants to it. The original text is preserved as legacy location text. AxilDB does not attempt to parse old freeform values into rooms, cabinets, or shelves automatically.

Location QR labels are generated through the existing bulk label PDF endpoint and include the collection name, location name, code, type, and breadcrumb when space allows. Bulk Tags can export plant labels, location labels, or both from one selection list. A location QR opens the location detail page and shows the plants currently assigned directly or through child locations. The Plant Instances page can filter by a location with optional child-location inclusion.

Batch location moves support direct-only or direct-plus-nested scope. The Location Manager previews affected active plants before commit, lets gardeners/managers deselect individual plants, requires confirmation, and writes one `PlantLocationMove` record per moved plant. The commit path re-checks collection, active status, source location, destination location, and no-op moves before applying changes.

Drag/drop is an enhancement, not the only movement path. The Location Manager keeps dropdown/button fallbacks for mobile and keyboard workflows. Manager location drags prevent cycles, preserve descendants and assigned plants, ask for confirmation when moving populated locations, normalize sibling sort order, and audit the move. Plant drags write one `PlantLocationMove` per moved plant and can move selected plant groups by dragging one selected plant.

Quarantine is modeled as a plant-level workflow record and can optionally reference a quarantine location. Moving into a quarantine-type location does not silently start quarantine; drag/drop shows a prompt to start quarantine, move only, or cancel the move, and specimen pages also show a prompt to start a record. Active quarantine records include reason, risk level, checklist, start date, target release review date, notes, release/cancel controls, and a care queue review item when the target date is due or overdue. Plant cards, specimen pages, location detail pages, care queue, and Plant Health Timeline surface active quarantine state.

Collection Update Digest is intentionally separate from the Care Queue Digest. It covers reference/governance/library changes, currently site-wide validated plant definition edits only. A validated definition is considered "in use" by a collection when that collection has at least one plant instance linked to it. Managers and gardeners can receive one daily email and/or push digest for the previous local day; loggers, viewers, and public visitors do not receive or view the v1 digest. The digest includes a concise old/new table, changed date/time, links to changed validated definitions, and affected instance counts without member emails or unrelated private notes.

The schema intentionally uses string fields rather than Prisma enums for many domain states. This keeps taxonomy, sport states, propagation methods, and future horticultural vocabulary easier to evolve.

## Plant Husbandry

Plant husbandry is collection-scoped and lives in two layers:

- `PlantHusbandryGuide` belongs to a plant definition. It can either store its own structured care data or live-link to another definition's guide in the same collection.
- `PlantHusbandryOverride` belongs to one plant instance. Blank fields inherit from the definition guide; filled fields are treated as local specimen-specific adjustments.

Guides are intentionally structured as explicit fields rather than a loose JSON blob. That makes each care section independently renderable and keeps the future care-sheet module straightforward: a later feature can select specimens, select care sections, merge inherited guide values with local overrides, and render a printable/shareable care package.

Gardeners and managers can create, edit, link, fork, and delete definition-level husbandry guides. Loggers can add local instance-level care adjustments. Viewers can read husbandry in collections they can access.

The husbandry integrity checks verify that linked guides do not cross collection boundaries, guide links do not form circular references, and instance overrides belong to the same collection as their specimen.

## Photos

Photo uploads are processed with Sharp:

- Images are auto-rotated from EXIF orientation.
- The maximum width or height is resized to 2000 px.
- Stored files are converted to JPEG at a space-conscious quality setting.
- Uploaded images are stored under `public/uploads`.
- Uploaded files are served through `/uploads/[filename]`.

Server admins can open **Server Management → Orphaned Images** to run a dry-run scan of uploaded image storage. The tool recursively scans supported image files in the upload directory, compares them with database upload references, shows suspected orphaned files with size, modified date, and preview, and deletes only selected files after the admin types the confirmation phrase. Deletion re-checks database references immediately before unlinking each file to avoid races with concurrent uploads, logs cleanup activity in the audit log, and never deletes database records. Back up before bulk deletion. The cleanup tool does not touch generated labels, manuals, backups, PDFs, or other non-upload directories.

For long-term production hardening, object storage such as AWS S3 or Lightsail Object Storage would be a good next step.

## Audit Log

Authenticated mutations write audit entries with:

- user ID, email, and role
- action
- entity type and entity ID
- summary
- optional serialized metadata
- timestamp

The audit log is visible to admin users.

## Collection Boundary Checks

AxilDB includes a lightweight static check for collection-owned read queries:

```bash
npm run check:collection-scope
```

The check scans collection-owned Prisma `findMany`, `findFirst`, and `count` calls and fails when they do not include `collectionId`, unless the call is in a narrow reviewed allowlist. It is not a replacement for end-to-end privacy tests, but it catches the easiest and riskiest class of tenant-leak regressions.

## Email

AxilDB uses provider-agnostic SMTP configuration through Nodemailer. In development, email delivery defaults to log mode so generated messages appear in app logs instead of being sent.

Relevant environment variables:

```text
TOTP_ENCRYPTION_KEY=
EMAIL_DELIVERY_MODE=log
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="AxilDB <no-reply@axildb.com>"
SMTP_REPLY_TO=
TZ=America/New_York
AXILDB_DEFAULT_TIMEZONE=America/New_York
REMINDER_WORKER_INTERVAL_SECONDS=300
METRICS_WORKER_INTERVAL_SECONDS=300
IMAGE_MODERATION_WORKER_INTERVAL_SECONDS=180
SERVER_HEALTH_ALERT_COOLDOWN_HOURS=6
NEXT_PUBLIC_ENABLE_WEB_PUSH=false
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@axildb.com
OPENAI_API_KEY=
OPENAI_DESCRIPTION_MODEL=gpt-5.4-mini
OPENAI_DESCRIPTION_HOURLY_LIMIT=20
OPENAI_MAGIC_FILL_MODEL=gpt-5.4-mini
OPENAI_MAGIC_FILL_HOURLY_LIMIT=10
OPENAI_PLANT_ID_MODEL=gpt-5.4-mini
OPENAI_PLANT_ID_HOURLY_LIMIT=10
OPENAI_HUSBANDRY_FILL_MODEL=gpt-5.4-mini
OPENAI_HUSBANDRY_FILL_HOURLY_LIMIT=10
OPENAI_GREEN_THUMB_MODEL=gpt-5.4-mini
OPENAI_GREEN_THUMB_HOURLY_LIMIT=20
OPENAI_GREEN_THUMB_DAILY_COLLECTION_LIMIT=5
AXILDB_AI_BRIEFING_ENABLED=false
OPENAI_BRIEFING_MODEL=gpt-5.4-mini
OPENAI_BRIEFING_MAX_OUTPUT_TOKENS=2400
OPENAI_BRIEFING_DAILY_COLLECTION_LIMIT=1
AXILDB_IMAGE_MODERATION_ENABLED=false
OPENAI_IMAGE_MODERATION_MODEL=omni-moderation-latest
OPENAI_PLANT_IMAGE_CHECK_MODEL=gpt-5.4-mini
```

Set `TOTP_ENCRYPTION_KEY` to a long random secret in production. It encrypts authenticator app secrets before they are stored in the database. On Ubuntu, a good value can be generated with:

```bash
openssl rand -base64 32
```

Set `EMAIL_DELIVERY_MODE=smtp` and provide SMTP credentials to send real email. Docker Compose loads app-level email settings from `/etc/axildb/axildb.env` on the server, so SMTP credentials do not need to live in the repository.

## Web Push notifications

AxilDB can send browser and installed PWA notifications alongside email alerts. Web Push is optional and disabled unless `NEXT_PUBLIC_ENABLE_WEB_PUSH=true` and VAPID keys are configured.

Generate VAPID keys with:

```bash
npx web-push generate-vapid-keys
```

Then set:

```text
NEXT_PUBLIC_ENABLE_WEB_PUSH=true
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@axildb.com
```

Users can enable push from Account → Web Push devices and choose push alert types in Account → Notification preferences. Push payloads intentionally use short generic copy with a click-through URL; plant notes, private collection names, user emails, and other freeform sensitive content are not included in notification payloads.

Production Web Push requires HTTPS. On iPhone and iPad, users must install AxilDB to the Home Screen before Safari/iOS will allow PWA push notifications.

Manual verification:

1. Set the Web Push env vars and restart AxilDB.
2. Open Account, enable a push alert type, then select “Enable push notifications.”
3. Select “Send test push notification” and confirm the notification appears.
4. Click the notification and confirm it opens AxilDB.
5. Select “Disable push notifications,” then confirm test or scheduled notifications are no longer delivered to that browser.

Set `AXILDB_DEFAULT_TIMEZONE` to the collection's normal local timezone, for example `America/New_York`. AxilDB still stores absolute timestamps in UTC, but reminder form input, recurring reminder calculations, care queue day boundaries, and timestamp display use each user's account email preference timezone when available, falling back to `AXILDB_DEFAULT_TIMEZONE`. Docker Compose also passes `TZ` and `AXILDB_DEFAULT_TIMEZONE` into the app, migrate, reminders, metrics, backups, and docs services so scheduled workers agree on the same local default.

To sanity-check reminder recurrence across local midnight and daylight-saving boundaries, run:

```bash
npm run check:timezone
```

For Amazon SES in `us-east-2`, create the server config file:

```bash
sudo mkdir -p /etc/axildb
sudo nano /etc/axildb/axildb.env
```

Example SES STARTTLS config:

```text
EMAIL_DELIVERY_MODE=smtp
SMTP_HOST=email-smtp.us-east-2.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-smtp-user
SMTP_PASSWORD=your-ses-smtp-password
SMTP_FROM=AxilDB <no-reply@axildb.com>
SMTP_REPLY_TO=
TOTP_ENCRYPTION_KEY=your-long-random-secret
TZ=America/New_York
AXILDB_DEFAULT_TIMEZONE=America/New_York
```

Then restrict the file permissions:

```bash
sudo chown root:root /etc/axildb/axildb.env
sudo chmod 600 /etc/axildb/axildb.env
```

Use `SMTP_SECURE=false` for SES STARTTLS ports such as 587 or 2587. Use `SMTP_SECURE=true` only for TLS wrapper ports such as 465 or 2465.

The `SMTP_FROM` address must be a sender/domain identity verified in SES. If the SES account is still in sandbox mode, recipient addresses must also be verified.

Recommended production provider: Amazon SES. It fits well with the AWS/Lightsail deployment, is intended for application and transactional email, supports SMTP credentials, and avoids tying AxilDB to a personal mailbox. Gmail SMTP can work for small testing, especially with Google Workspace and app passwords, but it is less ideal as the long-term sender for app-auth and reminder emails.

## Optional OpenAI Plant Definition Drafting

Plant definition forms include optional OpenAI buttons. **AI draft** uses the genus, species, and cultivar fields to draft a description under 40 words. **Magic fill** asks OpenAI for a structured plant definition draft: accepted genus/species, authority, cultivar registration number, governing body, taxonomy/reference URLs, description, and aliases. **ID My Plant** suggests a cautious identification draft from a user description, known common/trade names, and an optional plant image; it saves each result to ID My Plant history, marks applied suggestions as **AI Determined**, and never saves or overwrites the definition until the user clicks Apply and saves the form. **Magic Fill husbandry** asks for one structured draft covering the entire care guide. **Green Thumb assist** lets a logger ask one care question per plant specimen per day and stores the answer as a highlighted care note. **Collection Briefing** can be enabled by a collection manager after server-level AI access is enabled; it creates one cached dashboard briefing per collection local day when an active authenticated member first opens the dashboard, written as a short conversational note rather than a comprehensive checklist. The API key is never sent to the browser, and generated definition/husbandry data is never saved automatically; review it before saving.

To enable it, create an OpenAI API key in the OpenAI Platform dashboard and add it to the server-level config file that Docker Compose already loads:

```bash
sudo nano /etc/axildb/axildb.env
```

Add:

```text
OPENAI_API_KEY=sk-your-api-key
OPENAI_DESCRIPTION_MODEL=gpt-5.4-mini
OPENAI_DESCRIPTION_HOURLY_LIMIT=20
OPENAI_MAGIC_FILL_MODEL=gpt-5.4-mini
OPENAI_MAGIC_FILL_HOURLY_LIMIT=10
OPENAI_PLANT_ID_MODEL=gpt-5.4-mini
OPENAI_PLANT_ID_HOURLY_LIMIT=10
OPENAI_HUSBANDRY_FILL_MODEL=gpt-5.4-mini
OPENAI_HUSBANDRY_FILL_HOURLY_LIMIT=10
OPENAI_GREEN_THUMB_MODEL=gpt-5.4-mini
OPENAI_GREEN_THUMB_HOURLY_LIMIT=20
OPENAI_GREEN_THUMB_DAILY_COLLECTION_LIMIT=5
AXILDB_AI_BRIEFING_ENABLED=true
OPENAI_BRIEFING_MODEL=gpt-5.4-mini
OPENAI_BRIEFING_MAX_OUTPUT_TOKENS=2400
OPENAI_BRIEFING_DAILY_COLLECTION_LIMIT=1
AXILDB_IMAGE_MODERATION_ENABLED=true
OPENAI_IMAGE_MODERATION_MODEL=omni-moderation-latest
OPENAI_PLANT_IMAGE_CHECK_MODEL=gpt-5.4-mini
```

Then redeploy/recreate the app container so the environment changes are loaded:

```bash
docker compose up -d --build
```

`OPENAI_DESCRIPTION_HOURLY_LIMIT`, `OPENAI_MAGIC_FILL_HOURLY_LIMIT`, `OPENAI_PLANT_ID_HOURLY_LIMIT`, `OPENAI_HUSBANDRY_FILL_HOURLY_LIMIT`, and `OPENAI_GREEN_THUMB_HOURLY_LIMIT` are lightweight per-user in-process limits for the OpenAI buttons. ID My Plant falls back to `OPENAI_MAGIC_FILL_MODEL` and `OPENAI_MAGIC_FILL_HOURLY_LIMIT` when its specific settings are not configured. Each successful ID My Plant run creates a collection-scoped history item with the submitted description, known names, optional image, suggested result, alternatives, confidence explanation, and any matching local or validated definition. Users can review their own history from Account → My Plant IDs; collection managers can review collection-wide history from Plant Definitions → ID History and start a new plant definition prefilled from any result. `OPENAI_GREEN_THUMB_DAILY_COLLECTION_LIMIT` is a persisted per-collection daily cap for Green Thumb requests and defaults to 5 when unset. `OPENAI_BRIEFING_DAILY_COLLECTION_LIMIT` limits AI-generated Collection Briefings per UTC day and defaults to 1; manager-triggered regeneration bypasses that limit but still requires server-level AI access, the collection briefing toggle, and `AXILDB_AI_BRIEFING_ENABLED=true`. `OPENAI_BRIEFING_MAX_OUTPUT_TOKENS` defaults to 2400, and AxilDB retries once with a larger output budget if OpenAI reports the briefing was truncated. Green Thumb also has a once-per-specimen-per-day cooldown.

When `AXILDB_IMAGE_MODERATION_ENABLED=true`, uploads still complete immediately and the image moderation worker processes pending local uploads in the background. The first layer sends only the uploaded image and a short safety classification string to the OpenAI Moderation API using `OPENAI_IMAGE_MODERATION_MODEL` (default `omni-moderation-latest`). If OpenAI Moderation flags unsafe content, AxilDB marks the photo `CENSORED`, creates a server-admin review item, and does not run the plant-content vision check. Censored images are hidden from normal users and public visitors until a server admin reviews them at Server Management → Image Moderation, where existing false-alarm, remove-image, and remove-and-block-uploader actions remain available.

Only images that pass the safety layer are sent to the plant-content vision check using `OPENAI_PLANT_IMAGE_CHECK_MODEL`. That second layer stores structured plant analysis (`containsPlant`, `confidence`, `primarySubject`, `imageType`, `usableForIdentification`, optional `suggestedCaption`, and `reason`) and sets the photo to `APPROVED`, `NO_PLANT_DETECTED`, or `UNCERTAIN_PLANT_CONTENT`. If the uploader left the caption blank, the same vision response may provide a short plant-photo caption that AxilDB stores as the photo caption; user-provided captions are preserved and are not overwritten. No-plant images remain visible but create an Account review item for the uploader to keep or remove. Uncertain plant-content images create a softer Account review item that asks, “We’re not sure this image contains a plant. Continue anyway?” Moderation API failures are recorded as `MODERATION_FAILED` after retry attempts and do not crash the worker.

ID My Plant sends only the description, known names, and selected image to OpenAI; image moderation sends only the uploaded image plus minimal moderation/check prompts; neither flow sends user emails, membership data, unrelated collection records, or saved specimen history. Collection Briefing sends compact care, note, bloom, propagation, condition, and metadata summaries to the model; uploaded image content, user emails, and private membership data are not sent. ID My Plant history is not public: normal users see only their own entries, and collection managers see entries for their collection. For stricter cost control, also set project usage limits in the OpenAI Platform billing settings.

To process pending image moderation checks once outside Docker, run:

```bash
npm run images:moderate
```

Current email foundation:

- Welcome email for newly created users.
- Email verification token generation and verification page.
- Self-service resend verification from the account page.
- Password reset request and completion screens.
- Magic login link request and consumption route.
- Secure random single-use tokens stored only as SHA-256 hashes.
- Token purpose, expiration, and used-at tracking.
- Basic auth-email cooldowns for verification, reset, and magic-link requests.
- Visible success/limit/error feedback for auth email flows.
- User email preferences on the account page.
- Reminder creation from the reminders page, plant instance pages, and bloom events.
- Reminder delivery history for sent, failed, and skipped reminder emails.
- Scheduled Docker worker for due reminder delivery and daily care queue digest emails/push alerts. The digest summarizes broad due/overdue care categories by collection, omits private notes/freeform detail, respects active collection memberships, and sends once per local day at the user's selected account preference time.
- Follow/unfollow controls on plant definitions and specimen detail pages.
- Event-based follow notifications with a delivery history on the Following page.
- Server health incidents for memory, disk, backup worker, AI, and image moderation failures. Memory incidents open after three consecutive samples above 75% warning or 90% critical; disk opens above 80% warning or 90% critical; metric incidents resolve after three clear samples. Server admins can also create manual incidents for operational events such as migrations, outages, reboots, and storage work.
- Server health alert emails for verified `SERVER_ADMIN` users when the metrics worker sees degraded disk or memory health. These alerts default to a 6-hour per-admin cooldown and attach notification records to open incidents.
- Account-page opt-out toggles for collection update digest, care queue digest, and server health alert emails/push alerts.
- Quiet botanical branded HTML and plain-text templates.
- SMTP/log delivery abstraction.

## Two-Factor Authentication

Admin users must enable two-factor authentication before using admin-only tools. After signing in for the first time, an admin is sent to **Account security**, where AxilDB shows a QR code that can be scanned by Apple Passwords, 1Password, Google Authenticator, Authy, or another TOTP-compatible app.

Once enabled, admin sign-ins require:

1. Email/password or magic-link authentication.
2. A current 6-digit rotating verification code.

Logger users are not required to use 2FA, but they can enable it from **Account security**. When 2FA is enabled, AxilDB generates one-time recovery codes. Save them somewhere safe; after you dismiss the displayed codes, AxilDB keeps only hashed versions for verification. Generating a new recovery-code batch invalidates the old batch.

Planned next email steps:

- More detailed reminder presets for propagation follow-up and bloom-cycle timing.
- In-app reminder notifications alongside email.
- Better quiet-hours handling for reminder delivery windows.
- Stronger anti-abuse protections such as IP-aware throttling and optional CAPTCHA if the app becomes public-write.

## Licensing and Branding

AxilDB source code is licensed under the GNU Affero General Public License v3.0. See `LICENSE`.

The AxilDB name, marks, logos, screenshots, and visual identity are not licensed for reuse as branding for derivative projects unless permission is granted separately. Forks should use their own project names and branding.

## Support

The splash page includes a Ko-fi donation link:

```text
https://ko-fi.com/wetlabs
```

If the Ko-fi handle changes, update `NEXT_PUBLIC_DONATE_URL` in `.env` or `docker-compose.yml`.

## Future Hardening Ideas

- Expand browser and API regression coverage for collection boundaries, public/private visibility, role permissions, and cross-collection validated-definition behavior.
- Add automated scenario tests for auth, two-factor flows, plant ID generation, uploads, image moderation decisions, destructive actions, sport logic, lineage graph construction, and transfer review.
- Move uploaded images from local disk to durable object storage with lifecycle policies, signed URLs, and backup/restore coverage.
- Add CSV import tools with dry-run validation, duplicate detection, and collection-scoped rollback notes.
- Add richer observability for background workers, including moderation, backups, reminders, digests, health alerts, and failed push/email delivery.
