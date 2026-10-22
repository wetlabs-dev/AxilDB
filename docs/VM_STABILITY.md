# Ubuntu VM stability runbook

Reported hardware: approximately **8 GiB RAM / 4 vCPUs**, cloudflared in Docker, swap unknown. Verify these before changing settings. Run commands on the VM from the deployed Compose directory. Commands below inspect state; do not paste environment files, tunnel tokens, complete container inspections, or raw database queries into shared reports.

## Capture the next incident before restarting

Record local time, browser failed request URL/status, Cloudflare error code/Ray ID, and whether other pages also fail. The reported 22 October 2026 14:18 Eastern incident is approximately **18:18 UTC**. For that incident use a window spanning 18:10–18:30 UTC; otherwise substitute the current incident window.

```sh
date -Is
lscpu
free -h
swapon --show
uptime
vmstat 1 10
cat /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io
df -h
df -i
docker compose ps
docker stats --no-stream
docker compose logs --since 20m --tail 300 app
sudo journalctl -k --since '2026-10-22 18:10:00 UTC' --until '2026-10-22 18:30:00 UTC' | grep -iE 'out of memory|oom|killed process'
docker events --since '2026-10-22T18:10:00Z' --until '2026-10-22T18:30:00Z' --filter event=oom --filter event=die --filter event=restart
```

Inspect individual service state without dumping secrets:

```sh
docker inspect "$(docker compose ps -q app)" --format 'Started={{.State.StartedAt}} OOMKilled={{.State.OOMKilled}} Exit={{.State.ExitCode}} Restarts={{.RestartCount}} LimitBytes={{.HostConfig.Memory}} NanoCPUs={{.HostConfig.NanoCpus}} Health={{if .State.Health}}{{.State.Health.Status}}{{end}}'
docker compose exec -T app node -e "Promise.all(['live','ready'].map(async p=>{try{const r=await fetch('http://127.0.0.1:3000/api/health/'+p,{signal:AbortSignal.timeout(5000)});console.log(p,r.status)}catch(e){console.log(p,e.name)}}))"
```

Inspect the six worker containers too, especially if a build or AI batch overlapped the incident. RSS/CPU should be observed across **all** services; a comfortable average VM-memory graph can miss transient peaks. Docker's current OOM flag and bounded event history do not prove no earlier OOM occurred. Kernel logs may require persistent journaling to survive reboot. `vmstat` swap-in/out, blocked I/O and CPU wait/steal help distinguish pressure. If installed, `iostat -xz 1 10` and `mpstat -P ALL 1 10` provide detail.

A stopped app with kernel/Docker OOM evidence indicates memory termination. A running app with slow live checks/high loop delay suggests CPU/event-loop pressure. Live working but readiness failing suggests DB/connectivity. All origin checks working while the connector disconnects suggests the tunnel/network path. Correlate timestamps, rather than choosing a cause from a single symptom.

## Docker-based Cloudflare connector

Find the connector without exposing its command line/token:

```sh
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker logs --since 20m --tail 200 <cloudflared-container-name>
docker inspect <cloudflared-container-name> --format 'OOMKilled={{.State.OOMKilled}} Exit={{.State.ExitCode}} Restarts={{.RestartCount}} Networks={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Review connector logs locally for origin refusal/timeouts, disconnections and reconnects; redact host-specific/sensitive details before sharing. Check its configured ingress destination and whether it shares the origin's Docker network. `localhost` inside cloudflared refers to that container; a service destination must resolve/reach the intended origin on the appropriate network. Check Caddy logs too if ingress targets Caddy. Do not change a working route speculatively or expose port 3000 publicly to bypass the tunnel.

Cloudflare distinguishes Error 1033 (no healthy connector) from tunnel 502 (connector cannot reach its configured origin). A 502 alone does not prove cloudflared was down. See [Cloudflare's tunnel troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/). Keep the connector's restart policy `unless-stopped` or the existing equivalent; verify it is not competing with app/build containers for a tiny imposed memory allowance. Changing the connector requires a separate server configuration step, not the Web deployment.

## PostgreSQL: connections, waits and locks

These aggregate/read-only commands avoid query contents and parameters:

```sh
docker compose exec -T db psql -U plants -d axildb -c "SELECT state, wait_event_type, wait_event, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2,3 ORDER BY 4 DESC;"
docker compose exec -T db psql -U plants -d axildb -c "SELECT pid, state, wait_event_type, wait_event, now()-xact_start AS transaction_age, now()-query_start AS query_age, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() ORDER BY xact_start NULLS LAST;"
docker compose exec -T db psql -U plants -d axildb -c "SELECT name,setting,unit FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','maintenance_work_mem','statement_timeout','idle_in_transaction_session_timeout');"
```

Look for growing idle-in-transaction sessions, blockers and repeated acquisition timeouts (`database_pool_timeout` / Prisma P2024 in application logs). `pg_stat_activity` measures server connections/waits, not Prisma's internal queued requests. Prisma may lazily open fewer than its configured maximum. If query analysis is needed, use sanitized EXPLAIN in a disposable fixture DB; do not log care payloads. PostgreSQL monitoring fields are documented in the [official monitoring guide](https://www.postgresql.org/docs/current/monitoring-stats.html).

## Initial configuration guidance for this VM

- **Keep 8 GiB / 4 vCPUs initially.** First deploy the allocation/refresh fixes and inspect RSS, memory pressure, loop delay, CPU steal and worker overlap. More hardware is not the primary fix. Avoid simultaneous production builds plus large research batches while establishing headroom; the Web deploy already has its existing build workflow.
- **Connection budget:** default five per shared Prisma process. One app plus six workers means at most 35 ordinary connections, plus the AI session-lock connection, migrations/diagnostics/admin reserve. Confirm actual process/replica counts and PostgreSQL's setting. Five is a starting cap, not a throughput target. If workers cause contention, set their `AXILDB_DB_POOL_SIZE=2` individually and retain app=5; that gives roughly 18 including the AI lock before admin reserve. An explicit `connection_limit` URL option overrides the environment variable. Do not blindly increase PostgreSQL `max_connections`. [Prisma explains per-client pools and its CPU-based default](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool).
- **Memory budgets:** measure app + workers + PostgreSQL + connector/proxy + build peaks. Reserve at least roughly 1.5–2 GiB for the OS/filesystem cache and service variance as an initial planning allowance, then validate on this host. A 2 GiB Node heap allowance for every worker is not a safe aggregate plan for an 8 GiB VM. Heap limits exclude native ICU, Prisma engine, buffers and other RSS. Do not impose an app cgroup cap until its observed native/heap peak and deployment overlap are known; a low cap can create exactly this outage. No Docker memory/CPU caps were changed in this patch. [Docker documents memory and swap limits](https://docs.docker.com/engine/containers/resource_constraints/).
- **Swap:** verify `swapon --show` first. If absent and disk has headroom, a host administrator can provision a small (~2 GiB) swap file following Ubuntu's filesystem-specific procedure. It is emergency headroom, not a solution to sustained pressure; high swap I/O can cause timeouts. Do not disable the OOM killer or force a swappiness value without measurements. This is optional server work.
- **Postgres:** preserve current tuning until measurements justify a change. For this shared 8 GiB host, avoid blindly assigning the usual dedicated-DB 25% RAM recommendation; workers and app share the same RAM. `work_mem` multiplies per execution node/session, so increasing it globally can amplify bursts. Long idle transactions should be traced before applying a timeout that could interrupt valid maintenance.
- **Health and restart:** Web deployment adds the cheap app liveness check. Keep the existing readiness check for deployment verification. Docker restart policies respond to exited processes, not an unhealthy status; do not assume this check automatically restarts a stuck process. Investigate the first failure before a manual restart. [Docker restart behavior](https://docs.docker.com/engine/containers/start-containers-automatically/).

In the app, Server Management → runtime diagnostics provides a snapshot; save before/after values during ordinary activity. Filter app logs for `application_operation`, `database_pool_timeout`, slow durations and changing process IDs. Do not continuously poll at high frequency. After deployment, a normal session should show stable connection counts and completed mutations, without forced full-page refreshes. Host changes, optional worker overrides, swap and tunnel adjustments require server access; **none is mandatory for deploying the code fixes through Web deployment**.
