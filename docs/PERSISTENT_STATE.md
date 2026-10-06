# Persistent state inventory (2026-10-05)

Audit scope: every Prisma model, all filesystem imports/writes in app/, lib/,
scripts/, Dockerfile, Compose volumes, authentication, workers, and existing
backup/restore scripts. Recheck this inventory when adding storage integrations.

| Resource | Classification | Migration treatment |
| --- | --- | --- |
| PostgreSQL public schema, every table, sequence, constraint and migration record | MUST MIGRATE | Complete custom-format dump; discover tables from PostgreSQL, never an entity allowlist. Includes accounts, password hashes, sessions, encrypted two-factor records, roles, collections/settings, taxonomy, definitions, instances, photos/identification/moderation history, merges, lineage/propagation, blooms, care/history/schedules, conditions, treatments, fertilizer/substrate libraries and recipes, locations/environment, provenance/vendors/acquisitions/wishlist, tags, exhibits/subscribers, email tokens/preferences, event/outbox/attempts, workflows/reminders, AI jobs/proposals/reviews/budgets/warnings, audit/incidents/metrics, backup/restore metadata. |
| public/uploads | MUST MIGRATE | All regular files, including original uploads and identification images. Photo.path is authoritative. Transfers copy here; moderation reads here. No separate thumbnail store exists. |
| public/labels | SHOULD MIGRATE | Preserve all regular files, including legacy labels. Current bulk labels, wishlist exports, and exhibit PDFs stream to clients; they have no additional durable directory. |
| backups/axildb-* routine folders | SHOULD MIGRATE | Preserve dump, uploads.tar.gz, labels.tar.gz, manifest.txt/json only. Unknown extra files stop export, rather than silently losing history. Nested migration archives never enter these artifacts in the current routine engine. |
| Migration job history/reports | SHOULD MIGRATE | Preserved as explicit metadata; migration archives and staging/safety copies are excluded to prevent recursion. Destination operational journal stays outside the restored data. |
| public/manual, screenshots | REGENERATE | Generated from lib/user-manual.ts and documented screenshot script; optional Compose docs volume is dependencies, not user data. |
| .next, node_modules, image optimizer cache, build outputs | REGENERATE | Rebuild from the matching application revision. Fonts/icons/static assets are versioned source. |
| PostgreSQL raw Docker volume axildb_pgdata | MUST MIGRATE logically | SQL dump replaces physical-volume copying. |
| caddy_data, caddy_config, Caddyfile, TLS/SSH identity, Docker/OS state | DO NOT MIGRATE | Destination infrastructure, certificates and networking must be configured independently. |
| .env, /etc/axildb/axildb.env and environment credentials | DO NOT MIGRATE | Names/instructions only in requirements report; never copy values. |
| TOTP_ENCRYPTION_KEY (or legacy AUTH_SECRET fallback) | DO NOT MIGRATE automatically | **Transfer the original effective encryption key separately** or encrypted account 2FA cannot decrypt. Do not generate a replacement for an existing installation. |
| VAPID keys | DO NOT MIGRATE automatically | Transfer separately to keep existing browser push subscriptions usable; changed origins require re-subscription. |
| External URLs/resources | DO NOT MIGRATE | References survive in the database; remote content was never owned by AxilDB. Review external availability separately. |

The active upload writers/readers use public/uploads. AXILDB_UPLOAD_DIR in the
orphan-image tool and AXILDB_UPLOADS_ROOT in metrics are inconsistent legacy
configuration aliases, not a supported alternate application storage backend.
Migration refuses non-default values rather than pretending those paths are safe.
Custom backup roots are supported through AXILDB_BACKUP_ROOT and must be mounted
at the same logical root for the app and worker.

## Gaps in previous backups

Routine backups cover the database, uploads and labels, but do not include retained
backup archives, per-file hashes, schema compatibility, equivalence verification,
or offline consistency. Their restore shell script modifies the database before
validating media. Existing MaintenanceMode is a user-facing access screen with
administrator bypass; it does not drain writers or pause background workers.

## Consistency boundary

Full migrations stop all application/worker Compose services (including optional
services) before sampling state. PostgreSQL remains running. External database
clients must be stopped too; active database connections cause refusal. Local mode
requires explicit operator attestation that all writers are stopped. Keep source
services stopped for final cutover. No online-snapshot consistency claim is made.

## Final audit checklist

All filesystem write sites above map to uploads, generated documentation, or backup
storage. No hidden object-store backend, authoritative thumbnail directory, local
AI asset cache, or additional persistent Docker application volume was found.
Whole-table fingerprints include IDs and every stored field; restored PostgreSQL
constraints validate relationships, and every Photo.path is checked against media.
Any future authoritative storage root must be registered before migrations can
claim completeness. Application-managed JSON/free text is copied unchanged and
may contain sensitive user data; administrators must protect the bundle itself.

## Final implementation review: required answers

1. Persistent state consists of PostgreSQL application/migration data, uploads,
   legacy labels, retained routine archives, and administrative migration history.
2. Full bundles include all of these through a complete database dump, regular
   file inventory, retained routine components, and completed history reports.
3. Builds, dependencies, optimized-image caches, documentation/screenshots, and
   on-demand PDFs/QR labels are regenerated from source and restored data.
4. Secrets, OS/Docker identity, TLS/Caddy state, external content, current operational
   locks/holds, safety copies, and previous migration bundles are excluded: they are
   deployment-owned or would create recursion. Sensitive application data remains.
5. Configure database access, original effective TOTP key, URL/timezone, SMTP,
   AI settings/keys, VAPID keys/origin, storage mounts, networking and TLS manually.
6. Routine backup directories retain their original artifacts, names and DB history.
   Historical source paths remain unchanged in the database; the backup browser
   reconnects them by portable folder name when the destination root differs.
7. Only known routine component names are accepted. Nested tar media is checked for
   its documented media prefix, links, and embedded archives. `.migration` outputs,
   partials, safety archives and rollback material never enter a routine folder.
8. Final exports stop all web/worker writers, refuse external DB connections, verify
   snapshot fingerprints again, and keep source stopped through cutover. Normal
   maintenance mode alone is explicitly insufficient.
9. SHA-256 inventories, sizes, manifest validation, gzip checks, required-member
   checks and strict streaming extraction detect corruption; authenticity requires
   a trusted transfer channel.
10. Every public table's sorted canonical rows/counts, sequence values, validated
    constraints, photo ownership/file references, and installed media/backup hashes
    are checked. TOTP decryptability is required before switching destinations.
11. Unknown formats, older destination PostgreSQL, different schema/version/revision
    or migration checksums stop restore. Restore matching source code, then upgrade.
12. Source errors clean incomplete output; interruptions retain recoverable journals.
    Destination restore stages first, retains safety/old DB/files, reverses switches
    on failure where possible, and keeps services held until reviewed release.
13. The integration fixture populated all 129 application tables and verified export,
    staged restore, complete table/file equivalence, encrypted credentials, historical
    backups and rollback; unit tests exercise hostile/corrupt archives and safety.
14. No additional authoritative local application store was found. External URL
    content, original secret keys, native-host orchestration, unsupported links/custom
    roots, and uncertain in-flight third-party effects require the documented manual
    actions. These are surfaced as requirements, refusals or operational review,
    never silently represented as migrated. Structural fixtures do not substitute
    for a production-data rehearsal and domain UI smoke test.
