-- Add collection-scoped hierarchical locations and safely backfill legacy text locations.
ALTER TABLE "PlantInstance" ADD COLUMN "legacyLocationText" TEXT;
ALTER TABLE "PlantInstance" ADD COLUMN "currentLocationId" TEXT;

CREATE TABLE "LocationType" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "parentLocationId" TEXT,
    "locationTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "legacyLocationText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantLocationMove" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "movedByUserId" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "PlantLocationMove_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocationType_collectionId_name_key" ON "LocationType"("collectionId", "name");
CREATE INDEX "LocationType_collectionId_idx" ON "LocationType"("collectionId");
CREATE INDEX "LocationType_status_idx" ON "LocationType"("status");
CREATE INDEX "LocationType_sortOrder_idx" ON "LocationType"("sortOrder");

CREATE UNIQUE INDEX "Location_collectionId_code_key" ON "Location"("collectionId", "code");
CREATE INDEX "Location_collectionId_idx" ON "Location"("collectionId");
CREATE INDEX "Location_parentLocationId_idx" ON "Location"("parentLocationId");
CREATE INDEX "Location_locationTypeId_idx" ON "Location"("locationTypeId");
CREATE INDEX "Location_status_idx" ON "Location"("status");
CREATE INDEX "Location_sortOrder_idx" ON "Location"("sortOrder");

CREATE INDEX "PlantInstance_currentLocationId_idx" ON "PlantInstance"("currentLocationId");

CREATE INDEX "PlantLocationMove_collectionId_idx" ON "PlantLocationMove"("collectionId");
CREATE INDEX "PlantLocationMove_plantInstanceId_idx" ON "PlantLocationMove"("plantInstanceId");
CREATE INDEX "PlantLocationMove_fromLocationId_idx" ON "PlantLocationMove"("fromLocationId");
CREATE INDEX "PlantLocationMove_toLocationId_idx" ON "PlantLocationMove"("toLocationId");
CREATE INDEX "PlantLocationMove_movedByUserId_idx" ON "PlantLocationMove"("movedByUserId");
CREATE INDEX "PlantLocationMove_movedAt_idx" ON "PlantLocationMove"("movedAt");

ALTER TABLE "LocationType" ADD CONSTRAINT "LocationType_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_locationTypeId_fkey" FOREIGN KEY ("locationTypeId") REFERENCES "LocationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantInstance" ADD CONSTRAINT "PlantInstance_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantLocationMove" ADD CONSTRAINT "PlantLocationMove_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantLocationMove" ADD CONSTRAINT "PlantLocationMove_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantLocationMove" ADD CONSTRAINT "PlantLocationMove_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantLocationMove" ADD CONSTRAINT "PlantLocationMove_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantLocationMove" ADD CONSTRAINT "PlantLocationMove_movedByUserId_fkey" FOREIGN KEY ("movedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "PlantInstance"
SET "legacyLocationText" = NULLIF(BTRIM("location"), '')
WHERE "legacyLocationText" IS NULL
  AND NULLIF(BTRIM("location"), '') IS NOT NULL;

INSERT INTO "LocationType" ("id", "collectionId", "name", "abbreviation", "description", "sortOrder", "status", "updatedAt")
SELECT
  'loctype_' || md5(collection.id || ':legacy-location'),
  collection.id,
  'Legacy Location',
  'LEG',
  'Backfilled from legacy freeform plant instance location text.',
  0,
  'ACTIVE',
  CURRENT_TIMESTAMP
FROM "Collection" collection
WHERE EXISTS (
  SELECT 1
  FROM "PlantInstance" instance
  WHERE instance."collectionId" = collection.id
    AND NULLIF(BTRIM(instance."legacyLocationText"), '') IS NOT NULL
)
ON CONFLICT ("collectionId", "name") DO NOTHING;

WITH distinct_legacy AS (
  SELECT
    instance."collectionId",
    BTRIM(instance."legacyLocationText") AS legacy_location,
    ROW_NUMBER() OVER (PARTITION BY instance."collectionId" ORDER BY BTRIM(instance."legacyLocationText")) AS sequence
  FROM "PlantInstance" instance
  WHERE NULLIF(BTRIM(instance."legacyLocationText"), '') IS NOT NULL
  GROUP BY instance."collectionId", BTRIM(instance."legacyLocationText")
)
INSERT INTO "Location" ("id", "collectionId", "locationTypeId", "name", "code", "description", "sortOrder", "status", "legacyLocationText", "updatedAt")
SELECT
  'loc_' || md5(distinct_legacy."collectionId" || ':legacy-location:' || distinct_legacy.legacy_location),
  distinct_legacy."collectionId",
  location_type.id,
  distinct_legacy.legacy_location,
  'LOC-LEG-' || LPAD(distinct_legacy.sequence::text, 2, '0'),
  'Backfilled from legacy freeform plant instance location text.',
  distinct_legacy.sequence,
  'ACTIVE',
  distinct_legacy.legacy_location,
  CURRENT_TIMESTAMP
FROM distinct_legacy
JOIN "LocationType" location_type
  ON location_type."collectionId" = distinct_legacy."collectionId"
 AND location_type.name = 'Legacy Location'
ON CONFLICT ("collectionId", "code") DO NOTHING;

UPDATE "PlantInstance" instance
SET "currentLocationId" = location.id
FROM "Location" location
WHERE instance."collectionId" = location."collectionId"
  AND BTRIM(instance."legacyLocationText") = location."legacyLocationText"
  AND instance."currentLocationId" IS NULL;
