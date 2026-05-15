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
