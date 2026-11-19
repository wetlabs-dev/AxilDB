# AxilDB theme conventions

Light mode uses a warm botanical canvas with solid paper-like cards, restrained sage insets and forest actions. Dark mode retains the owner-approved Botanical Charcoal foundation. Both use the same CSS roles, component anatomy, typography and interactions. The existing root theme script, ThemeToggle and system-preference listener remain authoritative; do not add a theme provider, component-specific theme fetch or render-time palette calculation.

## Surface and text roles

Use `--ax-bg` for canvas, `--ax-nav` for navigation, `--ax-surface` / `--ax-surface-solid` for standard cards, `--ax-elevated` for raised content and `--ax-field` for editable/inset fields. The corresponding classes are `ax-surface`, `ax-surface-elevated` and `ax-surface-inset`. Decorative divisions use `--ax-border` or `--ax-border-subtle`; meaningful editable boundaries use `--ax-border-strong`. Decorative borders do not need to meet the same contrast requirement as a control boundary.

Body text consumes `--ax-text`, headings `--ax-heading`, secondary copy `--ax-text-secondary` and small metadata `--ax-muted`. Keep the established AxilDB Sans/Serif and identifier/label font stacks. Small text should not be made faint by reducing opacity on its container. Preserve underlines or other non-color link cues.

```tsx
<Card>
  <h3>Observed care</h3>
  <p className="ax-text-muted">Reviewed collection metadata</p>
  <Field name="notes" label="Notes" />
  <Button>Save</Button>
</Card>
```

Shared cards receive light-only border/shadow refinement. Explicit background overrides on Card/Button retain their existing intent. New components should prefer semantic variants instead of inventing another light literal and adding a dark compatibility selector later.

## Actions, focus and status

Default Button/LinkButton use `--ax-action` and `--ax-action-text`; secondary actions use `ax-action-secondary`, destructive actions use DangerButton / `ax-action-danger`. Keep disabled/read-only states distinguishable from enabled controls. The shared opaque keyboard outline uses `--ax-focus`, with a system Highlight alternative for forced colors.

Status owners use `ax-status-success`, `ax-status-warning`, `ax-status-info`, `ax-status-violet` or `ax-status-rose`. These pair text, surface and border values in both themes. Status text/icon labels must carry the meaning independently of hue. AI confidence, definition completeness and care urgency have different meanings; do not reuse a success color to imply botanical verification.

```tsx
<div className="ax-status-warning rounded-md border p-3">
  Review required: verify the proposed interval before applying it.
</div>
<CareCategoryBadge type="WATER" />
<PlantTagChip tag={tag} />
```

Care badges/cards consume the existing care-category presentation mapping. Tag colors consume the existing --palette-* families. Preserve stored category, color, icon, visibility and assignments. Category tint must not encode urgency or completion.

## Charts, graphs and print

MetricChart uses --ax-chart-* roles for surfaces, labels, series, grid, tooltips and symbols. Measure SVG `fill` / `stroke`, not just DOM `color`; markers need readable glyphs against their own fills. Lineage label roles are --ax-graph-label*, with existing method colors/dashes and graph geometry preserved. Do not theme botanical photographs with filters.

Print media and intentional public-light interfaces remain explicit exceptions. Keep label/QR/barcode dimensions, pure ink/paper colors and PDF export geometry independent of screen refinements. Do not indiscriminately replace fixed brand, print or data-series colors.

## Verification and evidence

`npm run check:theme-harmonization` guards the accepted dark token values and important light/dark contrast pairs. `npm run check:care-colors` checks category identities and paired colors. Existing browser coverage tests real care operations, photo workflows, mocked Magic Fill reviews, tag editing and card layouts. The theme-only browser harness additionally checks responsive widths, navigation, system-theme changes, dialogs and paper backgrounds.

The implementation report, starting inventory, final token reference and limitations are under docs/audits/light-mode. Keep large screenshot galleries out of Git; retain small representative comparisons and a portable local bundle. Revalidate actual compositing, active/hover/selected states, images, opacity and gradients; nominal token ratios alone do not establish application-wide accessibility conformance. This refinement does not claim screen-reader or hardware-printer certification.

Quotation marks and botanical display names follow [the typography convention](TYPOGRAPHY.md). Use Unicode in static copy and explicit display formatters for dynamic prose; keep inputs and technical data literal.

The expanded [typographic and editorial standard](design/typography.md) governs botanical styles, numerical typography, scientific units and literal-content boundaries.
