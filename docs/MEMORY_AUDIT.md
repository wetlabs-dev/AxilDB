# AxilDB Memory Audit

Last updated: 2026-08-24

## Production-Shaped Baseline

Restored backup measured locally on 2026-08-24:

- Collection: The Sibley Collection
- Rows: 76 plant definitions, 52 plant instances, 55 photos, 677 domain events
- Upload storage: 17.2 MB
- Current `npm run check:memory` process memory: 140.8 MB RSS, 16.7 MB heap used of 26.0 MB, 11.0 MB external/ArrayBuffer memory
- Bounded gallery payload: 20.2 KB for 53 photos
- Bounded search instance payload: 20.4 KB for 52 instances
- Bounded search definition payload: 37.9 KB for 76 definitions

## Scope

This pass focused on high-risk memory growth paths visible from code review without production data: large gallery loads, broad search result materialization, image decoding, and server memory diagnostics.

## Findings

### High: Gallery loaded all photos and full photo records

Before: `app/gallery/page.tsx` loaded every gallery photo for the collection, including large unused JSON fields such as moderation and plant-analysis payloads, then loaded related plant records for every photo.

After: Gallery loads 96 photos per page, counts the full result set separately, and selects only fields used by the UI.

Expected impact: Lower server heap use and lower React payload size for collections with large photo histories. The default gallery route now scales with page size instead of total photo count.

Measured impact: On the restored backup, the old full photo query serialized 53 photos to 77,995 bytes. The narrowed gallery query serialized the same 53 photos to 20,718 bytes, a 73% reduction before related plant records are considered.

### High: Search loaded unbounded plant instances and definitions

Before: `app/search/page.tsx` could return every matching plant instance and definition, including related data that was not rendered.

After: Search shows the first 80 matches in each primary result group, counts total matches separately, and uses narrower `select` projections.

Expected impact: Lower server allocations and smaller React Server Component payloads when browsing large collections or broad filters.

Measured impact: On the restored backup, bounded search payloads were 20.4 KB for all 52 instance matches and 37.9 KB for all 76 definition matches.

### Medium: Images did not consistently opt into lazy async decoding

Before: `PlantImage` rendered plain `img` tags, leaving every browser image load to default behavior.

After: `PlantImage` defaults to `loading="lazy"` and `decoding="async"`. Gallery keeps the first eight thumbnails eager for a fast first viewport.

Expected impact: Lower browser memory pressure and less decoding work for large lists of plant cards/photos.

Measured impact: Browser heap/image decode profiling should be run with production-like uploads.

### Medium: Server metrics collector loaded all photo paths by collection

Before: collection storage estimates loaded every `Photo.path` into collection records at once.

After: photo storage estimates are calculated in batches of 1,000 paths, and collection records only load counts and identity fields.

Expected impact: The diagnostics page no longer risks a large heap spike just to measure photo storage.

Measured impact: `npm run check:memory` now reports process RSS, heap, external buffers, and container memory where available.

## New Diagnostics

`npm run check:memory` records:

- collection counts for definitions, instances, photos, and domain events
- bounded gallery payload size
- bounded search instance payload size
- bounded search definition payload size
- current Node RSS, peak RSS, heap usage, external memory, and container memory
- upload storage totals, optionally from `AXILDB_UPLOADS_ROOT`

Server Management now displays:

- Node RSS and peak RSS
- V8 heap usage
- external memory and ArrayBuffers
- container memory usage when cgroup metrics are available

## Remaining Work

- Run `npm run check:memory` against production-shaped data and save the output before further optimization.
- Profile route renders in browser DevTools for Dashboard, Care Queue, Gallery, Plant Definitions, Plant Instances, Timeline/Activity, Workflows, Treatments, and Exhibits.
- Add true infinite loading or virtualization to any list that still renders hundreds of visible rows after production-data review.
- Add image thumbnail generation and responsive variants if production uploads are large originals.
- Review AI routes with production payload examples to ensure prompts do not serialize unused metadata.
- Review bundle output from `npm run build` and code-split graph/chart/editor features if they appear in unrelated routes.
