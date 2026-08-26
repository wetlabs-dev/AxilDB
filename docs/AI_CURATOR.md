# AI Curator

AI Curator is AxilDB's autonomous botanical enrichment and stewardship service. It prepares research and suggestions for human review, but it never changes plant data by itself.

## Background Service Design

AI Curator is a first-class background service named `ai-curator`. Runs are recorded in `ServerWorkerRun`, and durable service state lives in:

- `AiCuratorSettings` for global enablement, model, cadence, concurrency, retry, expiry, and budget settings.
- `AiCuratorJob` for globally prioritized work across enabled collections.
- `AiCuratorSuggestion` for human-reviewable outputs.
- `Collection.aiCuratorEnabled` for collection-level participation.

The dedicated dashboard is available at **Server Management -> AI Curator**.

## Worker Lifecycle

The worker runs one wake cycle at a time through `npm run ai-curator:process`. In Docker Compose deployments, the `ai-curator` service repeats that command every `AI_CURATOR_WORKER_INTERVAL_SECONDS` seconds, defaulting to 120 seconds.

1. Load global Curator settings.
2. Skip when the service is disabled.
3. Seed jobs from Definition Readiness for enabled active collections.
4. Defer queued/running jobs for collections that are no longer eligible.
5. Check daily and monthly budget limits.
6. Claim the highest-priority available job.
7. Process up to the configured concurrency or time slice.
8. Mark the job completed, deferred, waiting for human, cancelled, skipped, or expired.
9. Record the worker run and sleep until the scheduler wakes it again.

Default cadence is every 2 minutes, with concurrency 1. Enabling AI Curator in the UI only changes database settings; the scheduled worker service must also be running before jobs are created.

## Job Lifecycle

Jobs support these statuses:

- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `DEFERRED`
- `WAITING_FOR_HUMAN`
- `SKIPPED`
- `CANCELLED`
- `EXPIRED`

Normal uncertainty does not become a generic failure. Jobs that cannot proceed become `WAITING_FOR_HUMAN` with an explanation, suggested action, and retry conditions. Examples include missing type images, ambiguous taxonomy, exhausted retry attempts, or data that needs a human decision.

Retries are bounded by `AiCuratorSettings.maxAttempts`. A retryable model or parsing issue moves the job to `DEFERRED` with `nextRetryAt`. After the maximum attempt count, the job moves to `WAITING_FOR_HUMAN`.

## Priority Algorithm

The priority scorer lives in `lib/ai-curator.ts`.

It weighs:

- completeness impact
- likely definition completeness gain
- number of specimens using the definition
- estimated model cost
- dependency readiness
- manual Research Now boost
- blocked/stuck state
- age

Higher scores run first. Manual Research Now jobs receive a large boost, but duplicate prevention still applies.

## Dependency Graph

Definition Readiness is the Curator's primary input. Missing categories become enrichment jobs only when they are useful. Sparse definitions are penalized for downstream jobs such as substrate and fertilizer because those depend on more complete taxonomy and care context.

Examples:

- Missing type images become `WAITING_FOR_HUMAN`; AI should not invent representative evidence.
- Missing taxonomy blocks speculative downstream research.
- Complete definitions naturally move to holistic review.
- Collection-level stewardship jobs look for cross-definition cleanup opportunities.

## Budgeting

Budgets are tracked in estimated US dollars, not request counts.

Global settings include:

- daily budget
- monthly budget
- soft limit percent
- hard limit percent
- model
- max tokens
- concurrency

Model pricing is centralized in `lib/ai-pricing.ts`. Update that file when model pricing changes so Curator estimates and future AI budget logic continue to use one shared source.

## Suggestions And Review

Every AI result creates an `AiCuratorSuggestion`. Suggestions include current value, suggested value, reasoning, confidence, references, prompt version, model, cost, collection, plant definition, and expiry.

The dashboard groups suggestions by Plant Definition rather than chronology. Server admins can:

- Accept
- Reject
- Edit then Accept

Simple fields such as description, authority, and reference URLs can be applied directly by explicit human acceptance. More complex suggestions, such as husbandry, substrate, fertilizer, tags, or stewardship cleanup, are accepted for manual follow-up until dedicated structured apply flows exist.

Rejected suggestions are not regenerated during the configured cooldown. Pending suggestions expire after the configured expiry period. Duplicate jobs are skipped when equivalent active work, pending suggestions, or recently rejected suggestions already exist.

## Manual Research

Plant Definition cards expose **Research Now** when AI Curator is enabled for the collection. This queues high-priority jobs for the definition; it does not run the model synchronously.

## Stewardship

Stewardship jobs target collection-level cleanup, including duplicate aliases, shared husbandry guides, reusable substrate/fertilizer patterns, inconsistent taxonomy, and other standardization opportunities.
