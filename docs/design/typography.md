# AxilDB typographic and editorial standard

This standard extends [quotation-mark guidance](../TYPOGRAPHY.md). It is part of the design system, alongside the existing botanical fonts, colors and spacing. Typography is presentation: canonical identities, numbers, inputs, evidence and interchange formats are not editorial copy.

## Mandatory boundaries

- Write intended Unicode directly in static English UI copy. Format dynamic prose at explicit display boundaries through `formatTypography`.
- Use `BotanicalName` for structured identities and the corresponding plain `plantDisplayName` for notifications, accessibility text and display-only payloads. Use canonical `plantName` for storage, taxonomic requests, comparisons and exports.
- Preserve raw inputs, option values, commands, logs, URLs, identifiers, NPK ratios, ISO dates, JSON, QR payloads and verbatim evidence. Never run presentation formatting over a document, React tree or DOM. Never normalize persisted records merely for typography.
- Keep diacritics, ʻokina and language-specific characters. Do not apply compatibility normalization to display strings. Search normalization is a separate, narrowly specified operation.

## Botanical names

Scientific genus and epithet runs are italic; ranks (`subsp.`, `var.`, `f.`), identification qualifiers (`sp.`, `spp.`, `cf.`, `aff.`), hybrid signs, cultivar epithets and authorities are upright. Genus capitalization and lowercase epithets are display conventions; stored spelling is retained. Explicit parent genera in hybrid formulas retain their capitalization. Do not expand parentage, reorder parents, invent authorities or convert trade names into cultivars.

Examples: *Hoya carnosa* ‘Chelsea’; *Hoya fungii* × *Hoya pubicalyx*; *Mentha* × *piperita*; ×*Fatshedera lizei*; *Hoya* cf. *carnosa*. A standalone x/X is replaced only in botanical fields. Authority text is copied exactly, upright. `accepted` rendering deliberately ignores a provisional label, while normal rendering respects it.

The conventions for hybrid formulas and named hybrids follow [ICN H.2](https://www.iapt-taxon.org/nomen/pages/main/art_h2.html) and [H.3](https://www.iapt-taxon.org/nomen/pages/main/art_h3.html). Spacing follows the underlying representation and readability; this is not a nomenclatural correction service.

## English punctuation

Use ‘ ’ and “ ” contextually, with ’ for apostrophes. Keep unambiguous existing punctuation. Ambiguous lone marks remain literal. Semantic `<q>` uses English outer double/inner single quotes; other language subtrees use native browser quotation conventions.

Prefer inclusive en-dash ranges without surrounding spaces: 7–10 days, April–June. Retain “from … to …” and “between … and …”. Negative ranges use “to”: −10 to −5 °C. Unspaced em dashes are the editorial preference for interruptions; do not automatically rewrite arbitrary spaced hyphens. Ordinary compound-word hyphens remain: slow-release fertilizer, root-bound plant. Nonbreaking hyphens are optional for a specific short compound, never blanket replacements in names or IDs.

Use … for actual ellipses (Researching…), not paths or spread syntax. Existing metadata separators use a spaced middle dot. A compound scientific unit uses an unspaced dot: μmol·m⁻²·s⁻¹. Preserve actual list semantics instead of inserting decorative bullet characters.

## Numbers, quantities and scientific notation

Use a nonbreaking space between a number and its known unit, including °C/°F. Plane angles and primes are exceptions: 45°, 6′, 12″. Examples: 25 °C, 250 mL, 12 m², 150 μmol·m⁻²·s⁻¹. Number/unit spacing and upright unit symbols follow [NIST SI guidance](https://www.nist.gov/pml/owm/writing-si-metric-system-units) and [unit symbol rules](https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-6-rules-and-style-conventions-printing-and-using).

AxilDB deliberately adopts compact English percentages (75%, 5–10%) rather than universally applying SI-style percentage spacing. `formatPercentage` has an explicit scientific-spacing option. Preserve specified precision, meaningful trailing zeroes, user-selected units and actual values. Do not silently reinterpret MB/Mb, GB/GiB, mS/MS or unknown units. Existing byte-unit meanings are retained in this refinement.

Use × between dimensions, but colons for aspect ratios: 2.25 × 1.25 in, 16:9. Common fractions are appropriate only in a known quantitative context: ½-strength, ¼ teaspoon, 1½ cups. Do not transform slash dates, NPK ratios or paths. `formatFraction` is explicit; arbitrary fractions retain a slash fallback, with `.ax-fraction` enabling font-supported fraction shaping only when deliberately applied.

Use actual −, ±, ≤, ≥, ≈ and other mathematical symbols only when their mathematical meaning is known. Prefer readable words where compact symbolism would obscure meaning. `formatScientificNumber` handles explicit powers of ten; `formatMathematicalNotation` handles explicitly mathematical operators, never code or fertilizer ratios. Chemistry is opt-in: `formatTypography(text, { mode: 'chemical' })` recognizes a small, documented set (CO₂, H₂O, O₂, NH₃, NO₃⁻, PO₄³⁻, Ca²⁺, Mg²⁺). Unknown formulas are preserved rather than guessed. Do not globally subscript digits after letters.

## Calendar and numerical interfaces

Calendar arithmetic, timezones, serialized dates and input parsers remain unchanged. Display times retain their existing precision and timezone, with English a.m./p.m.; an explicit 24-hour setting remains 24-hour. `formatDateRange` uses the collection timezone and Intl range formatting. Seasonal month/day ranges use an en dash. `formatCareInterval` produces Every day, Every week, Every 3 weeks, etc.; this does not convert calendar intervals into durations.

Use tabular lining numerals for metrics, numeric cells, countdown/progress displays and number controls. Keep proportional numerals in editorial prose. Reuse existing rounding and input conversion functions. Never parse a typeset value back into canonical storage.

## Browser typography, wrapping and accessibility

Enable normal kerning and standard/contextual ligatures for prose. Disable ligatures in monospaced technical content, IDs and editing controls. Do not insert presentation-form ligature characters. Small caps and discretionary ligatures are optional; no new small-cap visual system is introduced. Balance short headings and use pretty wrapping only for bounded editorial blocks, as progressive enhancements. Do not justify or automatically hyphenate scientific names, technical text or IDs. Long names may wrap; whole names and paragraphs must not become nonbreaking.

`BotanicalName` emits ordinary inline text nodes with `<i>` for scientific parts and upright spans for the rest. It does not duplicate the name in hidden text or replace the accessible name with markup. Keyboard behavior and controlled inputs remain unchanged. Screen-reader punctuation pronunciation varies; no claim of hardware screen-reader certification is made.

## Print, notifications and fonts

Existing Times label fonts are retained for supported glyphs, with bundled Inter for scientific characters outside their encoding. Reports retain their existing font choices where supported. Scientific runs use a portable oblique form of the existing face when a bundled italic is unavailable (standard PDF font substitutions otherwise vary by reader); cultivar/rank/sign runs remain upright. Width measurement uses the same fonts as rendering. Label MediaBox, margins, QR generation and identifier fonts remain unchanged; long-name text is fitted to its existing box.

Inter supports the required quote, prime, Greek, fraction, super/subscript and operator glyphs. Fraunces lacks some scientific superscripts/subscripts and Greek μ; use the bundled fallback, not an external font download. IBM Plex Mono remains the identifier face. Do not use the label ID font for scientific measurement prose. HTML/plain emails and push text share display formatting, with destinations and delivery semantics unchanged.

Trademarks, copyright and other legal symbols are used only when the underlying content supports them. Preserve authoritative names and legal evidence, rather than inventing claims or decorative symbols.

## Maintenance and checks

Run `npm run check:typography` (including editorial and canonical-data checks), the applicable unit/calendar checks, typechecking and production build. The production validation path includes the typography audit. Static AST inspection flags high-confidence quote, loading-ellipsis and dimension violations, excluding technical contexts and editable values. Ambiguous prose is reviewed, not automatically rewritten. A local `typography-literal: reason` comment documents an intentional ASCII example.

See [the implementation review](../audits/editorial-2026-11-19/README.md) for the actual visual/PDF coverage and limitations. The guide distinguishes mandatory data-integrity boundaries from AxilDB’s preferred editorial choices; it does not describe every editorial preference as a universal scientific rule.
