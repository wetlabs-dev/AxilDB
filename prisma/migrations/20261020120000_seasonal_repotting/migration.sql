-- CreateEnum
CREATE TYPE "RepottingQueueStatus" AS ENUM ('QUEUED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RepottingQueueSource" AS ENUM ('MANUAL', 'CARE_QUEUE');

-- AlterTable
ALTER TABLE "PlantDefinition" ADD COLUMN     "alternateRepottingWindowId" TEXT,
ADD COLUMN     "primaryRepottingWindowId" TEXT;

-- CreateTable
CREATE TABLE "RepottingWindow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startMonth" INTEGER NOT NULL,
    "startDay" INTEGER NOT NULL,
    "endMonth" INTEGER NOT NULL,
    "endDay" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepottingWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepottingQueueItem" (
    "id" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "repottingWindowId" TEXT NOT NULL,
    "scheduledYear" INTEGER NOT NULL,
    "status" "RepottingQueueStatus" NOT NULL DEFAULT 'QUEUED',
    "source" "RepottingQueueSource" NOT NULL DEFAULT 'MANUAL',
    "sourceReminderId" TEXT,
    "assessmentDueAt" TIMESTAMP(3),
    "assignmentSnapshot" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "careEventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepottingQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepottingWindow_name_key" ON "RepottingWindow"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RepottingQueueItem_careEventId_key" ON "RepottingQueueItem"("careEventId");

-- CreateIndex
CREATE INDEX "RepottingQueueItem_status_repottingWindowId_scheduledYear_idx" ON "RepottingQueueItem"("status", "repottingWindowId", "scheduledYear");

-- CreateIndex
CREATE INDEX "RepottingQueueItem_plantInstanceId_status_idx" ON "RepottingQueueItem"("plantInstanceId", "status");

-- AddForeignKey
ALTER TABLE "PlantDefinition" ADD CONSTRAINT "PlantDefinition_primaryRepottingWindowId_fkey" FOREIGN KEY ("primaryRepottingWindowId") REFERENCES "RepottingWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDefinition" ADD CONSTRAINT "PlantDefinition_alternateRepottingWindowId_fkey" FOREIGN KEY ("alternateRepottingWindowId") REFERENCES "RepottingWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepottingQueueItem" ADD CONSTRAINT "RepottingQueueItem_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepottingQueueItem" ADD CONSTRAINT "RepottingQueueItem_repottingWindowId_fkey" FOREIGN KEY ("repottingWindowId") REFERENCES "RepottingWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Only one active intention per specimen; retained terminal history is unrestricted.
CREATE UNIQUE INDEX "RepottingQueueItem_active_instance_key" ON "RepottingQueueItem" ("plantInstanceId") WHERE "status" = 'QUEUED';
ALTER TABLE "RepottingWindow" ADD CONSTRAINT "RepottingWindow_month_day_check" CHECK (
 "startMonth" BETWEEN 1 AND 12 AND "endMonth" BETWEEN 1 AND 12 AND
 "startDay" BETWEEN 1 AND CASE WHEN "startMonth"=2 THEN 29 WHEN "startMonth" IN (4,6,9,11) THEN 30 ELSE 31 END AND
 "endDay" BETWEEN 1 AND CASE WHEN "endMonth"=2 THEN 29 WHEN "endMonth" IN (4,6,9,11) THEN 30 ELSE 31 END);
ALTER TABLE "PlantDefinition" ADD CONSTRAINT "PlantDefinition_repotting_assignment_check" CHECK (
 "alternateRepottingWindowId" IS NULL OR ("primaryRepottingWindowId" IS NOT NULL AND "primaryRepottingWindowId" <> "alternateRepottingWindowId"));
ALTER TABLE "RepottingQueueItem" ADD CONSTRAINT "RepottingQueueItem_year_check" CHECK ("scheduledYear" BETWEEN 2000 AND 2200);
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-3','Early Spring','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',3,1,3,31,0,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-4','Mid Spring','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',4,1,4,30,1,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-5','Late Spring','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',5,1,5,31,2,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-6','Early Summer','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',6,1,6,30,3,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-7','Mid Summer','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',7,1,7,31,4,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-8','Late Summer','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',8,1,8,31,5,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-9','Early Autumn','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',9,1,9,30,6,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-10','Mid Autumn','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',10,1,10,31,7,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-11','Late Autumn','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',11,1,11,30,8,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-12','Early Winter','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',12,1,12,31,9,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-1','Mid Winter','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',1,1,1,31,10,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "RepottingWindow" ("id","name","description","startMonth","startDay","endMonth","endDay","sortOrder","updatedAt") VALUES ('repot-default-2','Late Winter','Editable temperate Northern Hemisphere organizational default; verify local growing conditions.',2,1,2,28,11,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

ALTER TABLE "RepottingQueueItem" ADD CONSTRAINT "RepottingQueueItem_careEventId_fkey" FOREIGN KEY ("careEventId") REFERENCES "PlantCareEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
