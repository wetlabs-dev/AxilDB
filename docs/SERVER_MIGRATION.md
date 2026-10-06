# AxilDB server migration

Full instance migrations are offline, provider-neutral exports for moving an entire
installation. Routine backups retain their existing folder format and entry point.
Both use the same streamed PostgreSQL/archive primitives. See
[PERSISTENT_STATE.md](PERSISTENT_STATE.md) for the audited inventory.

## Prerequisites and support boundary

Run host commands from the **deployment checkout**, with Python 3.12+, Node/npm,
Docker Compose v2, and permission to manage the deployment and its bind mounts.
The web container never receives the Docker socket. PostgreSQL client tools run in
the existing Compose `db` container. Python is also installed in the builder image
for routine backup workers. Rebuild that image when deploying this change.

The default database/user are `axildb`/`plants`, matching Compose. For a customized
deployment use `--database NAME --user ROLE` (or AXILDB_PGDATABASE/AXILDB_PGUSER).
The role needs database creation/rename privileges; the standard deployment role
has these. For other container orchestrators use `--container CONTAINER
--services-stopped`; the latter explicitly attests that **all writers** have been
stopped externally. Native non-container PostgreSQL orchestration is not provided
by the full migration CLI. The bundle is portable; deploy the standard Docker stack
on the destination Linux VM. Windows hosts require WSL/Linux for the host worker.

Run as the storage owner or a suitably privileged service account. Default Docker
containers run as root and may create root-owned control files; a root-owned host
worker is appropriate in that deployment. Control files and bundles are private
(mode 0700/0600). Do not expose `backups` through the reverse proxy. Custom backup
roots must have matching host/container mount configuration.

## Preparing the source

1. Deploy this feature and rebuild the backup worker image.
2. Review persistent storage and free space. Resolve any missing photo references,
   unsupported symlinks, custom upload-root aliases, unexpected backup-root entries,
   or nested archives in retained routine media before export. Refusals identify
   the issue; no legacy archive is silently removed.
3. Record the deployed revision. With a Git checkout this is automatic. For source
   distributions without `.git`, ship a `REVISION` file containing the commit SHA,
   or set `GIT_COMMIT`/`SOURCE_COMMIT`. Container builds also accept
   `docker compose build --build-arg GIT_COMMIT=THE_COMMIT_SHA` and stamp REVISION.
4. Preserve the **original effective TOTP_ENCRYPTION_KEY** separately. Older installs
   may use AUTH_SECRET or the development fallback; configure the same effective
   material as TOTP_ENCRYPTION_KEY on the destination. Do not generate a new key
   for encrypted existing accounts. Keys are never included in the archive.
5. Review source timezone, public URL, AI worker settings, SMTP, and VAPID keys.
   The bundle lists required setting names, never environment secret values.

```sh
npm run migration -- preflight
npm run migration -- create
```

Preflight records table counts, database bytes, separate media/label/history/backup
sizes, and a conservative uncompressed estimate. Actual compressed size depends
on the data. Generation checks archive-volume free space; restore also checks the
PostgreSQL data volume and each destination storage volume. Allow several times
both source and destination sizes for staging, safety archives, and rollback.

## Browser workflow and durable host worker

Open **Server Management → Backup & Restore → Full Instance Migration**. Only
SERVER_ADMIN users with completed two-factor authentication can access operations.
Refresh the estimate, acknowledge downtime, and request a bundle. The browser
queues a durable JSON job; it never assembles an archive or buffers a download.

Run a host worker under your service supervisor:

```sh
npm run migration -- worker
# Or process one queued operation, suitable for a host scheduler:
npm run migration -- worker --once
```

A sample service is in `scripts/migration/axildb-migration.service`; adjust its
WorkingDirectory and executable paths before installing it with your normal host
administration process. Do not run multiple supervisors. An OS file lock prevents
concurrent operations and releases on process death. The worker deliberately stays
outside Compose, because it must stop application containers.

Jobs record actor, timestamps, stage, failure, manifest, archive hash/size, and
restore/recovery details. Their reports live in `backups/.migration/jobs`. The UI
shows the latest 25 operations and streams detailed reports on demand. The complete
history stays on disk. Download, inspect, revalidate, and delete completed bundles
there. Deletion requires typing the archive name and retains history.

The page becomes unavailable while application containers are stopped. Follow
`journalctl`/worker output for live stages; refresh the page when services return.
An interrupted RUNNING operation blocks further mutation jobs. Recover it explicitly
instead of blindly restarting a destructive operation.

## Maintenance mode and consistency

Existing Maintenance Mode is an access screen; administrators and workers can
still write. Announce downtime and enable it for visitor messaging, but do **not**
treat it as a write barrier.

The host migration worker stops every running Compose service except `db` and
`caddy`, draining/stopping web requests, photo writers, reminders, event processing,
AI, moderation, metrics, and routine backup workers. It refuses export/restore if
other PostgreSQL client connections remain. Stop external clients, cron writers,
and any separate processes too. Do not restart writers while migration runs.
Table fingerprints are checked again after archive creation to detect unexpected
concurrent database changes. File checksums detect changes during archiving.

For the final cutover:

```sh
npm run migration -- create --keep-stopped
```

The source remains stopped after completion (also on failure). This prevents new
source writes after the final snapshot. The default creation command restarts only
services that were running before it began, making it useful for rehearsal exports.
Creating a bundle does not modify source domain records or delete source backups;
only administrative audit/history records are added.

## Transfer and fresh destination

Keep bundles private: they include account hashes, session/subscriber tokens,
encrypted authentication records, photos, and all application data. SHA-256 detects
corruption, **not authenticity**. A PostgreSQL dump contains executable SQL: restore
only bundles obtained from a trusted administrator over an authenticated channel.

For example, Lightsail to a generic Linux VM:

1. Deploy the source AxilDB revision on the VM. Configure Docker/Compose, storage,
   firewall, Caddy/reverse proxy, TLS, and the destination environment independently.
2. Start the destination normally to check infrastructure, or start only `db` for
   an empty database. Do not point public traffic at it yet.
3. Transfer the final bundle using authenticated SCP/SFTP, such as
   `scp backups/.migration/axildb-migration-ID.tar.gz admin@new-vm:/secure/`.
4. Compare the complete archive SHA-256 with the source job report using `sha256sum`
   (or `shasum -a 256` on macOS). Then run built-in verification on the received copy.

Do not put imported bundles in the routine backup root. `/secure` is an example
operator-owned transfer directory; the CLI accepts an explicit archive path but
the web UI does not browse arbitrary server paths.

## Inspect, validate, restore

```sh
npm run migration -- verify /secure/bundle.tar.gz
npm run migration -- inspect /secure/bundle.tar.gz
```

`verify` checks the supported format, manifest/inventory, every file size and SHA-256,
required dump, duplicate entries, archive paths, gzip integrity, and resource limits.
It is independent of application authentication and database availability.
`inspect` additionally checks the destination application/schema/migration history,
PostgreSQL version and dump readability; start the destination database first.
Both print a machine-readable report including all source table counts and hashes.

Restore requires an explicit destructive flag even for a fresh database:

```sh
# Export the destination's separately transferred TOTP key into this shell securely.
# It must also be configured identically in the destination app environment.
npm run migration -- restore /secure/bundle.tar.gz --confirm-destructive-restore
```

The command stops destination writers and creates a destination outbound-service
hold. It verifies the entire bundle and compatibility before touching destination
state, makes a full destination safety archive, then restores a **new database**
with `pg_restore --single-transaction --exit-on-error`. It validates all table
fingerprints, sequence states, PostgreSQL constraints, photo ownership/file references,
and decryption of every stored two-factor secret/recovery payload using the supplied
key. A wrong/missing key stops restore before the switch.

Files are staged on their destination filesystem. The original database is renamed
to a recorded rollback database; staged database and files switch into place while
all services remain stopped. Every rename is journaled before execution. This is
not a distributed atomic transaction: failure recovery reverses completed renames.
The original database, media directories, backup folders, and safety archive are
retained until the operator explicitly retires them after the rollback period.

## Post-restore verification and release

```sh
npm run migration -- verify-restored /secure/bundle.tar.gz
```

Run before starting application traffic. It compares every public table's complete
canonical row stream (including IDs, application settings, and job/subscriber state),
counts, sequence state, constraints, photo references, installed media and retained
backup checksums, and detects unexpected destination files. Normal application
writes, new audits, or worker activity afterward will legitimately change fingerprints;
a later mismatch must not be described as proof of migration data loss.

Read the destination job report for the source revision, archive manifest, safety
archive, rollback database, per-table verification, duration timestamps, and required
configuration. Restore completion itself is recorded in this durable administrative
report; inserting a new database audit row before equivalence verification would
change the snapshot. Initiation is also recorded in the destination's pre-restore
audit database/safety archive. UI requests/downloads/inspection/deletion and export
completion use the existing AuditLog system.

You may start **only the app** for a private smoke test (`docker compose start app`).
Do not run the `migrate` bootstrap service against the restored database during
verification; use the matching revision and already-restored migration history.
The hold prevents email/push and background AI/event/moderation work even if their
containers are accidentally started. Test account login/2FA, images, collections,
propagation lineage, care, locations, provenance/acquisitions, exhibits, and libraries.
Review SMTP/public origin/timezone, AI credentials/budgets, and push keys.

Review queued/stale event and AI claims in Server Management before resuming.
Database idempotency keys, delivery records and scheduling timestamps are preserved,
not recreated or backfilled. External side effects already sent but not acknowledged
at the moment a worker stopped cannot be proven from a database snapshot; review
in-flight jobs before releasing to avoid replaying such effects. The system does
not claim exactly-once delivery across third-party providers.

After confirming configuration and pending work, stop the app again if needed for
one last equivalence check, then release using the restore **job ID**:

```sh
npm run migration -- release JOB_ID --confirm-destination-configuration
```

This removes the destination outbound hold and restarts the services that were
running before restore. For a destination initially running only `db`, explicitly
start the desired already-created app/worker services afterward. It does not invent
or enable services you previously disabled. Set email to log mode if a staged mail
test is needed. No historical email is automatically discarded during restore.

## Recommended cutover

Deploy destination → configure infrastructure → test startup → rehearse migration →
announce maintenance → stop source and create final bundle with `--keep-stopped` →
verify and transfer → inspect destination copy → restore → verify → private smoke
test → review mail/AI/timezone/queued work → release destination services → switch
DNS/reverse proxy → confirm public and authenticated access → keep old server intact
and stopped for a rollback period → decommission only after acceptance.

Keep the source stopped throughout cutover; never run both instances' outbound
workers against the same users. If reverting DNS after users have written to the
new server, reconcile those new writes explicitly; the old snapshot cannot contain
data created after cutover.

## Failure, restart recovery, and rollback

Creation failure removes incomplete output and temporary staging in normal error
handling. A process kill can leave private `.partial`/staging files and a RUNNING
journal, never a completed-looking published bundle. Inspect the report, then:

```sh
npm run migration -- recover JOB_ID --confirm-destructive-restore
```

Recovery stops writers, reverses journaled filesystem/database renames, and cleans
owned temporary archive/staging paths. Ambiguous states stop with an actionable
error; services stay stopped. It never guesses which database to discard. Use the
recorded safety archive and rollback names for manual recovery if storage was lost.
Normal restore exceptions attempt this rollback automatically and record either
FAILED_RECOVERED or the recovery error. Outbound hold remains until explicit release.
Do not recover a completed restore after accepting new destination writes without
first backing up those new writes: recovery intentionally restores the old destination.

Retained staging/rollback databases, old media directories, and safety archives use
disk until explicitly cleaned by the operator. Their names are in the report. They
are excluded from future bundles and routine cleanup. Keep them until acceptance,
then delete only the exact artifacts in the reviewed report using normal DBA/host
tools. Retention is deliberately not automatic.

## Compatibility and intentional limits

Format v1 is explicit; unknown versions are rejected. Source and destination must
have matching Prisma schema bytes, application version, applied migration checksums,
and matching revision when both revisions are known. Historical rolled-back migration
attempts are preserved without being treated as applied schema; unresolved failures
are refused. Missing revision produces a
warning. Deploy the source revision first, restore, then upgrade normally. Automatic
cross-schema upgrades inside restore are intentionally refused. Destination
PostgreSQL must be at least the source major version; the staged restore provides
an additional compatibility check before switching.

Only regular files are portable in v1; symlinks/special files and nested routine
media archives are refused rather than silently excluded. Filenames/relative paths
and file timestamps survive; destination ownership/access modes are set for the
deployment, not copied from the source machine. Empty directories can be recreated.
Custom PostgreSQL roles/grants are deployment configuration (`--no-owner --no-acl`);
AxilDB user/collection permissions remain in the database.

## Automated validation

```sh
npm run check:migration
npx tsc --noEmit
npm run build
```

The opt-in integration test requires a disposable PostgreSQL 16 container named
`axildb-migration-test-*` with user `plants` and database `postgres` accessible:

```sh
docker run -d --name axildb-migration-test-local -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=plants postgres:16-alpine
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/axildb-test-schema.sql
python3 scripts/migration/integration.py axildb-migration-test-local /tmp/axildb-test-schema.sql
python3 scripts/migration/cli_integration.py axildb-migration-test-local
# After inspecting results, remove only this disposable test container.
docker rm -f axildb-migration-test-local
```

It creates isolated databases with FK-valid records in every application table,
including encrypted two-factor credentials and polymorphic photo references,
exports, restores over a populated destination, verifies all table/file fingerprints,
and reverses the switch to verify rollback. It does not access the production DB.
This structural fixture supplements rather than replaces the administrator's
real-data rehearsal and browser smoke test.

The real CLI integration additionally exercises empty-database restore, inspect,
confirmation gates, outbound hold/release, and repeated recovery. Cross-version
validation also passed from PostgreSQL 16 to 17 with Prisma migration history.
The local browser smoke test (`scripts/check-migration-ui.mjs`) checks administrator
access, denied anonymous/non-admin downloads, streamed downloads/reports, durable
requests, and mobile overflow using the disposable fixtures; it never targets a
production hostname.
