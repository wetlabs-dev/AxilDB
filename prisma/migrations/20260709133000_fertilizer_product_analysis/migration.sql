-- AlterTable: add structured guaranteed analysis, label feed-rate, and source/review fields.
ALTER TABLE "FertilizerProduct"
ADD COLUMN "calcium" DECIMAL,
ADD COLUMN "magnesium" DECIMAL,
ADD COLUMN "sulfur" DECIMAL,
ADD COLUMN "iron" DECIMAL,
ADD COLUMN "manganese" DECIMAL,
ADD COLUMN "zinc" DECIMAL,
ADD COLUMN "copper" DECIMAL,
ADD COLUMN "boron" DECIMAL,
ADD COLUMN "molybdenum" DECIMAL,
ADD COLUMN "chlorine" DECIMAL,
ADD COLUMN "nickel" DECIMAL,
ADD COLUMN "silicon" DECIMAL,
ADD COLUMN "guaranteedAnalysisNotes" TEXT,
ADD COLUMN "manufacturerFeedAmount" TEXT,
ADD COLUMN "manufacturerFeedUnit" TEXT,
ADD COLUMN "manufacturerFeedWaterVolume" TEXT,
ADD COLUMN "manufacturerFeedWaterUnit" TEXT,
ADD COLUMN "manufacturerFeedNotes" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceName" TEXT,
ADD COLUMN "dataConfidence" TEXT NOT NULL DEFAULT 'USER_ENTERED',
ADD COLUMN "dataReviewedAt" TIMESTAMP(3),
ADD COLUMN "dataReviewedByUserId" TEXT,
ADD COLUMN "aiModel" TEXT,
ADD COLUMN "aiFilledAt" TIMESTAMP(3);

-- Preserve legacy freeform micronutrient text as guaranteed-analysis fallback notes.
UPDATE "FertilizerProduct"
SET "guaranteedAnalysisNotes" = "micronutrients"
WHERE "micronutrients" IS NOT NULL
  AND btrim("micronutrients") <> ''
  AND "guaranteedAnalysisNotes" IS NULL;

-- Replace the freeform micronutrient model with structured fields plus notes.
ALTER TABLE "FertilizerProduct" DROP COLUMN "micronutrients";

-- CreateIndex
CREATE INDEX "FertilizerProduct_dataConfidence_idx" ON "FertilizerProduct"("dataConfidence");

-- CreateIndex
CREATE INDEX "FertilizerProduct_dataReviewedByUserId_idx" ON "FertilizerProduct"("dataReviewedByUserId");
