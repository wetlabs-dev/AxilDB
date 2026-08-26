# Background Services

AxilDB background services are recurring operational workers that record each wake in `ServerWorkerRun` and expose health through server-admin dashboards.

Current services:

- `reminders`
- `metrics`
- `image-moderation`
- `backups`
- `ai-curator`

## Shared Shape

The helper in `lib/background-services.ts` normalizes service health fields for dashboards:

- enabled/disabled
- cadence
- concurrency
- last run
- current task
- queue statistics
- recent errors
- runtime metrics

Services can keep their own durable queue tables when needed, while still using `ServerWorkerRun` for common operational history.

## Worker Pattern

Each worker should:

1. Claim only bounded batches.
2. Record a `ServerWorkerRun`.
3. Avoid unbounded retries.
4. Keep errors visible in Server Management.
5. Respect collection scope and privacy.
6. Expose queue state when work is asynchronous.

AI Curator follows this pattern with a durable prioritized queue, budget-aware wake cycles, and first-class `WAITING_FOR_HUMAN` jobs.
