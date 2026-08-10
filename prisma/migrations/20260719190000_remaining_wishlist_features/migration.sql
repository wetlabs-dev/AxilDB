ALTER TABLE "Collection"
ADD COLUMN "wishlistIntro" TEXT,
ADD COLUMN "wishlistPublicSettingsJson" JSONB;

ALTER TABLE "PlantObservation"
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PlantAcquisitionRecord"
ADD COLUMN "acquisitionBatchId" TEXT;

CREATE TABLE "AcquisitionBatch" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "distributorId" TEXT,
  "distributorLocationId" TEXT,
  "acquisitionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "orderNumber" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" DECIMAL,
  "shippingCost" DECIMAL,
  "tax" DECIMAL,
  "totalCost" DECIMAL,
  "sharedNotes" TEXT,
  "receiptPhotoId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcquisitionBatchItem" (
  "id" TEXT NOT NULL,
  "acquisitionBatchId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "observationId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL,
  "specimenSize" TEXT,
  "potSize" TEXT,
  "initialLocationId" TEXT,
  "notes" TEXT,
  "fulfillmentChoice" "AcquisitionFulfillmentChoice" NOT NULL DEFAULT 'FULFILLED',
  "createPlantInstances" BOOLEAN NOT NULL DEFAULT true,
  "createdAcquisitionRecordId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionBatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionExhibitWishlistItem" (
  "id" TEXT NOT NULL,
  "exhibitId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "customCaption" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionExhibitWishlistItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcquisitionBatch_collectionId_idempotencyKey_key" ON "AcquisitionBatch"("collectionId", "idempotencyKey");
CREATE INDEX "AcquisitionBatch_collectionId_acquisitionDate_idx" ON "AcquisitionBatch"("collectionId", "acquisitionDate");
CREATE INDEX "AcquisitionBatch_distributorId_idx" ON "AcquisitionBatch"("distributorId");
CREATE INDEX "AcquisitionBatch_distributorLocationId_idx" ON "AcquisitionBatch"("distributorLocationId");
CREATE INDEX "AcquisitionBatch_receiptPhotoId_idx" ON "AcquisitionBatch"("receiptPhotoId");
CREATE INDEX "AcquisitionBatch_createdByUserId_idx" ON "AcquisitionBatch"("createdByUserId");
CREATE INDEX "AcquisitionBatchItem_acquisitionBatchId_idx" ON "AcquisitionBatchItem"("acquisitionBatchId");
CREATE INDEX "AcquisitionBatchItem_plantDefinitionId_idx" ON "AcquisitionBatchItem"("plantDefinitionId");
CREATE INDEX "AcquisitionBatchItem_observationId_idx" ON "AcquisitionBatchItem"("observationId");
CREATE INDEX "AcquisitionBatchItem_initialLocationId_idx" ON "AcquisitionBatchItem"("initialLocationId");
CREATE UNIQUE INDEX "AcquisitionBatchItem_createdAcquisitionRecordId_key" ON "AcquisitionBatchItem"("createdAcquisitionRecordId");
CREATE INDEX "PlantAcquisitionRecord_acquisitionBatchId_idx" ON "PlantAcquisitionRecord"("acquisitionBatchId");
CREATE UNIQUE INDEX "CollectionExhibitWishlistItem_exhibitId_plantDefinitionId_key" ON "CollectionExhibitWishlistItem"("exhibitId", "plantDefinitionId");
CREATE INDEX "CollectionExhibitWishlistItem_exhibitId_sortOrder_idx" ON "CollectionExhibitWishlistItem"("exhibitId", "sortOrder");
CREATE INDEX "CollectionExhibitWishlistItem_collectionId_idx" ON "CollectionExhibitWishlistItem"("collectionId");
CREATE INDEX "CollectionExhibitWishlistItem_plantDefinitionId_idx" ON "CollectionExhibitWishlistItem"("plantDefinitionId");

ALTER TABLE "AcquisitionBatch" ADD CONSTRAINT "AcquisitionBatch_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DO $$
BEGIN
  -- These tables are created by a migration with the same timestamp prefix. Their
  -- lexical order can place this migration first on a clean database.
  IF to_regclass('"Distributor"') IS NOT NULL THEN
    ALTER TABLE "AcquisitionBatch" ADD CONSTRAINT "AcquisitionBatch_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF to_regclass('"DistributorLocation"') IS NOT NULL THEN
    ALTER TABLE "AcquisitionBatch" ADD CONSTRAINT "AcquisitionBatch_distributorLocationId_fkey" FOREIGN KEY ("distributorLocationId") REFERENCES "DistributorLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "AcquisitionBatch" ADD CONSTRAINT "AcquisitionBatch_receiptPhotoId_fkey" FOREIGN KEY ("receiptPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatch" ADD CONSTRAINT "AcquisitionBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatchItem" ADD CONSTRAINT "AcquisitionBatchItem_acquisitionBatchId_fkey" FOREIGN KEY ("acquisitionBatchId") REFERENCES "AcquisitionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatchItem" ADD CONSTRAINT "AcquisitionBatchItem_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatchItem" ADD CONSTRAINT "AcquisitionBatchItem_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "PlantObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatchItem" ADD CONSTRAINT "AcquisitionBatchItem_initialLocationId_fkey" FOREIGN KEY ("initialLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatchItem" ADD CONSTRAINT "AcquisitionBatchItem_createdAcquisitionRecordId_fkey" FOREIGN KEY ("createdAcquisitionRecordId") REFERENCES "PlantAcquisitionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_acquisitionBatchId_fkey" FOREIGN KEY ("acquisitionBatchId") REFERENCES "AcquisitionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionExhibitWishlistItem" ADD CONSTRAINT "CollectionExhibitWishlistItem_exhibitId_fkey" FOREIGN KEY ("exhibitId") REFERENCES "CollectionExhibit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionExhibitWishlistItem" ADD CONSTRAINT "CollectionExhibitWishlistItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionExhibitWishlistItem" ADD CONSTRAINT "CollectionExhibitWishlistItem_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
