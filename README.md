# AxilDB — Plant Lineage Tracker

AxilDB is a personal horticultural collection database for tracking plant definitions, living specimens, propagations, blooms, photos, sport candidates, QR labels, and lineage history.

It is designed for real collection work: messy taxonomy, acquisition names, aliases, provisional labels, uncertain IDs, photos over time, and plant lines that change as they are propagated.

## Current Features

- Public splash page at `https://axildb.com`.
- Main application at `https://app.axildb.com`.
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
- Local user accounts with admin/logger roles.
- SMTP-ready email foundation with welcome/verification emails, secure single-use tokens, branded HTML/plain-text templates, and user email preferences.
- Read-only browsing for unauthenticated visitors.
- Admin-only edit/delete tools, users page, governing bodies page, and audit log.
- Confirmation modals for destructive delete actions.
- Demo data generator for populating realistic test records.

## Roles

- **Unauthenticated visitors** can browse and explore the application in read-only mode.
- **Loggers** can add records such as plants, blooms, propagations, notes, photos, and sport observations.
- **Admins** can create, edit, delete, archive/restore, manage users, manage governing bodies, select cover/type photos, and review audit logs.

The bootstrap script creates the first admin user:

```text
Email: admin@axildb.com
Password: password
```

Change this password after the first deployment.

## Architecture

AxilDB is a Next.js app using the App Router, React server components, server actions, Prisma, Postgres, and Caddy.

Production is managed with Docker Compose:

- `caddy`: public reverse proxy, HTTP-to-HTTPS redirects, and automatic Let's Encrypt certificates.
- `db`: Postgres 16 database with a persistent Docker volume.
- `migrate`: one-shot setup container that runs Prisma schema sync and bootstraps the initial admin user.
- `app`: Next.js production server exposed internally on port 3000.

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
```

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
- `EmailToken`: hashed single-use tokens for email verification, password resets, and magic links.
- `EmailPreference`: user-configurable email categories, timezone, and quiet-hours settings.
- `Reminder` and `ReminderDelivery`: reminder scheduling metadata and delivery history.
- `GoverningBody`: registration or standards organizations.

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

## Email

AxilDB uses provider-agnostic SMTP configuration through Nodemailer. In development, email delivery defaults to log mode so generated messages appear in app logs instead of being sent.

Relevant environment variables:

```text
EMAIL_DELIVERY_MODE=log
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="AxilDB <no-reply@axildb.com>"
SMTP_REPLY_TO=
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
```

Then restrict the file permissions:

```bash
sudo chown root:root /etc/axildb/axildb.env
sudo chmod 600 /etc/axildb/axildb.env
```

Use `SMTP_SECURE=false` for SES STARTTLS ports such as 587 or 2587. Use `SMTP_SECURE=true` only for TLS wrapper ports such as 465 or 2465.

The `SMTP_FROM` address must be a sender/domain identity verified in SES. If the SES account is still in sandbox mode, recipient addresses must also be verified.

Recommended production provider: Amazon SES. It fits well with the AWS/Lightsail deployment, is intended for application and transactional email, supports SMTP credentials, and avoids tying AxilDB to a personal mailbox. Gmail SMTP can work for small testing, especially with Google Workspace and app passwords, but it is less ideal as the long-term sender for app-auth and reminder emails.

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
- Quiet botanical branded HTML and plain-text templates.
- SMTP/log delivery abstraction.

Planned next email steps:

- Reminder creation UI tied to plant instances and bloom events.
- Scheduled reminder sending job.
- Reminder delivery history UI.
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
- Add documented backup and restore commands for Postgres and uploaded files.
- Move uploads to durable object storage.
- Add automated tests for auth, permissions, plant ID generation, uploads, destructive actions, sport logic, and lineage graph construction.
- Add CSV import/export and duplicate plant definition merge tools.
