CREATE TABLE "PlantInstanceMerge" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "survivingPlantInstanceId" TEXT NOT NULL,
    "mergeDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "metadataSelectionsJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlantInstanceMerge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantInstanceMergeConstituent" (
    "id" TEXT NOT NULL,
    "mergeId" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "originalPlantId" TEXT NOT NULL,
    "originalSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlantInstanceMergeConstituent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlantInstanceMerge_collection_date_idx" ON "PlantInstanceMerge"("collectionId", "mergeDate");
CREATE INDEX "PlantInstanceMerge_survivor_idx" ON "PlantInstanceMerge"("survivingPlantInstanceId");
CREATE INDEX "PlantInstanceMerge_creator_idx" ON "PlantInstanceMerge"("createdByUserId");
CREATE UNIQUE INDEX "PlantInstanceMergeConstituent_plant_key" ON "PlantInstanceMergeConstituent"("plantInstanceId");
CREATE INDEX "PlantInstanceMergeConstituent_merge_idx" ON "PlantInstanceMergeConstituent"("mergeId");

ALTER TABLE "PlantInstanceMerge" ADD CONSTRAINT "PlantInstanceMerge_collection_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantInstanceMerge" ADD CONSTRAINT "PlantInstanceMerge_survivor_fkey" FOREIGN KEY ("survivingPlantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantInstanceMerge" ADD CONSTRAINT "PlantInstanceMerge_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantInstanceMergeConstituent" ADD CONSTRAINT "PlantInstanceMergeConstituent_merge_fkey" FOREIGN KEY ("mergeId") REFERENCES "PlantInstanceMerge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantInstanceMergeConstituent" ADD CONSTRAINT "PlantInstanceMergeConstituent_plant_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
