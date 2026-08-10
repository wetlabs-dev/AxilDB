-- CreateTable
CREATE TABLE "SubstrateComponent" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "particleSize" TEXT,
    "organicity" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "waterRetention" TEXT,
    "aeration" TEXT,
    "drainage" TEXT,
    "cationExchangeCapacity" TEXT,
    "longevity" TEXT,
    "phTendency" TEXT,
    "renewable" BOOLEAN,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "starterKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubstrateComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubstrateRecipe" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "intendedUse" TEXT,
    "activeVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "starterKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubstrateRecipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubstrateRecipeVersion" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "substrateRecipeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "changeSummary" TEXT,
    "notes" TEXT,
    "totalPercent" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    CONSTRAINT "SubstrateRecipeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubstrateRecipeComponent" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "substrateRecipeVersionId" TEXT NOT NULL,
    "substrateComponentId" TEXT NOT NULL,
    "percentByVolume" DECIMAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubstrateRecipeComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantDefinitionSubstrateRecommendation" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantDefinitionId" TEXT NOT NULL,
    "substrateRecipeVersionId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "suitability" TEXT NOT NULL DEFAULT 'RECOMMENDED',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlantDefinitionSubstrateRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantInstanceSubstrate" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "substrateMode" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "substrateRecipeVersionId" TEXT,
    "receivedSubstrateDescription" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlantInstanceSubstrate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantSubstrateHistory" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "previousMode" TEXT,
    "previousRecipeVersionId" TEXT,
    "previousDescription" TEXT,
    "newMode" TEXT NOT NULL,
    "newRecipeVersionId" TEXT,
    "newDescription" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "repottingCareEventId" TEXT,
    "changedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlantSubstrateHistory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlantCareEvent" ADD COLUMN "substrateRecipeVersionId" TEXT;

CREATE UNIQUE INDEX "SubstrateComponent_collectionId_slug_key" ON "SubstrateComponent"("collectionId", "slug");
CREATE UNIQUE INDEX "SubstrateComponent_collectionId_starterKey_key" ON "SubstrateComponent"("collectionId", "starterKey");
CREATE INDEX "SubstrateComponent_collectionId_active_idx" ON "SubstrateComponent"("collectionId", "active");
CREATE INDEX "SubstrateComponent_collectionId_category_idx" ON "SubstrateComponent"("collectionId", "category");
CREATE INDEX "SubstrateComponent_collectionId_organicity_idx" ON "SubstrateComponent"("collectionId", "organicity");
CREATE UNIQUE INDEX "SubstrateRecipe_activeVersionId_key" ON "SubstrateRecipe"("activeVersionId");
CREATE UNIQUE INDEX "SubstrateRecipe_collectionId_slug_key" ON "SubstrateRecipe"("collectionId", "slug");
CREATE UNIQUE INDEX "SubstrateRecipe_collectionId_starterKey_key" ON "SubstrateRecipe"("collectionId", "starterKey");
CREATE INDEX "SubstrateRecipe_collectionId_archivedAt_idx" ON "SubstrateRecipe"("collectionId", "archivedAt");
CREATE UNIQUE INDEX "SubstrateRecipeVersion_substrateRecipeId_versionNumber_key" ON "SubstrateRecipeVersion"("substrateRecipeId", "versionNumber");
CREATE INDEX "SubstrateRecipeVersion_collectionId_status_idx" ON "SubstrateRecipeVersion"("collectionId", "status");
CREATE INDEX "SubstrateRecipeVersion_collectionId_substrateRecipeId_idx" ON "SubstrateRecipeVersion"("collectionId", "substrateRecipeId");
CREATE UNIQUE INDEX "SubstrateRecipeComponent_substrateRecipeVersionId_substrateComponentId_key" ON "SubstrateRecipeComponent"("substrateRecipeVersionId", "substrateComponentId");
CREATE INDEX "SubstrateRecipeComponent_collectionId_idx" ON "SubstrateRecipeComponent"("collectionId");
CREATE INDEX "SubstrateRecipeComponent_substrateComponentId_idx" ON "SubstrateRecipeComponent"("substrateComponentId");
CREATE INDEX "SubstrateRecipeComponent_substrateRecipeVersionId_sortOrder_idx" ON "SubstrateRecipeComponent"("substrateRecipeVersionId", "sortOrder");
CREATE UNIQUE INDEX "PlantDefinitionSubstrateRecommendation_collectionId_plantDefinitionId_substrateRecipeVersionId_key" ON "PlantDefinitionSubstrateRecommendation"("collectionId", "plantDefinitionId", "substrateRecipeVersionId");
CREATE INDEX "PlantDefinitionSubstrateRecommendation_collectionId_plantDefinitionId_rank_idx" ON "PlantDefinitionSubstrateRecommendation"("collectionId", "plantDefinitionId", "rank");
CREATE INDEX "PlantDefinitionSubstrateRecommendation_collectionId_substrateRecipeVersionId_idx" ON "PlantDefinitionSubstrateRecommendation"("collectionId", "substrateRecipeVersionId");
CREATE UNIQUE INDEX "PlantInstanceSubstrate_plantInstanceId_key" ON "PlantInstanceSubstrate"("plantInstanceId");
CREATE INDEX "PlantInstanceSubstrate_collectionId_substrateMode_idx" ON "PlantInstanceSubstrate"("collectionId", "substrateMode");
CREATE INDEX "PlantInstanceSubstrate_collectionId_substrateRecipeVersionId_idx" ON "PlantInstanceSubstrate"("collectionId", "substrateRecipeVersionId");
CREATE UNIQUE INDEX "PlantSubstrateHistory_repottingCareEventId_key" ON "PlantSubstrateHistory"("repottingCareEventId");
CREATE INDEX "PlantSubstrateHistory_collectionId_plantInstanceId_changedAt_idx" ON "PlantSubstrateHistory"("collectionId", "plantInstanceId", "changedAt");
CREATE INDEX "PlantSubstrateHistory_collectionId_newMode_idx" ON "PlantSubstrateHistory"("collectionId", "newMode");
CREATE INDEX "PlantSubstrateHistory_newRecipeVersionId_idx" ON "PlantSubstrateHistory"("newRecipeVersionId");
CREATE INDEX "PlantCareEvent_substrateRecipeVersionId_idx" ON "PlantCareEvent"("substrateRecipeVersionId");

ALTER TABLE "SubstrateComponent" ADD CONSTRAINT "SubstrateComponent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubstrateRecipe" ADD CONSTRAINT "SubstrateRecipe_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubstrateRecipeVersion" ADD CONSTRAINT "SubstrateRecipeVersion_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubstrateRecipeVersion" ADD CONSTRAINT "SubstrateRecipeVersion_substrateRecipeId_fkey" FOREIGN KEY ("substrateRecipeId") REFERENCES "SubstrateRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubstrateRecipe" ADD CONSTRAINT "SubstrateRecipe_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "SubstrateRecipeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubstrateRecipeComponent" ADD CONSTRAINT "SubstrateRecipeComponent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubstrateRecipeComponent" ADD CONSTRAINT "SubstrateRecipeComponent_substrateRecipeVersionId_fkey" FOREIGN KEY ("substrateRecipeVersionId") REFERENCES "SubstrateRecipeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubstrateRecipeComponent" ADD CONSTRAINT "SubstrateRecipeComponent_substrateComponentId_fkey" FOREIGN KEY ("substrateComponentId") REFERENCES "SubstrateComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionSubstrateRecommendation" ADD CONSTRAINT "PlantDefinitionSubstrateRecommendation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionSubstrateRecommendation" ADD CONSTRAINT "PlantDefinitionSubstrateRecommendation_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionSubstrateRecommendation" ADD CONSTRAINT "PlantDefinitionSubstrateRecommendation_substrateRecipeVersionId_fkey" FOREIGN KEY ("substrateRecipeVersionId") REFERENCES "SubstrateRecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantInstanceSubstrate" ADD CONSTRAINT "PlantInstanceSubstrate_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantInstanceSubstrate" ADD CONSTRAINT "PlantInstanceSubstrate_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantInstanceSubstrate" ADD CONSTRAINT "PlantInstanceSubstrate_substrateRecipeVersionId_fkey" FOREIGN KEY ("substrateRecipeVersionId") REFERENCES "SubstrateRecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantSubstrateHistory" ADD CONSTRAINT "PlantSubstrateHistory_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantSubstrateHistory" ADD CONSTRAINT "PlantSubstrateHistory_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantSubstrateHistory" ADD CONSTRAINT "PlantSubstrateHistory_previousRecipeVersionId_fkey" FOREIGN KEY ("previousRecipeVersionId") REFERENCES "SubstrateRecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantSubstrateHistory" ADD CONSTRAINT "PlantSubstrateHistory_newRecipeVersionId_fkey" FOREIGN KEY ("newRecipeVersionId") REFERENCES "SubstrateRecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlantSubstrateHistory" ADD CONSTRAINT "PlantSubstrateHistory_repottingCareEventId_fkey" FOREIGN KEY ("repottingCareEventId") REFERENCES "PlantCareEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantCareEvent" ADD CONSTRAINT "PlantCareEvent_substrateRecipeVersionId_fkey" FOREIGN KEY ("substrateRecipeVersionId") REFERENCES "SubstrateRecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
