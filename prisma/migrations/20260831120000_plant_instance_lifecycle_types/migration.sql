ALTER TABLE "PlantInstance"
  ADD COLUMN "sownAt" TIMESTAMP(3),
  ADD COLUMN "germinatedAt" TIMESTAMP(3),
  ADD COLUMN "cormStartedAt" TIMESTAMP(3),
  ADD COLUMN "deflaskedAt" TIMESTAMP(3),
  ADD COLUMN "establishedAt" TIMESTAMP(3);

CREATE INDEX "PlantInstance_establishedAt_idx" ON "PlantInstance"("establishedAt");
CREATE INDEX "PlantInstance_sownAt_idx" ON "PlantInstance"("sownAt");
CREATE INDEX "PlantInstance_cormStartedAt_idx" ON "PlantInstance"("cormStartedAt");
CREATE INDEX "PlantInstance_deflaskedAt_idx" ON "PlantInstance"("deflaskedAt");
