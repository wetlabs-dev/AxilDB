-- CreateTable
CREATE TABLE "CareCadenceProposal" (
    "id" TEXT NOT NULL,
    "plantDefinitionId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "interval" INTEGER,
    "unit" TEXT,
    "confidence" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "applicability" TEXT NOT NULL,
    "sourceReferences" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "jobId" TEXT,
    "recoveryKey" TEXT,
    "researchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "approvedInterval" INTEGER,
    "approvedUnit" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareCadenceProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareCadenceProposal_recoveryKey_key" ON "CareCadenceProposal"("recoveryKey");

-- CreateIndex
CREATE INDEX "CareCadenceProposal_plantDefinitionId_activity_status_idx" ON "CareCadenceProposal"("plantDefinitionId", "activity", "status");

-- CreateIndex
CREATE INDEX "CareCadenceProposal_status_researchedAt_idx" ON "CareCadenceProposal"("status", "researchedAt");

-- CreateIndex
CREATE INDEX "CareCadenceProposal_jobId_idx" ON "CareCadenceProposal"("jobId");

-- AddForeignKey
ALTER TABLE "CareCadenceProposal" ADD CONSTRAINT "CareCadenceProposal_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareCadenceProposal" ADD CONSTRAINT "CareCadenceProposal_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AiCuratorJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareCadenceProposal" ADD CONSTRAINT "CareCadenceProposal_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "CareCadenceProposal" ADD CONSTRAINT "CadenceProposal_activity" CHECK (activity IN ('WATERING','FERTILIZING','REPOTTING','PEST_INSPECTION','GENERAL_INSPECTION','PRUNING')),
 ADD CONSTRAINT "CadenceProposal_confidence" CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
 ADD CONSTRAINT "CadenceProposal_status" CHECK (status IN ('PENDING','APPROVED','REJECTED','SUPERSEDED','FAILED')),
 ADD CONSTRAINT "CadenceProposal_source" CHECK (source IN ('MAGIC_FILL','AI_RESEARCH','BULK_RESEARCH','LEGACY_RECOVERY')),
 ADD CONSTRAINT "CadenceProposal_applicability" CHECK (applicability IN ('RECOMMENDED','NOT_APPLICABLE','INSUFFICIENT_INFORMATION','BLOCKED_BY_DEPENDENCY')),
 ADD CONSTRAINT "CadenceProposal_interval" CHECK ((applicability = 'RECOMMENDED' AND interval IS NOT NULL AND interval BETWEEN 1 AND 3650 AND unit IS NOT NULL AND unit IN ('DAY','WEEK','MONTH','YEAR')) OR (applicability <> 'RECOMMENDED' AND interval IS NULL AND unit IS NULL)),
 ADD CONSTRAINT "CadenceProposal_approved" CHECK (status <> 'APPROVED' OR (applicability = 'RECOMMENDED' AND "approvedInterval" IS NOT NULL AND "approvedInterval" BETWEEN 1 AND 3650 AND "approvedUnit" IS NOT NULL AND "approvedUnit" IN ('DAY','WEEK','MONTH','YEAR')));
CREATE UNIQUE INDEX "CadenceProposal_one_pending" ON "CareCadenceProposal" ("plantDefinitionId",activity) WHERE status = 'PENDING';
CREATE UNIQUE INDEX "CadenceResearch_one_active" ON "AiCuratorJob" ("plantDefinitionId") WHERE "targetField" = 'careCadences' AND status IN ('QUEUED','RUNNING','DEFERRED','WAITING_FOR_HUMAN');

-- Shares the cadence dependency lock so manual edits and proposal approvals serialize.
CREATE FUNCTION supersede_cadence_proposals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE "CareCadenceProposal" SET status='SUPERSEDED', "reviewNote"='A cadence was configured.', "updatedAt"=CURRENT_TIMESTAMP
 WHERE "plantDefinitionId"=NEW."plantDefinitionId" AND activity=NEW.activity AND status='PENDING';
 RETURN NEW;
END $$;
CREATE TRIGGER supersede_cadence_proposals AFTER INSERT OR UPDATE ON "PlantDefinitionCareCadence" FOR EACH ROW EXECUTE FUNCTION supersede_cadence_proposals();

-- Terminal history must not prevent a later explicit re-research from completing.
DROP INDEX "AiCuratorJob_active_scope_key";
CREATE UNIQUE INDEX "AiCuratorJob_active_scope_key" ON "AiCuratorJob" ("collectionId","jobType",phase,"plantDefinitionId","targetEntityType","targetEntityId","targetField",status) WHERE status IN ('QUEUED','RUNNING','DEFERRED','WAITING_FOR_HUMAN');
CREATE INDEX "AiCuratorJob_collectionId_jobType_phase_plantDefinitionId_t_idx" ON "AiCuratorJob" ("collectionId","jobType",phase,"plantDefinitionId","targetField");
