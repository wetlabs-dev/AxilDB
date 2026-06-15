-- CreateEnum
CREATE TYPE "RestoreRequestStatus" AS ENUM ('PLANNED', 'VALIDATED', 'COMMAND_GENERATED', 'COMPLETED_EXTERNALLY', 'CANCELLED');

-- CreateTable
CREATE TABLE "MaintenanceMode" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "expectedReturnAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "startedByUserId" TEXT,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreRequest" (
    "id" TEXT NOT NULL,
    "backupPath" TEXT NOT NULL,
    "backupName" TEXT NOT NULL,
    "status" "RestoreRequestStatus" NOT NULL DEFAULT 'PLANNED',
    "requestedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validationJson" JSONB,
    "generatedCommand" TEXT,
    "commandGeneratedAt" TIMESTAMP(3),
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestoreRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceMode_enabled_idx" ON "MaintenanceMode"("enabled");

-- CreateIndex
CREATE INDEX "MaintenanceMode_startedByUserId_idx" ON "MaintenanceMode"("startedByUserId");

-- CreateIndex
CREATE INDEX "MaintenanceMode_endedByUserId_idx" ON "MaintenanceMode"("endedByUserId");

-- CreateIndex
CREATE INDEX "RestoreRequest_backupPath_idx" ON "RestoreRequest"("backupPath");

-- CreateIndex
CREATE INDEX "RestoreRequest_status_idx" ON "RestoreRequest"("status");

-- CreateIndex
CREATE INDEX "RestoreRequest_requestedAt_idx" ON "RestoreRequest"("requestedAt");

-- CreateIndex
CREATE INDEX "RestoreRequest_requestedByUserId_idx" ON "RestoreRequest"("requestedByUserId");

-- AddForeignKey
ALTER TABLE "MaintenanceMode" ADD CONSTRAINT "MaintenanceMode_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceMode" ADD CONSTRAINT "MaintenanceMode_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestoreRequest" ADD CONSTRAINT "RestoreRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestoreRequest" ADD CONSTRAINT "RestoreRequest_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestoreRequest" ADD CONSTRAINT "RestoreRequest_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
