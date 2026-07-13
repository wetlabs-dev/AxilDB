-- Support bounded care queue lookups for latest care events and specimen card photos.
CREATE INDEX "PlantCareEvent_collectionId_plantInstanceId_eventType_performedAt_idx"
  ON "PlantCareEvent"("collectionId", "plantInstanceId", "eventType", "performedAt");

CREATE INDEX "Photo_collectionId_entityType_entityId_isCover_createdAt_idx"
  ON "Photo"("collectionId", "entityType", "entityId", "isCover", "createdAt");
