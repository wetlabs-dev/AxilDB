CREATE TABLE "TreatmentDefinition" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "category" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "targetSummary" TEXT,
  "instructions" TEXT, "manufacturerDoseText" TEXT, "defaultDoseAmount" DOUBLE PRECISION,
  "defaultDoseUnit" TEXT, "defaultWaterVolumeMl" DOUBLE PRECISION, "defaultStrength" TEXT,
  "applicationMethod" TEXT, "minimumIntervalDays" INTEGER, "defaultRepeatCount" INTEGER,
  "defaultRepeatIntervalDays" INTEGER, "defaultFollowUpDays" INTEGER,
  "requiresQuarantine" BOOLEAN NOT NULL DEFAULT false, "reentryIntervalHours" INTEGER,
  "ventilationRequired" BOOLEAN NOT NULL DEFAULT false, "indoorUseAllowed" BOOLEAN,
  "avoidBlooms" BOOLEAN NOT NULL DEFAULT false, "avoidHeat" BOOLEAN NOT NULL DEFAULT false,
  "avoidDirectLight" BOOLEAN NOT NULL DEFAULT false, "ppeRequirementsJson" JSONB,
  "safetyNotes" TEXT, "contraindications" TEXT, "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreatmentDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentProduct" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "name" TEXT NOT NULL, "manufacturer" TEXT,
  "productType" TEXT, "activeIngredient" TEXT, "concentration" TEXT, "registrationNumber" TEXT,
  "form" TEXT, "containerSize" TEXT, "purchaseDate" TIMESTAMP(3), "expirationDate" TIMESTAMP(3),
  "lotNumber" TEXT, "storageLocation" TEXT, "labelUrl" TEXT, "safetyDataSheetUrl" TEXT,
  "labelNotes" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreatmentProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentDefinitionProduct" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "treatmentDefinitionId" TEXT NOT NULL,
  "treatmentProductId" TEXT NOT NULL, "notes" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TreatmentDefinitionProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentConditionType" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "treatmentDefinitionId" TEXT NOT NULL,
  "conditionType" TEXT NOT NULL, CONSTRAINT "TreatmentConditionType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentTagCaution" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "treatmentDefinitionId" TEXT NOT NULL,
  "plantTagId" TEXT NOT NULL, "severity" TEXT NOT NULL DEFAULT 'WARNING', "warningText" TEXT NOT NULL,
  CONSTRAINT "TreatmentTagCaution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentPlan" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "plantInstanceId" TEXT NOT NULL,
  "plantConditionId" TEXT, "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3), "finalOutcome" TEXT, "finalEffectiveness" TEXT, "finalNotes" TEXT,
  "createdByUserId" TEXT, "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentPlanStep" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "treatmentPlanId" TEXT NOT NULL,
  "treatmentDefinitionId" TEXT, "stepType" TEXT NOT NULL, "title" TEXT NOT NULL,
  "instructions" TEXT, "scheduledAt" TIMESTAMP(3) NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "required" BOOLEAN NOT NULL DEFAULT true, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3), "completedByUserId" TEXT, "completionNotes" TEXT,
  "treatmentSnapshotJson" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TreatmentPlanStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentApplication" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "plantInstanceId" TEXT NOT NULL,
  "plantConditionId" TEXT, "treatmentPlanId" TEXT, "treatmentPlanStepId" TEXT,
  "treatmentDefinitionId" TEXT, "treatmentProductId" TEXT, "appliedByUserId" TEXT,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "treatmentNameSnapshot" TEXT NOT NULL,
  "productNameSnapshot" TEXT, "doseAmount" DOUBLE PRECISION, "doseUnit" TEXT,
  "waterVolumeMl" DOUBLE PRECISION, "strength" TEXT, "applicationMethod" TEXT,
  "instructionsSnapshot" TEXT, "safetySnapshotJson" JSONB, "notes" TEXT,
  "adverseReaction" BOOLEAN NOT NULL DEFAULT false, "correctedAt" TIMESTAMP(3),
  "correctionReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TreatmentApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentApplicationOutcome" (
  "id" TEXT NOT NULL, "collectionId" TEXT NOT NULL, "treatmentApplicationId" TEXT NOT NULL,
  "recordedByUserId" TEXT, "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveness" TEXT NOT NULL, "conditionResponse" TEXT, "adverseEffects" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreatmentApplicationOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreatmentDefinition_collectionId_slug_key" ON "TreatmentDefinition"("collectionId", "slug");
CREATE INDEX "TreatmentDefinition_collectionId_active_idx" ON "TreatmentDefinition"("collectionId", "active");
CREATE INDEX "TreatmentDefinition_collectionId_category_idx" ON "TreatmentDefinition"("collectionId", "category");
CREATE UNIQUE INDEX "TreatmentProduct_collectionId_name_manufacturer_key" ON "TreatmentProduct"("collectionId", "name", "manufacturer");
CREATE INDEX "TreatmentProduct_collectionId_active_idx" ON "TreatmentProduct"("collectionId", "active");
CREATE INDEX "TreatmentProduct_expirationDate_idx" ON "TreatmentProduct"("expirationDate");
CREATE UNIQUE INDEX "TreatmentDefinitionProduct_treatmentDefinitionId_treatmentProductId_key" ON "TreatmentDefinitionProduct"("treatmentDefinitionId", "treatmentProductId");
CREATE INDEX "TreatmentDefinitionProduct_collectionId_idx" ON "TreatmentDefinitionProduct"("collectionId");
CREATE INDEX "TreatmentDefinitionProduct_treatmentProductId_idx" ON "TreatmentDefinitionProduct"("treatmentProductId");
CREATE UNIQUE INDEX "TreatmentConditionType_treatmentDefinitionId_conditionType_key" ON "TreatmentConditionType"("treatmentDefinitionId", "conditionType");
CREATE INDEX "TreatmentConditionType_collectionId_conditionType_idx" ON "TreatmentConditionType"("collectionId", "conditionType");
CREATE UNIQUE INDEX "TreatmentTagCaution_treatmentDefinitionId_plantTagId_key" ON "TreatmentTagCaution"("treatmentDefinitionId", "plantTagId");
CREATE INDEX "TreatmentTagCaution_collectionId_idx" ON "TreatmentTagCaution"("collectionId");
CREATE INDEX "TreatmentTagCaution_plantTagId_idx" ON "TreatmentTagCaution"("plantTagId");
CREATE INDEX "TreatmentPlan_collectionId_status_idx" ON "TreatmentPlan"("collectionId", "status");
CREATE INDEX "TreatmentPlan_plantInstanceId_status_idx" ON "TreatmentPlan"("plantInstanceId", "status");
CREATE INDEX "TreatmentPlan_plantConditionId_idx" ON "TreatmentPlan"("plantConditionId");
CREATE INDEX "TreatmentPlanStep_collectionId_status_scheduledAt_idx" ON "TreatmentPlanStep"("collectionId", "status", "scheduledAt");
CREATE INDEX "TreatmentPlanStep_treatmentPlanId_sortOrder_idx" ON "TreatmentPlanStep"("treatmentPlanId", "sortOrder");
CREATE INDEX "TreatmentPlanStep_treatmentDefinitionId_idx" ON "TreatmentPlanStep"("treatmentDefinitionId");
CREATE UNIQUE INDEX "TreatmentApplication_treatmentPlanStepId_key" ON "TreatmentApplication"("treatmentPlanStepId");
CREATE INDEX "TreatmentApplication_collectionId_appliedAt_idx" ON "TreatmentApplication"("collectionId", "appliedAt");
CREATE INDEX "TreatmentApplication_plantInstanceId_appliedAt_idx" ON "TreatmentApplication"("plantInstanceId", "appliedAt");
CREATE INDEX "TreatmentApplication_plantConditionId_idx" ON "TreatmentApplication"("plantConditionId");
CREATE INDEX "TreatmentApplication_treatmentDefinitionId_appliedAt_idx" ON "TreatmentApplication"("treatmentDefinitionId", "appliedAt");
CREATE INDEX "TreatmentApplication_treatmentPlanId_idx" ON "TreatmentApplication"("treatmentPlanId");
CREATE INDEX "TreatmentApplicationOutcome_collectionId_observedAt_idx" ON "TreatmentApplicationOutcome"("collectionId", "observedAt");
CREATE INDEX "TreatmentApplicationOutcome_treatmentApplicationId_observedAt_idx" ON "TreatmentApplicationOutcome"("treatmentApplicationId", "observedAt");
CREATE INDEX "TreatmentApplicationOutcome_effectiveness_idx" ON "TreatmentApplicationOutcome"("effectiveness");

ALTER TABLE "TreatmentDefinition" ADD CONSTRAINT "TreatmentDefinition_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentProduct" ADD CONSTRAINT "TreatmentProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentDefinitionProduct" ADD CONSTRAINT "TreatmentDefinitionProduct_treatmentDefinitionId_fkey" FOREIGN KEY ("treatmentDefinitionId") REFERENCES "TreatmentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentDefinitionProduct" ADD CONSTRAINT "TreatmentDefinitionProduct_treatmentProductId_fkey" FOREIGN KEY ("treatmentProductId") REFERENCES "TreatmentProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreatmentConditionType" ADD CONSTRAINT "TreatmentConditionType_treatmentDefinitionId_fkey" FOREIGN KEY ("treatmentDefinitionId") REFERENCES "TreatmentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentTagCaution" ADD CONSTRAINT "TreatmentTagCaution_treatmentDefinitionId_fkey" FOREIGN KEY ("treatmentDefinitionId") REFERENCES "TreatmentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentTagCaution" ADD CONSTRAINT "TreatmentTagCaution_plantTagId_fkey" FOREIGN KEY ("plantTagId") REFERENCES "PlantTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_plantConditionId_fkey" FOREIGN KEY ("plantConditionId") REFERENCES "PlantCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlanStep" ADD CONSTRAINT "TreatmentPlanStep_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlanStep" ADD CONSTRAINT "TreatmentPlanStep_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlanStep" ADD CONSTRAINT "TreatmentPlanStep_treatmentDefinitionId_fkey" FOREIGN KEY ("treatmentDefinitionId") REFERENCES "TreatmentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_plantConditionId_fkey" FOREIGN KEY ("plantConditionId") REFERENCES "PlantCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_treatmentPlanStepId_fkey" FOREIGN KEY ("treatmentPlanStepId") REFERENCES "TreatmentPlanStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_treatmentDefinitionId_fkey" FOREIGN KEY ("treatmentDefinitionId") REFERENCES "TreatmentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplication" ADD CONSTRAINT "TreatmentApplication_treatmentProductId_fkey" FOREIGN KEY ("treatmentProductId") REFERENCES "TreatmentProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplicationOutcome" ADD CONSTRAINT "TreatmentApplicationOutcome_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreatmentApplicationOutcome" ADD CONSTRAINT "TreatmentApplicationOutcome_treatmentApplicationId_fkey" FOREIGN KEY ("treatmentApplicationId") REFERENCES "TreatmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
