# Botanical Charcoal theme

Implements approved DM-001 through DM-010 from the audit of revision 952ab1b.

The dark foundation uses #151a17 canvas, #202722 surface, #263029 elevated surface, #181e1a fields, #e7ebe3 text, #bbc6ba secondary text and #8ebb91 botanical accents. Accent foregrounds and action fills are separate: enabled primary actions use #f1f6ee on #315c42 (6.99:1).

Use `ax-surface`, `ax-surface-elevated`, `ax-surface-inset`, `ax-text-muted`, `ax-action`, `ax-action-secondary`, `ax-action-danger` and paired `ax-status-{success,warning,info,violet,rose}` roles for new components. Tokens are declared for both themes in app/globals.css. Text/icons continue to identify categories and statuses; the established care and plant-tag palettes are preserved. Shared Button/LinkButton use action roles by default and retain explicit background overrides. Legacy literal utility mappings remain for existing screens and now consume the new foundations; migrate those incrementally rather than deleting them without coverage.

Audited modules migrated to roles: dashboard activity types, backup storage, Care Queue location panels and overdue chips, Curator comparison/status panels and secondary actions, instance neutral forms, photo framing, shared cards/controls and navigation. Keyboard focus uses an opaque 2px outline with 3px offset in both themes and a system Highlight outline in forced colors. Intentional public/light and paper-print behavior remains separate.

No schema, worker, API or host configuration changes. Deploy through the normal Web application update.

The original audit is historical evidence; its images and decisions have not been rewritten to imply that they describe the new revision. Implementation verification lives in docs/theme-verification. Browser checks use isolated fictional fixtures and block mutations/external requests. These checks do not certify every workflow, browser, screen reader or native picker.

## Approved recommendation mapping

| Finding | Implementation |
|---|---|
| DM-001 | Dashboard activity foreground/background pairs, including thumbnail icons |
| DM-002 | Backup storage uses the shared surface role |
| DM-003 | Shared and legacy primary actions use dark action fills with light labels |
| DM-004 | Curator and collection secondary actions use a dedicated action pair |
| DM-005 | Overdue chip uses the warning pair and keeps its text/count |
| DM-006 | Location groups use a solid shared surface with readable metadata |
| DM-007 | Curator status and comparison states use success/warning roles, including formerly translucent panels |
| DM-008 | Shared keyboard outline in both themes, plus forced-color support |
| DM-009 | Shared controls/cards, instance forms, framing and status owners use semantic roles; legacy mappings retained for incremental migration |
| DM-010 | Botanical Charcoal foundation, navigation and chart/lineage surfaces |

## Verification

Production build (including TypeScript) and `scripts/check-botanical-theme.mjs`. The browser check requires a local preview on port 3107 and the disposable audit fixture context; see the original audit's reproduction notes. It checks nine real routes in light/dark at desktop/mobile sizes, opens/closes the cadence dialog, measures enabled semantic text pairs, primary hover and focus indicator contrast, and verifies paper and public/marketing boundaries. It also renders actual production controls, palette chips, photo framing, metric charts and three deployment-progress states with fictional props. See results.json and screenshots in theme-verification.
