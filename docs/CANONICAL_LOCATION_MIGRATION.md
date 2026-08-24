# Canonical Location Migration

AxilDB now uses `PlantInstance.currentLocationId` as the only source of truth for a specimen's physical Location. The former `PlantInstance.location`, `PlantInstance.legacyLocationText`, and `Location.legacyLocationText` columns are removed by `20260824120000_canonical_plant_locations`.

## Resolution report

During deployment the migration prints counts for:

- plants carrying unresolved legacy text;
- values matched to one existing Location by collection-scoped, case-insensitive exact name;
- values assigned to a newly created `Legacy Imported Location` reconciliation record; and
- unresolved values.

When zero or multiple existing Locations match, the migration does not guess. It creates a deterministic top-level reconciliation Location carrying the original text. The migration aborts before dropping columns if any plant remains unresolved.

## Consolidated usages

- Plant create/edit, acquisition fulfillment, propagation, workflow relocation, treatment quarantine, transfer, merge, and bulk-move writes now set only `currentLocationId`.
- Care Queue, Care Sheets, exhibits, previews, timelines, search, filtering, reports, APIs, and AI context read the Location relation.
- Search resolves matching Location names/codes to descendants so parent searches include plants below them.
- Seed and demo fixtures create real Locations.
- Historical database backups remain compatible because migrations run in order: the older hierarchy migration first introduces/backfills the fields, and this migration then resolves and removes them.

Existing domain events retain their immutable location snapshots for historical display; new location movement events continue carrying canonical Location IDs plus display snapshots.
