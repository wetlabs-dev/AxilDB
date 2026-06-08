-- Add site-wide validated plant definition support while preserving existing
-- collection-owned definitions and plant instance references.

ALTER TABLE "PlantDefinition"
  ADD COLUMN "isValidated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "validatedByUserId" TEXT,
  ADD COLUMN "validatedSourceCollectionId" TEXT,
  ADD COLUMN "validatedSourceDefinitionId" TEXT,
  ADD COLUMN "validatedPlantDefinitionId" TEXT,
  ADD COLUMN "validationNotes" TEXT;

CREATE TABLE "PlantDefinitionValidationCandidate" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT,
  "nominatedByUserId" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "approvedPlantDefinitionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlantDefinitionValidationCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantDefinitionDispute" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "validatedPlantDefinitionId" TEXT NOT NULL,
  "submittedByUserId" TEXT,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "resolutionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlantDefinitionDispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlantDefinition_isValidated_idx" ON "PlantDefinition"("isValidated");
CREATE INDEX "PlantDefinition_validatedByUserId_idx" ON "PlantDefinition"("validatedByUserId");
CREATE INDEX "PlantDefinition_validatedSourceCollectionId_idx" ON "PlantDefinition"("validatedSourceCollectionId");
CREATE INDEX "PlantDefinition_validatedSourceDefinitionId_idx" ON "PlantDefinition"("validatedSourceDefinitionId");
CREATE INDEX "PlantDefinition_validatedPlantDefinitionId_idx" ON "PlantDefinition"("validatedPlantDefinitionId");

CREATE INDEX "PlantDefinitionValidationCandidate_collectionId_idx" ON "PlantDefinitionValidationCandidate"("collectionId");
CREATE INDEX "PlantDefinitionValidationCandidate_plantDefinitionId_idx" ON "PlantDefinitionValidationCandidate"("plantDefinitionId");
CREATE INDEX "PlantDefinitionValidationCandidate_nominatedByUserId_idx" ON "PlantDefinitionValidationCandidate"("nominatedByUserId");
CREATE INDEX "PlantDefinitionValidationCandidate_reviewedByUserId_idx" ON "PlantDefinitionValidationCandidate"("reviewedByUserId");
CREATE INDEX "PlantDefinitionValidationCandidate_approvedPlantDefinitionId_idx" ON "PlantDefinitionValidationCandidate"("approvedPlantDefinitionId");
CREATE INDEX "PlantDefinitionValidationCandidate_status_idx" ON "PlantDefinitionValidationCandidate"("status");

CREATE INDEX "PlantDefinitionDispute_collectionId_idx" ON "PlantDefinitionDispute"("collectionId");
CREATE INDEX "PlantDefinitionDispute_validatedPlantDefinitionId_idx" ON "PlantDefinitionDispute"("validatedPlantDefinitionId");
CREATE INDEX "PlantDefinitionDispute_submittedByUserId_idx" ON "PlantDefinitionDispute"("submittedByUserId");
CREATE INDEX "PlantDefinitionDispute_reviewedByUserId_idx" ON "PlantDefinitionDispute"("reviewedByUserId");
CREATE INDEX "PlantDefinitionDispute_reason_idx" ON "PlantDefinitionDispute"("reason");
CREATE INDEX "PlantDefinitionDispute_status_idx" ON "PlantDefinitionDispute"("status");

ALTER TABLE "PlantDefinition"
  ADD CONSTRAINT "PlantDefinition_validatedByUserId_fkey"
  FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinition"
  ADD CONSTRAINT "PlantDefinition_validatedSourceCollectionId_fkey"
  FOREIGN KEY ("validatedSourceCollectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinition"
  ADD CONSTRAINT "PlantDefinition_validatedPlantDefinitionId_fkey"
  FOREIGN KEY ("validatedPlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionValidationCandidate"
  ADD CONSTRAINT "PlantDefinitionValidationCandidate_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionValidationCandidate"
  ADD CONSTRAINT "PlantDefinitionValidationCandidate_plantDefinitionId_fkey"
  FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionValidationCandidate"
  ADD CONSTRAINT "PlantDefinitionValidationCandidate_nominatedByUserId_fkey"
  FOREIGN KEY ("nominatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionValidationCandidate"
  ADD CONSTRAINT "PlantDefinitionValidationCandidate_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionValidationCandidate"
  ADD CONSTRAINT "PlantDefinitionValidationCandidate_approvedPlantDefinitionId_fkey"
  FOREIGN KEY ("approvedPlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionDispute"
  ADD CONSTRAINT "PlantDefinitionDispute_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionDispute"
  ADD CONSTRAINT "PlantDefinitionDispute_validatedPlantDefinitionId_fkey"
  FOREIGN KEY ("validatedPlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionDispute"
  ADD CONSTRAINT "PlantDefinitionDispute_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantDefinitionDispute"
  ADD CONSTRAINT "PlantDefinitionDispute_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
