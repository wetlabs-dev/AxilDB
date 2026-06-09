-- Add asynchronous image moderation fields and review workflow.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "disabledReason" TEXT;

ALTER TABLE "Photo" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Photo" ADD COLUMN "uploadedByUserId" TEXT;
ALTER TABLE "Photo" ADD COLUMN "nsfwFlagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Photo" ADD COLUMN "plantDetected" BOOLEAN;
ALTER TABLE "Photo" ADD COLUMN "plantConfidence" DOUBLE PRECISION;
ALTER TABLE "Photo" ADD COLUMN "moderationCheckedAt" TIMESTAMP(3);
ALTER TABLE "Photo" ADD COLUMN "moderationReason" TEXT;
ALTER TABLE "Photo" ADD COLUMN "moderationModel" TEXT;
ALTER TABLE "Photo" ADD COLUMN "moderationFailureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Photo" ADD COLUMN "moderationLastError" TEXT;

CREATE TABLE "ImageModerationReview" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "collectionId" TEXT,
    "uploaderUserId" TEXT,
    "reviewType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "ImageModerationReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_disabledAt_idx" ON "User"("disabledAt");
CREATE INDEX "Photo_uploadedByUserId_idx" ON "Photo"("uploadedByUserId");
CREATE INDEX "Photo_moderationStatus_idx" ON "Photo"("moderationStatus");
CREATE INDEX "Photo_nsfwFlagged_idx" ON "Photo"("nsfwFlagged");
CREATE UNIQUE INDEX "ImageModerationReview_photoId_reviewType_status_key" ON "ImageModerationReview"("photoId", "reviewType", "status");
CREATE INDEX "ImageModerationReview_photoId_idx" ON "ImageModerationReview"("photoId");
CREATE INDEX "ImageModerationReview_collectionId_idx" ON "ImageModerationReview"("collectionId");
CREATE INDEX "ImageModerationReview_uploaderUserId_idx" ON "ImageModerationReview"("uploaderUserId");
CREATE INDEX "ImageModerationReview_resolvedByUserId_idx" ON "ImageModerationReview"("resolvedByUserId");
CREATE INDEX "ImageModerationReview_reviewType_idx" ON "ImageModerationReview"("reviewType");
CREATE INDEX "ImageModerationReview_status_idx" ON "ImageModerationReview"("status");

ALTER TABLE "ImageModerationReview" ADD CONSTRAINT "ImageModerationReview_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImageModerationReview" ADD CONSTRAINT "ImageModerationReview_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageModerationReview" ADD CONSTRAINT "ImageModerationReview_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImageModerationReview" ADD CONSTRAINT "ImageModerationReview_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
