# Proposed palettes — demonstrations only

A retains current warm forest/ivory foundations and demonstrates paired status colors, darker action fill and visible focus. B uses botanical charcoal with solid layered surfaces; recommended for review. C uses neutral charcoal with botanical accents. None has been implemented in AxilDB.

## A

| Role | Proposed value |
|---|---|
| `--audit-elevated` | `#263029` |
| `--audit-action` | `#315c42` |
| `--audit-focus` | `#a0c69a` |

## B

| Role | Proposed value |
|---|---|
| `--ax-bg` | `#151a17` |
| `--ax-bg-soft` | `#181e1a` |
| `--ax-bg-warm` | `#191f1b` |
| `--ax-surface` | `#202722` |
| `--ax-surface-solid` | `#202722` |
| `--ax-surface-muted` | `#263029` |
| `--ax-field` | `#181e1a` |
| `--ax-text` | `#e7ebe3` |
| `--ax-heading` | `#f1f6ee` |
| `--ax-muted` | `#bbc6ba` |
| `--ax-muted-strong` | `#bbc6ba` |
| `--ax-border` | `#39463c` |
| `--ax-border-strong` | `#536457` |
| `--ax-primary` | `#8ebb91` |
| `--audit-nav` | `#191f1b` |
| `--audit-elevated` | `#263029` |
| `--audit-action` | `#315c42` |
| `--audit-focus` | `#a0c69a` |

## C

| Role | Proposed value |
|---|---|
| `--ax-bg` | `#17191a` |
| `--ax-bg-soft` | `#1b1d1f` |
| `--ax-bg-warm` | `#202224` |
| `--ax-surface` | `#232628` |
| `--ax-surface-solid` | `#232628` |
| `--ax-surface-muted` | `#2b3032` |
| `--ax-field` | `#1b1d1f` |
| `--ax-text` | `#e8e9e6` |
| `--ax-heading` | `#f2f3ef` |
| `--ax-muted` | `#adb4ae` |
| `--ax-muted-strong` | `#c2c9c3` |
| `--ax-border` | `#414946` |
| `--ax-border-strong` | `#65716a` |
| `--ax-primary` | `#a3c6a3` |
| `--audit-nav` | `#1d2020` |
| `--audit-elevated` | `#2b3032` |
| `--audit-action` | `#315742` |
| `--audit-focus` | `#b0d1aa` |

Browser-injected CSS is retained in assets/proposed-treatments.css for traceability. It contains successive direction blocks for documentation; do not load the whole file into production. Shared demo corrections are deliberately broad and need component-level implementation, interaction testing and measured contrast before approval. Untreated comparison views may retain defects. Color remains supplemental to text, icon and state labels.

## B: foundational semantic pairs

Calculated opaque sRGB contrast; these pairs are proposals, not proof of every rendered component. Borders are decorative unless they identify a control; do not claim a decorative border AA pass.

| Role | Foreground | Background | Contrast |
|---|---|---|---|
| Primary text | `#e7ebe3` | `#202722` | 12.65:1 |
| Secondary text | `#bbc6ba` | `#202722` | 8.66:1 |
| Accent link | `#8ebb91` | `#202722` | 7.03:1 |
| Action label | `#f1f6ee` | `#315c42` | 6.99:1 |
| Focus vs canvas | `#a0c69a` | `#151a17` | 9.26:1 |
| Success text | `#b5d4ad` | `#233425` | 8.17:1 |
| Warning text | `#f0d28f` | `#3c321e` | 8.59:1 |
| Danger text | `#ef9a8c` | `#3b2724` | 6.44:1 |
| Info text | `#b6d7ef` | `#233340` | 8.62:1 |

Current values are recorded in source-inventory.json (light and dark tokens). B proposes inset #181e1a, elevated #263029, disabled text #929f93 (inactive only), selection #314c36 with #e7ebe3 text, chart series #8ebb91 / #f0d28f / #b6c5ee / #eab2c1, and shadow rgba(0,0,0,.28). Validate chart lines against every surface and use shape/labels in addition to color. Existing care/tag paired tokens should remain authoritative rather than adopting status colors blindly.
