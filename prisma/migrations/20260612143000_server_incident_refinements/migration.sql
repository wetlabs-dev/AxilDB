-- Tighten incident lifecycle fields to enums and add durable worker-run records.

CREATE TYPE "ServerIncidentCategory" AS ENUM ('MEMORY', 'DISK', 'WORKER', 'EMAIL', 'AI', 'NETWORK', 'MANUAL');
CREATE TYPE "ServerIncidentSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "ServerIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "ServerIncident" ALTER COLUMN "category" TYPE "ServerIncidentCategory" USING "category"::"ServerIncidentCategory";
ALTER TABLE "ServerIncident" ALTER COLUMN "severity" TYPE "ServerIncidentSeverity" USING "severity"::"ServerIncidentSeverity";
ALTER TABLE "ServerIncident" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ServerIncident" ALTER COLUMN "status" TYPE "ServerIncidentStatus" USING "status"::"ServerIncidentStatus";
ALTER TABLE "ServerIncident" ALTER COLUMN "status" SET DEFAULT 'OPEN';

CREATE TABLE "ServerWorkerRun" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "summary" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerWorkerRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerWorkerRun_workerName_idx" ON "ServerWorkerRun"("workerName");
CREATE INDEX "ServerWorkerRun_status_idx" ON "ServerWorkerRun"("status");
CREATE INDEX "ServerWorkerRun_startedAt_idx" ON "ServerWorkerRun"("startedAt");
