ALTER TABLE "TreatmentDefinition"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "targetArea" TEXT,
  ADD COLUMN "defaultWaterVolumeUnit" TEXT DEFAULT 'ML',
  ADD COLUMN "maximumApplications" INTEGER,
  ADD COLUMN "petSafety" TEXT,
  ADD COLUMN "outdoorApplicationPreferred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "keepAwayAquaticSystems" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "temperatureMinC" DOUBLE PRECISION,
  ADD COLUMN "temperatureMaxC" DOUBLE PRECISION,
  ADD COLUMN "incompatibilities" TEXT,
  ADD COLUMN "precautions" TEXT,
  ADD COLUMN "disposalNotes" TEXT,
  ADD COLUMN "sourceUrlsJson" JSONB,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "TreatmentProduct"
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "petSafety" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "TreatmentDefinitionProduct"
  ADD COLUMN "amount" DOUBLE PRECISION,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "role" TEXT;

ALTER TABLE "TreatmentConditionType"
  ADD COLUMN "suitability" TEXT NOT NULL DEFAULT 'POSSIBLE',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "TreatmentPlan"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "targetCompletionAt" TIMESTAMP(3),
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "finalOutcomeAmendmentReason" TEXT,
  ADD COLUMN "conditionReviewJson" JSONB;

ALTER TABLE "TreatmentPlanStep"
  ADD COLUMN "timingMode" TEXT NOT NULL DEFAULT 'FIXED_DATE',
  ADD COLUMN "offsetDays" INTEGER,
  ADD COLUMN "repeatEveryDays" INTEGER,
  ADD COLUMN "repeatCount" INTEGER,
  ADD COLUMN "skippedAt" TIMESTAMP(3),
  ADD COLUMN "skipReason" TEXT;

ALTER TABLE "TreatmentApplication"
  ADD COLUMN "treatmentApplicationBatchItemId" TEXT,
  ADD COLUMN "targetArea" TEXT,
  ADD COLUMN "immediateResponse" TEXT,
  ADD COLUMN "adverseReactionNotes" TEXT,
  ADD COLUMN "followUpDueAt" TIMESTAMP(3),
  ADD COLUMN "intervalOverrideNote" TEXT,
  ADD COLUMN "correctedByUserId" TEXT,
  ADD COLUMN "originalSnapshotJson" JSONB;

ALTER TABLE "TreatmentApplicationOutcome"
  ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "observedConditionSeverity" TEXT,
  ADD COLUMN "correctedAt" TIMESTAMP(3),
  ADD COLUMN "correctedByUserId" TEXT,
  ADD COLUMN "correctionReason" TEXT;

CREATE TABLE "TreatmentApplicationBatch" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "treatmentDefinitionId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL,
  "sharedValuesJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreatmentApplicationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentApplicationBatchItem" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "plantInstanceId" TEXT NOT NULL,
  "plantConditionId" TEXT,
  "treatmentPlanStepId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "warningSnapshotJson" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreatmentApplicationBatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreatmentApplication_treatmentApplicationBatchItemId_key" ON "TreatmentApplication"("treatmentApplicationBatchItemId");
CREATE UNIQUE INDEX "TreatmentApplicationBatch_collectionId_idempotencyKey_key" ON "TreatmentApplicationBatch"("collectionId", "idempotencyKey");
CREATE INDEX "TreatmentApplicationBatch_collectionId_appliedAt_idx" ON "TreatmentApplicationBatch"("collectionId", "appliedAt");
CREATE INDEX "TreatmentApplicationBatch_treatmentDefinitionId_idx" ON "TreatmentApplicationBatch"("treatmentDefinitionId");
CREATE UNIQUE INDEX "TreatmentApplicationBatchItem_batchId_plantInstanceId_key" ON "TreatmentApplicationBatchItem"("batchId", "plantInstanceId");
CREATE INDEX "TreatmentApplicationBatchItem_collectionId_status_idx" ON "TreatmentApplicationBatchItem"("collectionId", "status");
CREATE INDEX "TreatmentApplicationBatchItem_plantInstanceId_idx" ON "TreatmentApplicationBatchItem"("plantInstanceId");
CREATE INDEX "TreatmentApplicationBatchItem_plantConditionId_idx" ON "TreatmentApplicationBatchItem"("plantConditionId");

ALTER TABLE "TreatmentApplicationBatch" ADD CONSTRAINT "TreatmentApplicationBatch_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplicationBatch" ADD CONSTRAINT "TreatmentApplicationBatch_treatmentDefinitionId_fkey" FOREIGN KEY ("treatmentDefinitionId") REFERENCES "TreatmentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplicationBatchItem" ADD CONSTRAINT "TreatmentApplicationBatchItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplicationBatchItem" ADD CONSTRAINT "TreatmentApplicationBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TreatmentApplicationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplicationBatchItem" ADD CONSTRAINT "TreatmentApplicationBatchItem_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplicationBatchItem" ADD CONSTRAINT "TreatmentApplicationBatchItem_plantConditionId_fkey" FOREIGN KEY ("plantConditionId") REFERENCES "PlantCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_treatmentApplicationBatchItemId_fkey" FOREIGN KEY ("treatmentApplicationBatchItemId") REFERENCES "TreatmentApplicationBatchItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
