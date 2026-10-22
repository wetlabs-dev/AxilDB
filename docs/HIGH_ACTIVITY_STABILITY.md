# High-activity stability investigation — 22 October 2026

## Findings and limits

Two confirmed sources of excessive work were fixed. The production incident's terminating event is **not yet established**: no production host, database, or tunnel logs were available. The browser's lost connections and Blooms RSC HTTP 502 show an interrupted request path; its shared Next/React `TypeError: Load failed` stack does not identify a plant-page JavaScript defect. No retained JavaScript heap leak was demonstrated.

1. **Calendar formatter allocation pressure.** `normalizeTimeZone` constructed an ICU-backed `Intl.DateTimeFormat` for every validation. Quiet-day evaluation also constructed weekday formatters repeatedly. The direct service benchmark reached about 1,035 MiB RSS after only 20 care/queue/forecast iterations, while settled JS heap was about 14 MiB. Bounded timezone validation, parts, and display formatter caches, plus weekday calculation from the already resolved local date, substantially reduce CPU and native allocation pressure. Invalid zones are cached too; timezone fallback and DST behavior remain covered.
2. **Redundant derived reads and page refreshes.** Care reconciliation refreshed the RSC tree, regenerated sidebar counters/queue, and separately fetched forecast data. It now distributes one authoritative queue-and-forecast snapshot to the queue, forecast, and care badge. Stale snapshots cannot publish shared state. Focus, date rollover, and other care workflows still refresh. Cadence approvals no longer combine broad root invalidation with an extra client refresh; ordinary approvals invalidate affected routes. Minimal approval dependency queries avoid loading sibling proposal history. Shared definitions retain the broader fallback when required.
3. **Speculative page traffic.** The first successful browser stress run recorded 143 Next page prefetches, including requests while queue rows were disappearing. Sidebar and queue-record links now fetch destination pages on navigation; plant hover previews remain available. The regression distinguishes Next prefetches from actual navigation/refresh requests.
4. **Connection budgeting and lifecycle hardening.** Application Prisma reuse is now process-global in production as well as development. Shared clients default to five connections and a ten-second pool acquisition timeout; explicit URL options take precedence. AI/image workers use that shared configuration. No per-request client leak was found. The AI worker's dedicated single-connection session lock is deliberately owned and disconnected in `finally`. Pool exhaustion in production remains unconfirmed.

## Request and process map

Browser → Cloudflare → Docker-based cloudflared (outside this repository's Compose definition) → configured origin/proxy → Next.js 15 / React 19 → session and collection authorization → Server Action or API → Prisma 5 → PostgreSQL 16. The application is one long-running Node process; six independent worker processes have separate heaps and pools. Caddy and PostgreSQL are separate containers. Inspect the actual cloudflared ingress/network before assuming whether it reaches Caddy or the app directly.

Care API writes preserve stable operation IDs, transaction receipts, authorization, and atomic event/state updates. A successful write schedules one coalesced authoritative read, which supplies both queue and seven-day forecast. Forecast still evaluates the full current queue for correctness, but no longer loads it twice for that snapshot. This is not an incremental scheduling rewrite. Cadence approval uses existing atomic state transitions/locks and sequential batch processing. Approval does not start another AI request. External AI work remains outside database write transactions. Background research already had bounded processing; no unbounded Approve All Promise.all was found.

Receipt lookups use the existing composite collection/user/operation primary key. A read-only EXPLAIN ANALYZE on the cleaned disposable table selected a sequential scan (0.021 ms); that tiny-table result is not evidence for a new index or a production query bottleneck. No schema/index changes were made. Full collection queue materialization remains the principal derived read; its allocation cost and duplicate invocation were addressed first.

## Measurements

These are **local diagnostic workloads**, not production VM measurements. Direct service tests used Node 26.12.1, local PostgreSQL, 150 definitions and instances, cadence inheritance/overrides, history, fertilizer recipes, repotting windows, and location Quiet Days. RSS is the highest sampled RSS, not continuous container telemetry. Direct timing excludes HTTP/rendering. Concurrent and mixed operations run after the sequential phases.

| Direct service metric | Baseline | Fixed |
| --- | ---: | ---: |
| First 20 care writes | 1,653 ms | 323 ms |
| First 20 queue + forecast reads | 13,979 ms | 1,780 ms |
| First 20 approvals | 87 ms | 82 ms |
| 100 care writes | Diagnostic safety stop; no valid total | 1,479 ms |
| 100 queue + forecast reads | Diagnostic safety stop; no valid total | 8,019 ms |
| 100 approvals | No comparable saved total | 363 ms |
| Sampled peak RSS, whole workload | 1,035 MiB (20-action run) | 350 MiB (100-action run) |
| Settled JS heap after diagnostic GC | ~14 MiB | ~14 MiB |
| Peak DB connections, isolated direct run | 5 | 5 |
| Errors in completed run | 0 / 20 | 0 / 100 |

An earlier 100-action baseline was stopped at the diagnostic 1.5 GiB RSS ceiling; that is not a recorded production crash or a complete before benchmark. The fixed workload does five times the sequential work with much lower sampled memory. Synthetic GC is enabled only in this isolated test process.

The calendar-only workload was also run on the production major runtime, Node 22.22.3: five cycles of 150 calendar sequences went from 240.41 to 34.40 ms; sampled peak RSS fell from 136.71 to 108.91 MiB; settled heap stayed about 6.3 MiB. This supports the allocation finding across runtimes but is not a full Node 22 web benchmark.

A production Next build served locally passed 100 real browser cadence approvals (~14.3 s total), 100 authenticated care POSTs with authoritative snapshots (~12.7 s total), and 20 real optimistic completions. Persisted outcomes, duplicate retry protection, same process ID, live/readiness responses, admin diagnostics access, and absence of page exceptions were checked. Zero mutation-triggered RSC refreshes occurred during the twenty completions. The initial successful run included speculative prefetch traffic; final results and repeated cycles are recorded in the audit files. Local browser timing is not a VM latency promise. No production tunnel availability test was performed.

Final production-build verification repeated the HTTP/browser workload twice in the same web process: 100 approvals + 100 POST/snapshot pairs + 20 optimistic completions per cycle, zero page exceptions, no process restart. Approval totals were 15.64 / 14.53 seconds; POST/snapshot totals 12.72 / 12.45 seconds. Automatic page prefetches fell from 143 to 108 (many remaining requests occur during the approval workflow); no mutation-triggered RSC refreshes occurred during queue completions. The web process RSS was 672 / 677 MiB at the end of the two cycles and 269 MiB before the second cycle; these are snapshots, not continuously sampled web peaks. Temporary heap growth remains visible, but this run does not show monotonically retained growth. Three direct service cycles settled at about 14 MiB JS heap each, with sampled RSS peaks of 344 / 349 / 268 MiB. Their database totals were 11 / 10 / 10 while the web server and another regression fixture were also connected; this differs from the isolated five-connection measurement.

Aggregate diagnostic output is saved in [the audit directory](audits/high-activity/). No production data or credentials are included.

## Observability and recovery

`/api/server/runtime` is read-only, no-store, and requires server-admin permission. The server page links it without polling. It reports RSS, peak process RSS, heap, external/ArrayBuffer memory, process ID/uptime, event-loop delay/utilization, and bounded per-operation duration/error counters. Active counts cover **instrumented care queue/forecast and cadence review operations**, not all Next requests. Loop statistics are cumulative since initialization, not a rolling window. Compare process IDs/uptime alongside Docker restart counts.

Structured `application_operation` logs contain timestamp, random correlation ID, fixed operation name, duration, status, concurrency, sanitized error category, and periodic/slow/error memory samples. No request bodies, session tokens, AI responses, or plant records are added. Prisma pool/connection/transaction codes are classified. An error already converted to an HTTP response retains its HTTP status; it may not have a Prisma exception category. These logs complement existing worker/deployment logs, not a universal tracing platform.

Care HTTP paths fail fast with 503 and Retry-After when more than 32 tracked mutations or eight tracked reads are active, before executing the rejected work. This is process-local pressure protection, not distributed rate limiting or an automatic replay queue. Sequential use never reaches this limit. Existing ambiguous-response reconciliation retains operation identity rather than blindly repeating a mutation.

Page/root error boundaries provide manual reload/recovery and explicitly warn that a previous action may have saved. They cannot keep an OOM-killed process alive. `/api/health/live` is a cheap DB-independent check; existing `/api/health/ready` checks database/revision readiness. The endpoint is available for an optional host-managed container health check; this update leaves Compose unchanged because remote preflight rejects Compose-file changes. **Docker does not restart a process solely because its health is unhealthy**; the existing unless-stopped policy restarts an exited process. Host/tunnel diagnosis remains necessary.

## Regression and reproduction

Use a disposable PostgreSQL database on localhost port 55439 named axildb, apply repository migrations, and run a production app against the same database on port 3107. Never point these tests at production. The high-activity suite refuses remote URLs and any other database port/name, creates only its own fixtures, and cleans them up.

```sh
DATABASE_URL=postgresql://plants:plants@localhost:55439/axildb npm run check:high-activity
DATABASE_URL=postgresql://plants:plants@localhost:55439/axildb STRESS_CYCLES=3 STRESS_REPORT=/tmp/stability.json npm run check:high-activity
DATABASE_URL=postgresql://plants:plants@localhost:55439/axildb STRESS_HTTP_URL=http://localhost:3107 npm run check:high-activity
npm run profile:calendar-load
npm run check:stability-resources
```

The harness covers 100 approvals/completions, twenty concurrent independent writes, identical concurrent retries, mixed edit/snooze/read operations, batch approval, and injected transaction rollback. It samples memory/CPU/event-loop/connection metrics and verifies persisted outcomes. Separate queue UI checks cover validation rollback, offline failure, lost committed response, focus, counters, mobile, and access/origin checks. Cadence integration tests cover provider timeout, concurrency, and restart recovery. A real production OOM, tunnel disconnect, database crash, or server restart mid-HTTP request has not been injected; these remain infrastructure scenarios for the runbook rather than claimed passing simulations.

## Deployment and remaining risks

Deploy through the existing **Web deployment**. No schema migration, new dependency, deployment-agent update, Compose-file change, tunnel change, or mandatory host setting is required. The optional Compose health check originally included in 045b1ea was removed in the follow-up because the existing preflight intentionally rejects any Compose-file diff. Deploy the follow-up target directly from the previously deployed revision; the net Compose diff is empty. Rebuild/recreate the app and workers through the usual deployment mechanism. Existing data, transaction receipts, backups, upgrade preflight/history, and readiness protocol remain compatible. Rollback is code-only.

The VM's actual OOM history, restart sequence, pool wait behavior, CPU steal/I/O pressure, swap, and connector logs remain unknown. Heavy unrelated pages, very large collections/history, simultaneous users, native allocator retention, worker overlap, and production runtime differences still warrant observation. Do not claim an unbounded leak is fixed or the specific Cloudflare outage is fully explained. Follow [the VM runbook](VM_STABILITY.md) to correlate the first origin failure with Docker/kernel/tunnel evidence.

## Final validation record

Passed: production build and type checks; changed-file lint (zero errors, two existing Sidebar image warnings); optimistic queue/store and resource tests; actual queue transaction/integration tests; cadence research integration and browser tests; queue browser rollback/offline/lost-response/bulk/authorization tests; timezone and calendar policy/database tests; repotting integration; request-origin and deployment-progress tests. Two final HTTP/browser cycles and three repeated direct service cycles passed. The cadence browser test must run without a simultaneous stress fixture because its Approve All dialog intentionally counts eligible recommendations globally. Its isolated rerun passed.

The older queue browser test was updated to the existing same-day eligibility bulk server action and current button wording; bulk persisted outcomes remain asserted. No production tunnel or VM tests are claimed.
