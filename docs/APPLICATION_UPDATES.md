# Application updates

## Inspected deployment topology

The repository's `docker-compose.yml` defines `app` (standalone Next.js runner), six builder-image workers (`reminders`, `image-moderation`, `ai-curator`, `events`, `metrics`, `backups`), a one-shot `migrate` builder service, PostgreSQL `db`, Caddy `caddy`, and an optional `docs` profile. Source is copied into images, not mounted in the running app. Uploads, labels, manuals and backups are bind mounts relative to the Compose project directory; PostgreSQL and Caddy use project-scoped named volumes. The Dockerfile supports a `GIT_COMMIT` build argument and writes `REVISION`. The repository uses `main`, with package.json version 0.2.0; no tagged release policy is assumed.

Migrations run explicitly through `scripts/deploy-migrations.sh` in the one-shot migration service, followed by bootstrap. The app entry point only starts Next.js. Routine backups use `scripts/backup.sh` and `scripts/migration/routine.py`, producing a PostgreSQL custom dump, uploads/labels tar archives and a manifest. Existing backup/restore and migration-hold workflows remain authoritative. Administrator authorization uses `requireServerAdmin` and verified two-factor authentication. No existing deployment readiness endpoint or upgrade job store was found.

Caddy's checked-in configuration forwards to `app:3000`. Cloudflare Tunnel is not defined in the repository. `.env` and optional `/etc/axildb/axildb.env` supply app/worker secrets. The local origin is HTTPS GitHub; production Git authentication, checkout path, Compose project name, override files and proxy/tunnel topology are not available from this checkout. Bootstrap requires the operator to specify and verify these actual host values. It must not infer a VM path or touch unrelated infrastructure.

## Architecture and trust boundary

`Application Updates` calls authenticated administrator-only Next.js endpoints. The backend signs protocol-v1 operations with HMAC-SHA256 using a file-mounted random key. The browser never receives that key. The host agent only listens on a permission-restricted Unix domain socket; it has no TCP listener and must never be routed through Cloudflare. Timestamps, single-use nonces, strict operation payloads, persistent per-actor rate limits, backend CSRF/origin checks, verified two-factor authorization and AxilDB audit records protect operations. The app receives only the agent socket directory and its authentication key, never the Docker socket, host checkout, host Git credentials or private job store.

The dedicated `axildb-deploy` host identity has Docker access, which is effectively administrative control of the host. It is **not a security sandbox**. A compromised trusted backend with the agent key can request deployment of code on the approved channel. Protect server-admin accounts, Git branch permissions, the agent configuration, credentials and host service accordingly. systemd filesystem/kernel restrictions provide defense in depth; Docker can bypass many host restrictions. Source fetched from the configured trusted channel executes during builds and deployment only after administrator confirmation. There is no generic command, path, repository or Compose-argument API.

The independent Python stdlib agent lives in `/opt/axildb-deploy`, outside releases and Compose. Host-local SQLite (WAL) stores jobs, ordered events, nonces, limits and deployment metadata in `/var/lib/axildb-deploy`, mode 0700. A process flock prevents duplicate agents; an atomic SQLite active-job constraint prevents concurrent deployments across requests or restarts. An interrupted operation never blindly replays migrations or container operations. Unstarted queued jobs may run after restart. Interrupted pre-replacement work fails without replay; interruption after replacement begins requires reconciliation. Recovery-required jobs block new deployments.

## One-time Ubuntu bootstrap (local/SSH administration)

Do not run these instructions on production without reviewing the host configuration and arranging a maintenance window. The application does not install its own host privileges.

1. Check the actual deployment directory, branch, Git remote and Compose project/override files from the existing host deployment and container Compose labels. Do not create a second project name: that would create different volumes/networks. Resolve any dirty tracked/untracked source changes without discarding them. Confirm which app workers are actually deployed.
2. Ensure the host has Python 3.10+, Git, curl, Docker Engine and current Docker Compose v2 (supporting the repository's optional env-file syntax). Docker must use a local Unix daemon. Size both the release filesystem and Docker storage for builds plus preserved previous images; default free-space reserve is 10 GiB on each. A rootless/remote Docker daemon or a deployment checkout using Git submodules needs separate host integration; this installer does not configure them.
3. Review `scripts/deployment-agent/config.example.json` into an operator-owned file. Replace every placeholder with actual host values. `compose_files` must list the existing production files in their normal order, followed by `/etc/axildb/deployment-connection.json`. Set `env_file` to the actual interpolation environment file. Preserve additional existing overrides. The file must be readable by the service identity; it is never copied into a build context.
4. Choose the local proxy probe. For the checked-in Caddy TLS sites, `proxy_health_url=https://app.axildb.com/api/health/ready` with `proxy_resolve_address=127.0.0.1` pins the connection directly to host Caddy while retaining TLS certificate verification and SNI. It does not traverse Cloudflare or change DNS/Caddy. Use the actual deployed hostname. Alternatively specify an existing private loopback HTTP proxy listener and omit the resolve field. A Cloudflare-only public probe, an HTTPS certificate bypass, or an unconfigured example port will fail preflight.
5. Run `sudo sh scripts/deployment-agent/install.sh /absolute/path/to/reviewed-config.json`. This creates the dedicated service identity, Docker group membership, root-managed code/configuration/key, a connection overlay, systemd unit and narrow filesystem drop-in; enables the independent service; and performs an authenticated agent probe. It will not overwrite an existing different config/key or update a running agent. The probe can report application readiness unavailable until the first manual deployment is complete.
6. Provision Git authentication **for the agent identity**, separately from the web app. Reuse the established deploy-key/credential-helper mechanism, read-only repository credentials where possible, and a deliberately verified `known_hosts`. The agent sets `BatchMode=yes`, `StrictHostKeyChecking=yes`, and disables interactive Git prompts. It never disables host-key verification. Do not put credentials in Git URLs, application records or browser requests. Do not copy an administrator's whole home directory into the service account.
7. Grant the identity the minimum normal filesystem access required to fetch the configured repository, update `.git` worktree metadata, read the actual environment/Compose files and maintain the checkpoint directory. Do not recursively change ownership of the production checkout or environment files without reviewing existing owners. The installer does not do so. For a checkout below a home directory, check ancestor traversal permissions and the unit's `ProtectHome=read-only`. The state and authentication key must remain outside the application checkout; state must not be covered by an app bind mount. If Git reports dubious ownership for a checkout deliberately owned by another identity, add only that exact reviewed checkout to the agent identity’s Git `safe.directory`; never use a wildcard. Confirm `systemctl status axildb-deploy` and `journalctl -u axildb-deploy`.
8. **Manually deploy this first version** using the existing project's complete Compose file list plus the connection overlay. Pass the exact full commit using `docker compose ... build --build-arg GIT_COMMIT=<reviewed-40-character-sha>` for app and builder services, run the established migration/bootstrap service, and recreate the configured application workers with the overlay. Do not recreate the database, proxy or tunnel just to enable the interface. The first manual rollout adds the readiness route, records `REVISION` in the images, fixes libpq backup connection handling and mounts only the private socket/key. It deliberately does not run an upgrade via an uninstalled agent.
9. Verify `/api/health/ready` through the configured local proxy and app, and run `sudo -u axildb-deploy /usr/bin/python3 /opt/axildb-deploy/agent.py --probe`. Open **Server Management → Application Updates**, Check for Updates, and run preflight on a later reviewed commit. Treat each failed preflight as a configuration problem; there is no bypass.

The default app image runs as root, so it can read the dedicated read-only key and Unix socket mounts. If you separately run containers with non-root/user-namespace mapping, explicitly arrange matching socket-group/key read access without making either world-readable. The runtime directory is preserved across agent restarts so the app's directory bind mount continues seeing the newly created socket. Rotate the key only during a planned manual agent/app restart; a bind-mounted single key file must be remounted after replacement.

## Configuration reference

All configuration is host-owned JSON; no browser form can change it. The example includes:

| Field | Purpose |
| --- | --- |
| `repository`, `trusted_remote`, `remote`, `branch` | Existing checkout, exact remote identity and approved simple branch name; no browser-supplied repository/ref |
| `project`, `compose_files`, `env_file` | Existing Compose project and ordered host configuration/interpolation files |
| `app_service`, `worker_services` | Explicit app/worker allowlist; database, migration, proxy, docs and cloudflared cannot be recreated as application services |
| `migration_service`, `database_service`, `backup_service`, `backup_dir` | Existing production migration service, database dependency and backup mechanism/mount |
| `state_dir`, `socket`, `secret_file` | Private durable host store and authenticated Unix IPC; standard installer uses the documented fixed paths |
| `health_path`, `proxy_health_url`, `proxy_resolve_address` | Lightweight readiness, direct local proxy verification with optional TLS loopback resolution |
| `minimum_free_bytes` | Minimum release and Docker storage free space; estimate/reserve, not a promise that every build fits |
| `command_timeout_seconds` | Bounded subprocess timeout (default 1800s); whole job also bounded to four command timeouts |
| `health_timeout_seconds`, `stabilization_seconds` | Readiness deadline and continuously healthy interval |
| `log_retention_days`, `history_retention_days` | Event and historical job expiry; active/recovery jobs are protected |
| `known_good_image_retention` | Minimum recent successful deployment records kept beyond time expiry; images/configs/releases are conservatively retained until host-operator cleanup |

The state/image reserve and disk checks fail closed if the agent cannot inspect Docker's local storage filesystem. This targets native Ubuntu Docker; Docker Desktop requires a test-specific storage adapter and is not the production installation target. Branch names are limited to simple identifiers in v1. There is no automatic release/image cleanup: never remove artifacts referenced by active/recovery jobs. Provision disk monitoring and manually retain at least the configured number of known-good image sets. The web view lists the latest 100 retained jobs; the private store retains additional history until its configured expiry.

## Remote workflow and job lifecycle

Check for Updates fetches the configured branch after checking the exact Git remote identity and clean working tree. It resolves a full immutable SHA, checks fast-forward ancestry from the **running image's** `REVISION`, and shows the commit count and up to 30 summaries. An up-to-date installation offers no upgrade. A dirty tree, unknown running image revision, unreachable remote, missing credentials, divergence, or agent protocol mismatch blocks deployment.

Run Preflight checks the exclusive slot, exact approved target, Docker/Compose, files/secrets, storage, configured services/mounts/images, existing backup/database capability, current app/proxy health, target agent protocol and migration history. The agent never infers version from an advancing branch pointer. Unknown initial deployment timestamps are labeled as unknown; package 0.2.0 is the actual package version, not an invented release version.

Review Upgrade shows the target and explains the backup, build, migrations, restarts and downtime. Only **Start Upgrade** creates an idempotent persistent request. The agent revalidates preflight and the exact approved channel head before execution. If the remote advances after approval, it aborts for a new review; it never substitutes a newer SHA.

Stages are QUEUED → PREFLIGHT → BACKUP → FETCHING → PREPARING → BUILDING → MIGRATING → DEPLOYING → VERIFYING → COMPLETED, with FAILED and RECOVERY_REQUIRED outcomes. Preflight and builds do not replace the running app. A verified checkpoint reuses `scripts/backup.sh`, checks required artifacts, fully reads the PostgreSQL dump through `pg_restore --file /dev/null`, and streams gzip/tar validation without restoring or extracting files. The checkpoint records `deploy-<job-id>` beneath the configured host backup directory. Earlier backups are not deleted. libpq tools receive individually parsed connection variables, including decoded credentials and supported SSL options, rather than leaking a database URL through command arguments.

An isolated detached Git worktree is prepared under private state. Build contexts point there; Compose's project directory, bind mounts, environment/secrets and named volumes retain their original host paths. Host Compose configuration remains pinned; a target change to the tracked host Compose files requires manual deployment review. The agent builds revision-tagged app and builder images, preserves previous immutable image IDs and configuration, and never prunes Docker resources. New application code is not copied into the production checkout.

New migrations must preserve every prior migration file. Potentially destructive SQL (DROP, TRUNCATE, DELETE, ALTER TYPE/RENAME) requires explicit migration review in the web interface. Preflight displays the exact new SQL and Git blob identities. Review Upgrade requires a separate risk acknowledgment and typed target revision; Start Upgrade sends the reviewed digest, which binds the previous running revision, target commit and migration blob manifest. The agent validates this digest at queue creation and again during execution and persists it with the administrator/job. SQL without these keywords follows the existing ordinary confirmation path. Edited or deleted historical migration files remain blocked; unexpected migration artifacts and SQL exceeding the 256 KiB web review limit require host review. All other critical preflight checks still block deployment. This is conservative screening, **not a SQL safety proof or a backward-compatibility guarantee**. All approved new migration files are shown before confirmation. Builds precede migration execution. For a schema transition the app and configured workers stop before the existing migration/bootstrap command runs; the database, proxy and tunnel remain up. A failed migration is treated as potentially partially committed and is never automatically retried or restored. With no new migrations, the migration stage is explicitly NOT_REQUIRED.

Deployment uses `compose up -d --no-deps --no-build --pull never` only for the configured app workers; the already built images are deployed. No `down`, volume deletion, database reset or system-wide cleanup is used. Health verification reads the actual running revision and checks `SELECT 1` readiness, all configured workers running, and direct local proxy reachability over a stabilization interval. Success is recorded only after verification.

## Progress, logs and disconnections

The agent continues when the browser closes or the web app is replaced. The browser remembers the job ID, polls durable status and replays ordered events through SSE with polling fallback. Retry intervals increase to a 30-second cap. Temporary unavailability shows a reconnect message, not a false job failure. Reopening the page finds the active job. Renew an expired administrator session to regain access.

Detailed logs have timestamp/stage/severity, auto-scroll pause, copy and download. Responses contain only sanitized operation output, never full environment/Compose files or unrestricted host/container logs. Known configured secrets, credential URLs and common token patterns are redacted; avoid printing secrets at source in build scripts. Logs cap at 20,000 entries per job and 4,000 characters per event; the browser shows the latest 2,000 and downloads all retained entries. A private previous Compose snapshot can contain environment secrets and remains under mode-0700 host state, never in application responses or backup archives.

## Failures and recovery

Before replacement, failure leaves app containers running and permits a fresh reviewed attempt. After replacement starts, a failure blocks further upgrades as **Recovery Required**, retaining the failed stage, previous revision/images, checkpoint, migration status and events. Agent restarts do not replay interrupted commands.

**Application-only recovery** is offered only when the job introduced no new migration files, a live fingerprint of migration history **and the actual schema dump** still matches the pre-deployment fingerprint, previous image IDs still exist, and the private previous Compose snapshot is available. An explicit confirmation queues recovery on the independent worker. It deploys captured previous image IDs with the prior configuration and re-verifies revision, database and proxy health. It does not restore any database or reverse migrations. A schema-changing deployment never qualifies automatically.

**Verify and Reconcile Running Target** only checks an already running approved target after interruption, then records success; it cannot replay migrations or clear an unknown migration outcome. If a migration may have partially committed, investigate from SSH. Inspect `journalctl -u axildb-deploy`, the recorded checkpoint, Prisma migration history and actual service state. Use the existing host migration/restore workflow only with separately reviewed explicit authorization. Restore may discard data written after the checkpoint. Do not reset PostgreSQL, delete volumes or guess `prisma migrate resolve` values.

After manual recovery and explicit schema review, stop the agent and run:

```sh
sudo systemctl stop axildb-deploy
sudo -u axildb-deploy python3 /opt/axildb-deploy/agent.py --resolve-job <recorded-job-id> --acknowledge-manual-migration-review
sudo systemctl start axildb-deploy
```

This host-only command verifies that either the recorded target or previous revision is healthy before reconciling history. It does not change application data, run migrations or deploy containers. If neither recorded revision is running, reconcile the host deployment manually first.

## Agent updates and disabling

Agent code is not upgraded by application deployment. When no job is active or awaiting recovery, stop the service, review/copy the new agent files through the installer, verify protocol compatibility and restart/probe it. Preserve config, key, SQLite, images and releases. The installer refuses to replace a running agent or silently overwrite different configuration. A future app requiring another `minimumAgentProtocol` must wait for a separate host-agent upgrade.

To disable remote deployment, first finish/reconcile active work, disable/stop `axildb-deploy`, then remove the connection overlay from the next **manual** app deployment and unset the two backend IPC variables. Preserve durable state and checkpoints for recovery/history. Never remove state or credentials underneath an active job.

## Verification

- `npm run check:deployment-agent`: real temporary Git repositories, SQLite and authenticated Unix HTTP transport; deterministic Docker boundary for failure injection, restart/queue recovery, immutable approval, concurrency, credential replay, injection rejection, backup failures, schema drift, missing images and compatible/incompatible recovery.
- `npm run check:deployment-agent:docker`: isolated randomly named Compose project with real image builds, PostgreSQL, the production Prisma migration script, the existing backup script, actual app-container replacement and a host-local Caddy proxy. A minimal fixture readiness app replaces Next.js only in this orchestration test. It seeds and checks all seven requested data categories and files, proves database/proxy container identities remain unchanged, and retains verified job history. Test-only cleanup removes only its own project resources. It requires the local `axildb-migrate:latest` builder fixture image; Ubuntu/native Docker runs the normal storage preflight, while the macOS test adapter accounts for Docker Desktop's VM-only storage path.
- `npm run check:application-updates:ui`: Chrome, a disposable database at localhost:55439/axildb and a real signed Unix agent connection; simulates the Docker boundary and application HTTP outage to test authorization/2FA, origin checks, invalid payloads, confirmation/cancel, idempotency, replay, reconnect and mobile layout. It does not upgrade a real installation.

Initial installation and systemd operation still require host verification on the actual Ubuntu VM. Automated checks cannot determine its private Git credentials, exact topology, disk capacity or migration compatibility. No production upgrade or data restore is performed as part of implementing this feature.

## Implementation files and persistence

| Area | Files |
| --- | --- |
| Independent agent, protocol, durable state and execution | `scripts/deployment-agent/core.py`, `scripts/deployment-agent/agent.py`, `deployment-protocol.json` |
| Host bootstrap and operator settings | `scripts/deployment-agent/install.sh`, `scripts/deployment-agent/axildb-deploy.service`, `scripts/deployment-agent/config.example.json` |
| Backend IPC, authorization and event streaming | `lib/deployment-agent.ts`, `app/api/server/application-updates/route.ts` |
| Administrator page and navigation | `app/server/application-updates/page.tsx`, `components/ApplicationUpdates.tsx`, `app/server/page.tsx` |
| Running revision and database readiness | `lib/application-revision.ts`, `app/api/health/ready/route.ts` |
| Secret exclusion and existing backup/restore safeguards | `.dockerignore`, `scripts/migration/routine.py`, `lib/ai-curator.ts` (restore hold checked before acquiring its database worker lock) |
| Automated checks | `scripts/deployment-agent/test_agent.py`, `scripts/deployment-agent/docker_integration.py`, `scripts/deployment-agent/ui_fixture.py`, `scripts/check-application-updates-ui.mjs`, `package.json` |
| Operator and user documentation | `docs/APPLICATION_UPDATES.md`, `README.md`, `lib/user-manual.ts`, generated `docs/USER_MANUAL.md` and `public/manual/USER_MANUAL.md` |

No Prisma schema migration is required for deployment management. The agent creates its own private SQLite schema at startup; app replacement and application-database availability do not determine job survival. Routine production Compose configuration is unchanged; the operator explicitly adds the separate host connection overlay during initial manual rollout.

Implementation verification on October 18, 2026 exercised twenty agent tests, twenty-nine existing migration/backup unit tests and the existing migration/worker-hold checks, actual isolated Docker upgrade plus schema-compatible application recovery, and Chrome authorization/confirmation/reconnection/event-replay/mobile checks. Docker testing used a minimal readiness application with the real backup and Prisma migration tooling; browser testing simulated container operations and HTTP downtime through the real signed Unix transport. The Ubuntu systemd unit was checked by `systemd-analyze verify` in a disposable Ubuntu 24.04 container, not installed on the production VM. Existing ESLint setup remains interactive/unconfigured, and the collection-scope guard reports its seven existing findings. Treat actual host bootstrap and first manual deployment as a separate rollout requiring operator verification.

## HTTPS proxy request origins

Application Updates mutations validate the browser Origin against the server-configured `NEXT_PUBLIC_APP_URL` origin, or the actual request Host plus its HTTP/HTTPS scheme (including a single `X-Forwarded-Proto` from the deployment proxy). The configured public origin is accepted when a tunnel rewrites Host. Other hostnames and ports must match exactly; forwarded host headers never create trusted origins. Requests missing Origin, opaque/malformed origins and downgrades of the configured public hostname are rejected. Care Queue uses the same check. Keep `NEXT_PUBLIC_APP_URL` set to the actual public application URL, such as `https://app.axildb.com`, and have the reverse proxy overwrite forwarded protocol headers. No wildcard origin allowance or CSRF bypass is required.

Older builds compare an internal HTTP request URL with the browser's HTTPS Origin and can return “Invalid request origin” even when the agent is healthy. Install the origin fix with one manual, revision-stamped **app-only** build/recreation using the production Compose files and connection overlay. This fix changes no database schema and does not require restarting the agent, database, Caddy or tunnel. Run `npm run check:request-origin` for the focused security regressions; the Application Updates browser suite also exercises proxy origins and rejects forged forwarded hosts through both affected APIs.

## Registry downloads interrupted during image builds

`npm ci` reporting `ECONNRESET` means a download connection was reset; it does not establish which proxy, network path or registry endpoint caused it. Dependency installation uses a BuildKit npm cache mount, prefers cached content, limits registry sockets to five and retries failed fetches up to five times with bounded backoff and a two-minute fetch timeout. The package lock, integrity verification and lifecycle scripts remain enforced. Cached downloads are separate from the resulting image and can be reused on subsequent attempts with the same builder; fresh builders start with empty caches. This improves transient-failure recovery but cannot repair persistent host/VM/Docker networking problems.

Keep the running application in place until its replacement image builds successfully. Retry the normal revision-stamped app build with `--progress plain`; do not use `--no-cache`, prune caches, regenerate the lockfile, disable TLS verification or upgrade npm solely because of a registry connection reset. If retries still fail, test `npm ping --registry=https://registry.npmjs.org/` from `node:22-alpine` on the deployment host, compare host/container connectivity and inspect the npm error's failing URL before changing DNS, proxy or MTU settings. Never paste credentials or proxy passwords from diagnostic logs.


## One-time host agent update for migration SQL review

After all current deployments have completed and no job is queued/running/requires recovery, update the independently installed host agent. Do not restart it during an application deployment. The source checkout and installed code are separate; a web application upgrade alone does not update the agent.

```bash
cd /opt/axildb
git pull --ff-only
sudo systemctl stop axildb-deploy.service
sudo install -o root -g root -m 0644 \
  scripts/deployment-agent/core.py \
  scripts/deployment-agent/agent.py \
  /opt/axildb-deploy/
sudo systemctl start axildb-deploy.service
sudo -u axildb-deploy timeout 60s /usr/bin/python3 \
  /opt/axildb-deploy/agent.py \
  --config /etc/axildb-deploy/config.json --probe
```

No configuration, key, systemd unit, database volume, proxy or tunnel change is needed. With the updated agent, deploy this web interface through the normal application update flow. No application schema migration is introduced by this change. The optional protocol-v1 extension remains compatible with older application clients for ordinary upgrades; the interface detects older agents and explains that migration review needs a host agent update.

Future new migrations needing review can be deployed entirely through Application Updates: check updates, run preflight, expand and review SQL, select Review Upgrade, acknowledge database risks, type the shown target revision and start. The worker still verifies a mandatory checkpoint, builds before applying migrations, stops only application/worker services for schema transitions, and confirms exact-revision local and proxy readiness before success. Approval is permission to apply the reviewed code, not proof that the SQL is nondestructive or that old code remains compatible. No automatic database restore or schema rollback is introduced. Failed or interrupted migrations retain Recovery Required and are not blindly replayed. Host Compose topology changes still require separate host administration.

Verification: the agent regression suite includes exact-content approval binding, absent/incorrect/stale digest rejection, durable consent/idempotency, critical-preflight and backup failures, migration failure recovery, and historical-file protection. Run `AXILDB_TEST_MIGRATION_REVIEW=1 npm run check:application-updates:ui` for the authenticated Unix transport/browser approval flow, or `AXILDB_TEST_MIGRATION_REVIEW=1 npm run check:deployment-agent:docker` for the real isolated PostgreSQL constraint replacement, backup, application replacement and health verification. Both are disposable fixtures; never point them at production.

## Deployment timeline

The web interface shows eight operational stages: preflight, backup, fetching, preparing, building, migrating, deploying and verifying. `COMPLETED` remains the agent's terminal outcome, not a ninth unit of work. The protocol-v1 agent executes these sequentially; reaching a later stage confirms the preceding operation succeeded. Its explicit `hasMigrations=false` / `migrationStatus=NOT_REQUIRED` metadata marks migrations **Skipped**, never completed. The progress bar counts processed stages (completed plus skipped) and reports both counts. Success is shown only after authoritative job status `COMPLETED`; the brief `stage=COMPLETED/status=RUNNING` interval is labeled finalization. Unknown stages use indeterminate progress. Recovered jobs retain their original failure and confirmed recovery result rather than being labeled successful upgrades.

The active stage has a one-second CSS spinner; completed transitions last 220ms. Reduced-motion preferences disable rotation, check animation and progress transitions. Stage transitions and outcomes have a selective polite announcement, indicators have text status labels, and the progress bar exposes processed-stage values. Initial page loads do not replay completed-stage animations. Active elapsed time is shown only when the retained stage-start event is available; completed job duration uses persisted start/end timestamps.

Technical identifiers and backup/migration metadata are under Deployment details, with full revision/job values and accessible copy feedback. Long failure summaries are abbreviated in the timeline, with the complete failure in expanded details and retained logs. Logs preserve existing copy, download and auto-scroll controls; failures open the log section. The browser retains at most 2,000 displayed events, while downloads retrieve all retained agent output.

Existing status polling and SSE replay remain the transport. Temporary restart failures preserve the last confirmed state and retry with a maximum 30-second backoff. After five minutes without status, the interface explicitly reports that status is unknown and suggests checking the host agent; it does not infer deployment failure. Confirmed terminal jobs stop routine status polling and read retained logs without maintaining an SSE subscription. Focus or explicit operations refresh status, and a newly discovered active job restarts monitoring. Request controllers, streams and animation timers are cleaned up on unmount.

This presentation change requires no agent upgrade, protocol change, database migration or new dependency. `check:deployment-progress` covers state mapping; `check:application-updates:ui` exercises the existing authenticated agent fixture plus queued/active/failed/skipped/unknown/success states, transition rendering, reduced motion, dark mode, keyboard details, long diagnostics, terminal polling cleanup, and 320/375/390/430/768/1280px layouts. The fixture simulates Docker operations and never deploys production.
