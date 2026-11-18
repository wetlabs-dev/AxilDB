ALTER TABLE "AiCuratorSettings" ADD COLUMN "calibrationPolicy" JSONB;
ALTER TABLE "CareCadenceProposal" ADD COLUMN "calibrationEvidence" JSONB;
CREATE TABLE "MetricCalibrationState" (
 "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "plantDefinitionId" TEXT NOT NULL, "metricKey" TEXT NOT NULL,
 "outcome" TEXT NOT NULL DEFAULT 'LEARNING', "nextEligibleAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "lastAssessedAt" TIMESTAMP(3),
 "observationBoundary" TIMESTAMP(3), "baseline" TEXT, "evidence" JSONB, "observedSummary" JSONB, "statisticsAt" TIMESTAMP(3), "proposalId" TEXT,
 "lastRequestedAt" TIMESTAMP(3), "lastApprovedAt" TIMESTAMP(3), "lastRejectedAt" TIMESTAMP(3), "stableCount" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "MetricCalibrationState_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MetricCalibrationState_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "MetricCalibrationState_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MetricCalibrationState_collectionId_plantDefinitionId_metricKey_key" ON "MetricCalibrationState"("collectionId", "plantDefinitionId", "metricKey");
CREATE INDEX "MetricCalibrationState_nextEligibleAt_collectionId_idx" ON "MetricCalibrationState"("nextEligibleAt", "collectionId");
CREATE UNIQUE INDEX "CareCadenceProposal_active_calibration_key" ON "CareCadenceProposal"("plantDefinitionId", "activity") WHERE "source" = 'CADENCE_CALIBRATION' AND "status" = 'PENDING';
ALTER TABLE "CareCadenceProposal" DROP CONSTRAINT "CadenceProposal_source";
ALTER TABLE "CareCadenceProposal" ADD CONSTRAINT "CadenceProposal_source" CHECK ("source" IN ('MAGIC_FILL','AI_RESEARCH','BULK_RESEARCH','LEGACY_RECOVERY','CADENCE_CALIBRATION'));
