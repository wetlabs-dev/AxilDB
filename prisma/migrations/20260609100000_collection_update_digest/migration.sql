-- Add collection update digest preferences and delivery tracking.
ALTER TABLE "EmailPreference" ADD COLUMN "collectionUpdateDigestEmailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EmailPreference" ADD COLUMN "collectionUpdateDigestPushEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ValidatedDefinitionChange" (
    "id" TEXT NOT NULL,
    "validatedDefinitionId" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeSummary" TEXT NOT NULL,
    "changedFieldsJson" JSONB NOT NULL,
    "previousValuesJson" JSONB,
    "nextValuesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidatedDefinitionChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionUpdateDigestDelivery" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionUpdateDigestDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ValidatedDefinitionChange_validatedDefinitionId_idx" ON "ValidatedDefinitionChange"("validatedDefinitionId");
CREATE INDEX "ValidatedDefinitionChange_changedByUserId_idx" ON "ValidatedDefinitionChange"("changedByUserId");
CREATE INDEX "ValidatedDefinitionChange_changedAt_idx" ON "ValidatedDefinitionChange"("changedAt");

CREATE UNIQUE INDEX "CollectionUpdateDigestDelivery_collectionId_userId_channel_localDate_key" ON "CollectionUpdateDigestDelivery"("collectionId", "userId", "channel", "localDate");
CREATE INDEX "CollectionUpdateDigestDelivery_collectionId_idx" ON "CollectionUpdateDigestDelivery"("collectionId");
CREATE INDEX "CollectionUpdateDigestDelivery_userId_idx" ON "CollectionUpdateDigestDelivery"("userId");
CREATE INDEX "CollectionUpdateDigestDelivery_localDate_idx" ON "CollectionUpdateDigestDelivery"("localDate");
CREATE INDEX "CollectionUpdateDigestDelivery_status_idx" ON "CollectionUpdateDigestDelivery"("status");

ALTER TABLE "ValidatedDefinitionChange" ADD CONSTRAINT "ValidatedDefinitionChange_validatedDefinitionId_fkey" FOREIGN KEY ("validatedDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidatedDefinitionChange" ADD CONSTRAINT "ValidatedDefinitionChange_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionUpdateDigestDelivery" ADD CONSTRAINT "CollectionUpdateDigestDelivery_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionUpdateDigestDelivery" ADD CONSTRAINT "CollectionUpdateDigestDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
