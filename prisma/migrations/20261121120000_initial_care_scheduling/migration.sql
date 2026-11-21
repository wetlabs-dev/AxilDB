-- Preserve unknown historical activation dates; only future rows receive a timestamp.
ALTER TABLE "PlantDefinitionCareCadence" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "PlantInstanceCareCadenceOverride" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "PlantDefinitionCareCadence" ALTER COLUMN "activatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PlantInstanceCareCadenceOverride" ALTER COLUMN "activatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PlantCareAdjustment" ADD COLUMN "initialAnchorAt" TIMESTAMP(3);

-- Preserve activation across interval edits in legacy writers too.
CREATE OR REPLACE FUNCTION sync_legacy_care_cadence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE activity_name TEXT;
BEGIN
 IF TG_TABLE_NAME = 'PlantCareAdjustment' THEN
  IF TG_OP = 'UPDATE' AND NEW."cadenceOverrideDays" IS NOT DISTINCT FROM OLD."cadenceOverrideDays" AND NEW."disabled" = OLD."disabled" THEN RETURN NEW; END IF;
  -- Clearing legacy settings in the new editor must not replace its chosen state.
  IF NEW."cadenceOverrideDays" IS NULL AND NOT NEW."disabled" THEN RETURN NEW; END IF;
  activity_name := CASE NEW."taskType" WHEN 'WATER' THEN 'WATERING' WHEN 'FERTILIZE' THEN 'FERTILIZING' WHEN 'REPOT' THEN 'REPOTTING' WHEN 'PRUNE' THEN 'PRUNING' WHEN 'PEST_CHECK' THEN 'PEST_INSPECTION' WHEN 'HEALTH_CHECK' THEN 'GENERAL_INSPECTION' END;
  IF activity_name IS NULL THEN RETURN NEW; END IF;
  INSERT INTO "PlantInstanceCareCadenceOverride" ("id","plantInstanceId","activity","mode","interval","unit")
  VALUES ('sync-' || NEW."id", NEW."plantInstanceId", activity_name, CASE WHEN NEW."disabled" THEN 'DISABLED' ELSE 'OVERRIDE' END, CASE WHEN NEW."disabled" THEN NULL ELSE NEW."cadenceOverrideDays" END, CASE WHEN NEW."disabled" THEN NULL ELSE 'DAY' END)
  ON CONFLICT ("plantInstanceId","activity") DO UPDATE SET "activatedAt" = CASE WHEN "PlantInstanceCareCadenceOverride"."mode" = 'OVERRIDE' AND EXCLUDED."mode" = 'OVERRIDE' THEN "PlantInstanceCareCadenceOverride"."activatedAt" ELSE CURRENT_TIMESTAMP END, "mode" = EXCLUDED."mode", "interval" = EXCLUDED."interval", "unit" = EXCLUDED."unit";
 ELSIF TG_TABLE_NAME = 'PlantHusbandryGuide' THEN
  IF TG_OP = 'UPDATE' AND NEW."fertilizationCadenceDays" IS NOT DISTINCT FROM OLD."fertilizationCadenceDays" AND NEW."fertilizationPaused" = OLD."fertilizationPaused" THEN RETURN NEW; END IF;
  IF NEW."fertilizationCadenceDays" IS NULL AND NOT NEW."fertilizationPaused" THEN RETURN NEW; END IF;
  IF NEW."fertilizationPaused" THEN
   DELETE FROM "PlantDefinitionCareCadence" WHERE "plantDefinitionId" = NEW."plantDefinitionId" AND "activity" = 'FERTILIZING';
  ELSE
   INSERT INTO "PlantDefinitionCareCadence" ("id","plantDefinitionId","activity","interval","unit") VALUES ('guide-' || NEW."id", NEW."plantDefinitionId", 'FERTILIZING', NEW."fertilizationCadenceDays", 'DAY')
   ON CONFLICT ("plantDefinitionId","activity") DO UPDATE SET "status" = 'SCHEDULED', "interval" = EXCLUDED."interval", "unit" = EXCLUDED."unit", "activatedAt" = CASE WHEN "PlantDefinitionCareCadence"."status" = 'SCHEDULED' THEN "PlantDefinitionCareCadence"."activatedAt" ELSE CURRENT_TIMESTAMP END;
  END IF;
 ELSE
  IF TG_OP = 'UPDATE' AND NEW."fertilizationCadenceDays" IS NOT DISTINCT FROM OLD."fertilizationCadenceDays" AND NEW."fertilizationPaused" = OLD."fertilizationPaused" THEN RETURN NEW; END IF;
  IF NEW."fertilizationCadenceDays" IS NULL AND NOT NEW."fertilizationPaused" THEN RETURN NEW; END IF;
  INSERT INTO "PlantInstanceCareCadenceOverride" ("id","plantInstanceId","activity","mode","interval","unit")
  VALUES ('husbandry-' || NEW."id", NEW."plantInstanceId", 'FERTILIZING', CASE WHEN NEW."fertilizationPaused" THEN 'DISABLED' ELSE 'OVERRIDE' END, CASE WHEN NEW."fertilizationPaused" THEN NULL ELSE NEW."fertilizationCadenceDays" END, CASE WHEN NEW."fertilizationPaused" THEN NULL ELSE 'DAY' END)
  ON CONFLICT ("plantInstanceId","activity") DO UPDATE SET "activatedAt" = CASE WHEN "PlantInstanceCareCadenceOverride"."mode" = 'OVERRIDE' AND EXCLUDED."mode" = 'OVERRIDE' THEN "PlantInstanceCareCadenceOverride"."activatedAt" ELSE CURRENT_TIMESTAMP END, "mode" = EXCLUDED."mode", "interval" = EXCLUDED."interval", "unit" = EXCLUDED."unit";
 END IF;
 RETURN NEW;
END $$;
