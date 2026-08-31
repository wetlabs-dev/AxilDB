ALTER TABLE "AiUsageEvent" ADD COLUMN "cachedInputTokens" INTEGER;
ALTER TABLE "AiUsageEvent" ADD COLUMN "webSearchCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageEvent" ADD COLUMN "webSearchPreviewCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageEvent" ADD COLUMN "estimatedCostDollars" DECIMAL(65,30) NOT NULL DEFAULT 0.00;

CREATE INDEX "AiUsageEvent_estimatedCostDollars_idx" ON "AiUsageEvent"("estimatedCostDollars");
