-- CreateEnum
CREATE TYPE "AcquisitionStatus" AS ENUM ('RESEARCHING', 'WISHLIST', 'ACTIVELY_SEEKING', 'ON_HOLD', 'FULFILLED', 'NO_LONGER_INTERESTED');

-- CreateEnum
CREATE TYPE "AcquisitionAvailability" AS ENUM ('PLENTY', 'LIMITED', 'LAST_ONE', 'SOLD_OUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AcquisitionFulfillmentChoice" AS ENUM ('FULFILLED', 'KEEP_ACTIVE', 'REPEAT_PURCHASE');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "acquisitionVisibility" TEXT NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "PlantDefinition"
ADD COLUMN "acquisitionStatus" "AcquisitionStatus",
ADD COLUMN "acquisitionPriority" INTEGER,
ADD COLUMN "acquisitionInterestNotes" TEXT,
ADD COLUMN "desiredSpecimenSize" TEXT,
ADD COLUMN "idealPurchasePrice" DECIMAL,
ADD COLUMN "maximumPurchasePrice" DECIMAL,
ADD COLUMN "desiredLocationId" TEXT,
ADD COLUMN "preferredVendorsJson" JSONB,
ADD COLUMN "acquisitionResearchSummary" TEXT;

-- CreateTable
CREATE TABLE "AcquisitionResearchEntry" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "urlsJson" JSONB,
  "sourceCitation" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AcquisitionResearchEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantObservation" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "vendor" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observedPrice" DECIMAL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "specimenSize" TEXT,
  "condition" TEXT,
  "availability" "AcquisitionAvailability" NOT NULL DEFAULT 'UNKNOWN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlantObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantAcquisitionRecord" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "observationId" TEXT,
  "vendor" TEXT,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "price" DECIMAL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "specimenSize" TEXT,
  "potSize" TEXT,
  "initialLocationId" TEXT,
  "notes" TEXT,
  "fulfillmentChoice" "AcquisitionFulfillmentChoice" NOT NULL DEFAULT 'FULFILLED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlantAcquisitionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantAcquisitionRecordInstance" (
  "id" TEXT NOT NULL,
  "acquisitionRecordId" TEXT NOT NULL,
  "plantInstanceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlantAcquisitionRecordInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_acquisitionVisibility_idx" ON "Collection"("acquisitionVisibility");

-- CreateIndex
CREATE INDEX "PlantDefinition_acquisitionStatus_idx" ON "PlantDefinition"("acquisitionStatus");

-- CreateIndex
CREATE INDEX "PlantDefinition_acquisitionPriority_idx" ON "PlantDefinition"("acquisitionPriority");

-- CreateIndex
CREATE INDEX "PlantDefinition_desiredLocationId_idx" ON "PlantDefinition"("desiredLocationId");

-- CreateIndex
CREATE INDEX "AcquisitionResearchEntry_collectionId_idx" ON "AcquisitionResearchEntry"("collectionId");

-- CreateIndex
CREATE INDEX "AcquisitionResearchEntry_plantDefinitionId_idx" ON "AcquisitionResearchEntry"("plantDefinitionId");

-- CreateIndex
CREATE INDEX "AcquisitionResearchEntry_createdByUserId_idx" ON "AcquisitionResearchEntry"("createdByUserId");

-- CreateIndex
CREATE INDEX "AcquisitionResearchEntry_occurredAt_idx" ON "AcquisitionResearchEntry"("occurredAt");

-- CreateIndex
CREATE INDEX "PlantObservation_collectionId_idx" ON "PlantObservation"("collectionId");

-- CreateIndex
CREATE INDEX "PlantObservation_plantDefinitionId_idx" ON "PlantObservation"("plantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantObservation_createdByUserId_idx" ON "PlantObservation"("createdByUserId");

-- CreateIndex
CREATE INDEX "PlantObservation_observedAt_idx" ON "PlantObservation"("observedAt");

-- CreateIndex
CREATE INDEX "PlantObservation_availability_idx" ON "PlantObservation"("availability");

-- CreateIndex
CREATE INDEX "PlantAcquisitionRecord_collectionId_idx" ON "PlantAcquisitionRecord"("collectionId");

-- CreateIndex
CREATE INDEX "PlantAcquisitionRecord_plantDefinitionId_idx" ON "PlantAcquisitionRecord"("plantDefinitionId");

-- CreateIndex
CREATE INDEX "PlantAcquisitionRecord_createdByUserId_idx" ON "PlantAcquisitionRecord"("createdByUserId");

-- CreateIndex
CREATE INDEX "PlantAcquisitionRecord_observationId_idx" ON "PlantAcquisitionRecord"("observationId");

-- CreateIndex
CREATE INDEX "PlantAcquisitionRecord_initialLocationId_idx" ON "PlantAcquisitionRecord"("initialLocationId");

-- CreateIndex
CREATE INDEX "PlantAcquisitionRecord_acquiredAt_idx" ON "PlantAcquisitionRecord"("acquiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlantAcquisitionRecordInstance_acquisitionRecordId_plantInstanceId_key" ON "PlantAcquisitionRecordInstance"("acquisitionRecordId", "plantInstanceId");

-- CreateIndex
CREATE INDEX "PlantAcquisitionRecordInstance_plantInstanceId_idx" ON "PlantAcquisitionRecordInstance"("plantInstanceId");

-- AddForeignKey
ALTER TABLE "PlantDefinition" ADD CONSTRAINT "PlantDefinition_desiredLocationId_fkey" FOREIGN KEY ("desiredLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionResearchEntry" ADD CONSTRAINT "AcquisitionResearchEntry_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionResearchEntry" ADD CONSTRAINT "AcquisitionResearchEntry_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionResearchEntry" ADD CONSTRAINT "AcquisitionResearchEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantObservation" ADD CONSTRAINT "PlantObservation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantObservation" ADD CONSTRAINT "PlantObservation_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantObservation" ADD CONSTRAINT "PlantObservation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "PlantObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_initialLocationId_fkey" FOREIGN KEY ("initialLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAcquisitionRecordInstance" ADD CONSTRAINT "PlantAcquisitionRecordInstance_acquisitionRecordId_fkey" FOREIGN KEY ("acquisitionRecordId") REFERENCES "PlantAcquisitionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAcquisitionRecordInstance" ADD CONSTRAINT "PlantAcquisitionRecordInstance_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
