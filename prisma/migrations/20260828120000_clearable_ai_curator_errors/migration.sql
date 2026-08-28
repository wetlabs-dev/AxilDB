-- Allow AI Curator error panels to be cleared without deleting worker/job history.

ALTER TABLE "AiCuratorJob"
ADD COLUMN "errorClearedAt" TIMESTAMP(3),
ADD COLUMN "errorClearedByUserId" TEXT;

ALTER TABLE "ServerWorkerRun"
ADD COLUMN "errorClearedAt" TIMESTAMP(3),
ADD COLUMN "errorClearedByUserId" TEXT;

CREATE INDEX "AiCuratorJob_errorClearedAt_idx" ON "AiCuratorJob"("errorClearedAt");
CREATE INDEX "ServerWorkerRun_errorClearedAt_idx" ON "ServerWorkerRun"("errorClearedAt");
