# AxilDB contributor guidance

Follow [the typographic and editorial standard](docs/design/typography.md) for human-readable copy.

- Use intended Unicode in static UI text and explicit display formatters for dynamic prose/measurements.
- Use the shared botanical renderer for scientific names; keep cultivars, ranks, hybrid signs and authorities upright.
- Keep canonical data, inputs, machine exports, commands, logs and identifiers exact. Do not rewrite stored data or scan/mutate the DOM for typography.
- Reuse existing fonts, themes, unit preferences, precision and calendar/timezone logic.
- Run `npm run check:typography`, applicable regression checks, TypeScript and production build for relevant changes. Document test limitations honestly.
