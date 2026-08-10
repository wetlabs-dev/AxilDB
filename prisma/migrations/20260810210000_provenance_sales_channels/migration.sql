CREATE TABLE "SalesChannelType" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesChannelType_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SellerStorefront"
  ADD COLUMN "salesChannelTypeId" TEXT,
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "phone" TEXT;

CREATE UNIQUE INDEX "SalesChannelType_collection_name_key"
  ON "SalesChannelType"("collectionId", "normalizedName");
CREATE INDEX "SalesChannelType_collection_active_order_idx"
  ON "SalesChannelType"("collectionId", "active", "sortOrder");
CREATE INDEX "SellerStorefront_channel_type_idx"
  ON "SellerStorefront"("salesChannelTypeId");
ALTER TABLE "SalesChannelType" ADD CONSTRAINT "SalesChannelType_collection_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerStorefront" ADD CONSTRAINT "SellerStorefront_channel_type_fkey"
  FOREIGN KEY ("salesChannelTypeId") REFERENCES "SalesChannelType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH defaults(name, normalized_name, sort_order) AS (
  VALUES
    ('Website', 'website', 0), ('Palmstreet', 'palmstreet', 1), ('Etsy', 'etsy', 2),
    ('Retail Store', 'retail store', 3), ('Nursery', 'nursery', 4), ('Plant Show', 'plant show', 5),
    ('Facebook Marketplace', 'facebook marketplace', 6), ('Instagram', 'instagram', 7),
    ('Auction', 'auction', 8), ('Other', 'other', 9)
)
INSERT INTO "SalesChannelType" ("id", "collectionId", "name", "normalizedName", "isBuiltIn", "sortOrder")
SELECT 'sct-' || md5(c."id" || ':' || d.normalized_name), c."id", d.name, d.normalized_name, true, d.sort_order
FROM "Collection" c CROSS JOIN defaults d
ON CONFLICT ("collectionId", "normalizedName") DO NOTHING;

UPDATE "SellerStorefront" ss
SET "salesChannelTypeId" = sct."id"
FROM "SalesChannelType" sct
WHERE sct."collectionId" = ss."collectionId"
  AND sct."normalizedName" = CASE
    WHEN lower(coalesce((SELECT d."name" FROM "Distributor" d WHERE d."id" = ss."distributorId"), '')) LIKE '%palmstreet%' THEN 'palmstreet'
    WHEN lower(coalesce((SELECT d."name" FROM "Distributor" d WHERE d."id" = ss."distributorId"), '')) LIKE '%etsy%' THEN 'etsy'
    WHEN ss."storefrontType" = 'DIRECT_ONLINE_STORE' THEN 'website'
    WHEN ss."storefrontType" = 'SOCIAL_MEDIA_STORE' THEN 'instagram'
    WHEN ss."storefrontType" = 'AUCTION_PROFILE' THEN 'auction'
    WHEN ss."storefrontType" = 'SHOW_VENDOR' THEN 'plant show'
    ELSE 'other'
  END;

-- Each legacy distributor becomes the seller for its legacy outlets unless a seller
-- with the same normalized name already exists. The old rows remain for audit/history.
INSERT INTO "Seller" (
  "id", "collectionId", "kind", "name", "normalizedName", "websiteUrl", "description",
  "rating", "experienceNotes", "aliasesJson", "active", "archivedAt", "createdAt", "updatedAt"
)
SELECT 'legacy-seller-' || md5(d."collectionId" || ':' || d."id"), d."collectionId", d."kind",
  d."name", d."normalizedName", d."websiteUrl", d."description", d."rating", d."experienceNotes",
  d."aliasesJson", d."active", d."archivedAt", d."createdAt", d."updatedAt"
FROM "Distributor" d
WHERE EXISTS (SELECT 1 FROM "DistributorOutlet" o WHERE o."distributorId" = d."id")
  AND NOT EXISTS (
    SELECT 1 FROM "Seller" s
    WHERE s."collectionId" = d."collectionId" AND s."normalizedName" = d."normalizedName"
  );

INSERT INTO "SellerStorefront" (
  "id", "collectionId", "sellerId", "distributorId", "handleOrName", "normalizedName",
  "storefrontType", "salesChannelTypeId", "profileUrl", "addressLine1", "addressLine2", "city",
  "region", "postalCode", "country", "phone", "notes", "active", "archivedAt", "createdAt", "updatedAt"
)
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM "SellerStorefront" x WHERE x."id" = o."id")
    THEN 'legacy-channel-' || md5(o."collectionId" || ':' || o."id") ELSE o."id" END,
  o."collectionId", s."id", o."distributorId", o."name", o."normalizedName",
  CASE WHEN o."outletType" = 'ONLINE_STOREFRONT' THEN 'DIRECT_ONLINE_STORE'
       WHEN o."outletType" = 'SHOW_EVENT_BOOTH' THEN 'SHOW_VENDOR' ELSE 'OTHER' END,
  sct."id", o."url", o."addressLine1", o."addressLine2", o."city", o."region", o."postalCode",
  o."country", o."phone", o."notes", o."active", o."archivedAt", o."createdAt", o."updatedAt"
FROM "DistributorOutlet" o
JOIN "Distributor" d ON d."id" = o."distributorId"
JOIN "Seller" s ON s."collectionId" = d."collectionId" AND s."normalizedName" = d."normalizedName"
JOIN "SalesChannelType" sct ON sct."collectionId" = o."collectionId"
 AND sct."normalizedName" = CASE
   WHEN lower(d."name") LIKE '%palmstreet%' THEN 'palmstreet'
   WHEN lower(d."name") LIKE '%etsy%' THEN 'etsy'
   WHEN o."outletType" = 'PHYSICAL_BRANCH' THEN 'retail store'
   WHEN o."outletType" = 'SHOW_EVENT_BOOTH' THEN 'plant show'
   WHEN o."outletType" IN ('ONLINE_STOREFRONT', 'MAIL_ORDER') THEN 'website'
   ELSE 'other' END
WHERE NOT EXISTS (
  SELECT 1 FROM "SellerStorefront" ss
  WHERE ss."sellerId" = s."id" AND ss."normalizedName" = o."normalizedName"
);

UPDATE "PlantAcquisitionRecord" ar
SET "sellerId" = ss."sellerId", "sellerStorefrontId" = ss."id"
FROM "DistributorOutlet" o
JOIN "Distributor" d ON d."id" = o."distributorId"
JOIN "Seller" s ON s."collectionId" = d."collectionId" AND s."normalizedName" = d."normalizedName"
JOIN "SellerStorefront" ss ON ss."sellerId" = s."id" AND ss."normalizedName" = o."normalizedName"
WHERE ar."distributorOutletId" = o."id" AND ar."sellerId" IS NULL;

UPDATE "PlantObservation" po
SET "sellerId" = ss."sellerId", "sellerStorefrontId" = ss."id"
FROM "DistributorOutlet" o
JOIN "Distributor" d ON d."id" = o."distributorId"
JOIN "Seller" s ON s."collectionId" = d."collectionId" AND s."normalizedName" = d."normalizedName"
JOIN "SellerStorefront" ss ON ss."sellerId" = s."id" AND ss."normalizedName" = o."normalizedName"
WHERE po."distributorOutletId" = o."id" AND po."sellerId" IS NULL;

UPDATE "AcquisitionBatch" ab
SET "sellerId" = ss."sellerId", "sellerStorefrontId" = ss."id"
FROM "DistributorOutlet" o
JOIN "Distributor" d ON d."id" = o."distributorId"
JOIN "Seller" s ON s."collectionId" = d."collectionId" AND s."normalizedName" = d."normalizedName"
JOIN "SellerStorefront" ss ON ss."sellerId" = s."id" AND ss."normalizedName" = o."normalizedName"
WHERE ab."distributorOutletId" = o."id" AND ab."sellerId" IS NULL;

UPDATE "DistributorOutlet" o
SET "active" = false, "archivedAt" = COALESCE(o."archivedAt", CURRENT_TIMESTAMP)
WHERE EXISTS (
  SELECT 1 FROM "SellerStorefront" ss
  JOIN "Seller" s ON s."id" = ss."sellerId"
  JOIN "Distributor" d ON d."id" = o."distributorId"
  WHERE s."collectionId" = d."collectionId"
    AND s."normalizedName" = d."normalizedName"
    AND ss."normalizedName" = o."normalizedName"
);
