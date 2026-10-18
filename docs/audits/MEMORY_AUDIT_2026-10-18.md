# AxilDB memory audit — October 18, 2026

## A. Executive summary

Confirmed unbounded retention in the browser plant-preview cache and six AI endpoint identity maps. Found delayed release of deployment-agent SQLite connections, an unnecessarily long AI transaction, browser-global Care Queue snapshots without an idle bound (also populated during SSR), deployment SSE without backpressure, and several finite but avoidable read/timer lifetimes. These are addressed with targeted ownership, bounds and cleanup changes. No production forced GC, scheduled restart, database migration, container memory-limit increase or architecture replacement was introduced.

The preview cache retained 10,000 promises/results before remediation; the same workload now retains 128. After controlled GC, heap grew 4.84 MiB over cycles 1–5 before the fix versus about 0.003 MiB afterward. These are isolated function measurements, not whole-application savings. The SQLite test demonstrated 1,001 open connections after 1,000 reads with cyclic GC disabled; connections now close deterministically even on exceptions. Python may still retain **closed connection objects** until GC.

Twenty production-build SPA cycles showed constant DOM/listener counts, stable external memory and modest heap growth rather than a continuing large retained-object trend. This short run does not certify weeks/months of stability. The lineage fixture has one root; complex/large graph workloads remain unverified. Native image processing caused a significant RSS warm-up with almost flat JS heap; that is evidence of native allocation/cache/allocator behavior, not a confirmed JS leak.

Scope: local macOS/Node/Chrome and isolated Docker Desktop/Postgres. Production Ubuntu/VirtualBox/Windows was not accessed or modified. Baseline-before-fix profiling covered the confirmed preview retention and SQLite handle lifetime. Full application workloads were measured **after fixes only**; there is no fabricated whole-app before/after comparison. No real AI provider calls, production upgrade, production backup/restore, physical-host pressure/OOM diagnosis, or multi-day soak was performed.

## Architecture and ownership inventory

- Web: Next 15.5.18 standalone production output, React 19, shared Prisma 5 client (`lib/prisma.ts`). Source copied into images. Request result graphs generally have request lifetime; no per-request Prisma construction found in web handlers.
- Docker: app, PostgreSQL 16, Caddy; reminders, metrics, image-moderation, AI Curator, events and backups run independent worker processes in shell wake loops. One-shot Prisma clients normally disconnect; metrics and backup error exits bypassed cleanup and now use exitCode. No Docker memory limits were changed. Production Cloudflare topology cannot be verified from this repo.
- AI: research jobs, proposals and usage are database-backed. Curator processing is sequential within a wake, with bounded job count/time slice, and serialized across workers for budget correctness. Bulk enqueue/recovery queries can load entire collections: transient scale risk, not evidence of completed jobs rooted in global memory. Provider response objects are local to work. Interactive and moderation requests lacked deadlines; now bounded to 120 seconds, as existing husbandry/Curator calls already were.
- Metrics: snapshots are persisted, normally every five minutes, 36-hour chart window and 42-hour age cleanup. No growing in-memory history array. Reads now cap at 1,000 recent rows. Collection disk scans batch photo queries at 1,000 rows but keep a request-local file-size cache; this can have collection-sized transient peaks. Concurrent sampling remains possible.
- Browser: repository searches covered effects, timers, listeners, observers, EventSource/WebSocket, object URLs, globals/maps, promises and resource allocation. Theme, gallery, tooltips, custom field events, menus and filters have matching cleanup. No imperative chart object exists: MetricChart is SVG, React Flow is declarative, Dagre layouts are local/useMemo. Their lifecycle was left to the libraries. PhotoFramingEditor already revokes replacement/unmounted URLs. No observer or WebSocket instance owned by application code was found. Scroll restoration and preview-close callbacks needed cleanup; update polling/fallback reads needed abort ownership.
- Deployment: host Python agent independent of app, durable bounded SQLite events, capped command output, bounded event pages and persistent job history; child process timeout/process-group termination and selector cleanup already exist. No browser disconnection cancels deployment jobs. Agent thread concurrency is still not explicitly capped, though transport is authenticated/private; see remaining risks.
- Backups/imports/exports: native backup tools stream archives to disk; backup worker log tail capped at 24,000 characters. Migration download uses file streams. PDF routes buffer their completed documents with Buffer.concat; CSV and large relational exports can also have transient collection-sized payloads. No evidence of global archival buffer retention, but large concurrent exports were not exhaustively stress-tested.
- Other globals: time-zone formatter map stores validated Intl zones; fixed taxonomy/style tables are deliberate small caches/constants. Most other maps/sets found are local per-query/group/layout structures. Agent redaction secrets accumulate configured values across checks; no realistic growth was demonstrated during this audit. Do not remove redaction history while running operations need it.

## B. Findings and fixes

| Component / files | Issue and severity | Evidence / ownership | Fix and verification |
| --- | --- | --- | --- |
| `components/PlantIdPreviewLink.tsx`, `lib/bounded-cache.ts` | Unbounded fulfilled/rejected preview promises; Medium | Module-rooted Map never deletes entries; actual function grows 2,000 entries/cycle. Failed requests also poison future reads. | 128-entry LRU, fixed 60s lazy TTL, failed-promise removal, 15s network deadline; before/after profiler and retry/expiry/eviction tests. |
| Six `app/api/ai/*/route.ts`, `lib/request-limiter.ts` | Inactive identities retained for process lifetime; Medium | Each module Map only trims timestamps when that same user returns. | Active-identity ceiling 10,000, opportunistic expiry sweep, bounded per-user timestamps; capacity fails closed so eviction cannot bypass rate limits. Regression covers capacity, expiry, same-user limit and invalid config. |
| `lib/care-queue-store.ts` | Browser snapshots retained across all user/collection switches and unnecessary SSR registry; Medium | Module Map strongly owns full item arrays. | No SSR registry; prune idle clean stores during lookup. Preserve subscribed and all unresolved operations. SSR isolation/idle eviction/live subscription tests plus queue unit/DB/browser suites. This is a **conditional** bound; protected operations are not silently discarded. |
| `scripts/deployment-agent/core.py` | SQLite handles wait for cyclic GC; Medium | Raw sqlite3 connection context commits but does not close. GC-paused reproduction yields 1,001 open connections. | Context manager closes in finally while preserving commit/rollback. Two regression tests, all 22 agent unit tests, real Docker lifecycle/recovery exercise. |
| `lib/ai-curator.ts` | Transaction holds a connection/snapshot during provider HTTP; Medium | Entire wake wrapped in a transaction with 900s timeout. | Owned single-connection session lock, disconnect in finally, no transaction. Real pg_locks/pg_stat_activity assertions during mocked HTTP verify ownership, null xact_start and release afterward; concurrent worker and budget tests pass. Requires session/direct DB connectivity. |
| `app/api/server/application-updates/route.ts`, `lib/deployment-agent.ts` | Eager SSE polling ignores slow readers; disconnect leaves finite read/wait work; Medium | start-loop queues every returned page until 25s, without desiredSize/demand. | Pull-based stream: one bounded page plus queued event, abortable agent HTTP/wait, deadline/disconnect clears page. Demand/cancel regression executes real stream construction. Signed-agent browser suite verifies reconnect/replay and authorization. |
| `components/ApplicationUpdates.tsx`, preview/scroll components | Read callbacks/timers survive their owners for up to their deadline; Low | Polling already sequential and clears timers, but ongoing GETs had no abort. Scroll frame/80ms callback and preview close timer had no unmount cleanup. | Abort polling/fallback/recovery GETs on cleanup, preserve POST jobs; cancel preview timer/scroll frame/timeout. Resource tests and browser navigation; deployment UI suite. These finite lifetimes were **not** diagnosed as unbounded leaks. |
| `components/CadenceResearchControls.tsx` | Fixed refresh interval can issue during pending refresh; Low | 15s timer already cleaned correctly, but no pending/visibility guard. | React transition guard and hidden-page pause; cadence UI regressions. No cancellation of durable research. |
| `lib/image-processing.ts`, upload/identification routes | Concurrent native transforms/parser buffers unbounded by application admission; Medium availability risk | Sharp operation allocates native memory beyond JS heap; 12MP test adds ~125 MiB RSS on warm-up with ~4.6 MiB heap. | Shared two-slot fail-fast guard spans parsing/auth/processing, released in finally, 429 + Retry-After when full. Slots/idempotent-release unit test, actual successful and malformed uploads, native repeated transform profiling. Not a claim of an existing native leak. |
| Metrics/incidents/email/UI/footprint script | Misleading memory accounting; Medium diagnostic issue | Persisted process can be short-lived metrics worker, host total-minus-free counts reclaimable Linux cache, external+ArrayBuffers double counts. | Live web PID/process diagnostics, persisted source/PID, Linux MemAvailable pressure semantics with legacy/non-Linux fallback, external counted once. Parser/compatibility tests, footprint collection and monitoring browser navigation. No historical data rewrite. |
| `scripts/collect-server-metrics.ts`, `scripts/run-backup-worker.ts` | Error process.exit bypasses intended finally; Low | Explicit synchronous exit occurs before disconnect handler. | Set exitCode and allow finally to disconnect. One-shot exit already limits lifetime, so this was not a weeks-long retained heap leak. |

## C. Measurements

Raw data: [before](memory-before.json), [after](memory-after.json), [native images](memory-images.json), [browser and web process](memory-browser.json). Values below use MiB, raw files use bytes. Controlled GC was used **only in disposable profiling/test processes**.

### Preview-cache baseline and remediation

Five cycles of 2,000 unique preview keys; actual old function from `f99037d` and current function, mocked response/deadline, fresh Node processes. TypeScript compiler/runtime overhead included equally. Synthetic payload is deliberately small and is not a production botanical record size.

| Measurement | Before cycle 1 → 5 | After cycle 1 → 5 |
| --- | --- | --- |
| Retained entries | 2,000 → 10,000 | 128 → 128 |
| Post-GC heap | 23.37 → 28.21 | 22.32 → 22.32 |
| RSS | 127.00 → 137.52 | 126.31 → 131.22 |
| External memory | 1.74 → 1.74 | 1.74 → 1.74 |
| Active resources | none | none |

Retaining paths are explicit in the source: module cache → promise → fulfilled result (or rejected error). The bounded result count and almost-flat post-GC heap remove that growth mechanism. RSS does not have to return to startup allocation.

### Native image profile

36 actual 3000×4000 PNG→rotated/resized JPEG transforms, six cycles, at most two concurrent, input generated in memory. RSS before first workload 114.00 MiB; post-workload RSS 238.78 → 242.55 MiB across cycles 0–5. Post-GC heap 4.62 → 4.72 MiB, external ~1.94 MiB and ArrayBuffers 16,619 bytes. Sharp cache reports at most 100 cached items, file count 0. Its reported memory high-water value reached 91 MB while instantaneous cache memory was 0 at sampling points. These samples do **not** measure a precise instantaneous operation peak or Windows/Ubuntu libvips allocator behavior. A modest native RSS drift remains for longer observation.

### Production-build repeated navigation

Final run: 20 cycles; 201 definitions, one instance, fixed three uploaded photos after warm-up. Actual Next links preserve one document; repeated definitions/instances/queue/gallery/lineage/Server Management navigation, photo preview replacements/unmounts, valid/invalid image uploads and definition CSV exports. No pageerror events in passing runs. Node inspector and Chrome CDP collect after cleanup/GC. Browser/Node resource numbers are in `memory-browser.json`; rerunning deliberately replaces that artifact.

The initial 20-cycle run (before adding explicit photo-preview instrumentation) had constant 13,482 DOM nodes, 2,299 listeners, two documents. Browser heap 12.84 → 14.89 MiB; web heap 113.81 → 114.91 MiB; web RSS 332.36 → 270.52 MiB with a sampled maximum around 335 MiB; external ~4.24 MiB. These historical observations are retained here to distinguish them from the final expanded run in the raw artifact. A later detached-node retaining-path investigation is described below. Short-run heap drift is not proof of an unbounded leak or a guarantee against future growth.

Disposable PostgreSQL observed at 40.34–42.16 MiB / 7.653 GiB Docker VM memory, restart count 0, OOMKilled false, no explicit container limit. This is **not** production Postgres usage. Existing footprint collector measured roughly 139 MiB RSS, 12.6 MiB heap and 6.46 MiB external in its own temporary process; it is not the web-server baseline. No app container/worker VM memory numbers are invented: the profiled full web app ran as a local Node process, while the isolated agent exercise used separate fixture containers.

Final expanded run (20 cycles, about 45 seconds after earlier warm-up workloads):

| Sampled measure | Cycle 0 | Cycle 19 |
| --- | ---: | ---: |
| Browser heap after GC | 13.47 MiB | 15.31 MiB |
| DOM nodes / listeners / documents | 13,486 / 2,299 / 2 | 13,486 / 2,299 / 2 |
| Live document elements | 8,619 | 8,619 |
| Web process heap after GC | 116.31 MiB | 116.47 MiB |
| Web process RSS | 268.25 MiB | 273.95 MiB |
| Web external / ArrayBuffers | 4.23 MiB / 491,154 B | 4.23 MiB / 491,154 B |
| Active Node resource count | 5 | 5 |

Sampled maximum RSS was 273.95 MiB. Browser heap growth tapered toward the end; the data does not establish an exact asymptote. Photo preview URL count returned to zero after every navigation, including 60 replacements across 20 mount/unmount cycles. Final measurements used the same warmed local Node process as the intermediate diagnostic runs, not a fresh process or production server.

### Profiling artifact investigated, not an application leak

Adding repeated file selection initially failed the DOM guard: in six cycles, nodes grew 14,814 → 23,512 and listeners 2,435 → 3,648, while live document elements stayed at 8,619 and preview URL ownership still cleaned up. Raw failed-run samples: [retained test handles](memory-browser-retained-handles.json). A disposable Chrome heap snapshot (~53 MiB, kept outside Git) showed a retaining path **Global handles → DevTools console → HTMLInputElement (file) → detached form → detached instance page**. Installed Playwright 1.60 source `_setInputFiles` creates a retargeted element handle without disposing it. Clearing console history did not release those remote handles.

The controlled alternative uses the same input File/DataTransfer and input/change DOM events through an evaluation returning no DOM objects, avoiding that extra remote ElementHandle. Six identical cycles then held 13,483 nodes and 2,299 listeners throughout; object URLs returned to zero after navigation. The final expanded twenty-cycle run uses that method. We did not modify application components or weaken the guardrail to hide this result. This illustrates why a detached-node count alone is insufficient attribution. The snapshot contains only disposable fixtures; production snapshots remain unauthorized.

## D. Changes and persistence

New reusable bounded cache, limiter, image admission and process-memory helpers; fixes in the files listed above; new memory unit/endurance/profiling scripts, SQLite lifetime tests and expanded real AI lock assertions. Added [developer guidance](../MEMORY_MANAGEMENT.md) with resource ownership, reproduction and operational interpretation. Package scripts expose the resource and browser checks.

No schema migration or persistent application data deletion. Snapshot JSON gains optional available-memory/PID/source fields; older records remain readable. Existing persisted metric retention unchanged, with a bounded chart query. Deployment records/events/backups and uncertain care operation identities retain their existing durable/retry semantics. No production data, uploads, tunnel settings or unrelated containers were touched. Disposable fixture data/images/containers are cleaned up.

## E. Verification

Executed successfully:

- TypeScript `npx tsc --noEmit --pretty false` and production Next build.
- New memory resource regressions: TTL/LRU, actual preview failure/retry, inactive user expiry, capacity fail-closed, SSR queue isolation/idle eviction/subscription protection, image slot exhaustion/release, Linux/legacy metrics, actual SSE demand/cancel.
- Before/after preview profiling, actual native image profiling, production-build browser/Node endurance and existing footprint collector.
- 22 deployment-agent unit tests, including two new SQLite normal/error lifetime tests.
- Real isolated Docker Git/build/backup/Prisma migration/app replacement/proxy+database health/recovery/data-preservation integration.
- AI cadence research real-DB/mock-provider suite including budget stop, concurrent lock exclusion, no transaction during HTTP and lock release; AI Curator and Magic Fill pure checks.
- Queue optimistic unit suite, real-DB mutation/idempotency/rollback suite, real-DB cadence constraints/history suite, care scheduling, timezone, domain events, workflows, collection defaults.
- Cadence redesign and controlled-network queue UI suites in development mode.
- Signed Unix-agent Application Updates browser suite: admin/CSRF/injection rejection, confirmation, restart reconnect, event replay, history, secret boundary and mobile layout.

The cadence browser script initially failed against production because its expected server exception text is redacted in production. Queue UI initially hit a detached-element timing failure while other UI work ran. Both passed sequentially against the development server; the unrelated UI behavior was not changed to make tests pass.

Known failing/unavailable checks:

- `npm run lint` cannot execute a lint pass: repository has no configured ESLint entry and Next opens its setup prompt (exit 1). No lint success is claimed.
- `check:collection-scope` reports the same seven existing findings in `app/ai-curator-actions.ts`, plant/instance list queries and AI Curator reads. No new findings introduced; fixing their semantics is outside this memory change.
- Production host/cgroup/swap/cache/OOM telemetry, paid live-provider behavior, every PDF/import variant, long multi-day stress, native heap allocation traces and production-sized collections were not exercised. No production profiling permission was assumed.

## F. Remaining risks

- Full collection queue, bulk research/recovery, exports and request-local storage scans may have high transient working sets. Query selection/pagination already bounds gallery/search payloads; unpaginated paths need realistic large-collection load testing before further refactoring.
- Image admission controls count, not per-image pixel cost or parser bytes. Native decoder defaults and proxy upload limits still matter. This audit did not establish a production-specific maximum safe pixel size.
- PDFs buffer complete output. Concurrent large labels/exhibits/care-sheet exports may pressure external memory; no retained global output buffer was found.
- Protected unresolved Care Queue operations intentionally survive navigation; many failures without resolution can retain snapshots. Silent eviction would risk duplicate care entries. Resolve/reconcile or close the browser session deliberately rather than dropping operation identity.
- Agent request threads are authenticated/private but not capped at a fixed worker count. Command/output/page limits reduce individual request lifetime/size, not arbitrary simultaneous administrator polling load. Agent secrets and Intl formatter globals were reviewed but not empirically shown to grow under ordinary repeated workloads.
- Session advisory locks assume direct PostgreSQL/session pooling. Do not route only the lock client through transaction pooling. The dedicated connection is an intentional per-wake resource, released on completion/failure/process exit; reconnect/failure during a wake needs operational observation.
- Linux MemAvailable measures the Docker host/VM view. Legacy samples use free-memory semantics. Physical Windows/VirtualBox ballooning/swap and aggregate worker/native/build peaks remain unmeasured.
- Memory and frontend tests are guardrails, not proof of lifetime correctness in every third-party library/version. Longer fixed-workload runs and allocation/dominator investigation remain appropriate if a sustained trend appears.

## G. Operational recommendations

Manually roll out the committed application normally; install/restart the updated host agent separately using the existing deployment-agent instructions, because normal application upgrades intentionally do not replace the agent. No new env variables/migrations are required. Observe live web PID/uptime/heap/external alongside each app/worker/Postgres container and VM available memory. Retain ordinary time-series samples and annotate deployments/builds/backups.

Keep the existing sustained incident thresholds, now using reclaimable-aware available memory for new Linux samples. Investigate sustained pressure/OOM or a fixed-workload post-warmup retained-heap slope; do not alert merely because the OS caches files. Measure actual worker count/pools and concurrent uploads/exports before selecting Docker limits. Do not increase limits or schedule process recycling as a substitute for diagnosis.

Use the [profiling procedure](../MEMORY_MANAGEMENT.md) in staging. Heap snapshots may pause/double memory and contain secrets; obtain explicit authorization before production profiling. Compare like-for-like input sizes and versions over days before concluding that this short local run proves months-long stability.
