ALTER TABLE "CareScheduleSyncBatch" ADD COLUMN "syncCadence" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CareScheduleSyncBatch" ADD COLUMN "cadenceDays" INTEGER;
