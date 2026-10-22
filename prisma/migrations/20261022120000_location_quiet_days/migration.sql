-- NULL location preserves every existing collection-wide rule unchanged.
ALTER TABLE "CollectionQuietDay" ADD COLUMN "locationId" TEXT;
CREATE UNIQUE INDEX "Location_collectionId_id_key" ON "Location"("collectionId", "id");
CREATE INDEX "CollectionQuietDay_collectionId_locationId_idx" ON "CollectionQuietDay"("collectionId", "locationId");
ALTER TABLE "CollectionQuietDay" ADD CONSTRAINT "CollectionQuietDay_location_fkey" FOREIGN KEY ("collectionId", "locationId") REFERENCES "Location"("collectionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
