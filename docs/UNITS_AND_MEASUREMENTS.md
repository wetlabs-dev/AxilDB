# Units and measurements

AxilDB separates canonical storage from user-facing measurement units. A signed-in user can choose temperature and measured-light units on the Account page without changing the underlying collection records.

## Structured dimensions

| Dimension | Canonical storage | Display choices | Existing-data migration |
| --- | --- | --- | --- |
| Temperature | Celsius | Celsius or Fahrenheit | None; existing values already use Celsius |
| Measured light | Lux | Lux or foot-candles | None; existing values already use lux |
| Humidity | Percent | Percent | Not applicable |
| Fertilizer NPK | Percent | Percent | Not applicable |

AxilDB currently stores fertilizer dose, feed-water volume, pot size, and specimen size as descriptive source text. Those values are not silently parsed or converted. Manufacturer wording such as `1 tsp per gallon` remains exactly as entered. There are not yet structured mass or length fields that need a user preference.

## Conversion policy

- Fahrenheit is calculated as `(C × 9 / 5) + 32`; Celsius is calculated as `(F - 32) × 5 / 9`.
- One foot-candle is `10.7639 lux`.
- Environment forms display the signed-in user's unit and convert submitted values back to Celsius or lux on the server.
- Unchanged converted form values retain the exact existing canonical number to avoid repeated rounding drift.
- Compatibility calculations always compare canonical values. Only their labels and displayed ranges are converted.
- Account-scoped plant-definition CSV exports use the requesting user's preference and put the unit in every converted column heading.
- Public pages, background jobs, AI payloads, and shared output without a user context use Celsius and lux. AI fields keep explicit canonical unit names.
- Numeric form input uses a period as the decimal separator and rejects malformed or non-finite values.

## Adding another dimension

Add a structured canonical database field first, then add typed conversion and formatting functions under `lib/units`. Convert only at form/API boundaries, include an explicit unit in exports and AI schemas, and add round-trip, negative/decimal, null, and malformed-input tests. Never infer a unit from an unlabeled number or convert existing freeform source text.
