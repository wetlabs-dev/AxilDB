CREATE TABLE "PlantTag" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "icon" TEXT,
  "description" TEXT,
  "category" TEXT,
  "colorToken" TEXT,
  "publicVisible" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlantTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantDefinitionTag" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "plantTagId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'USER',
  "confidence" DOUBLE PRECISION,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantDefinitionTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlantTag_collectionId_slug_key" ON "PlantTag"("collectionId", "slug");
CREATE INDEX "PlantTag_collectionId_slug_idx" ON "PlantTag"("collectionId", "slug");
CREATE INDEX "PlantTag_collectionId_category_idx" ON "PlantTag"("collectionId", "category");
CREATE INDEX "PlantTag_collectionId_active_idx" ON "PlantTag"("collectionId", "active");
CREATE UNIQUE INDEX "PlantDefinitionTag_plantDefinitionId_plantTagId_key" ON "PlantDefinitionTag"("plantDefinitionId", "plantTagId");
CREATE INDEX "PlantDefinitionTag_collectionId_idx" ON "PlantDefinitionTag"("collectionId");
CREATE INDEX "PlantDefinitionTag_plantDefinitionId_idx" ON "PlantDefinitionTag"("plantDefinitionId");
CREATE INDEX "PlantDefinitionTag_plantTagId_idx" ON "PlantDefinitionTag"("plantTagId");

ALTER TABLE "PlantTag" ADD CONSTRAINT "PlantTag_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantTag" ADD CONSTRAINT "PlantTag_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionTag" ADD CONSTRAINT "PlantDefinitionTag_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionTag" ADD CONSTRAINT "PlantDefinitionTag_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionTag" ADD CONSTRAINT "PlantDefinitionTag_plantTagId_fkey" FOREIGN KEY ("plantTagId") REFERENCES "PlantTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionTag" ADD CONSTRAINT "PlantDefinitionTag_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
