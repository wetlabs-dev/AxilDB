# Implemented findings

## LM-001 — Warm, solid surface hierarchy

Light mode mixed translucent cream surfaces, tinted nested modules and ornamental canvas gradients.

Implemented: Warm #f5f3e9 canvas, #faf9f3 cards, #fffdf8 raised/field surfaces, #eeefe5 inset areas, and light-only shared card/navigation shadow/border refinement. Same anatomy, fonts and density.

Files: app/globals.css, components/ui.tsx

Dark impact: Existing accepted dark tokens unchanged.

Measurements: Design/architecture correction; no invented contrast claim.

## LM-002 — Recognizable editable controls

Light field boundaries measured 1.71:1 against the field; pale borders were indistinguishable from decorative dividers.

Implemented: Shared editable controls now use emphasized #7b8878 borders, distinct field surface, explicit placeholder tone and muted read-only/disabled surfaces.

Files: app/globals.css

Dark impact: Existing dark field/focus tokens unchanged.

Measurements: {"before": "1.71:1 field boundary", "after": "3.67:1 field boundary; light focus 5.00:1 against field", "method": "Actual computed opaque field colors in foundations.before/after.json; no inactive-control contrast requirement asserted."}

## LM-003 — Readable small metadata

Small metadata on tinted care cards and public exhibits measured below 4.5:1 (examples 4.44 and 4.33).

Implemented: Route legacy light metadata through shared #606b61 muted and #465348 secondary roles, preserving type sizes.

Files: app/globals.css

Dark impact: Mappings are light-only; intentionally light public surfaces remain light.

Measurements: {"before": "Care metadata 4.44:1; exhibit captions 4.33:1", "after": "Muted role 5.28:1 on the main card; actual route samples recorded in measurements.json", "method": "Computed ancestor-composited route samples. Uncertainty retained for gradients/opacity; not a full WCAG certification."}

## LM-004 — Charts consume theme roles

Metric charts forced a dark surface in light mode; the white warning symbol on amber lacked normal-text contrast.

Implemented: Theme-aware chart surface, labels, series, grid, tooltip and marker pairs; identical plot geometry, data and clustering.

Files: components/MetricChart.tsx, app/globals.css

Dark impact: Dark chart foundation/series/tooltip values retained. Amber and resolved symbols deliberately use dark text to correct contrast.

Measurements: {"before": "Warning symbol #fffdf7 on #d6a533 approximately 2.22:1", "after": "Light warning symbol white on #80601e 5.82:1; dark symbols checked \u22654.5:1", "method": "Opaque SVG fill pairs, separately validated by check:theme-harmonization; DOM color scans alone do not measure SVG fills."}

## LM-005 — Calm lineage surfaces and labels

Layered gradients and fixed label colors bypassed theme roles.

Implemented: Light graph uses recessed canvas, raised readable nodes and quieter shadows. Label fills/text/borders consume shared roles; edge colors, widths, dash patterns, layout and relationships retained.

Files: components/LineageGraph.tsx, app/globals.css

Dark impact: Dark graph label role values match the previous fixed colors.

Measurements: Design/architecture correction; no invented contrast claim.

## LM-006 — Readiness belongs to the surface hierarchy

Readiness used a separate translucent yellow-beige panel.

Implemented: Light readiness panels use the shared inset surface/divider roles. Completeness values, labels and progress geometry remain unchanged.

Files: components/PlantDefinitionCompleteness.tsx, app/globals.css

Dark impact: Dark styling unchanged; confidence/completeness meaning not conflated.

Measurements: Design/architecture correction; no invented contrast claim.

## LM-007 — Readable botanical support action

The normal-size white Ko-fi action label on terracotta measured 3.34:1.

Implemented: Preserve the terracotta brand fill and use dark heading text; hover remains readable.

Files: app/splash/page.tsx

Dark impact: Marketing continues to force light mode.

Measurements: {"before": "3.34:1", "after": "4.92:1 normal label; hover pair separately checked", "method": "Opaque foreground/background calculation and actual route scan."}

## LM-008 — Opacity does not hide actionable labels

Whole-card archival opacity and unselected filter opacity dimmed text as well as decorative surfaces. Ancestor opacity is a separate compositing risk.

Implemented: Keep activity card/filter text fully opaque in light mode. Existing selection ring and aria-pressed states retain selection cues; archival labels and image grayscale retained.

Files: app/page.tsx, app/globals.css

Dark impact: Light-only override; accepted dark dimming unchanged.

Measurements: {"before": "Group-opacity candidate, not assigned an exact baseline ratio", "after": "Full text opacity; computed metadata roles meet threshold on the rendered surfaces", "method": "Visible light-state opacity assertions, plus sampled text checks. No fabricated gradient ratio."}