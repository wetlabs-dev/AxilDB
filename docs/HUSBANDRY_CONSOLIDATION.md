# Husbandry consolidation

Curator may compare an independent Plant Definition with a stable shared guide even if its current guide is complete. A shared guide represents sufficiently compatible cultivation, never taxonomic equivalence. Recommendations are optional; preserving independent care is the default when evidence is insufficient.

## Existing architecture and preserved ownership

Husbandry already links through `PlantHusbandryGuide.sourcePlantDefinitionId`. Guide detail and environmental requirement views resolve that relationship. Care cadences and seasonal repotting window IDs belong to definitions separately; instance cadence and husbandry overrides remain separate. Existing fertilizer associations and substrate assignments are not merged or replaced by consolidation. Retained local fertilizer narrative is archival while linked and cannot re-enter cadence parsing or override the established recipe strength; instance fertilizer overrides remain authoritative. This change does not expand inheritance to new scheduling categories.

Previously, manual linking cleared local narrative/environmental fields. The shared link mutation now updates only the relationship, retaining independent fields, recipes and provenance beneath it, and records a complete previous-guide snapshot in the existing audit log. Source views remain live-linked as before. **Restore preserved independent guide** explicitly restores the snapshot and notes its archive date and need for review. Legacy links whose original fields were already erased cannot be fabricated back; they can still use **Make local copy**, which explicitly copies source care and archives the prior local state. No migration destructively normalizes existing links.

## Discovery and evidence

Normal Curator readiness research and Research Now include the `husbandryLink` target independently of completeness. Sources are discovered from at most 60 independent same-genus definitions in the collection, filtered before any provider request, ranked and limited to six candidates. Research snapshots include relevant care/provenance fields only, with strings capped at 800 characters and truncation indicated; freshness fingerprints and audit archives still cover the full guide. Genus is only an efficient discovery boundary, not a compatibility conclusion. Cross-genus AI discovery is intentionally outside this initial shortlist; authorized manual linking remains available and shares the dependency validator.

Candidates must cover light, moisture, substrate, humidity and temperature plus sufficient additional dimensions. Coverage measures source documentation quality, not botanical compatibility. Reviewed guides and established consumer groups are preferred only after quality and conflict filtering. Disputed/conflicted/rejected source guides are excluded. Deterministic prefilters reject non-overlapping recorded temperature/humidity ranges and explicit consistently-moist versus fully-dry guidance. The model must independently compare all twelve dimensions: light, watering, substrate, humidity, temperature, dormancy, fertilization, repotting, pruning/maintenance, growth habit, roots and special requirements. These map to existing fields; absent dedicated fields are evaluated using available narrative evidence rather than inventing schema.

An actionable result requires `shouldRecommendLink`, `compatible` and `evidenceSufficient` to be true, a supplied source ID, the actual target ID, confidence above the configured threshold, all evaluated dimensions, supporting similarities, minor differences, botanical reasoning, source-quality assessment, evidence limitations, and an empty critical-differences list. One material incompatibility vetoes a link regardless of other similarities or confidence. The system does not repair free-text conclusions into link proposals. Uncertain, unsupported or incompatible output is skipped without creating a recommendation. A model's assessment remains a claim for human review, not a guarantee of botanical correctness.

Configuration is optional and server-side:

- `AXILDB_HUSBANDRY_LINK_MIN_CONFIDENCE`: default 0.90, allowed 0.80–1.00, using the existing 0–1 confidence scale.
- `AXILDB_HUSBANDRY_LINK_MIN_DIMENSIONS`: default 8 of 12, allowed 5–12. The five core dimensions above are always required.

The confidence default matches AxilDB's conservative local-override policy. Coverage and confidence are distinct and do not average away incompatibilities. These defaults need no server changes to deploy. Existing concurrency, usage ledger, spending budgets, retry bounds, rejection cooldown and suggestion expiry continue to apply. Routine completed/skipped comparisons are reused by durable job hash; changes to collection guides, link recommendation lifecycle or the target invalidate that hash. Explicit Research Now bypasses that comparison cache. No unbounded memory cache or exhaustive pairwise AI process is introduced.

## Dependency rules and transactions

The centralized validator considers approved links and unexpired PENDING consolidation suggestions. ACCEPTED recommendations are applied atomically, so there is no separate approved-but-unapplied state. REJECTED, EXPIRED and STALE work does not reserve a future relationship.

For proposed target A → source B:

- A and B must exist in the same collection and differ.
- B must have independent husbandry, with no outbound source link or pending proposal to become a consumer.
- A cannot already supply actual consumers or pending consumers.
- A cannot have another competing active proposal.
- Shared stars A → B and C → B are legal; A → B plus C → A or B → A is not.

A collection-scoped PostgreSQL transaction advisory lock serializes proposal persistence, manual linking, approvals, restoration, forks and definition merges. Approval also locks source/target definition and guide rows before checking fingerprints, preventing an overlapping edit from slipping between freshness validation and application. New graph violations are rejected by definition merges, without rewriting unrelated legacy chains. Deleting a guide with actual consumers is blocked. These protections are backend rules, not just prompts or UI filters.

Proposal persistence rechecks the shortlisted IDs, current source/target fingerprints, compatibility and dependency graph inside the same transaction that creates the suggestion and completes its worker job. The oldest pending proposal is retained when repeated research competes with it; the system does not silently replace it. Reject the old comparison and request new research to reconsider a source, subject to the normal cooldown. A rejected proposal immediately releases dependency reservations even while its research cooldown remains in force.

## Human review

Open Review Items continues to count each pending consolidation as one Curator suggestion. The normal Curator review card shows source name, target/source documentation coverage, confidence, similarities, minor differences, reasoning, limitations and the preservation warning. The optional comparison groups stored target and source guidance by dimension, identifies identical values and missing source detail. It does not infer semantic similarity solely from text equality.

**Approve Link** applies the existing source relationship and marks the suggestion ACCEPTED together with its audit snapshot in one transaction. Source choice and compatibility evidence are immutable at review: choosing a different source requires a fresh comparison. Rejection leaves care unchanged. Approval revalidates graph eligibility, active status, expiry, confidence, source completeness and both guide/identity fingerprints. A stale or conflicted result becomes STALE with a reason; it is not applied or counted as pending. The stale panel offers refresh/reject controls. Legacy dependency issues are reported without modifying records.

The batch panel handles up to 50 selected comparisons with explicit confirmation. Each decision uses the same transactional approval service and is revalidated against the entire still-active proposal graph and previously accepted relationships. Conflicting comparisons are marked stale/skipped while unrelated safe work continues. The result reports accepted, stale/rejected and unchanged counts; a failed comparison is never labeled accepted. Repeated or concurrent decisions cannot approve the same proposal twice. Authentication and server-administrator checks protect all AI review actions; manual linking/restoration retain collection-administrator authorization and Next.js server-action origin protection.

## Rollout and validation

Deploy application and workers together through Application Updates. No database migration, host-agent change or mandatory configuration edit is required. Enable normal collection Curator participation and use Research Now for a targeted comparison. Existing links remain in place; inspect legacy dependency issues before manually normalizing them. Do not treat a consolidation rate as a target.

`check:husbandry-consolidation` requires the disposable localhost:55439/axildb database and uses mocked AI only. It covers complete/partial/missing guides, shortlist evidence, high-confidence incompatibility vetoes, missing evidence, actual/pending graphs, competing proposals, concurrent creation/manual links/approvals, stale source changes, rejection reservation release, duplicate approval, source/target archive preservation and explicit restoration, dashboard counts, and unchanged cadence/window/instance/history records. `check:husbandry-consolidation:ui` requires the local app on port 3107 and Chrome and verifies comparison, approval, restoration, stale explanations, batch review, authorization and mobile/dark layout. No production data or real provider request is used by these tests.
