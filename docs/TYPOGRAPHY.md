# Quotation marks, apostrophes and primes

AxilDB’s English interfaces use ‘opening single’, ’closing single/apostrophe’, “opening double” and ”closing double” characters. Use literal UTF-8 in static copy, including accessibility labels: `<h1>Today’s Care</h1>`. Keep programming-language string delimiters ASCII. This convention concerns quotes and primes, not a rewrite of dashes, ellipses or grammar.

## Display boundaries

`lib/typography.ts` supplies deterministic display-only formatting:

```ts
formatTypography(description) // Prose, including AI-generated descriptions.
formatTypography(rawCommand, { mode: 'literal' }) // Exact input.
formatTypography(text, { locale: 'fr' }) // Unchanged; English rules are opt-in by locale.
formatTypography('5\' 8"', { mode: 'measurement' }) // 5′ 8″, in a known measurement field.
formatCultivar("'N'Joy'") // ‘N’Joy’
plantDisplayName(definition) // Structured display name, from lib/utils.ts.
```

Use `plantDisplayName` and `acceptedPlantDisplayName` for botanical presentation. Preview `displayName`, care-queue `plantName` labels and lineage node labels are generated using that structured display path; the preview’s separate canonical `botanicalName` remains unchanged. Their canonical counterparts, `plantName` and `acceptedPlantName`, retain ASCII delimiters for lookup, persistence, identity comparisons and machine exports. The structured display formatter trims recognized paired outer cultivar delimiters and handles internal apostrophes without mutating the record. Authority spelling, hybrid notation, genus and species are preserved.

Format at read-only text leaves, not over entire React trees. Pass original values to inputs, forms, selection values, actions, clipboard commands and API payloads. User-controlled collection/location names, handles, identifiers and exact authority evidence are generally literal. No input interception, DOM scans, MutationObserver, font substitution tricks or hydration-time rewriting is used.

General prose conversion protects Markdown code spans/fences, HTML tags, link destinations, URLs and email addresses. It is not an HTML sanitizer or a full Markdown parser; existing React renderers still escape text. Dashboard and exhibit renderers explicitly preserve fenced code. Raw JSON, logs, paths and shell commands must be rendered literally, ideally with `<code>`/`<pre>`, rather than passed to prose formatting. Deployment-agent diagnostic/status payloads remain literal as well, because they may contain commands or exact host error text. A prose field is not a promise that arbitrary embedded technical text can be inferred without delimiters.

Existing typographic marks, primes, ʻokina, modifier apostrophes, language-specific punctuation, whitespace and line breaks are retained. A lone `12"`, `A'` or `5' end` remains ambiguous in prose. Only an explicitly measurement-scoped call interprets numeric quotation markers as primes; a closing quote in `Select “Option 2”` stays a quotation mark. Existing spelled-out units (`in`, `ft`, `cm`) remain unchanged. Read-only desired/specimen-size fields and their human-readable PDF values use explicit measurement mode; form and filter values keep the original strings.

## Search, messages and print

`normalizeTypographySearch` is for human-readable comparisons only. `typographySearchWhere` expands human-readable Prisma `contains` filters to at most four quote variants while preserving literal identifier/URL fields and existing collection constraints. It does not change indexes, uniqueness, stored values, exact search input or operators. Main search, definition filters, queue, wishlist, graph, care-bulk, treatment-batch, tag, exhibit and provenance filters use explicit matching boundaries.

Branded email copy is formatted before HTML escaping; destinations stay literal. Email subjects and push display text use UTF-8 presentation without changing recipients, preferences or delivery. No real notifications are sent by the checks.

Label name lines use the structured cultivar formatter. PDF Times fonts retain the existing appearance for curly quotes. When label names contain primes unsupported by the base font, the existing Fraunces font is embedded for that name and used for both sizing and drawing. Care-sheet body lines similarly fall back to bundled Inter only when primes require it. Existing exhibit and wishlist PDFs already embed these fonts. Fixed label page sizes, orientations, QR payloads and identifier fonts remain unchanged.

Inter and Fraunces contain all six quotation/prime glyphs. IBM Plex Mono contains curly quotes but lacks primes; its dedicated label-ID role remains literal ASCII. Do not use the ID font for typeset measurements. Browser prose uses the existing sans/serif faces and normal fallbacks.

CSS `:lang(en) { quotes: "“" "”" "‘" "’"; }` controls semantic `<q>` nesting only. An explicit non-English language subtree resets to `quotes: auto`. CSS does not convert arbitrary characters in text nodes.

## Checks and exceptions

Run `npm run check:typography` for formatter, data-boundary, search, email, label and source-audit checks. It is included in `check:production`, so any CI invoking that existing command also runs typography validation. This repository currently has no GitHub Actions CI workflow; none was added solely for punctuation.

The TypeScript AST audit inspects JSX text, human-readable attributes/properties, static UI strings and template fragments in `app` and `components`, plus named human-readable copy properties in `lib`. It deliberately excludes literal elements and editable values. It flags likely violations rather than trying to classify every string in arbitrary backend code. Dynamic display integrations are covered by unit/browser checks and review, not by a claim of exhaustive natural-language inference.

For an intentional ASCII example, place a narrowly scoped explanatory comment immediately before it:

```tsx
// typography-literal: Exact command users must paste into a terminal.
<code>{'docker exec app sh -c "node --version"'}</code>
```

The `typography-literal:` exception requires a reason. Prefer literal elements for technical examples. Keep exceptions local; do not disable the audit for entire directories.

`npm run check:typography:ui` requires a disposable database on localhost:55442 named `axildb_typography` and the app on localhost:3107. It refuses other database addresses. See the implementation report for setup, evidence and known validation limits.
