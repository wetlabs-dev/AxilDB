CREATE TABLE "DomainEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "collectionId" TEXT,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorRole" TEXT,
  "source" TEXT NOT NULL DEFAULT 'APPLICATION',
  "visibility" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadJson" JSONB NOT NULL,
  "summaryJson" JSONB,
  "metadataJson" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "correlationId" TEXT,
  "causationId" TEXT,
  "reconstructed" BOOLEAN NOT NULL DEFAULT false,
  "redactedAt" TIMESTAMP(3),
  "supersededByEventId" TEXT,
  "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastProcessingError" TEXT,
  "processedAt" TIMESTAMP(3),
  "ignoredAt" TIMESTAMP(3),
  "ignoredByUserId" TEXT,
  "ignoreReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DomainEventProcessingAttempt" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "consumer" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  CONSTRAINT "DomainEventProcessingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainEvent_idempotencyKey_key" ON "DomainEvent"("idempotencyKey");
CREATE INDEX "DomainEvent_collectionId_occurredAt_idx" ON "DomainEvent"("collectionId", "occurredAt");
CREATE INDEX "DomainEvent_aggregateType_aggregateId_occurredAt_idx" ON "DomainEvent"("aggregateType", "aggregateId", "occurredAt");
CREATE INDEX "DomainEvent_eventType_occurredAt_idx" ON "DomainEvent"("eventType", "occurredAt");
CREATE INDEX "DomainEvent_processingStatus_nextAttemptAt_idx" ON "DomainEvent"("processingStatus", "nextAttemptAt");
CREATE INDEX "DomainEvent_actorUserId_occurredAt_idx" ON "DomainEvent"("actorUserId", "occurredAt");
CREATE INDEX "DomainEvent_correlationId_idx" ON "DomainEvent"("correlationId");
CREATE INDEX "DomainEvent_occurredAt_idx" ON "DomainEvent"("occurredAt");
CREATE INDEX "DomainEventProcessingAttempt_eventId_startedAt_idx" ON "DomainEventProcessingAttempt"("eventId", "startedAt");
CREATE INDEX "DomainEventProcessingAttempt_status_startedAt_idx" ON "DomainEventProcessingAttempt"("status", "startedAt");

ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_ignoredByUserId_fkey" FOREIGN KEY ("ignoredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_supersededByEventId_fkey" FOREIGN KEY ("supersededByEventId") REFERENCES "DomainEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DomainEventProcessingAttempt" ADD CONSTRAINT "DomainEventProcessingAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
