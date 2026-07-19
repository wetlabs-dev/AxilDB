# AxilDB Provenance Model

## Responsibilities

- `Source` identifies a person or organization upstream of the direct transaction: originator, breeder, hybridizer, propagator, grower, importer, tissue-culture producer, seed producer, or collector.
- `Distributor` identifies the person or organization from which the collection directly purchased, received, traded for, or was gifted material.
- `DistributorLocation` identifies a reusable branch, online store, show booth, or other outlet. Transaction date, price, quantity, condition, and notes remain on the acquisition or observation.
- `AcquisitionSource` gives an acquisition an ordered source chain, relationship-specific role and notes, and at most one primary source.

Plant Definitions remain botanical and taxonomic records. Structured commercial provenance belongs to `PlantAcquisitionRecord`; `PlantObservation` may point to a distributor and outlet but does not imply that distributor was the original source.

## Collection Boundaries

Every provenance record carries `collectionId`. Server actions validate that an acquisition, observation, source, distributor, and outlet all belong to the same collection, and that an outlet belongs to the selected distributor. `npm run provenance:check` audits those invariants after deployment or migration. Public reads never include distributor ratings or experience notes.

## Visibility

Source provenance may appear in a public exhibit when both acquisition/source display and collection source visibility are enabled. Distributor identity and outlet location have separate collection controls and default to private. A person-type record should contain only identity information appropriate for the collection; personal street addresses must not be published.

## Legacy Migration And Reconciliation

Legacy string columns remain readable and are not erased. `npm run provenance:migrate -- --dry-run` classifies values without writing. A plain single-name value is eligible for an idempotent collection-scoped record and link. Strings containing separators or uncertainty language, and specimen strings without a linked acquisition, enter `ProvenanceReconciliationItem`. Gardeners can assign a structured record or dismiss the item while preserving the original value.

The migration can be rerun safely. It uses normalized names for deduplication, upserts relationship records, and never removes legacy text.

## Archive And Merge Rules

Archived records remain attached to history and disappear only from new-acquisition choices. Manager merge actions select a canonical record, reassign acquisitions, observations, source links, and compatible distributor locations, then remove the duplicate. Referenced records are never deleted without reassignment.

## Future Shared Records

Collection-specific transaction data is not embedded in source or distributor identity rows. Their normalized identity fields and local aliases leave room for a later site-wide validated organization directory and cross-collection duplicate resolution. That shared layer is intentionally not implemented in this release.
