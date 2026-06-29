-- Add persisted care schedule sync records, collection quiet days, and quiet-day shift rules.

ALTER TABLE "PlantCareAdjustment" ADD COLUMN "nextDueAt" TIMESTAMP(3);

CREATE TABLE "CareScheduleSyncBatch" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "locationId" TEXT,
  "includeNested" BOOLEAN NOT NULL DEFAULT false,
  "targetDueAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "selectedCareTypesJson" JSONB NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'ALIGN_NEXT_DUE',
  "createMissing" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareScheduleSyncBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareScheduleSyncItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantInstanceId" TEXT NOT NULL,
  "careType" TEXT NOT NULL,
  "previousDueAt" TIMESTAMP(3),
  "newDueAt" TIMESTAMP(3),
  "previousCadenceJson" JSONB,
  "newCadenceJson" JSONB,
  "action" TEXT NOT NULL,
  "skipReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareScheduleSyncItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionQuietDay" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "quietType" TEXT NOT NULL,
  "date" TIMESTAMP(3),
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "dayOfWeek" INTEGER,
  "timezone" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionQuietDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionQuietDayShiftRule" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "careType" TEXT NOT NULL,
  "defaultShiftDirection" TEXT NOT NULL DEFAULT 'LATER',
  "maxShiftDaysBefore" INTEGER NOT NULL DEFAULT 2,
  "maxShiftDaysAfter" INTEGER NOT NULL DEFAULT 2,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionQuietDayShiftRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareQuietDayAdjustment" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "quietDayId" TEXT,
  "plantInstanceId" TEXT,
  "careType" TEXT NOT NULL,
  "originalDueAt" TIMESTAMP(3) NOT NULL,
  "adjustedDueAt" TIMESTAMP(3) NOT NULL,
  "shiftDirection" TEXT NOT NULL,
  "ruleUsed" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareQuietDayAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlantCareAdjustment_nextDueAt_idx" ON "PlantCareAdjustment"("nextDueAt");

CREATE INDEX "CareScheduleSyncBatch_collectionId_idx" ON "CareScheduleSyncBatch"("collectionId");
CREATE INDEX "CareScheduleSyncBatch_createdByUserId_idx" ON "CareScheduleSyncBatch"("createdByUserId");
CREATE INDEX "CareScheduleSyncBatch_locationId_idx" ON "CareScheduleSyncBatch"("locationId");
CREATE INDEX "CareScheduleSyncBatch_targetDueAt_idx" ON "CareScheduleSyncBatch"("targetDueAt");
CREATE INDEX "CareScheduleSyncBatch_createdAt_idx" ON "CareScheduleSyncBatch"("createdAt");

CREATE INDEX "CareScheduleSyncItem_batchId_idx" ON "CareScheduleSyncItem"("batchId");
CREATE INDEX "CareScheduleSyncItem_collectionId_idx" ON "CareScheduleSyncItem"("collectionId");
CREATE INDEX "CareScheduleSyncItem_plantInstanceId_idx" ON "CareScheduleSyncItem"("plantInstanceId");
CREATE INDEX "CareScheduleSyncItem_careType_idx" ON "CareScheduleSyncItem"("careType");
CREATE INDEX "CareScheduleSyncItem_action_idx" ON "CareScheduleSyncItem"("action");

CREATE INDEX "CollectionQuietDay_collectionId_idx" ON "CollectionQuietDay"("collectionId");
CREATE INDEX "CollectionQuietDay_createdByUserId_idx" ON "CollectionQuietDay"("createdByUserId");
CREATE INDEX "CollectionQuietDay_quietType_idx" ON "CollectionQuietDay"("quietType");
CREATE INDEX "CollectionQuietDay_date_idx" ON "CollectionQuietDay"("date");
CREATE INDEX "CollectionQuietDay_startDate_idx" ON "CollectionQuietDay"("startDate");
CREATE INDEX "CollectionQuietDay_endDate_idx" ON "CollectionQuietDay"("endDate");
CREATE INDEX "CollectionQuietDay_dayOfWeek_idx" ON "CollectionQuietDay"("dayOfWeek");
CREATE INDEX "CollectionQuietDay_active_idx" ON "CollectionQuietDay"("active");

CREATE UNIQUE INDEX "CollectionQuietDayShiftRule_collectionId_careType_key" ON "CollectionQuietDayShiftRule"("collectionId", "careType");
CREATE INDEX "CollectionQuietDayShiftRule_collectionId_idx" ON "CollectionQuietDayShiftRule"("collectionId");
CREATE INDEX "CollectionQuietDayShiftRule_careType_idx" ON "CollectionQuietDayShiftRule"("careType");
CREATE INDEX "CollectionQuietDayShiftRule_active_idx" ON "CollectionQuietDayShiftRule"("active");

CREATE INDEX "CareQuietDayAdjustment_collectionId_idx" ON "CareQuietDayAdjustment"("collectionId");
CREATE INDEX "CareQuietDayAdjustment_quietDayId_idx" ON "CareQuietDayAdjustment"("quietDayId");
CREATE INDEX "CareQuietDayAdjustment_plantInstanceId_idx" ON "CareQuietDayAdjustment"("plantInstanceId");
CREATE INDEX "CareQuietDayAdjustment_careType_idx" ON "CareQuietDayAdjustment"("careType");
CREATE INDEX "CareQuietDayAdjustment_originalDueAt_idx" ON "CareQuietDayAdjustment"("originalDueAt");
CREATE INDEX "CareQuietDayAdjustment_adjustedDueAt_idx" ON "CareQuietDayAdjustment"("adjustedDueAt");

ALTER TABLE "CareScheduleSyncBatch" ADD CONSTRAINT "CareScheduleSyncBatch_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareScheduleSyncBatch" ADD CONSTRAINT "CareScheduleSyncBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareScheduleSyncBatch" ADD CONSTRAINT "CareScheduleSyncBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CareScheduleSyncItem" ADD CONSTRAINT "CareScheduleSyncItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CareScheduleSyncBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareScheduleSyncItem" ADD CONSTRAINT "CareScheduleSyncItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareScheduleSyncItem" ADD CONSTRAINT "CareScheduleSyncItem_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionQuietDay" ADD CONSTRAINT "CollectionQuietDay_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionQuietDay" ADD CONSTRAINT "CollectionQuietDay_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionQuietDayShiftRule" ADD CONSTRAINT "CollectionQuietDayShiftRule_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CareQuietDayAdjustment" ADD CONSTRAINT "CareQuietDayAdjustment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareQuietDayAdjustment" ADD CONSTRAINT "CareQuietDayAdjustment_quietDayId_fkey" FOREIGN KEY ("quietDayId") REFERENCES "CollectionQuietDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareQuietDayAdjustment" ADD CONSTRAINT "CareQuietDayAdjustment_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
