# Semantic care-category palette

Care category answers “what care?”, independently of urgency, source, due date, snooze, Quiet Day displacement or completion. Category badges retain text and decorative icons. The existing primary-action green and explicit priority/overdue indicators retain their meanings.

## Canonical sources

- `lib/care-category-presentation.ts`: exhaustive `Record<CareTaskType, CareCategoryPresentation>` for category identity, label, icon name and semantic family, plus existing filter mappings and a safe neutral fallback.
- `app/globals.css`, shared semantic palette section: the single color-value source. `--palette-<family>-fg/bg/border/swatch` has explicit light/dark variants. `data-semantic-color` or `.semantic-color-<family>` resolves local semantic variables. `.semantic-chip` provides badge/count appearance; `.care-category-card` provides a 40% palette/60% warm-surface mix and a three-pixel logical inline-start accent. Completed items use a lighter 20% mix and reduced accent opacity.
- `components/CareCategoryBadge.tsx`: shared non-interactive category label/icon. Icon names resolve once; icons inherit foreground and use `aria-hidden` because the label conveys their meaning.

No generated Tailwind class names, per-card effects, data fetching, timers, color calculations, stored event colors or new dependencies are used. Existing task data determines presentation synchronously.

## Category inventory and final palette

| Canonical task | Label | Shared family | Light foreground | Badge background | Border/accent |
| --- | --- | --- | --- | --- | --- |
| WATER | Water | ocean / cool blue | #34536f | #edf3fa | #91abc4 |
| FERTILIZE | Fertilize | fern / botanical green | #285d3b | #eaf2e4 | #9fbea1 |
| REPOT | Repot | terracotta / earth | #7d5637 | #f7f0e7 | #be9471 |
| TREATMENT | Treatment | rose / cranberry | #8b3c4e | #faeff2 | #cc8b9b |
| PROPAGATION_CHECK | Propagation check | sky / teal | #315f64 | #ebf5f5 | #a8c8cc |
| HEALTH_CHECK | Health check | indigo | #525d96 | #f1f1f9 | #9b9fcb |
| QUARANTINE_REVIEW | Quarantine review | indigo / health | #525d96 | #f1f1f9 | #9b9fcb |
| PEST_CHECK | Pest check | amber | #71551b | #fff5d8 | #dcc88b |
| BLOOM_CHECK | Bloom check | violet / muted orchid | #5d4b75 | #f3eef8 | #bdb1cf |
| PRUNE | Prune | coral / burnt orange | #9a491f | #fff1e6 | #cc9873 |
| REMINDER | Reminder | stone / neutral | #44403c | #f5f5f4 | #d6d3d1 |

Quarantine intentionally shares the health family while retaining a distinct shield icon and label. Unknown legacy values retain a readable label and the stone family. Prototype keys and invalid runtime category types do not resolve to arbitrary objects or unsafe classes.

## Existing color reuse and alignment

Ocean, fern, sky, amber, violet and stone reuse existing Plant Tag light-theme colors. Sage and legacy moss are also centralized with their existing light values. Terracotta and indigo fill missing distinct families. Bloom uses the existing muted violet rather than introducing a nearly duplicate orchid family; custom care retains the app's warm stone rather than a new cool gray.

Plant Tag chips and picker swatches now consume the same palette. Rose previously used brown chip colors despite its rosy swatch; it is aligned with cranberry. Coral is aligned with burnt orange so pruning is differentiated from earth-toned repotting. Persisted color-token names, tag choices, tag meaning and all tag records are preserved. These two cosmetic alignments follow the request to establish a universal palette; confidence/readiness/husbandry colors are not recolored. Explicit dark variants replace light-only tag chip colors on dark surfaces.

## Updated surfaces

- Main Care Queue desktop/mobile cards: category badges, faint backgrounds and a non-layout-shifting pseudo-element accent. Expanded details, notes, photo controls and primary actions preserve their layout and behavior.
- Weekly checklist cards use the same identity and badge.
- Existing category filters use small inactive indicators and selected category tint/text. Today, Overdue, Completed and location controls remain status/scope controls with existing styling. Existing URLs and filter/count semantics are unchanged; no new pruning filter or summary counts were added.
- Existing location category counts and forecast breakdown counts use shared semantic chips. Total/overdue counts remain status indicators. Forecast calculations are unchanged.
- Shared `careTaskLabel` delegates to the central presentation map, removing the duplicate main-card label/icon switches. Canonical task labels stay the same.

## Accessibility and verification

Light badge text contrast spans 5.55:1 to 9.42:1; dark spans 7.84:1 to 8.78:1 across care families. All exceed WCAG AA normal-text 4.5:1. Badge icons use the same foreground. Accent/badge borders are decorative reinforcement, not sole indicators or interactive boundaries. Selected filters use their foreground as the boundary, with explicit `aria-current=page`. Focus outlines retain primary color and offset; forced-colors mode uses system colors. Color changes add no keyboard stops and no redundant screen-reader color announcements.

`npm run check:care-colors` verifies exhaustive category mapping, intentional shared identities, safe unknown/prototype fallback, status-filter neutrality, both theme token sets and computed text contrast. `scripts/check-care-colors-ui.mjs` uses authenticated Chrome fixtures to exercise all 11 types plus a legacy fallback, 3px accents, desktop detail expansion, category filtering, real care completion, completed-item rendering, primary-action color preservation and layouts at 390/768/1440 pixels in both themes. Fixture-only API overrides create mixed visual/status examples without changing production queue logic. Existing photo tests verify initial/progress/cover uploads, framing, idempotency, repeated uploads, permissions and care-history isolation.

Screenshots produced locally:

- `/tmp/axildb-care-colors-light-1440.png`
- `/tmp/axildb-care-colors-dark-1440.png`
- `/tmp/axildb-care-colors-light-390.png`
- `/tmp/axildb-care-colors-dark-390.png`
- Equivalent 768px tablet images.

The visual-only change has no schema migration, backend action, scheduling, calibration or data-model changes. Deploy it through Web/Application Updates. If deployed together with Adaptive Cadence Calibration, that separate feature supplies the database migration; neither feature needs a host/Compose update.

Final validation passed: exhaustive presentation/contrast checks, authenticated mixed-category browser checks, existing care-photo suite (including 20 uploads), optimistic queue tests, Quiet Day/calendar regression tests, Plant Tag checks, TypeScript, changed-file lint and the production build. The compiled production CSS was checked for the shared palette and category rules. No production care data was accessed or modified.
