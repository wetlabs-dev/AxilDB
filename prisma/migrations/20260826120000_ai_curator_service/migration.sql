ALTER TABLE "Collection" ADD COLUMN "aiCuratorEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AiCuratorSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "reasoningEffort" TEXT NOT NULL DEFAULT 'low',
    "maxTokens" INTEGER NOT NULL DEFAULT 1200,
    "dailyBudgetDollars" DECIMAL(65,30) NOT NULL DEFAULT 5.00,
    "monthlyBudgetDollars" DECIMAL(65,30) NOT NULL DEFAULT 100.00,
    "softLimitPercent" INTEGER NOT NULL DEFAULT 80,
    "hardLimitPercent" INTEGER NOT NULL DEFAULT 100,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "cadenceMinutes" INTEGER NOT NULL DEFAULT 2,
    "timeSliceSeconds" INTEGER NOT NULL DEFAULT 75,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "suggestionExpiryDays" INTEGER NOT NULL DEFAULT 90,
    "rejectedSuggestionCooldownDays" INTEGER NOT NULL DEFAULT 90,
    "promptVersion" TEXT NOT NULL DEFAULT 'ai-curator-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCuratorSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCuratorJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phase" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantDefinitionId" TEXT,
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "targetField" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "estimatedCostDollars" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "actualCostDollars" DECIMAL(65,30),
    "model" TEXT,
    "promptVersion" TEXT,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "blockingReason" TEXT,
    "humanActionRequired" TEXT,
    "retryConditions" TEXT,
    "resultSummary" TEXT,
    "dataHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCuratorJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCuratorSuggestion" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "plantDefinitionId" TEXT,
    "jobId" TEXT,
    "phase" TEXT NOT NULL,
    "suggestionType" TEXT NOT NULL,
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "targetField" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "currentValue" JSONB,
    "suggestedValue" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "supportingReferences" JSONB,
    "promptVersion" TEXT,
    "model" TEXT,
    "estimatedCostDollars" DECIMAL(65,30),
    "actualCostDollars" DECIMAL(65,30),
    "sourceDataHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCuratorSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Collection_aiCuratorEnabled_idx" ON "Collection"("aiCuratorEnabled");
CREATE INDEX "AiCuratorJob_collectionId_status_priority_idx" ON "AiCuratorJob"("collectionId", "status", "priority");
CREATE INDEX "AiCuratorJob_phase_idx" ON "AiCuratorJob"("phase");
CREATE INDEX "AiCuratorJob_jobType_idx" ON "AiCuratorJob"("jobType");
CREATE INDEX "AiCuratorJob_plantDefinitionId_idx" ON "AiCuratorJob"("plantDefinitionId");
CREATE INDEX "AiCuratorJob_status_nextRetryAt_idx" ON "AiCuratorJob"("status", "nextRetryAt");
CREATE INDEX "AiCuratorJob_claimedAt_idx" ON "AiCuratorJob"("claimedAt");
CREATE INDEX "AiCuratorJob_createdAt_idx" ON "AiCuratorJob"("createdAt");
CREATE UNIQUE INDEX "AiCuratorJob_active_scope_key" ON "AiCuratorJob"("collectionId", "jobType", "phase", "plantDefinitionId", "targetEntityType", "targetEntityId", "targetField", "status");
CREATE UNIQUE INDEX "AiCuratorSuggestion_jobId_key" ON "AiCuratorSuggestion"("jobId");
CREATE INDEX "AiCuratorSuggestion_collectionId_status_createdAt_idx" ON "AiCuratorSuggestion"("collectionId", "status", "createdAt");
CREATE INDEX "AiCuratorSuggestion_plantDefinitionId_status_idx" ON "AiCuratorSuggestion"("plantDefinitionId", "status");
CREATE INDEX "AiCuratorSuggestion_phase_idx" ON "AiCuratorSuggestion"("phase");
CREATE INDEX "AiCuratorSuggestion_suggestionType_idx" ON "AiCuratorSuggestion"("suggestionType");
CREATE INDEX "AiCuratorSuggestion_targetField_idx" ON "AiCuratorSuggestion"("targetField");
CREATE INDEX "AiCuratorSuggestion_expiresAt_idx" ON "AiCuratorSuggestion"("expiresAt");

ALTER TABLE "AiCuratorJob" ADD CONSTRAINT "AiCuratorJob_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCuratorJob" ADD CONSTRAINT "AiCuratorJob_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCuratorSuggestion" ADD CONSTRAINT "AiCuratorSuggestion_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCuratorSuggestion" ADD CONSTRAINT "AiCuratorSuggestion_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCuratorSuggestion" ADD CONSTRAINT "AiCuratorSuggestion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AiCuratorJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
