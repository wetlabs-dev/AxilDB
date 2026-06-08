-- CreateTable
CREATE TABLE "Sunshine" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sunshine_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EmailPreference" ADD COLUMN "sunshineNotifications" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailPreference" ADD COLUMN "sunshineNotificationLastSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Sunshine_collectionId_userId_targetType_targetId_key" ON "Sunshine"("collectionId", "userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Sunshine_collectionId_targetType_targetId_idx" ON "Sunshine"("collectionId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Sunshine_userId_idx" ON "Sunshine"("userId");

-- CreateIndex
CREATE INDEX "Sunshine_createdAt_idx" ON "Sunshine"("createdAt");

-- AddForeignKey
ALTER TABLE "Sunshine" ADD CONSTRAINT "Sunshine_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sunshine" ADD CONSTRAINT "Sunshine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
