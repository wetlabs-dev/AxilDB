# Light-mode refinement and theme harmonization

Source `bc646216ecfa5e0f1915efa8973ad541e522a84c`; owner-approved dark precedent bc64621. Eight consolidated findings implemented. No live deployment, schema, business-rule, provider or host configuration changes. Use normal Web deployment.

## Review artifacts

The **complete portable offline report and screenshot gallery** is generated locally at:

`/Users/dcurry/.codex/visualizations/2026/10/22/01a16439-2af8-7021-8687-9b642a4e911e/axildb-light-mode-2026-11-19/visual-review.html`

Keep the full directory together. It contains 200 baseline light screenshots, 200 after light screenshots, 32 representative dark route screenshots and 80 conditional/component screenshots. The Git-tracked visual-review.html is a deliberately small representative report; full binaries remain outside Git so application updates do not need to download another large audit archive.

- [Executive summary](executive-summary.md)
- [Design precedent](design-precedent.md)
- [Implemented findings](implemented-findings.md)
- [Final palette](final-palette.md)
- [Coverage](coverage.json) (screenshot paths refer to the full local bundle)
- [Measurements](measurements.json)
- [Validation](validation-report.md)

## Reproduction

The tools reuse the prior audit's disposable local database fixtures, guarded to localhost/127.0.0.1:55441/axildb_dark_audit, and temporary session context under /tmp. Do not use production data or credentials. Local preview is port 3107; providers and workers remain disabled. Set AXILDB_LIGHT_ARTIFACT_ROOT to a directory outside Git, AXILDB_CAPTURE_PHASE=before or after and AXILDB_CAPTURE_THEME=light or dark. Route capture resumes from its phase manifest; clear the corresponding manifest to start fresh. Conditional captures use static production markup prepared by the previous component-fixtures.ts utility and runtime dialogs.

Baseline capture must happen before production-source edits. Rebuild the application before after captures. Existing UI checks are run against this isolated DB by adapting only their disposable-database guards; temporary test copies are deleted. Functional test fixtures create/clean their own records.

The source inventory is the frozen starting inventory used for the accepted-dark-token regression guard; final-palette.md reflects implemented values. Regeneration requires raw capture inputs; they are local intermediates, excluded from the portable ZIP and Git. No runtime dependency or theme provider was added.

## Limits

- One baseline dark mobile graph image contains a resize/sticky-header capture artifact; its pixel comparison is inconclusive. Final graph appearance and unchanged dark role values were reviewed separately.
- Dark Server Management full-page heights differ with dynamic diagnostics; those images are not asserted pixel-identical. Other representative dark captures are identical or near-identical in the recorded thresholded comparison.
- Automated initial-state capture/contrast sampling spans all 100 route templates; 3 redirect aliases are partial, not interior sign-off. Human visual review focuses on representative modules and overview sheets.
- Default text scan is bounded to 550 direct-text elements per page; SVG fill, native widgets, group opacity and gradients need separate validation. Disabled controls and color emoji are excluded from normal text assertions.
- Eight representative dark route templates plus 40 conditional/component state captures across both themes; not every dark workflow was recaptured. Existing dark token values are regression-checked.
- Static deployment/chart/control fixtures render actual production components with fictional props; they do not run real deployment operations or provider calls.
- No live-server changes, paid AI research, real notification delivery, native camera capture, hardware printing or screen-reader/Firefox/Safari certification.
- Authentication screens were visually captured; password recovery, real 2FA login, invitation email and external provider workflows are not end-to-end verified.
- Existing splash-page lint issue (plain internal anchor) and six image warnings predate this pass; no new lint errors in changed shared components.
- Large production-sized collections and every possible tag icon combination were not exercised. Existing layout checks cover 12 definition cards and long cultivar names; all care/tag color families are measured.
- Offscreen lazy photos can remain unloaded in long full-page captures; baseline/after retain matching fixtures, and real photo upload/framing behavior is exercised separately.
