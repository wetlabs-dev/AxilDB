-- Persist ID My Plant requests as collection-scoped history records.
CREATE TABLE "PlantIdentificationLog" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT,
    "knownNames" TEXT,
    "uploadedPhotoId" TEXT,
    "uploadedImagePath" TEXT,
    "resultJson" JSONB NOT NULL,
    "genus" TEXT,
    "species" TEXT,
    "hybridNotation" TEXT,
    "cultivarName" TEXT,
    "confidenceLevel" TEXT,
    "confidenceExplanation" TEXT,
    "alternativesJson" JSONB,
    "suggestedAliasesJson" JSONB,
    "suggestedDescription" TEXT,
    "warningsJson" JSONB,
    "matchedPlantDefinitionId" TEXT,
    "appliedPlantDefinitionId" TEXT,
    "createdPlantDefinitionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESULT_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantIdentificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlantIdentificationLog_collectionId_idx" ON "PlantIdentificationLog"("collectionId");
CREATE INDEX "PlantIdentificationLog_userId_idx" ON "PlantIdentificationLog"("userId");
CREATE INDEX "PlantIdentificationLog_uploadedPhotoId_idx" ON "PlantIdentificationLog"("uploadedPhotoId");
CREATE INDEX "PlantIdentificationLog_matchedPlantDefinitionId_idx" ON "PlantIdentificationLog"("matchedPlantDefinitionId");
CREATE INDEX "PlantIdentificationLog_appliedPlantDefinitionId_idx" ON "PlantIdentificationLog"("appliedPlantDefinitionId");
CREATE INDEX "PlantIdentificationLog_createdPlantDefinitionId_idx" ON "PlantIdentificationLog"("createdPlantDefinitionId");
CREATE INDEX "PlantIdentificationLog_status_idx" ON "PlantIdentificationLog"("status");
CREATE INDEX "PlantIdentificationLog_createdAt_idx" ON "PlantIdentificationLog"("createdAt");

ALTER TABLE "PlantIdentificationLog" ADD CONSTRAINT "PlantIdentificationLog_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantIdentificationLog" ADD CONSTRAINT "PlantIdentificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantIdentificationLog" ADD CONSTRAINT "PlantIdentificationLog_uploadedPhotoId_fkey" FOREIGN KEY ("uploadedPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantIdentificationLog" ADD CONSTRAINT "PlantIdentificationLog_matchedPlantDefinitionId_fkey" FOREIGN KEY ("matchedPlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantIdentificationLog" ADD CONSTRAINT "PlantIdentificationLog_appliedPlantDefinitionId_fkey" FOREIGN KEY ("appliedPlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantIdentificationLog" ADD CONSTRAINT "PlantIdentificationLog_createdPlantDefinitionId_fkey" FOREIGN KEY ("createdPlantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
