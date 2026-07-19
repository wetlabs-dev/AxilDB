ALTER TABLE "Collection"
  ADD COLUMN "showSourceProvenance" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showDistributorIdentity" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showDistributorLocation" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Source" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'ORGANIZATION',
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "websiteUrl" TEXT,
  "country" TEXT,
  "region" TEXT,
  "locality" TEXT,
  "description" TEXT,
  "notes" TEXT,
  "aliasesJson" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Source_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Source_kind_check" CHECK ("kind" IN ('ORGANIZATION', 'PERSON'))
);

CREATE TABLE "Distributor" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'ORGANIZATION',
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "distributorType" TEXT NOT NULL DEFAULT 'OTHER',
  "websiteUrl" TEXT,
  "description" TEXT,
  "rating" INTEGER,
  "experienceNotes" TEXT,
  "aliasesJson" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Distributor_kind_check" CHECK ("kind" IN ('ORGANIZATION', 'PERSON')),
  CONSTRAINT "Distributor_rating_check" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5))
);

CREATE TABLE "DistributorLocation" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "distributorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "locationType" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "region" TEXT,
  "postalCode" TEXT,
  "country" TEXT,
  "phone" TEXT,
  "url" TEXT,
  "latitude" DECIMAL(65,30),
  "longitude" DECIMAL(65,30),
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributorLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcquisitionSource" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "acquisitionRecordId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProvenanceReconciliationItem" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "legacyField" TEXT NOT NULL,
  "legacyValue" TEXT NOT NULL,
  "suggestedSourceId" TEXT,
  "suggestedDistributorId" TEXT,
  "suggestedDistributorLocationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "resolutionJson" JSONB,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProvenanceReconciliationItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlantObservation"
  ADD COLUMN "distributorId" TEXT,
  ADD COLUMN "distributorLocationId" TEXT;

ALTER TABLE "PlantAcquisitionRecord"
  ADD COLUMN "distributorId" TEXT,
  ADD COLUMN "distributorLocationId" TEXT;

CREATE UNIQUE INDEX "Source_collectionId_normalizedName_key" ON "Source"("collectionId", "normalizedName");
CREATE INDEX "Source_collectionId_active_idx" ON "Source"("collectionId", "active");
CREATE INDEX "Source_sourceType_idx" ON "Source"("sourceType");
CREATE UNIQUE INDEX "Distributor_collectionId_normalizedName_key" ON "Distributor"("collectionId", "normalizedName");
CREATE INDEX "Distributor_collectionId_active_idx" ON "Distributor"("collectionId", "active");
CREATE INDEX "Distributor_distributorType_idx" ON "Distributor"("distributorType");
CREATE UNIQUE INDEX "DistributorLocation_distributorId_normalizedName_key" ON "DistributorLocation"("distributorId", "normalizedName");
CREATE INDEX "DistributorLocation_collectionId_active_idx" ON "DistributorLocation"("collectionId", "active");
CREATE INDEX "DistributorLocation_distributorId_idx" ON "DistributorLocation"("distributorId");
CREATE UNIQUE INDEX "AcquisitionSource_acquisitionRecordId_sourceId_role_key" ON "AcquisitionSource"("acquisitionRecordId", "sourceId", "role");
CREATE UNIQUE INDEX "AcquisitionSource_acquisitionRecordId_sortOrder_key" ON "AcquisitionSource"("acquisitionRecordId", "sortOrder");
CREATE UNIQUE INDEX "AcquisitionSource_one_primary_per_acquisition" ON "AcquisitionSource"("acquisitionRecordId") WHERE "isPrimary" = true;
CREATE INDEX "AcquisitionSource_collectionId_idx" ON "AcquisitionSource"("collectionId");
CREATE INDEX "AcquisitionSource_sourceId_idx" ON "AcquisitionSource"("sourceId");
CREATE UNIQUE INDEX "ProvenanceReconciliationItem_collectionId_entityType_entityId_legacyField_key" ON "ProvenanceReconciliationItem"("collectionId", "entityType", "entityId", "legacyField");
CREATE INDEX "ProvenanceReconciliationItem_collectionId_status_idx" ON "ProvenanceReconciliationItem"("collectionId", "status");
CREATE INDEX "PlantObservation_distributorId_idx" ON "PlantObservation"("distributorId");
CREATE INDEX "PlantObservation_distributorLocationId_idx" ON "PlantObservation"("distributorLocationId");
CREATE INDEX "PlantAcquisitionRecord_distributorId_idx" ON "PlantAcquisitionRecord"("distributorId");
CREATE INDEX "PlantAcquisitionRecord_distributorLocationId_idx" ON "PlantAcquisitionRecord"("distributorLocationId");

ALTER TABLE "Source" ADD CONSTRAINT "Source_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Source" ADD CONSTRAINT "Source_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DistributorLocation" ADD CONSTRAINT "DistributorLocation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DistributorLocation" ADD CONSTRAINT "DistributorLocation_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcquisitionSource" ADD CONSTRAINT "AcquisitionSource_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcquisitionSource" ADD CONSTRAINT "AcquisitionSource_acquisitionRecordId_fkey" FOREIGN KEY ("acquisitionRecordId") REFERENCES "PlantAcquisitionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcquisitionSource" ADD CONSTRAINT "AcquisitionSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProvenanceReconciliationItem" ADD CONSTRAINT "ProvenanceReconciliationItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProvenanceReconciliationItem" ADD CONSTRAINT "ProvenanceReconciliationItem_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantObservation" ADD CONSTRAINT "PlantObservation_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantObservation" ADD CONSTRAINT "PlantObservation_distributorLocationId_fkey" FOREIGN KEY ("distributorLocationId") REFERENCES "DistributorLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_distributorLocationId_fkey" FOREIGN KEY ("distributorLocationId") REFERENCES "DistributorLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
