-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "aiBriefingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CollectionBriefing" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "sourceHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "title" TEXT NOT NULL,
    "summaryMarkdown" TEXT NOT NULL,
    "structuredJson" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "generatedByUserId" TEXT,

    CONSTRAINT "CollectionBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_aiBriefingEnabled_idx" ON "Collection"("aiBriefingEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionBriefing_collectionId_localDate_key" ON "CollectionBriefing"("collectionId", "localDate");

-- CreateIndex
CREATE INDEX "CollectionBriefing_collectionId_idx" ON "CollectionBriefing"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionBriefing_localDate_idx" ON "CollectionBriefing"("localDate");

-- CreateIndex
CREATE INDEX "CollectionBriefing_status_idx" ON "CollectionBriefing"("status");

-- CreateIndex
CREATE INDEX "CollectionBriefing_generatedByUserId_idx" ON "CollectionBriefing"("generatedByUserId");

-- AddForeignKey
ALTER TABLE "CollectionBriefing" ADD CONSTRAINT "CollectionBriefing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionBriefing" ADD CONSTRAINT "CollectionBriefing_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
