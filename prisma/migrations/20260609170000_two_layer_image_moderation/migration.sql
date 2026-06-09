-- Store separate OpenAI Moderation and plant-content analysis payloads for uploaded images.

ALTER TABLE "Photo" ADD COLUMN "moderationResultJson" JSONB;
ALTER TABLE "Photo" ADD COLUMN "plantAnalysisJson" JSONB;
