-- Add plant-level quarantine workflow records for advanced location workflows.
CREATE TABLE "PlantQuarantine" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "quarantineLocationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetReleaseDate" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releasedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "notes" TEXT,
    "checklistJson" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantQuarantine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlantQuarantine_collectionId_idx" ON "PlantQuarantine"("collectionId");
CREATE INDEX "PlantQuarantine_plantInstanceId_idx" ON "PlantQuarantine"("plantInstanceId");
CREATE INDEX "PlantQuarantine_quarantineLocationId_idx" ON "PlantQuarantine"("quarantineLocationId");
CREATE INDEX "PlantQuarantine_status_idx" ON "PlantQuarantine"("status");
CREATE INDEX "PlantQuarantine_riskLevel_idx" ON "PlantQuarantine"("riskLevel");
CREATE INDEX "PlantQuarantine_targetReleaseDate_idx" ON "PlantQuarantine"("targetReleaseDate");
CREATE INDEX "PlantQuarantine_createdByUserId_idx" ON "PlantQuarantine"("createdByUserId");
CREATE INDEX "PlantQuarantine_releasedByUserId_idx" ON "PlantQuarantine"("releasedByUserId");
CREATE INDEX "PlantQuarantine_cancelledByUserId_idx" ON "PlantQuarantine"("cancelledByUserId");

ALTER TABLE "PlantQuarantine" ADD CONSTRAINT "PlantQuarantine_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantQuarantine" ADD CONSTRAINT "PlantQuarantine_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantQuarantine" ADD CONSTRAINT "PlantQuarantine_quarantineLocationId_fkey" FOREIGN KEY ("quarantineLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantQuarantine" ADD CONSTRAINT "PlantQuarantine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantQuarantine" ADD CONSTRAINT "PlantQuarantine_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantQuarantine" ADD CONSTRAINT "PlantQuarantine_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
