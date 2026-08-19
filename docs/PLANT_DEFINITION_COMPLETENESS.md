# Plant Definition Completeness

AxilDB evaluates Plant Definition readiness from current records in `lib/plant-definition-completeness.ts`. The score is derived in bounded batch queries and is never written back to Plant Definition content. The current Plant Definitions page is unpaginated, so batch derivation keeps results current without snapshot invalidation or a schema migration. If the list becomes paginated, move the same canonical results into queryable snapshots before doing server-side score sorting.

## Weights

| Category | Weight |
| --- | ---: |
| Taxonomy and naming | 25% |
| Husbandry | 25% |
| References and description | 10% |
| Images | 10% |
| Taxonomic Authority | 10% |
| Fertilizer | 7.5% |
| Substrate | 7.5% |
| Plant Tags | 2.5% |
| Review and validation | 2.5% |

Weights are exported as `PLANT_DEFINITION_COMPLETENESS_WEIGHTS` and checked by `npm run check:definition-completeness`.

## Criteria Inventory

- **Required / needs attention:** genus and species working placement, resolved or clearly provisional identity, description, core husbandry sections (water, light, temperature, humidity, and medium), and a representative approved image.
- **Recommended:** author citation, conditionally applicable cultivar registration, remaining structured husbandry sections, at least one reference, fertilizer recipe or explicit no-fertilizer guidance, fertilizer cadence, a preferred/recommended substrate, an expected Taxonomic Authority match, and human review of AI/uncertain identification.
- **Optional:** aliases, authoritative secondary references, meaningful tags, and authorities where no configured scope indicates one is applicable.
- **Conditionally applicable:** cultivar registration is not applicable without a cultivar; fertilizer can be not applicable when husbandry explicitly says it is not recommended; collection-local fertilizer, substrate, and tags are not applicable to site-level Validated Definitions.

Linked husbandry follows the effective source guide without requiring duplicated local fields. Husbandry sections are complete when a useful share of their structured fields is present, partial when only a small amount is present, and inherited when supplied by a linked guide. A moderated, approved definition type image earns full image credit; an approved specimen cover/type image earns fallback credit and leaves a recommendation to select a dedicated type image.

Substrate credit requires an accepted, saved preferred/recommended relationship to a non-archived recipe. Magic Fill drafts never count until saved. Fertilizer credit requires an active, non-draft recipe or explicit no-fertilizer guidance. Tags intentionally have low weight.

## Status Semantics

- 90-100: Complete
- 75-89: Mostly complete
- 50-74: Needs work
- 25-49: Sparse
- 0-24: Minimal
- Provisional: shown separately at every score while identification remains unresolved

A 100% score means applicable AxilDB metadata categories are satisfactorily populated. It does not guarantee taxonomic correctness. Validation state is displayed separately.

## Performance And Boundaries

The evaluator batch-loads definitions, guides, approved images, tags, recommendations, authorities, and review state without per-card queries. Collection-local evaluation is scoped by `collectionId`. Site-level definitions are evaluated with `collectionId = null`, and collection-local relationships are not introduced to improve their scores. Derived score changes do not create Event Engine records.

CSV export and the collection and validated-definition lists call this same service. Components never calculate their own score.
