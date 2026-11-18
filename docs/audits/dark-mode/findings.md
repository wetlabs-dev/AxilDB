# Findings

## DM-001 · P1 · Activity badges lose their text

Workflow, Exhibit and Condition resolved inherit ivory text on opaque pastel backgrounds.

Proposed: Use paired semantic foreground/background tokens for each activity kind; retain icon and text labels.

Acceptance: All normal badge text ≥4.5:1 in both themes; check all activity kinds.

Source: `app/page.tsx: activity-kind badge styles`

[Current evidence](screenshots/annotated/activity-chips.dark.annotated.jpg)

Measurement: {"status": "Computed, opaque", "ratios": "Workflow 1.10:1; Exhibit 1.12:1; Condition resolved 1.17:1", "foreground": "#eee7d7", "background": "#eef2ff / #fff1f2 / #ecfdf5"}

## DM-002 · P1 · Backup storage text nearly disappears

A fixed #f5f7ee panel bypasses dark surfaces while inheriting ivory foreground. Diagnostics become unreadable.

Proposed: Replace panel literal with a semantic surface; keep warning, diagnostic and unavailable states separately paired.

Acceptance: Heading and metadata ≥4.5:1 unless large; test unavailable, loading, success and error states.

Source: `components/BackupStoragePanel.tsx: #backup-storage`

[Current evidence](screenshots/annotated/backup-storage.dark.annotated.jpg)

Measurement: {"status": "Computed, opaque", "ratios": "1.14:1", "foreground": "#eee7d7", "background": "#f5f7ee"}

## DM-003 · P1 · Primary action labels miss normal-text contrast

Primary actions use near-white labels on #4f8a5d. At ordinary button sizes the measured 4.02:1 falls below 4.5:1. This repeats across queue, dashboard and server actions.

Proposed: Separate action background from accent foreground; use a darker green action fill with light text.

Acceptance: Every enabled primary action label ≥4.5:1; preserve hover, pressed and disabled distinctions.

Source: `app/globals.css; components/ui.tsx`

[Current evidence](screenshots/current/shared-controls.component.desktop.dark.current.jpg)

Measurement: {"status": "Computed, opaque", "ratios": "4.02:1", "foreground": "#fffdf4", "background": "#4f8a5d"}

## DM-004 · P1 · Secondary approval actions have low contrast

Edit then Accept uses ivory normal text on a medium sage background.

Proposed: Use a dedicated secondary action role or outlined action with compliant text.

Acceptance: Normal action text ≥4.5:1; primary, secondary and destructive actions remain distinguishable.

Source: `app/server/ai-curator/page.tsx; secondary action color #6d7f6d`

[Current evidence](screenshots/annotated/ai-review.dark.annotated.jpg)

Measurement: {"status": "Computed, opaque", "ratios": "3.47:1", "foreground": "#eee7d7", "background": "#6d7f6d"}

## DM-005 · P1 · Overdue care badge is difficult to read

A fixed brown-red foreground sits over a translucent tinted background. Ancestor-composited estimate is 1.06:1; use the painted-measurements file for a localized actual-pixel cross-check.

Proposed: Use paired warning or overdue tokens and retain the overdue count and text.

Acceptance: Validate ≥4.5:1 at actual rendered backgrounds in both themes; never rely on hue alone.

Source: `components/CareQueueLocationBoard.tsx: overdue badge`

[Current evidence](screenshots/annotated/care-overdue.dark.annotated.jpg)

Measurement: {"status": "Gradient/compositing estimate; localized painted sample supplemental", "ratios": "Estimated 1.06:1; painted local sample 1.02:1 (#913e2d / #6a5149)", "foreground": "#913e2d", "background": "Estimated #674e48"}

## DM-006 · P1 · Care group metadata sits on a washed surface

White-opacity layers brighten the location header while muted text remains relatively dim. Estimated metadata contrast is 2.82:1.

Proposed: Give grouped headers an explicit dark surface and secondary text pair.

Acceptance: Location codes and group counts ≥4.5:1; nested groups remain distinct without a bright gray slab.

Source: `components/CareQueueLocationBoard.tsx: location group header`

[Current evidence](screenshots/current/care-queue.desktop.dark.current-detail.jpg)

Measurement: {"status": "Gradient/compositing estimate; painted sample supplemental", "ratios": "Estimated 2.82:1; painted local sample 2.64:1 (#bdb5a5 / #676c66)", "foreground": "#bdb5a5", "background": "Estimated #636763"}

## DM-007 · P2 · AI review color roles are inconsistent

Green/amber utility combinations and opacity variants are not consistently covered by the compatibility layer. Proposed and current sections vary in brightness and hierarchy. Some computed candidates require painted validation.

Proposed: Use shared status, comparison-current and comparison-proposed roles; preserve Changed and Can apply text.

Acceptance: Review pending, approved, rejected, blocked and stale states; text and icons carry meaning; remeasure all variants.

Source: `app/server/ai-curator/page.tsx: PrettyValue, status classes`

[Current evidence](screenshots/annotated/ai-review.dark.annotated.jpg)

Measurement: {"status": "Candidate only; gradients and opacity prevent blanket pass/fail", "ratios": "Examples in contrast-measurements.json"}

## DM-008 · P2 · Keyboard focus needs an explicit theme role

Focused email field reports transparent outline and only an inset shadow; inherited border overrides make the intended focus treatment hard to distinguish. This is a focus design finding, not a quantified WCAG violation.

Proposed: Apply a visible opaque focus outline with offset and retain it in dark and light themes.

Acceptance: Keyboard-only review of links, fields, buttons, dialogs and menus; compare focused/unfocused states and measure non-text contrast at the indicator.

Source: `components/ui.tsx; app/globals.css: focus and compatibility rules`

[Current evidence](screenshots/current/login.keyboard-focus.dark.current.jpg)

Measurement: {"status": "Observed computed style; no claimed indicator contrast ratio", "ratios": "Transparent 2px outline; inset rgba(0,0,0,.24) shadow"}

## DM-009 · P2 · Theme compatibility selectors are fragile

Large literal-color compatibility lists with !important cannot reliably cover every neutral family, opacity variant and new module. Source candidates are not automatically visible defects.

Proposed: Introduce semantic surface, field, action, status, chart and focus roles; migrate shared components first and retire compatibility mappings incrementally.

Acceptance: No new page-specific light literal without an intentional documented exception; regression gallery covers both themes and real conditional states.

Source: `app/globals.css; source-inventory.json`

[Current evidence](screenshots/current/instance-expanded.desktop.dark.current.jpg)

Measurement: Design/source observation, no numeric contrast claim.

## DM-010 · P3 · Choose the desired dark-mode character

Existing warm olive treatment is coherent in places, but layered translucency makes surface hierarchy variable. This is a design choice independent of accessibility repairs.

Proposed: Compare A refined existing, B botanical charcoal and C neutral charcoal. Recommend B as the starting direction, subject to owner review.

Acceptance: Approve a direction separately from individual fixes; verify all semantic palettes, print and intentionally light pages after implementation.

Source: `assets/proposed-treatments.css`

[Current evidence](screenshots/current/dashboard.desktop.dark.current-detail.jpg)

Measurement: Design/source observation, no numeric contrast claim.