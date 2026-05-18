# AxilDB — Botanical Accession System

AxilDB is a personal horticultural accession database for tracking plant definitions, living specimens, propagations, blooms, photos, sport candidates, QR labels, and lineage history.

It is designed for real collection work: messy taxonomy, acquisition names, aliases, provisional labels, uncertain IDs, photos over time, and plant lines that change as they are propagated.

## Current Features

- Public splash page at `https://axildb.com`.
- Main application at `https://app.axildb.com`.
- Multi-collection workspaces at `/c/[collectionSlug]`, with private/public visibility and collection-scoped memberships.
- Plant definitions with genus, species, hybrid notation, cultivar name, authority, governing body, registration number, confidence, provisional taxon, acquisition label, reference URLs, notes, and aliases.
- Alias tracking for synonyms, old taxonomy, trade names, common names, shorthand, and misapplied names.
- Plant instances with generated plant IDs, acquisition/propagation dates, source/distributor metadata, location, archive status, notes, and photos.
- Automatic plant ID generation based on plant definition, date, context, and sequence number.
- Propagation events with parent/child links, method, date, success status, and generated child plant IDs.
- Bloom tracker with bloom start, peak, closure, first-bloom marker, flower counts, notes, and bloom photos.
- Specimen cover photos for plant cards.
- Type photos for plant definitions, including direct upload of reference-sourced images with source/source URL metadata.
- Photo upload resizing through Sharp to keep files space-conscious.
- Dashboard activity timeline combining propagations, blooms, sport notes, acquisitions, and archive actions.
- Lineage graph with searchable sidebar, ancestor/descendant tree view, selected-plant highlighting, and propagation-method line styles.
- Sport review workflow for suspected, candidate, stable, registered, unstable, and reverted sport lines.
- Stable sport/cultivar wizard that creates a new cultivar definition and preserves lineage history.
- QR label generation and bulk PDF label export.
- Collection search across definitions, instances, aliases, notes, source metadata, and plant IDs.
- Archive/restore workflow for plants that leave the active collection.
- Local user accounts with self-service viewer registration.
- Collection roles for owners, admins, loggers, and viewers, with member approval and role-management tools.
- QR-code two-factor authentication with one-time recovery codes, compatible with Apple Passwords and standard authenticator apps.
- SMTP-ready email foundation with welcome/verification emails, secure single-use tokens, branded HTML/plain-text templates, and user email preferences.
- User reminders for general tasks, plant check-ins, bloom follow-ups, and propagation follow-ups, with one-time or recurring schedules.
- Reminder delivery history and a lightweight scheduled reminder worker.
- Followed plant updates for individual specimens, plant types, and connected lineages, with email notifications for blooms, propagations, sport updates, photos, notes, archives, and new specimens of followed types.
- Follower counts on followable plant types, specimens, and lineages.
- Read-only browsing for public collections by unauthenticated visitors.
- Admin-only edit/delete tools, users page, governing bodies page, and audit log.
- Confirmation modals for destructive delete actions.
- Demo data generator for populating realistic test records.

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

Collection visibility:

- **Public collections** can be browsed read-only without signing in.
- **Private collections** require active collection membership.

Collection roles:

- **Viewer** can view the collection, follow records, and manage their own reminders/preferences.
- **Logger** can add records such as plants, blooms, propagations, notes, photos, and sport observations.
- **Admin** can edit, delete, archive/restore, manage governing bodies, select cover/type photos, review audit logs, and run collection admin tools.
- **Owner** can manage collection settings and members, approve membership requests, promote/demote roles, and add/remove owners. AxilDB prevents removing the final owner.

Global site roles still exist for account-level administration, but normal plant work is collection-scoped through collection memberships.

The bootstrap script creates the first admin user:

```text
Email: admin@axildb.com
Password: password
```

Change this password after the first deployment.

The bootstrap script also creates the default collection and makes existing global admins owners of that collection. It backfills existing records with the default `collectionId`.

## Architecture

AxilDB is a Next.js app using the App Router, React server components, server actions, Prisma, Postgres, and Caddy.

Tenant-like collection context is handled by middleware. Requests to `/c/[slug]/...` are rewritten internally to the existing App Router pages while an `x-axildb-collection` request header carries the current collection slug. Server components and server actions load the current collection, check membership, and scope queries by `collectionId`.

Production is managed with Docker Compose:

- `caddy`: public reverse proxy, HTTP-to-HTTPS redirects, and automatic Let's Encrypt certificates.
- `db`: Postgres 16 database with a persistent Docker volume.
- `migrate`: one-shot setup container that runs Prisma schema sync and bootstraps the initial admin user.
- `app`: Next.js production server exposed internally on port 3000.
- `reminders`: scheduled worker that checks for due reminders and sends email through the configured SMTP provider.

Persistent production data lives in Docker volumes and bind mounts:

- `axildb_pgdata`: Postgres data.
- `caddy_data`: Caddy certificates and ACME state.
- `caddy_config`: Caddy runtime config.
- `./public/uploads:/app/public/uploads`: uploaded plant/bloom/type images.
- `./public/labels:/app/public/labels`: generated label artifacts.

The app currently uses `prisma db push` during deployment. A future hardening step should switch production schema changes to Prisma migrations.

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
npx prisma db push
npm run db:seed
npm run dev
```

Open `http://localhost` locally unless you override `PORT`.

Useful scripts:

```bash
npm run build
npm run prisma:generate
npm run db:push
npm run db:seed
npm run db:bootstrap
npm run backup
npm run check:collection-scope
```

`check:collection-scope` is a static guardrail for the multi-collection model. It flags collection-owned Prisma reads that are missing an explicit collection boundary, including ID-based lookups that could otherwise accidentally cross collection lines.

## Backup And Restore

Back up before production schema changes, major pulls, or server maintenance. The backup script writes a timestamped folder under `backups/` containing:

- a compressed Postgres custom-format dump
- uploaded images from `public/uploads`
- generated label files from `public/labels`
- a small manifest with timestamp and git commit

Run on the server from the repo root:

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

Restore is intentionally guarded because it replaces database contents:

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
```

## Reset Local Docker Data

This deletes local Docker database data, so use it only for local testing or a disposable server.

```bash
docker compose down -v
docker compose up -d --build
```

## Data Model Overview

Core models:

- `Collection`: tenant-like workspace with slug, name, visibility, and description.
- `CollectionMembership`: user membership, collection role, and pending/active/rejected status.
- `PlantDefinition`: taxonomic/cultivar definition and reference metadata.
- `PlantAlias`: alternate names with type, source, confidence, and notes.
- `PlantInstance`: an individual plant/specimen in the collection.
- `PropagationEvent`: a propagation action with parent and child links.
- `ParentageLink` and `PropagationChild`: graph edges for lineage.
- `BloomEvent`: bloom lifecycle records.
- `Photo`: photos attached to definitions, instances, and bloom events.
- `Note`: freeform notes attached to entities.
- `SportStabilityRecord`: evidence for sport-line stability.
- `User`, `Session`, and `AuditLog`: local auth, sessions, and mutation history.
- `UserTwoFactor`, `TwoFactorChallenge`, and `TwoFactorRecoveryCode`: encrypted authenticator secrets, short-lived login challenges, and one-time recovery-code hashes.
- `EmailToken`: hashed single-use tokens for email verification, password resets, and magic links.
- `EmailPreference`: user-configurable email categories, timezone, and quiet-hours settings.
- `Reminder` and `ReminderDelivery`: reminder scheduling metadata and delivery history.
- `Follow` and `FollowNotification`: event-based subscriptions and delivery history for followed specimens, plant types, and lineages.
- `GoverningBody`: registration or standards organizations.

Most domain records carry `collectionId`, including plant definitions, aliases, plant instances, propagations, blooms, notes, photos, reminders, follows, governing bodies, and audit logs. Suggestions/autocomplete, search, gallery, lineage graphs, labels, dashboard activity, and follow counts are scoped per collection.

The schema intentionally uses string fields rather than Prisma enums for many domain states. This keeps taxonomy, sport states, propagation methods, and future horticultural vocabulary easier to evolve.

## Photos

Photo uploads are processed with Sharp:

- Images are auto-rotated from EXIF orientation.
- The maximum width or height is resized to 2000 px.
- Stored files are converted to JPEG at a space-conscious quality setting.
- Uploaded images are stored under `public/uploads`.
- Uploaded files are served through `/uploads/[filename]`.

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
REMINDER_WORKER_INTERVAL_SECONDS=300
OPENAI_API_KEY=
OPENAI_DESCRIPTION_MODEL=gpt-5.4-mini
OPENAI_DESCRIPTION_HOURLY_LIMIT=20
OPENAI_MAGIC_FILL_MODEL=gpt-5.4-mini
OPENAI_MAGIC_FILL_HOURLY_LIMIT=10
```

Set `TOTP_ENCRYPTION_KEY` to a long random secret in production. It encrypts authenticator app secrets before they are stored in the database. On Ubuntu, a good value can be generated with:

```bash
openssl rand -base64 32
```

Set `EMAIL_DELIVERY_MODE=smtp` and provide SMTP credentials to send real email. Docker Compose loads app-level email settings from `/etc/axildb/axildb.env` on the server, so SMTP credentials do not need to live in the repository.

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

Plant definition forms include optional OpenAI buttons beside the description field. **AI draft** uses the genus, species, and cultivar fields to draft a description under 40 words. **Magic fill** asks OpenAI for a structured plant definition draft: accepted genus/species, authority, cultivar registration number, governing body, taxonomy/reference URLs, description, and aliases. The API key is never sent to the browser, and generated data is never saved automatically; review it before saving.

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
```

Then redeploy/recreate the app container so the environment changes are loaded:

```bash
docker compose up -d --build
```

`OPENAI_DESCRIPTION_HOURLY_LIMIT` and `OPENAI_MAGIC_FILL_HOURLY_LIMIT` are lightweight per-user in-process limits for the two OpenAI buttons. For stricter cost control, also set project usage limits in the OpenAI Platform billing settings.

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
- Scheduled Docker worker for due reminder delivery.
- Follow/unfollow controls on plant definitions and specimen detail pages.
- Event-based follow notifications with a delivery history on the Following page.
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

- Switch production schema changes from `prisma db push` to Prisma migrations.
- Add browser/API privacy tests for collection boundaries and public/private behavior.
- Add sitewide verified/reference plant definitions that collections can link to or fork.
- Move uploads to durable object storage.
- Add automated tests for auth, permissions, plant ID generation, uploads, destructive actions, sport logic, and lineage graph construction.
- Add CSV import/export and duplicate plant definition merge tools.
