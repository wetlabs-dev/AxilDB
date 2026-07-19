ALTER TABLE "PlantHusbandryGuide"
  ADD COLUMN "environmentTemperatureMinC" DOUBLE PRECISION,
  ADD COLUMN "environmentTemperatureMaxC" DOUBLE PRECISION,
  ADD COLUMN "environmentNightTemperatureMinC" DOUBLE PRECISION,
  ADD COLUMN "environmentNightTemperatureMaxC" DOUBLE PRECISION,
  ADD COLUMN "environmentHumidityMinPercent" DOUBLE PRECISION,
  ADD COLUMN "environmentHumidityMaxPercent" DOUBLE PRECISION,
  ADD COLUMN "environmentLightLevel" TEXT,
  ADD COLUMN "environmentLightExposure" TEXT,
  ADD COLUMN "environmentLightMinLux" INTEGER,
  ADD COLUMN "environmentLightMaxLux" INTEGER,
  ADD COLUMN "environmentPhotoperiodMinHours" DOUBLE PRECISION,
  ADD COLUMN "environmentPhotoperiodMaxHours" DOUBLE PRECISION,
  ADD COLUMN "environmentAirflowLevel" TEXT,
  ADD COLUMN "environmentStability" TEXT,
  ADD COLUMN "environmentAvoidDrafts" BOOLEAN,
  ADD COLUMN "environmentSeasonalNotes" TEXT;

ALTER TABLE "PlantHusbandryOverride"
  ADD COLUMN "environmentTemperatureMinC" DOUBLE PRECISION,
  ADD COLUMN "environmentTemperatureMaxC" DOUBLE PRECISION,
  ADD COLUMN "environmentNightTemperatureMinC" DOUBLE PRECISION,
  ADD COLUMN "environmentNightTemperatureMaxC" DOUBLE PRECISION,
  ADD COLUMN "environmentHumidityMinPercent" DOUBLE PRECISION,
  ADD COLUMN "environmentHumidityMaxPercent" DOUBLE PRECISION,
  ADD COLUMN "environmentLightLevel" TEXT,
  ADD COLUMN "environmentLightExposure" TEXT,
  ADD COLUMN "environmentLightMinLux" INTEGER,
  ADD COLUMN "environmentLightMaxLux" INTEGER,
  ADD COLUMN "environmentPhotoperiodMinHours" DOUBLE PRECISION,
  ADD COLUMN "environmentPhotoperiodMaxHours" DOUBLE PRECISION,
  ADD COLUMN "environmentAirflowLevel" TEXT,
  ADD COLUMN "environmentStability" TEXT,
  ADD COLUMN "environmentAvoidDrafts" BOOLEAN,
  ADD COLUMN "environmentSeasonalNotes" TEXT;

ALTER TABLE "PlantLocationMove"
  ADD COLUMN "compatibilityStatus" TEXT,
  ADD COLUMN "compatibilityAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "compatibilityNote" TEXT;

CREATE TABLE "LocationEnvironmentProfile" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "temperatureMinC" DOUBLE PRECISION,
  "temperatureMaxC" DOUBLE PRECISION,
  "nighttimeTemperatureMinC" DOUBLE PRECISION,
  "nighttimeTemperatureMaxC" DOUBLE PRECISION,
  "humidityMinPercent" DOUBLE PRECISION,
  "humidityMaxPercent" DOUBLE PRECISION,
  "lightLevel" TEXT,
  "lightExposure" TEXT,
  "lightMinLux" INTEGER,
  "lightMaxLux" INTEGER,
  "photoperiodHours" DOUBLE PRECISION,
  "airflowLevel" TEXT,
  "environmentStability" TEXT,
  "supplementalLight" BOOLEAN,
  "supplementalLightType" TEXT,
  "supplementalHeat" BOOLEAN,
  "humidification" BOOLEAN,
  "dehumidification" BOOLEAN,
  "activeAirflow" BOOLEAN,
  "nearWindow" BOOLEAN,
  "nearHvacVent" BOOLEAN,
  "enclosed" BOOLEAN,
  "seasonalVariationNotes" TEXT,
  "measurementSource" TEXT,
  "measuredAt" TIMESTAMP(3),
  "confidence" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocationEnvironmentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocationEnvironmentProfile_locationId_key" ON "LocationEnvironmentProfile"("locationId");
CREATE INDEX "LocationEnvironmentProfile_collectionId_idx" ON "LocationEnvironmentProfile"("collectionId");
CREATE INDEX "LocationEnvironmentProfile_measurementSource_idx" ON "LocationEnvironmentProfile"("measurementSource");
CREATE INDEX "LocationEnvironmentProfile_measuredAt_idx" ON "LocationEnvironmentProfile"("measuredAt");

ALTER TABLE "LocationEnvironmentProfile"
  ADD CONSTRAINT "LocationEnvironmentProfile_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LocationEnvironmentProfile"
  ADD CONSTRAINT "LocationEnvironmentProfile_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
