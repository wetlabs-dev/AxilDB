-- Preserve existing outlet IDs and history while correcting the domain terminology.
ALTER TABLE "DistributorLocation" RENAME TO "DistributorOutlet";
ALTER TABLE "DistributorOutlet" RENAME COLUMN "locationType" TO "outletType";
ALTER TABLE "DistributorOutlet" ALTER COLUMN "outletType" SET DEFAULT 'OTHER';
UPDATE "DistributorOutlet"
SET "outletType" = CASE
  WHEN "outletType" IS NULL OR btrim("outletType") = '' THEN 'OTHER'
  WHEN lower("outletType") ~ '(online|web|storefront)' THEN 'ONLINE_STOREFRONT'
  WHEN lower("outletType") ~ '(show|booth|event)' THEN 'SHOW_EVENT_BOOTH'
  WHEN lower("outletType") ~ '(mail)' THEN 'MAIL_ORDER'
  WHEN lower("outletType") ~ '(pop.?up)' THEN 'POP_UP'
  WHEN lower("outletType") ~ '(branch|store|physical)' THEN 'PHYSICAL_BRANCH'
  ELSE 'OTHER'
END;
ALTER TABLE "DistributorOutlet" ALTER COLUMN "outletType" SET NOT NULL;

ALTER TABLE "PlantObservation" RENAME COLUMN "distributorLocationId" TO "distributorOutletId";
ALTER TABLE "PlantAcquisitionRecord" RENAME COLUMN "distributorLocationId" TO "distributorOutletId";
ALTER TABLE "AcquisitionBatch" RENAME COLUMN "distributorLocationId" TO "distributorOutletId";
ALTER TABLE "ProvenanceReconciliationItem" RENAME COLUMN "suggestedDistributorLocationId" TO "suggestedDistributorOutletId";
ALTER TABLE "Collection" RENAME COLUMN "showDistributorLocation" TO "showDistributorOutlet";

ALTER INDEX "DistributorLocation_distributorId_normalizedName_key" RENAME TO "DistributorOutlet_distributorId_normalizedName_key";
ALTER INDEX "DistributorLocation_collectionId_active_idx" RENAME TO "DistributorOutlet_collectionId_active_idx";
ALTER INDEX "DistributorLocation_distributorId_idx" RENAME TO "DistributorOutlet_distributorId_idx";
ALTER INDEX "PlantObservation_distributorLocationId_idx" RENAME TO "PlantObservation_distributorOutletId_idx";
ALTER INDEX "PlantAcquisitionRecord_distributorLocationId_idx" RENAME TO "PlantAcquisitionRecord_distributorOutletId_idx";
ALTER INDEX "AcquisitionBatch_distributorLocationId_idx" RENAME TO "AcquisitionBatch_distributorOutletId_idx";

ALTER TABLE "Collection"
  ADD COLUMN "showSellerIdentity" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showSellerStorefront" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Collection" ALTER COLUMN "showSourceProvenance" SET DEFAULT false;

CREATE TABLE "Seller" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'ORGANIZATION',
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "websiteUrl" TEXT,
  "region" TEXT,
  "country" TEXT,
  "description" TEXT,
  "rating" INTEGER,
  "experienceNotes" TEXT,
  "aliasesJson" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Seller_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Seller_kind_check" CHECK ("kind" IN ('ORGANIZATION', 'PERSON')),
  CONSTRAINT "Seller_rating_check" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5))
);

CREATE TABLE "SellerStorefront" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "distributorId" TEXT,
  "handleOrName" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "storefrontType" TEXT NOT NULL DEFAULT 'OTHER',
  "profileUrl" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerStorefront_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlantObservation"
  ADD COLUMN "sellerId" TEXT,
  ADD COLUMN "sellerStorefrontId" TEXT;
ALTER TABLE "PlantAcquisitionRecord"
  ADD COLUMN "sellerId" TEXT,
  ADD COLUMN "sellerStorefrontId" TEXT;
ALTER TABLE "AcquisitionBatch"
  ADD COLUMN "sellerId" TEXT,
  ADD COLUMN "sellerStorefrontId" TEXT;
ALTER TABLE "ProvenanceReconciliationItem"
  ADD COLUMN "suggestedSellerId" TEXT,
  ADD COLUMN "suggestedSellerStorefrontId" TEXT;

CREATE TABLE "PlantDefinitionPreferredSeller" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "sellerStorefrontId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantDefinitionPreferredSeller_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantDefinitionPreferredDistributor" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "distributorId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantDefinitionPreferredDistributor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Seller_collectionId_normalizedName_key" ON "Seller"("collectionId", "normalizedName");
CREATE INDEX "Seller_collectionId_active_idx" ON "Seller"("collectionId", "active");
CREATE UNIQUE INDEX "SellerStorefront_sellerId_normalizedName_distributorId_key" ON "SellerStorefront"("sellerId", "normalizedName", "distributorId");
CREATE INDEX "SellerStorefront_collectionId_active_idx" ON "SellerStorefront"("collectionId", "active");
CREATE INDEX "SellerStorefront_sellerId_idx" ON "SellerStorefront"("sellerId");
CREATE INDEX "SellerStorefront_distributorId_idx" ON "SellerStorefront"("distributorId");
CREATE INDEX "PlantObservation_sellerId_idx" ON "PlantObservation"("sellerId");
CREATE INDEX "PlantObservation_sellerStorefrontId_idx" ON "PlantObservation"("sellerStorefrontId");
CREATE INDEX "PlantAcquisitionRecord_sellerId_idx" ON "PlantAcquisitionRecord"("sellerId");
CREATE INDEX "PlantAcquisitionRecord_sellerStorefrontId_idx" ON "PlantAcquisitionRecord"("sellerStorefrontId");
CREATE INDEX "AcquisitionBatch_sellerId_idx" ON "AcquisitionBatch"("sellerId");
CREATE INDEX "AcquisitionBatch_sellerStorefrontId_idx" ON "AcquisitionBatch"("sellerStorefrontId");
CREATE UNIQUE INDEX "PlantDefinitionPreferredSeller_plantDefinitionId_sellerId_sellerStorefrontId_key" ON "PlantDefinitionPreferredSeller"("plantDefinitionId", "sellerId", "sellerStorefrontId");
CREATE INDEX "PlantDefinitionPreferredSeller_collectionId_idx" ON "PlantDefinitionPreferredSeller"("collectionId");
CREATE INDEX "PlantDefinitionPreferredSeller_sellerId_idx" ON "PlantDefinitionPreferredSeller"("sellerId");
CREATE INDEX "PlantDefinitionPreferredSeller_sellerStorefrontId_idx" ON "PlantDefinitionPreferredSeller"("sellerStorefrontId");
CREATE UNIQUE INDEX "PlantDefinitionPreferredDistributor_plantDefinitionId_distributorId_key" ON "PlantDefinitionPreferredDistributor"("plantDefinitionId", "distributorId");
CREATE INDEX "PlantDefinitionPreferredDistributor_collectionId_idx" ON "PlantDefinitionPreferredDistributor"("collectionId");
CREATE INDEX "PlantDefinitionPreferredDistributor_distributorId_idx" ON "PlantDefinitionPreferredDistributor"("distributorId");

ALTER TABLE "Seller" ADD CONSTRAINT "Seller_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SellerStorefront" ADD CONSTRAINT "SellerStorefront_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerStorefront" ADD CONSTRAINT "SellerStorefront_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerStorefront" ADD CONSTRAINT "SellerStorefront_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantObservation" ADD CONSTRAINT "PlantObservation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantObservation" ADD CONSTRAINT "PlantObservation_sellerStorefrontId_fkey" FOREIGN KEY ("sellerStorefrontId") REFERENCES "SellerStorefront"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantAcquisitionRecord" ADD CONSTRAINT "PlantAcquisitionRecord_sellerStorefrontId_fkey" FOREIGN KEY ("sellerStorefrontId") REFERENCES "SellerStorefront"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatch" ADD CONSTRAINT "AcquisitionBatch_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionBatch" ADD CONSTRAINT "AcquisitionBatch_sellerStorefrontId_fkey" FOREIGN KEY ("sellerStorefrontId") REFERENCES "SellerStorefront"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionPreferredSeller" ADD CONSTRAINT "PlantDefinitionPreferredSeller_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionPreferredSeller" ADD CONSTRAINT "PlantDefinitionPreferredSeller_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionPreferredSeller" ADD CONSTRAINT "PlantDefinitionPreferredSeller_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionPreferredSeller" ADD CONSTRAINT "PlantDefinitionPreferredSeller_sellerStorefrontId_fkey" FOREIGN KEY ("sellerStorefrontId") REFERENCES "SellerStorefront"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionPreferredDistributor" ADD CONSTRAINT "PlantDefinitionPreferredDistributor_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionPreferredDistributor" ADD CONSTRAINT "PlantDefinitionPreferredDistributor_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionPreferredDistributor" ADD CONSTRAINT "PlantDefinitionPreferredDistributor_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Distributor"
SET "distributorType" = CASE "distributorType"
  WHEN 'MARKETPLACE_SELLER' THEN 'MARKETPLACE'
  WHEN 'PLANT_SHOW_VENDOR' THEN 'PLANT_SHOW'
  WHEN 'PRIVATE_SELLER' THEN 'PRIVATE_SALE_CHANNEL'
  WHEN 'AUCTION' THEN 'AUCTION_PLATFORM'
  ELSE "distributorType"
END;
