-- Upgrade only untouched generated defaults. Explicitly edited limits remain authoritative.
-- The calendar engine caps these bounds by each plant's assessment cadence.
UPDATE "CollectionQuietDayShiftRule"
SET "maxShiftDaysBefore" = 14, "maxShiftDaysAfter" = 14
WHERE "careType" = 'WATER' AND "defaultShiftDirection" = 'SMART'
  AND "maxShiftDaysBefore" = 1 AND "maxShiftDaysAfter" = 1
  AND "createdAt" = "updatedAt";
