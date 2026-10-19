-- Optional provenance on the existing Quiet Day adjustment model; legacy history remains intact.
ALTER TABLE "CareQuietDayAdjustment" ADD COLUMN "scheduleKey" TEXT,
  ADD COLUMN "taskKey" TEXT, ADD COLUMN "timezone" TEXT;
CREATE UNIQUE INDEX "CareQuietDayAdjustment_scheduleKey_key" ON "CareQuietDayAdjustment"("scheduleKey");
