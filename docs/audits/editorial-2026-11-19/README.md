# Editorial typography implementation review — 19 November 2026

The application retains its existing fonts, theme colors and information hierarchy. This pass expands the quote standard into botanical and scientific display typography. See the [style guide](../../design/typography.md) and root contributor instructions.

## Changes

Structured botanical names now distinguish italic scientific parts from upright cultivar names, rank markers, hybrid signs and authorities. Display helpers handle explicit measurements, numerical ranges, fractions, scientific notation, selected chemical formulas, meridiem and care intervals. Shared numerical styles use tabular figures where values are compared. Static loading ellipses and dimension labels were corrected through syntax-aware inspection.

Canonical records, editable values, calculations, precision, identifiers, URLs, logs, machine exports and scheduling remain unchanged. Context selection is explicit: uncertain chemical formulas and technical strings are preserved. Existing ASCII searches remain compatible with display variants. There are no new dependencies, fonts, database migrations, background jobs or AI requests.

PDF labels and reports use mixed scientific/upright runs. Existing font families and label geometry are retained, with bundled Inter for otherwise unsupported glyphs. Standard PDF italic font substitution varied in local rendering, so standard scientific runs use a portable oblique transform. Width measurement uses the rendering fonts; identifiers and QR generation retain their existing paths.

## Visual evidence

A disposable local database contained 203 definitions, including long cultivar names, hybrid names, ASCII source values and scientific measurements. Baseline and updated captures cover 14 real routes in light/dark themes at 1440 px and 390 px: 112 captures total. Routes include dashboard, definitions, editor, specimen, care queue, husbandry, repotting, gallery, AI Curator, server management, deployment, splash, public exhibit and labels. The deployment route was inspected in its local configuration; this was not a live upgrade.

Updated checks also cover tablet width and 200% text scaling. Large definition pages use bounded viewport screenshots; other captures are full-page where practical. Existing wide server tables are recorded separately in validation JSON. No client exceptions occurred. The AI fixture contains a representative suggestion; this does not claim a production-scale AI queue load test.

| View | Before | After |
| --- | --- | --- |
| Botanical editor | [Light desktop](screenshots/before-editor-light-1440.jpg) | [Light desktop](screenshots/after-editor-light-1440.jpg) |
| Scientific husbandry | [Dark mobile](screenshots/before-husbandry-dark-390.jpg) | [Dark mobile](screenshots/after-husbandry-dark-390.jpg) |

[Rendered scientific PDF specimen](screenshots/scientific-specimen.png) and [hybrid label](screenshots/hybrid-label.png). Complete route results are preserved in the adjacent validation JSON. Full local screenshots and PDF specimens are retained outside Git to keep deployment fetches small.

## Validation and limits

Typography fixtures, AST audit, botanical markup, protected literals, search variants, canonical-data assertions, unit precision, calendar/cadence checks and TypeScript pass. Production build succeeds. Changed tracked sources introduce no new Next core-web-vitals lint findings against the starting revision. The broader production validation reaches ten preexisting collection-scope guard findings; this pass does not claim that unrelated baseline is clean. Collection-default checks pass separately.

Browser checks use local Chrome with external requests blocked. Final regression covers 11 additional browser captures and 21 report/label PDFs; extracted text bounding boxes fit their page geometry. PDF verification includes supported label formats/orientations, long names/primes, care sheets, wishlist and public exhibit reports, plus a glyph-coverage specimen. Scientific glyph coverage is checked against the bundled font. Physical printers, Safari/Firefox, hardware screen readers and live-server performance were not certified. Native text and semantic inline markup preserve accessible names without hidden duplicate names.

Deploy through the existing Web deployment. No host configuration or database migration is required.
