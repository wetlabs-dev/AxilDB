# Backup storage reclamation and diagnostics

## Findings and remaining uncertainty

Repository investigation confirmed two measurement bugs: the existing Server Management chart samples the **uploads** mount and reuses its snapshot for up to five minutes (`lib/server-metrics.ts`); the old bulk cleanup summed archive lengths and called that sum “reclaimed” without measuring free blocks. Neither proves that Windows host allocation changed or that the backup filesystem gained that space. The previous physical deletion removed the selected directory synchronously, verified absence, then updated history. There was no trash or soft-delete folder to empty. If metadata failed after removal, there was no durable deletion intent for recovery.

No production VM inspection, backup deletion, or space reclamation was performed during this change. The precise explanation for the reported production discrepancy remains unverified. The live diagnostics and read-only host checks below distinguish stale statistics, different mounts, retained copies, open descriptors, concurrent writes, hard links, snapshots and VDI allocation.

## Existing storage lifecycle (before this change)

| Producer | Files and physical location | Tracking / integrity / deletion |
| --- | --- | --- |
| Server Management sitewide backup | `scripts/run-backup-worker.ts` → `scripts/backup.sh` → Python `routine.py`; configured `AXILDB_BACKUP_ROOT` (default `backups`), `axildb-UTC-runID` folder | `BackupRun` history, manifest, dump plus uploads and labels gzip tar files. No recorded-size or checksum columns. Worker parses manifest. Synchronous selected-folder deletion previously marked linked history DELETED. |
| CLI/manual/scheduled routine entry point | Same routine script; default `axildb-UTC`, caller may pass root or `AXILDB_BACKUP_DIR` (including manual names) | No necessary DB history. A shell/system scheduler may invoke it; no automatic age-retention worker exists. Manifest written only after success. Normal errors remove only the exclusively created target; process termination can leave an incomplete folder. |
| Remote pre-upgrade / deployment checkpoint | Host deployment agent `core.py` runs backup service with `/app/backups/deploy-jobID` | Agent job data contains checkpoint name; may be needed for failed-upgrade/manual recovery. No necessary `BackupRun`. Integrity checked by agent; no shared deletion lock with the application worker. |
| Full-instance export / migration / import staging | `scripts/migration/engine.py`, CLI-managed `.migration` control, staging, history and exports; export destination can be supplied by operator | Portable archives include routine backup history as **copies**, uploaded data, labels, DB snapshot and checksum manifest. Removing a routine backup cannot remove embedded copies from a completed export. Staging/partial archives, locks and outbound hold have distinct recovery ownership; all excluded from GC. An export outside backup root is not measured by backup inventory. |
| Routine PostgreSQL dump / compression | Inside the exclusively created routine backup directory; no separate unmanaged dump cache in the routine path | No database volumes are removed. No automatic Docker prune, filesystem trim or VDI compaction exists in this feature. |

Tracked Compose mounts `./backups:/app/backups` into app and workers, including the existing `backups` service (builder image with Python 3). It mounts uploads separately; PostgreSQL uses its own volume. Production overrides may differ. Changing the root variable to an unmounted container-local directory is unsafe for durability: inspect mounts and explicitly plan migration; this change never copies or migrates production data. Multiple historical records can name the same folder; all terminal references are retained and reconciled after physical removal. Active backup references prevent removal.

## Deletion and garbage collection

No schema migration or second registry is introduced. Existing `BackupRun` string scope/status and JSON manifest fields store operation records:

- `BACKUP_DELETE`: REQUESTED → RUNNING → DELETED, or DELETE_FAILED. The original routine history remains until removal succeeds, then is retained with DELETED status. Failed intents remain discoverable.
- `BACKUP_GC`: REQUESTED → RUNNING → SUCCEEDED/PARTIAL. Progress and measured available-space deltas are durable in its manifest.

Single deletion and existing age-cleanup controls now **request** deletion. Verified server-admin authorization, exact folder confirmation, recognized ownership, protected references, canonical root and source identity are checked before a durable intent commits. The interface says “requested,” never “removed” at this stage. Existing retention age controls are unchanged; low space never triggers deletion.

The existing backups worker handles both backup creation and storage jobs, under an owned PostgreSQL session lock that spans filesystem work without keeping a DB transaction open. Other workers cannot concurrently create backups or purge through this worker path. The current migration outbound hold pauses the worker. Browser navigation/disconnection does not cancel jobs. Worker interval defaults to five minutes; pending status does not mean failure.

The worker revalidates protection, canonical root identity, device and directory inode. A Python fd-relative helper atomically renames the intended directory to `.gc-operationID`; this quarantine identity is committed **before** the rename. It recursively traverses open directory descriptors with no symlink following, checks device boundaries/mount points and directory identities, and verifies absence before committing DELETED. Quarantine is a recoverable intermediate state, not a retention/trash policy. A replacement directory at the original name is never removed. A crash during removal resumes the matching quarantine inode. If files are already absent after a crash, the explicit intent permits metadata-only reconciliation. If DB writes fail, the intent remains available for the next worker wake or confirmed retry.

GC preview is read-only. Confirmation includes artifact identities, count, estimated allocation and irreversible-removal wording, plus `PURGE DELETED BACKUPS`. A fresh digest check rejects a stale preview. Cleanup retries only listed explicit deletion intents with matching root and artifact identity, or reconciles their already-absent artifacts. Failures are not retried forever; Scan for garbage and confirm again after correcting the reported cause. Unexpected worker termination leaves RUNNING work resumable. Intent records are not removed automatically.

### Exclusions

- Healthy backups are not deleted by GC simply because they are old, unlinked or large.
- Recognized complete unlinked routine backups appear as orphaned artifacts; deletion requires explicit selection and a valid routine manifest/artifacts.
- Untracked incomplete folders, partial files and unknown entries are reported for manual review, never automatically removed. There is no reliable terminated-job identity for old arbitrary temporary data; no age/grace-period assumption is invented.
- Active backup work, open restore plans and backups with `protected`/`pinned` notes are excluded. These notes are a conservative guard, not a new retention policy.
- **All `deploy-*` checkpoints remain protected**, including from the selected-delete button. The independent host agent may require them for recovery and cannot share this worker lock. Review/remove obsolete checkpoints separately on the host after checking deployment history. Agent unavailability is never treated as permission to delete.
- `.migration`, exports, staging, DB volumes, uploads, labels, Docker resources and paths outside the configured root are excluded. No automatic process termination or container restart occurs.
- Old DELETED history with a physical folder but no identity-bearing intent is not sufficient authority to purge a possibly recreated artifact; select the recognized folder again after review.

## Measurements and UI

The admin-only Backup storage panel independently fetches current measurements on load, Refresh storage, Scan for garbage, and every five seconds while queued/running work is visible. It refreshes backup inventory when worker work completes. Data is not taken from the five-minute historical metric snapshot. Historical uploads-based charts remain clearly labelled.

- Backup allocation: sum of `st_blocks * 512` on the backup filesystem, distinct from logical archive lengths; symlinks are not followed and hard-link inodes are deduplicated.
- Filesystem capacity: `blocks * blockSize`; used: `(blocks - bfree) * blockSize`; available: `bavail * blockSize`. Reserved free blocks are separate. The measurement target is the real configured backup directory, never a guessed root or uploads path.
- Before/after available-space difference is measured around removal and GC. It is the **observed net filesystem change**, influenced by other writes, hard links, compression, snapshots and open files. No increase is reported accurately; nominal archive size is never represented as actual reclamation.
- Missing paths, unreadable inventory and unavailable metrics display unavailable/manual-review states, not invented zeroes. Recorded-size comparison is unavailable because routine `BackupRun` records have no size column. Missing-history/archive and incomplete/unknown data are classified without rewriting ordinary history automatically.
- Linux mount info reports the container-visible mount point, filesystem type and source. The host bind source and named-volume ownership cannot reliably be inferred inside a container; use Docker inspect.
- `/proc` diagnostics deduplicate visible open deleted file inodes on the backup filesystem and report PID, descriptor and allocated bytes. This is restricted to the container PID namespace/permissions; it does not rule out host or other-container open descriptors. No filenames or backup contents are exposed to ordinary users.
- Guest free space does **not** describe the allocated Windows VDI size. Removing guest files ordinarily frees guest blocks but does not automatically shrink the dynamic virtual disk. No trim, zero-fill, compaction or disk resize is performed.

## Read-only production investigation

Run these on the Ubuntu host; first obtain the actual host path from the deployed app/worker mounts, including Compose overrides. Do not substitute an assumed directory.

```sh
docker compose ps
docker inspect "$(docker compose ps -q app)" --format '{{json .Mounts}}'
docker inspect "$(docker compose ps -q backups)" --format '{{json .Mounts}}'
# Set BACKUP_PATH to the verified host source, then inspect it:
df -hT "$BACKUP_PATH"
du -sh "$BACKUP_PATH"
findmnt -T "$BACKUP_PATH"
# Optional if installed; root access broadens visible process descriptors:
sudo lsof +L1
# Docker accounting only, no pruning:
docker system df -v
```

Compare df availability with the panel's resolved-path filesystem and timestamp. Inspect `.migration` allocation separately if present; do not remove staging, holds or export archives without their own recovery review. If an open deleted file retains blocks, identify the owning process and arrange for it to close the descriptor during an appropriate maintenance window; do not kill database/deployment processes to force reclamation. Docker images/build cache, snapshots and Windows VDI allocation are separate investigations. Finish pending deletion/quarantine work before starting a full-instance export; the migration exporter deliberately rejects unknown backup-root entries rather than silently omitting them. No production orphan list can be established from repository inspection alone; Scan for garbage supplies the actual inventory after deployment.

## Deployment and validation

Use normal **Web deployment**, refreshing the app and existing `backups` worker image together. No Compose topology, deployment-agent protocol/configuration, schema migration, extra service, scheduler or host package is required. The existing builder image already includes Python 3. If the backups worker is disabled, requests remain pending; enable the existing service. No production operations are performed merely by installing this update; queued explicit deletion requests are executed by the worker.

`npm run check:backup-storage` requires a disposable migrated database at localhost:55439/axildb and a non-root test user. It creates private temp roots and verifies durable intents, real removal, measured free-space change, dry-run immutability, history preservation, session-lock concurrency, interrupted quarantine, post-removal metadata recovery, permission failure/retry, inode replacement, traversal/symlinks, protected/active work, stale preview, unknown and partial data preservation.

`npm run check:backup-storage:ui` additionally uses Chrome and a production app on port 3107 with the same dedicated `axildb-storage-ui-*` temp root. It checks actual Server Actions, admin authorization, queued-vs-removed feedback, disconnected-browser completion, GC preview/confirmation/retry/progress, fresh measurements and desktop/tablet/mobile layout. `scripts/check-backup-deletion-ui.mjs` forwards to this current lifecycle suite. `npm run check:backup-deletion` forwards to the same isolated lifecycle suite; the obsolete synchronous removal path has been removed. All fixtures are disposable; never aim these scripts at production storage.

The fd-relative helper is also covered by `python3 scripts/check-purge-backup.py` and was verified as an unprivileged user inside a Linux backups-worker image. Production build, TypeScript, targeted lint and the lifecycle/browser suites passed during implementation.
