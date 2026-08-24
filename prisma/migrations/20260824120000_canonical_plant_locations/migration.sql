-- Resolve every remaining free-form plant location before removing the legacy columns.
-- Existing exact, case-insensitive matches are used only when they are unambiguous.
CREATE TEMP TABLE "_LegacyPlantLocationResolution" ON COMMIT DROP AS
SELECT
  instance."id" AS "plantInstanceId",
  instance."collectionId",
  COALESCE(
    NULLIF(BTRIM(instance."legacyLocationText"), ''),
    NULLIF(BTRIM(instance."location"), '')
  ) AS "legacyValue",
  NULL::TEXT AS "resolvedLocationId",
  NULL::TEXT AS "resolution"
FROM "PlantInstance" instance
WHERE instance."collectionId" IS NOT NULL
  AND instance."currentLocationId" IS NULL
  AND COALESCE(
    NULLIF(BTRIM(instance."legacyLocationText"), ''),
    NULLIF(BTRIM(instance."location"), '')
  ) IS NOT NULL;

WITH unique_matches AS (
  SELECT
    pending."plantInstanceId",
    MIN(location."id") AS "locationId"
  FROM "_LegacyPlantLocationResolution" pending
  JOIN "Location" location
    ON location."collectionId" = pending."collectionId"
   AND LOWER(BTRIM(location."name")) = LOWER(pending."legacyValue")
  GROUP BY pending."plantInstanceId"
  HAVING COUNT(*) = 1
)
UPDATE "_LegacyPlantLocationResolution" pending
SET
  "resolvedLocationId" = unique_matches."locationId",
  "resolution" = 'MATCHED_EXISTING'
FROM unique_matches
WHERE pending."plantInstanceId" = unique_matches."plantInstanceId";

INSERT INTO "LocationType" (
  "id", "collectionId", "name", "abbreviation", "description", "sortOrder", "status", "updatedAt"
)
SELECT DISTINCT
  'loctype_' || md5(pending."collectionId" || ':legacy-imported-location'),
  pending."collectionId",
  'Legacy Imported Location',
  'LEG',
  'Created while retiring the former free-form plant location field. Review these locations when convenient.',
  9990,
  'ACTIVE',
  CURRENT_TIMESTAMP
FROM "_LegacyPlantLocationResolution" pending
WHERE pending."resolvedLocationId" IS NULL
ON CONFLICT ("collectionId", "name") DO NOTHING;

WITH unresolved AS (
  SELECT DISTINCT pending."collectionId", pending."legacyValue"
  FROM "_LegacyPlantLocationResolution" pending
  WHERE pending."resolvedLocationId" IS NULL
)
INSERT INTO "Location" (
  "id", "collectionId", "parentLocationId", "locationTypeId", "name", "code",
  "description", "sortOrder", "status", "updatedAt"
)
SELECT
  'loc_' || md5(unresolved."collectionId" || ':legacy-imported:' || LOWER(unresolved."legacyValue")),
  unresolved."collectionId",
  NULL,
  location_type."id",
  unresolved."legacyValue",
  'LOC-LEG-' || UPPER(SUBSTRING(md5(unresolved."collectionId" || ':' || LOWER(unresolved."legacyValue")) FROM 1 FOR 10)),
  'Imported from the retired free-form Location field. A separate Location was created because no unique exact match was available.',
  9990,
  'ACTIVE',
  CURRENT_TIMESTAMP
FROM unresolved
JOIN "LocationType" location_type
  ON location_type."collectionId" = unresolved."collectionId"
 AND location_type."name" = 'Legacy Imported Location'
ON CONFLICT ("collectionId", "code") DO NOTHING;

UPDATE "_LegacyPlantLocationResolution" pending
SET
  "resolvedLocationId" = location."id",
  "resolution" = 'CREATED_RECONCILIATION_LOCATION'
FROM "Location" location
WHERE pending."resolvedLocationId" IS NULL
  AND location."id" = 'loc_' || md5(pending."collectionId" || ':legacy-imported:' || LOWER(pending."legacyValue"));

UPDATE "PlantInstance" instance
SET "currentLocationId" = pending."resolvedLocationId"
FROM "_LegacyPlantLocationResolution" pending
WHERE instance."id" = pending."plantInstanceId"
  AND pending."resolvedLocationId" IS NOT NULL;

DO $$
DECLARE
  migrated_count INTEGER;
  matched_count INTEGER;
  created_count INTEGER;
  unresolved_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM "_LegacyPlantLocationResolution";
  SELECT COUNT(*) INTO matched_count FROM "_LegacyPlantLocationResolution" WHERE "resolution" = 'MATCHED_EXISTING';
  SELECT COUNT(*) INTO created_count FROM "_LegacyPlantLocationResolution" WHERE "resolution" = 'CREATED_RECONCILIATION_LOCATION';
  SELECT COUNT(*) INTO unresolved_count FROM "_LegacyPlantLocationResolution" WHERE "resolvedLocationId" IS NULL;
  RAISE NOTICE 'Canonical location migration: % plants, % matched existing, % assigned to imported reconciliation locations, % unresolved.', migrated_count, matched_count, created_count, unresolved_count;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Canonical location migration left % plant locations unresolved; legacy columns were not dropped.', unresolved_count;
  END IF;
END $$;

ALTER TABLE "PlantInstance" DROP COLUMN "legacyLocationText";
ALTER TABLE "PlantInstance" DROP COLUMN "location";
ALTER TABLE "Location" DROP COLUMN "legacyLocationText";
