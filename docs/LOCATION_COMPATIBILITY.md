# Location Environment Compatibility

AxilDB stores local environmental observations in `LocationEnvironmentProfile`, one optional profile per structured `Location`. Existing locations remain valid with no profile. The migration does not infer conditions from location names or types.

## Effective Location Environment

`getEffectiveLocationEnvironment(client, collectionId, locationId)` resolves each field independently. It starts at the selected location and walks toward the hierarchy root. The nearest non-null value wins. Resolved values include the source location ID, code, name, and an inherited flag. Values are never copied into child profiles.

All resolver queries require `collectionId`. A location outside that collection is treated as missing. Existing hierarchy cycle prevention remains the first line of defense; the resolver also tracks visited IDs defensively.

Temperature is stored canonically in Celsius. Humidity is relative percent, light measurements are lux, and photoperiod is hours per day. Qualitative state remains in string fields so vocabulary can evolve without a destructive enum migration.

## Plant Requirements

`getEffectivePlantEnvironmentRequirements` resolves structured requirements in this order:

1. Specimen husbandry override, field by field.
2. Local definition husbandry guide.
3. A live-linked definition guide.
4. The definition linked as its validated definition.
5. Unknown.

Freeform husbandry remains useful to people but is not parsed into numeric requirements. Compatibility rules consume only the structured fields.

## Compatibility Rules

`evaluatePlantLocationCompatibility` is pure and deterministic. Range overlap is a match; partial overlap is a caution; disjoint ranges are a conflict. Material temperature and humidity gaps receive stronger wording. Qualitative light uses an ordered scale, while direct exposure is checked separately. Draft sensitivity, still air, and stability preferences produce cautious warnings. Missing values produce `UNKNOWN`, not an inferred mismatch.

Overall statuses are:

- `GOOD_MATCH`: at least one match and no caution/conflict.
- `CAUTION`: one or more cautions or non-high conflicts.
- `POOR_MATCH`: at least one high conflict.
- `INSUFFICIENT_DATA`: no meaningful match, caution, or conflict can be calculated.

Messages deliberately use advisory language. The engine does not calculate a health score, predict survival, alter care schedules, or prevent placement.

## Movement And Auditing

Individual, drag/drop, and batch movement paths preflight compatibility. Cautions and poor matches require explicit user acknowledgment, then proceed. `PlantLocationMove` stores the evaluated status, acknowledgment date, and optional note. AxilDB emits `plant.location_compatibility_warning_acknowledged` and retains the normal `plant.location_moved` event. Temporary quarantine placement bypasses long-term compatibility enforcement and is recorded as temporary quarantine placement.

## Adding Dimensions

Add a nullable field to both the location profile and plant guide/override, include it in the relevant resolver field list, then add a pure category check. Keep unknown handling explicit, preserve collection scoping, add inheritance and rule tests, and avoid parsing freeform prose when a structured field exists.

## Testing

Run `npm run check:location-compatibility`. Coverage includes nearest-ancestor inheritance, collection scoping, range overlap/conflict behavior, light exposure, airflow, insufficient data, specimen precedence, and validated-definition fallback. Run `npm run check:production` before deployment.
