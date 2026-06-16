-- CreateEnum
CREATE TYPE "CollectionExhibitAccessMode" AS ENUM ('PUBLIC', 'UNLISTED');

-- CreateEnum
CREATE TYPE "CollectionExhibitStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CollectionExhibitSubscriberStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CollectionExhibitUpdateDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "CollectionExhibit" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "token" TEXT,
    "accessMode" "CollectionExhibitAccessMode" NOT NULL DEFAULT 'UNLISTED',
    "status" "CollectionExhibitStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "introMarkdown" TEXT,
    "coverPhotoId" TEXT,
    "createdByUserId" TEXT,
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "settingsJson" JSONB,
    "updateSettingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionExhibit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionExhibitPlant" (
    "id" TEXT NOT NULL,
    "exhibitId" TEXT NOT NULL,
    "plantInstanceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "customCaption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionExhibitPlant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionExhibitSubscriber" (
    "id" TEXT NOT NULL,
    "exhibitId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "CollectionExhibitSubscriberStatus" NOT NULL DEFAULT 'PENDING',
    "confirmTokenHash" TEXT,
    "unsubscribeTokenHash" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionExhibitSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionExhibitUpdate" (
    "id" TEXT NOT NULL,
    "exhibitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "changeSummaryJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "CollectionExhibitUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionExhibitDelivery" (
    "id" TEXT NOT NULL,
    "exhibitUpdateId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "status" "CollectionExhibitUpdateDeliveryStatus" NOT NULL DEFAULT 'SKIPPED',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionExhibitDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionExhibit_slug_key" ON "CollectionExhibit"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionExhibit_token_key" ON "CollectionExhibit"("token");

-- CreateIndex
CREATE INDEX "CollectionExhibit_collectionId_idx" ON "CollectionExhibit"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionExhibit_status_idx" ON "CollectionExhibit"("status");

-- CreateIndex
CREATE INDEX "CollectionExhibit_accessMode_idx" ON "CollectionExhibit"("accessMode");

-- CreateIndex
CREATE INDEX "CollectionExhibit_expiresAt_idx" ON "CollectionExhibit"("expiresAt");

-- CreateIndex
CREATE INDEX "CollectionExhibit_createdByUserId_idx" ON "CollectionExhibit"("createdByUserId");

-- CreateIndex
CREATE INDEX "CollectionExhibit_publishedByUserId_idx" ON "CollectionExhibit"("publishedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionExhibitPlant_exhibitId_plantInstanceId_key" ON "CollectionExhibitPlant"("exhibitId", "plantInstanceId");

-- CreateIndex
CREATE INDEX "CollectionExhibitPlant_exhibitId_idx" ON "CollectionExhibitPlant"("exhibitId");

-- CreateIndex
CREATE INDEX "CollectionExhibitPlant_plantInstanceId_idx" ON "CollectionExhibitPlant"("plantInstanceId");

-- CreateIndex
CREATE INDEX "CollectionExhibitPlant_sortOrder_idx" ON "CollectionExhibitPlant"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionExhibitSubscriber_confirmTokenHash_key" ON "CollectionExhibitSubscriber"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionExhibitSubscriber_unsubscribeTokenHash_key" ON "CollectionExhibitSubscriber"("unsubscribeTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionExhibitSubscriber_exhibitId_email_key" ON "CollectionExhibitSubscriber"("exhibitId", "email");

-- CreateIndex
CREATE INDEX "CollectionExhibitSubscriber_exhibitId_idx" ON "CollectionExhibitSubscriber"("exhibitId");

-- CreateIndex
CREATE INDEX "CollectionExhibitSubscriber_email_idx" ON "CollectionExhibitSubscriber"("email");

-- CreateIndex
CREATE INDEX "CollectionExhibitSubscriber_status_idx" ON "CollectionExhibitSubscriber"("status");

-- CreateIndex
CREATE INDEX "CollectionExhibitUpdate_exhibitId_idx" ON "CollectionExhibitUpdate"("exhibitId");

-- CreateIndex
CREATE INDEX "CollectionExhibitUpdate_createdAt_idx" ON "CollectionExhibitUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "CollectionExhibitUpdate_sentAt_idx" ON "CollectionExhibitUpdate"("sentAt");

-- CreateIndex
CREATE INDEX "CollectionExhibitUpdate_createdByUserId_idx" ON "CollectionExhibitUpdate"("createdByUserId");

-- CreateIndex
CREATE INDEX "CollectionExhibitDelivery_exhibitUpdateId_idx" ON "CollectionExhibitDelivery"("exhibitUpdateId");

-- CreateIndex
CREATE INDEX "CollectionExhibitDelivery_subscriberId_idx" ON "CollectionExhibitDelivery"("subscriberId");

-- CreateIndex
CREATE INDEX "CollectionExhibitDelivery_status_idx" ON "CollectionExhibitDelivery"("status");

-- AddForeignKey
ALTER TABLE "CollectionExhibit" ADD CONSTRAINT "CollectionExhibit_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibit" ADD CONSTRAINT "CollectionExhibit_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibit" ADD CONSTRAINT "CollectionExhibit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibit" ADD CONSTRAINT "CollectionExhibit_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibitPlant" ADD CONSTRAINT "CollectionExhibitPlant_exhibitId_fkey" FOREIGN KEY ("exhibitId") REFERENCES "CollectionExhibit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibitPlant" ADD CONSTRAINT "CollectionExhibitPlant_plantInstanceId_fkey" FOREIGN KEY ("plantInstanceId") REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibitSubscriber" ADD CONSTRAINT "CollectionExhibitSubscriber_exhibitId_fkey" FOREIGN KEY ("exhibitId") REFERENCES "CollectionExhibit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibitUpdate" ADD CONSTRAINT "CollectionExhibitUpdate_exhibitId_fkey" FOREIGN KEY ("exhibitId") REFERENCES "CollectionExhibit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibitUpdate" ADD CONSTRAINT "CollectionExhibitUpdate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibitDelivery" ADD CONSTRAINT "CollectionExhibitDelivery_exhibitUpdateId_fkey" FOREIGN KEY ("exhibitUpdateId") REFERENCES "CollectionExhibitUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionExhibitDelivery" ADD CONSTRAINT "CollectionExhibitDelivery_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "CollectionExhibitSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
