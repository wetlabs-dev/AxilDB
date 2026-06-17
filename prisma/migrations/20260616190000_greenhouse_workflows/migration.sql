-- Add collection-scoped greenhouse workflow templates, runs, scoped plants, and run-step state.

CREATE TABLE "WorkflowTemplate" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT,
  "triggerType" TEXT,
  "triggerConfigJson" JSONB,
  "isTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowStep" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "stepType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "configJson" JSONB,
  "outputBehavior" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRun" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "templateId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "scopeType" TEXT NOT NULL DEFAULT 'COLLECTION',
  "locationId" TEXT,
  "assignedToUserId" TEXT,
  "startedByUserId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "summary" TEXT,
  "triggerType" TEXT,
  "triggerConfigJson" JSONB,
  "isTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRunPlant" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "plantInstanceId" TEXT NOT NULL,

  CONSTRAINT "WorkflowRunPlant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRunStep" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "templateStepId" TEXT,
  "stepType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "configJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "completedByUserId" TEXT,
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "outputJson" JSONB,
  "createdRecordType" TEXT,
  "createdRecordId" TEXT,

  CONSTRAINT "WorkflowRunStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowRunPlant_runId_plantInstanceId_key" ON "WorkflowRunPlant"("runId", "plantInstanceId");

CREATE INDEX "WorkflowTemplate_collectionId_idx" ON "WorkflowTemplate"("collectionId");
CREATE INDEX "WorkflowTemplate_createdByUserId_idx" ON "WorkflowTemplate"("createdByUserId");
CREATE INDEX "WorkflowTemplate_isBuiltIn_idx" ON "WorkflowTemplate"("isBuiltIn");
CREATE INDEX "WorkflowTemplate_isArchived_idx" ON "WorkflowTemplate"("isArchived");
CREATE INDEX "WorkflowTemplate_category_idx" ON "WorkflowTemplate"("category");
CREATE INDEX "WorkflowTemplate_triggerType_idx" ON "WorkflowTemplate"("triggerType");
CREATE INDEX "WorkflowTemplate_isTriggerEnabled_idx" ON "WorkflowTemplate"("isTriggerEnabled");

CREATE INDEX "WorkflowStep_templateId_idx" ON "WorkflowStep"("templateId");
CREATE INDEX "WorkflowStep_stepType_idx" ON "WorkflowStep"("stepType");
CREATE INDEX "WorkflowStep_sortOrder_idx" ON "WorkflowStep"("sortOrder");

CREATE INDEX "WorkflowRun_collectionId_idx" ON "WorkflowRun"("collectionId");
CREATE INDEX "WorkflowRun_templateId_idx" ON "WorkflowRun"("templateId");
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");
CREATE INDEX "WorkflowRun_scopeType_idx" ON "WorkflowRun"("scopeType");
CREATE INDEX "WorkflowRun_locationId_idx" ON "WorkflowRun"("locationId");
CREATE INDEX "WorkflowRun_assignedToUserId_idx" ON "WorkflowRun"("assignedToUserId");
CREATE INDEX "WorkflowRun_startedByUserId_idx" ON "WorkflowRun"("startedByUserId");
CREATE INDEX "WorkflowRun_startedAt_idx" ON "WorkflowRun"("startedAt");
CREATE INDEX "WorkflowRun_triggerType_idx" ON "WorkflowRun"("triggerType");
CREATE INDEX "WorkflowRun_isTriggerEnabled_idx" ON "WorkflowRun"("isTriggerEnabled");

CREATE INDEX "WorkflowRunPlant_collectionId_idx" ON "WorkflowRunPlant"("collectionId");
CREATE INDEX "WorkflowRunPlant_runId_idx" ON "WorkflowRunPlant"("runId");
CREATE INDEX "WorkflowRunPlant_plantInstanceId_idx" ON "WorkflowRunPlant"("plantInstanceId");

CREATE INDEX "WorkflowRunStep_collectionId_idx" ON "WorkflowRunStep"("collectionId");
CREATE INDEX "WorkflowRunStep_runId_idx" ON "WorkflowRunStep"("runId");
CREATE INDEX "WorkflowRunStep_templateStepId_idx" ON "WorkflowRunStep"("templateStepId");
CREATE INDEX "WorkflowRunStep_stepType_idx" ON "WorkflowRunStep"("stepType");
CREATE INDEX "WorkflowRunStep_status_idx" ON "WorkflowRunStep"("status");
CREATE INDEX "WorkflowRunStep_sortOrder_idx" ON "WorkflowRunStep"("sortOrder");
CREATE INDEX "WorkflowRunStep_completedByUserId_idx" ON "WorkflowRunStep"("completedByUserId");
CREATE INDEX "WorkflowRunStep_createdRecordType_createdRecordId_idx" ON "WorkflowRunStep"("createdRecordType", "createdRecordId");

ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowRunPlant" ADD CONSTRAINT "WorkflowRunPlant_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRunPlant" ADD CONSTRAINT "WorkflowRunPlant_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRunPlant" ADD CONSTRAINT "WorkflowRunPlant_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "WorkflowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
