# Memory ownership and profiling

Read the [October 2026 audit](audits/MEMORY_AUDIT_2026-10-18.md) for evidence, scope and limitations.

## Resource ownership

- Effects own their timers, listeners, observers and subscriptions. Return cleanup with the same handler identity. Cancel animation frames and delayed callbacks on navigation. Test replacement, unmount and Strict Mode setup/cleanup.
- Abort unnecessary read requests on unmount. Deployment operations and care mutations are durable operations: disconnecting a browser must not cancel them. Keep operation identity for ambiguous responses.
- Photo preview URLs belong to the editor. Revoke old URLs on replacement and the current URL on unmount. Do not retain File/Blob objects in registries.
- Shared browser previews have a fixed 60-second TTL and 128-entry LRU capacity; failures are removed. The fetch deadline is 15 seconds. Expiry is lazy, with no housekeeping interval.
- AI route limiters sweep expired identities on activity, at most once a minute. Each route admits at most 10,000 active identities; capacity exhaustion rejects new identities rather than evicting active restrictions. These remain per-process guards, not distributed quotas. Configured per-identity limits are capped at 10,000 timestamps. No user data beyond IDs/timestamps is retained.
- The care registry is browser-only. It keeps fewer than eight idle stores on new lookup (plus the requested store); subscribed stores and stores with pending, confirmed-but-unreconciled, failed or uncertain actions are protected. Their retry identities must survive navigation. SSR must not populate this registry. A large number of unresolved actions remains a deliberate retention risk, not a safe eviction candidate.
- Deployment SSE reads on demand, holds at most one bounded agent page and one queued event, and replays durable events using IDs. Disconnect and the 25-second stream deadline abort read transport/waits and drop the pending page. Do not tie agent job lifetime to HTTP response lifetime.
- Use the shared Prisma client for web requests. Short-lived scripts disconnect in `finally`; do not call `process.exit()` before cleanup. Never keep a transaction open over AI/network/image/deployment work.
- AI Curator serialization uses a **separate single-connection Prisma client** and session advisory lock. That connection intentionally stays open while the wake runs, with no open transaction. Disconnect releases the lock in `finally`. Do not acquire session locks on a general-purpose connection pool. Direct PostgreSQL/session pooling is required; transaction-pooling proxies are incompatible with this lock model (the previous transaction lock also required a transaction spanning the wake).
- Image upload and identification routes share two admission slots per web process. Excess requests return 429 with Retry-After; they are not queued in memory. Every success/error/auth rejection releases its slot in `finally`. Request parsing and original image buffers are still in memory; admission control does not replace reverse-proxy request body/time limits or decompression limits. Multiple app replicas each have their own two slots.
- Python SQLite context managers commit/rollback but do not close connections. The agent's `Store.connect()` wraps both transaction handling and explicit close; do not return raw connections outside that context.
- Backups stream to disk through the existing native tools. Keep output bounded. PDFs currently buffer their output: use streaming/pagination if measured export size/concurrency requires it; do not add unbounded caches for generated reports.

## Interpreting Server Management

Memory Diagnostics shows the **live web process** RSS, heap and external memory with its PID. `arrayBuffers` is included in Node's `external`, so never add them. Container memory belongs to the persisted sample's process/container (often the metrics worker), which is explicitly labeled. Saved samples record PID and source; older rows may lack them. Process uptime and peak RSS reset on restart.

On Linux, new host pressure samples use `/proc/meminfo` MemAvailable, which accounts for reclaimable cache. Free memory is retained separately. Legacy samples and non-Linux hosts fall back to free memory; historical values are not rewritten. A container's `/proc/meminfo` normally describes its Docker host/VM, not its cgroup limit or the physical Windows host. Container memory.current includes file cache; it need not match the Docker CLI's displayed working-set calculation.

Historical snapshots retain their existing 42-hour pruning/36-hour chart window. Chart reads now cap at the newest 1,000 snapshots, ordered chronologically, without deleting persisted rows. Normal five-minute sampling yields about 432 points. Concurrent collectors can still create duplicate samples; this is not a global heap cache.

Compare heap after warm-up, RSS, external/ArrayBuffers, cgroup usage/limits, PostgreSQL, and Linux available memory separately. Native allocators/libvips may retain arenas after images are freed. Small nonzero RSS growth is not enough to diagnose a leak. Do not add forced GC or scheduled restarts to production.

## Reproducing tests safely

Use a disposable database on **localhost:55439/axildb**, apply the existing migrations, and point `DATABASE_URL` there. The browser/DB tests assert this address; never run them against production. Seeded rows and created photos are removed by test cleanup.

```sh
npm run check:memory:resources
npm run check:deployment-agent
node --expose-gc scripts/profile-preview-memory.cjs f99037d
node --expose-gc scripts/profile-preview-memory.cjs
node --expose-gc scripts/profile-image-memory.cjs
```

The preview profiler executes the actual fetch/cache function from the selected revision, mocking the network and its deadline to isolate cache retention. It prints five 2,000-entry cycles with controlled GC. The image profiler runs actual Sharp transforms: six cycles, six 12-megapixel images per cycle, two at a time. It records native cache metrics and post-GC process usage, not instantaneous peak RSS.

For browser/process endurance, build the application and start it on local port 3107. **In a disposable local/staging environment only**, start Node with `--inspect=127.0.0.1:9237`; do not expose that port or put the flag in production Compose. Run:

```sh
node scripts/check-memory-browser.mjs
```

This connects to the loopback Node inspector and Chrome CDP, exercises actual Next links without reloading the document, and records heap/DOM/listeners/resources after controlled GC. It uses 201 definitions and one instance, uploads only during the first three cycles, replaces/unmounts photo previews, traverses collection pages and monitoring, and exports CSV. `AXILDB_MEMORY_CYCLES` defaults to 20. Output overwrites `docs/audits/memory-browser.json`; compare runs with matching fixture sizes and idle infrastructure. The guardrails catch large regressions, not every possible slope. Browser DOM counters include the React/Next cache. The photo workload avoids Playwright 1.60 setInputFiles remote-handle retention by dispatching the equivalent file events without returning DOM handles; the audit records the heap retaining-path evidence. Set AXILDB_MEMORY_SNAPSHOT=1 only in this disposable fixture to capture a Chrome heap snapshot at /tmp/axildb-browser-memory.heapsnapshot. Snapshots are deliberately excluded from the repository.

For a suspected new leak, warm up first, repeat a fixed workload, allow cleanup, and compare retained object counts/paths with inspector heap snapshots or allocation sampling. Capture snapshots only in staging: pauses and transient memory doubling can cause OOM on a small VM. Never store snapshots containing real credentials/private collection data in Git.

On Ubuntu record `docker stats --no-stream`, the specific containers' restart count, OOMKilled and memory limits, `/proc/meminfo`, swap and kernel OOM events. Record Postgres connections and active transactions. Collect a multi-day baseline before choosing container limits; keep build peaks separate from serving peaks. The local audit does not authorize production profiling, upgrades, or recovery.
