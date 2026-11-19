# Validation

- Production build including TypeScript: passed.
- check:care-colors: passed; all families retain ≥4.5:1 in both themes.
- check:theme-harmonization: passed, including dark-token preservation, field/focus boundaries, chart lines/symbols.
- check:workflows and check:label-download: passed.
- Existing UI suites: check-plant-definition-layout-ui.mjs: passed, check-care-colors-ui.mjs: passed after transition-settle fix, check-magic-fill-review-ui.ts: passed, check-care-queue-responsiveness.mjs: passed, check-care-photos.mjs: passed
- Theme/browser checks: 18 assertions/groups recorded.
- Lint: shared changed components pass; splash has a pre-existing anchor error and six image warnings.
- No axe package is installed; custom computed contrast checks plus visual review are not a complete accessibility certification.

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