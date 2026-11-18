# Theme and component inventory

Source `952ab1b63e3c9cc19f0c9082c600f71089f93ee1`. Systematic scan: 180 implementation files, 85 component files. Full file/line literal-color inventory and nonvisual API routes are in source-inventory.json. API routes are outside visual screenshot scope.

Theme ownership: app/globals.css provides light/dark variables and compatibility selectors. app/layout.tsx sets the root theme early; ThemeToggle reads and persists axildb-theme. ForceLightTheme intentionally presents public/marketing views in light mode and restores the preferred root state without changing the preference. Print/export surfaces must preserve paper backgrounds.

Current dark theme: forest canvas #0f160f, solid surface #1e251b, ivory text #eee7d7, heading #fff3dc, muted #bdb5a5, accent #9bc38a. Translucent surfaces and a warm gradient require measuring actual compositing. Compatibility mappings contain 96 !important declarations; literal matches miss new hues and opacity variants.

Shared care-category and plant-tag tokens have explicit paired dark foreground/background/border roles. Their isolated palette fixture looks coherent; preserve category names and icons. Shared controls, cards, tables and forms are present in real route captures. Deployment progress (running/error/complete), photo framing, chart and disabled/read-only controls also have isolated static fixtures. Dialog runtime captured through care-cadence editing; login keyboard focus captured.

No blanket sign-off for every tooltip, dropdown, portal, toast, loading skeleton, native select, chart series, server error, upgrade state or responsive permission combination. Per-route coverage records default captures and gaps; source scan is evidence of inventory, not interaction coverage.

Light references are captured for dashboard, grid, cadence section, care queue and backup storage. Intentional public/print light surfaces remain outside dark remediation; follow-up implementation must regression-test these boundaries.

Architecture: Next.js App Router with server and client React components; Tailwind utility styling and global CSS variables; Prisma/PostgreSQL. Existing verification includes TypeScript, purpose-specific check scripts and Playwright browser tooling. This audit uses the existing production build against an isolated fixture database. The audit does not change app/theme entrypoints or run external providers.
