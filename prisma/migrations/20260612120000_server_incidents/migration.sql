-- Lightweight server incident history for metric and manual operational events.

CREATE TABLE "ServerIncident" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "metricType" TEXT,
    "thresholdValue" DOUBLE PRECISION,
    "observedValue" DOUBLE PRECISION,
    "peakValue" DOUBLE PRECISION,
    "createdByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServerIncidentNote" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerIncidentNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServerIncidentNotification" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ServerIncidentNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerIncident_type_idx" ON "ServerIncident"("type");
CREATE INDEX "ServerIncident_category_idx" ON "ServerIncident"("category");
CREATE INDEX "ServerIncident_severity_idx" ON "ServerIncident"("severity");
CREATE INDEX "ServerIncident_status_idx" ON "ServerIncident"("status");
CREATE INDEX "ServerIncident_metricType_idx" ON "ServerIncident"("metricType");
CREATE INDEX "ServerIncident_detectedAt_idx" ON "ServerIncident"("detectedAt");
CREATE INDEX "ServerIncident_resolvedAt_idx" ON "ServerIncident"("resolvedAt");
CREATE INDEX "ServerIncident_createdByUserId_idx" ON "ServerIncident"("createdByUserId");
CREATE INDEX "ServerIncidentNote_incidentId_idx" ON "ServerIncidentNote"("incidentId");
CREATE INDEX "ServerIncidentNote_authorUserId_idx" ON "ServerIncidentNote"("authorUserId");
CREATE INDEX "ServerIncidentNote_createdAt_idx" ON "ServerIncidentNote"("createdAt");
CREATE INDEX "ServerIncidentNotification_incidentId_idx" ON "ServerIncidentNotification"("incidentId");
CREATE INDEX "ServerIncidentNotification_userId_idx" ON "ServerIncidentNotification"("userId");
CREATE INDEX "ServerIncidentNotification_sentAt_idx" ON "ServerIncidentNotification"("sentAt");
CREATE INDEX "ServerIncidentNotification_status_idx" ON "ServerIncidentNotification"("status");

ALTER TABLE "ServerIncident" ADD CONSTRAINT "ServerIncident_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServerIncidentNote" ADD CONSTRAINT "ServerIncidentNote_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ServerIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerIncidentNote" ADD CONSTRAINT "ServerIncidentNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServerIncidentNotification" ADD CONSTRAINT "ServerIncidentNotification_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ServerIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerIncidentNotification" ADD CONSTRAINT "ServerIncidentNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
