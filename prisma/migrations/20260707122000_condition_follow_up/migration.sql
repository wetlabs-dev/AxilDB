ALTER TABLE "PlantCondition" ADD COLUMN "followUpAt" TIMESTAMP(3);
CREATE INDEX "PlantCondition_followUpAt_idx" ON "PlantCondition"("followUpAt");
