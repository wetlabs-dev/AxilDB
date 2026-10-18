-- Prevent an ambiguous network retry from creating duplicate care history.
CREATE TABLE "CareQueueOperation" (
 "collectionId" TEXT NOT NULL REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "operationId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "payloadHash" TEXT NOT NULL,
 "result" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("collectionId", "userId", "operationId")
);
CREATE INDEX "CareQueueOperation_expiresAt_idx" ON "CareQueueOperation"("expiresAt");
