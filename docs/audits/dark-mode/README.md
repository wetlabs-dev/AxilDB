# AxilDB dark mode design audit

Open [visual-review.html](visual-review.html) in a browser. Keep this entire directory together; all images and scripts are local. No server or internet is required for review.

Source: `952ab1b63e3c9cc19f0c9082c600f71089f93ee1` · application 0.2.0 · captured 2026-11-18T16:15:28.896Z. Audit only: production code, schemas, preferences and real records were not changed. No Web or host deployment is required.

100 route templates captured at desktop and mobile widths; 96 initial-state reviews, 3 redirect aliases and 1 unavailable sitter interior. 62 additional current, proposed, annotated and light-reference views. 85 component files source-scanned; that is not a claim of full runtime coverage.

Findings: {'P0': 0, 'P1': 6, 'P2': 3, 'P3': 1}. P1 includes four opaque computed contrast failures and two gradient candidates with localized painted confirmation. P2 focus finding has no claimed conformance ratio. No blanket accessibility certification. The source revision must be revalidated if the application changes before implementation.

Review controls save decisions in this browser only. Export JSON or Markdown to retain decisions; nothing is sent to AxilDB. Export before moving to another browser. File-browser storage may be unavailable, so export remains the durable record.

- [Executive summary](executive-summary.md)
- [Findings](findings.md) and [machine-readable findings](findings.json)
- [Coverage](coverage.json), [theme inventory](theme-inventory.md), [source inventory](source-inventory.json)
- [Palette proposals](proposed-palette.md), [implementation roadmap](implementation-roadmap.md)
- [Computed contrast samples](contrast-measurements.json), [localized painted samples](painted-measurements.json)

## Limitations

- Sitter session interior: fixture token belonged to care-sheet mode; 404 captured, not reviewed.
- Live deployment agent, filesystem garbage collection, real notification delivery, uploads, native camera/picker, provider errors and destructive confirmation completion not exercised.
- No Safari/Firefox/device hardware or screen-reader audit. Mobile route defaults captured, not every conditional state.
- No end-to-end persistence, keyboard traversal of every workflow or all user permissions.
- Initial-route contrast candidates may include closed-detail content; findings rely on targeted visible states or explicitly labeled estimates.

## Reproduction

Tools under `tools/` are audit utilities, not production services. They assume a disposable local PostgreSQL database on port 55441 named `axildb_dark_audit`, existing built application on port 3107, and temporary credentials at `/tmp/axildb-dark-audit-context.json`. Seed-base guards against a different database URL. Run only against a clean disposable database; do not point at production. Fixtures use fictional records and no providers or workers. Capture blocks mutations and external HTTP. The component harness renders production components statically; behavior is not exercised. Temporary credentials are deliberately absent from this package.

Capture route defaults with `node tools/capture.mjs`, additional states with `node tools/extra-captures.mjs`, and painted samples with `node tools/painted-measurements.mjs` from the repository root using the full audit tool paths. `build-report.py` consumes the temporary raw capture files, which are not retained in this portable package. Re-capture recreates them.
