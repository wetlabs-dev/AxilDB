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

## Legacy job-history uniqueness repair

The original `AiCuratorJob_active_scope_key` was unique across every status. A later job for the same fully populated scope could therefore fail when becoming SKIPPED, COMPLETED or CANCELLED if history already contained that status. Those database failures were retried as provider errors until jobs reached Waiting for Human. The cadence research migration intended to restrict this index to active statuses, but legacy full indexes or equivalent shadow constraints can still block an installation. The error alone does not prove which index currently exists: old blocking messages remain persisted after a schema fix.

Migration `20261019160000_curator_terminal_history` repairs the expected partial index and removes equivalent full eight-column unique indexes/constraints, including alternate legacy names. Only matching index metadata is changed. It deletes no jobs, suggestions, care records or plants and does not silently requeue work. Active-status uniqueness remains enforced. Deploy the app and worker together through Application Updates, explicitly reviewing the index migration when prompted; no host agent/configuration change is needed for an installation already using migration SQL review.

After deployment, open **AI Curator → Waiting for Human → Retry database-blocked jobs**. This administrator-only action processes up to 200 matching legacy uniqueness errors per request, including jobs beyond the eight visible cards. It leaves botanical ambiguity and missing-image blockers unchanged. Existing saved suggestions or cadence proposals are recovered by completing their original job without another AI request. Otherwise jobs are queued with attempts reset and stale ownership/completion/retry fields cleared; ordinary participation, budget and worker concurrency limits still apply. If the worker is busy or another active job occupies the scope, the action reports skipped work rather than starting duplicates. Retry after the worker finishes. Failures are counted separately, and actions are audited.

New suggestion creation and job completion now commit atomically, with a RUNNING/worker-ownership check at completion. A failed terminal write cannot leave an orphan suggestion that blocks another insert for the same job. Human-readable legacy-error descriptions replace Prisma source excerpts in the review interface, while stored job history remains available. The ordinary Retry action uses the same recovery/reset rules and never restarts terminal jobs.

`npm run check:ai-curator:history` uses only the disposable local database (`localhost:55439/axildb`) and a mock provider. It reproduces the old SKIPPED constraint failure, executes the repair, checks repeated SKIPPED/COMPLETED worker results, verifies history/result retention and budget limits, injects completion failure to prove atomic rollback, and exercises result recovery and selective bulk retry. `npm run check:ai-curator:history:ui` additionally requires the local test app on port 3107 and Chrome; it verifies hidden jobs beyond the visible list, authorization, audit, readable errors and mobile layout. No production repair or real provider request is executed by these tests.

## Invalid or incomplete AI responses

JSON parsing failures are separate from the legacy database uniqueness error. Curator now requests JSON mode, checks completion/refusal state before parsing, and accepts only a complete object with a suggestedValue property. Invalid or incomplete output never creates a partial suggestion. A declined request pauses for review. An exhausted output limit pauses after one attempt rather than repeating the same paid request; failed response usage is recorded and included in daily/monthly budgets. The configured model and token cap are preserved.

Deploy the application and Curator worker together through Application Updates. No database migration, host agent update or server configuration change is required for this response-handling fix. Then open **AI Curator → Waiting for Human → Retry response-error jobs**. This administrator-only, audited action handles up to 200 matching jobs, including hidden rows, recovers any existing result without another provider call, and otherwise queues bounded retries under existing budgets. Refusals and unrelated botanical, image and database blockers are left unchanged. Busy/conflicting work is reported for a later retry.

For a new output-limit message, increase **Service settings → Max tokens**, save, then retry. The retry action requires a higher cap than the one recorded in that error. For example, 6000 may allow a more complete response than 1200, but still depends on the requested work. This explicitly authorizes a larger per-request allowance; spending limits still apply. Reasoning consumes the same output allowance as the visible answer ([OpenAI reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning)). JSON mode does not make incomplete responses safe to apply ([OpenAI structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs)). Old parsing messages cannot establish whether their original response was malformed or truncated; retrying after deployment provides the new, specific diagnosis.

`npm run check:ai-curator:responses` exercises strict parsing, nested/flat/fenced output, refusal and truncation, mock worker execution, no partial writes, usage/budget accounting, explicit cap changes and selective recovery against the disposable localhost:55439 database. It makes no real AI requests.
