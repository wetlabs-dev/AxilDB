CREATE TABLE "PlantDefinitionCareCadence" (
 "id" TEXT PRIMARY KEY, "plantDefinitionId" TEXT NOT NULL REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "activity" TEXT NOT NULL, "interval" INTEGER NOT NULL CHECK ("interval" BETWEEN 1 AND 3650),
 "unit" TEXT NOT NULL CHECK ("unit" IN ('DAY','WEEK','MONTH','YEAR')),
 CONSTRAINT "definition_cadence_activity" CHECK ("activity" IN ('WATERING','FERTILIZING','REPOTTING','PEST_INSPECTION','GENERAL_INSPECTION','PRUNING'))
);
CREATE UNIQUE INDEX "PlantDefinitionCareCadence_plantDefinitionId_activity_key" ON "PlantDefinitionCareCadence"("plantDefinitionId", "activity");
CREATE TABLE "PlantInstanceCareCadenceOverride" (
 "id" TEXT PRIMARY KEY, "plantInstanceId" TEXT NOT NULL REFERENCES "PlantInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "activity" TEXT NOT NULL CHECK ("activity" IN ('WATERING','FERTILIZING','REPOTTING','PEST_INSPECTION','GENERAL_INSPECTION','PRUNING')),
 "mode" TEXT NOT NULL, "interval" INTEGER, "unit" TEXT,
 CHECK (("mode" = 'DISABLED' AND "interval" IS NULL AND "unit" IS NULL) OR
 ("mode" = 'OVERRIDE' AND "interval" IS NOT NULL AND "interval" BETWEEN 1 AND 3650 AND "unit" IS NOT NULL AND "unit" IN ('DAY','WEEK','MONTH','YEAR')))
);
CREATE UNIQUE INDEX "PlantInstanceCareCadenceOverride_plantInstanceId_activity_key" ON "PlantInstanceCareCadenceOverride"("plantInstanceId", "activity");
-- Preserve explicit numeric legacy settings only; never infer intervals from prose.
INSERT INTO "PlantDefinitionCareCadence" ("id","plantDefinitionId","activity","interval","unit")
SELECT 'legacy-guide-' || g."id", g."plantDefinitionId", 'FERTILIZING', COALESCE(g."fertilizationCadenceDays", r."frequencyDays"), 'DAY'
FROM "PlantHusbandryGuide" g JOIN "FertilizerRecipe" r ON r."id" = g."fertilizerRecipeId" AND r."active" = true AND r."collectionId" = g."collectionId"
WHERE COALESCE(g."fertilizationCadenceDays", r."frequencyDays") BETWEEN 1 AND 3650 AND NOT g."fertilizationPaused";
INSERT INTO "PlantInstanceCareCadenceOverride" ("id","plantInstanceId","activity","mode","interval","unit")
SELECT 'legacy-override-' || o."id", o."plantInstanceId", 'FERTILIZING',
CASE WHEN o."fertilizationPaused" THEN 'DISABLED' ELSE 'OVERRIDE' END,
CASE WHEN o."fertilizationPaused" THEN NULL ELSE o."fertilizationCadenceDays" END,
CASE WHEN o."fertilizationPaused" THEN NULL ELSE 'DAY' END
FROM "PlantHusbandryOverride" o JOIN "PlantInstance" i ON i."id" = o."plantInstanceId"
LEFT JOIN "PlantHusbandryGuide" g ON g."plantDefinitionId" = i."plantDefinitionId"
LEFT JOIN "FertilizerRecipe" r ON r."id" = g."fertilizerRecipeId" AND r."active" = true AND r."collectionId" = i."collectionId"
WHERE o."fertilizationPaused" OR (o."fertilizationCadenceDays" BETWEEN 1 AND 3650 AND r."id" IS NOT NULL AND NOT g."fertilizationPaused");
INSERT INTO "PlantInstanceCareCadenceOverride" ("id","plantInstanceId","activity","mode","interval","unit")
SELECT 'legacy-adjustment-' || a."id", a."plantInstanceId",
CASE a."taskType" WHEN 'WATER' THEN 'WATERING' WHEN 'FERTILIZE' THEN 'FERTILIZING' WHEN 'REPOT' THEN 'REPOTTING' WHEN 'PEST_CHECK' THEN 'PEST_INSPECTION' WHEN 'HEALTH_CHECK' THEN 'GENERAL_INSPECTION' END,
CASE WHEN a."disabled" THEN 'DISABLED' ELSE 'OVERRIDE' END,
CASE WHEN a."disabled" THEN NULL ELSE a."cadenceOverrideDays" END,
CASE WHEN a."disabled" THEN NULL ELSE 'DAY' END
FROM "PlantCareAdjustment" a JOIN "PlantInstance" i ON i."id" = a."plantInstanceId"
LEFT JOIN "PlantHusbandryGuide" g ON g."plantDefinitionId" = i."plantDefinitionId"
LEFT JOIN "FertilizerRecipe" r ON r."id" = g."fertilizerRecipeId" AND r."active" = true AND r."collectionId" = i."collectionId"
WHERE a."taskType" IN ('WATER','FERTILIZE','REPOT','PEST_CHECK','HEALTH_CHECK')
AND (a."disabled" OR (a."cadenceOverrideDays" BETWEEN 1 AND 3650 AND (a."taskType" <> 'FERTILIZE' OR (r."id" IS NOT NULL AND NOT g."fertilizationPaused"))))
ON CONFLICT ("plantInstanceId","activity") DO UPDATE SET "mode" = EXCLUDED."mode", "interval" = EXCLUDED."interval", "unit" = EXCLUDED."unit"
WHERE "PlantInstanceCareCadenceOverride"."mode" <> 'DISABLED' OR EXCLUDED."mode" = 'DISABLED';

-- All writers (including older husbandry forms and AI actions) share this lock.
-- Validate at statement completion with a fresh snapshot after acquiring it.
CREATE FUNCTION lock_care_cadence_dependencies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(186104, 1);
 RETURN NULL;
END $$;
CREATE FUNCTION validate_care_cadence_dependencies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
 SELECT 1 FROM "PlantDefinitionCareCadence" c JOIN "PlantDefinition" d ON d."id" = c."plantDefinitionId" JOIN "Collection" owner ON owner."id" = d."collectionId"
 WHERE c."activity" = 'FERTILIZING' AND NOT EXISTS (
 SELECT 1 FROM "PlantHusbandryGuide" g JOIN "FertilizerRecipe" r ON r."id" = g."fertilizerRecipeId"
 WHERE g."plantDefinitionId" = d."id" AND r."active" AND r."collectionId" = d."collectionId"))
 OR EXISTS (
 SELECT 1 FROM "PlantInstanceCareCadenceOverride" c JOIN "PlantInstance" i ON i."id" = c."plantInstanceId" JOIN "PlantDefinition" d ON d."id" = i."plantDefinitionId" JOIN "Collection" owner ON owner."id" = i."collectionId"
 WHERE c."activity" = 'FERTILIZING' AND c."mode" = 'OVERRIDE' AND NOT EXISTS (
 SELECT 1 FROM "PlantHusbandryGuide" g JOIN "FertilizerRecipe" r ON r."id" = g."fertilizerRecipeId"
 WHERE g."plantDefinitionId" = i."plantDefinitionId" AND r."active" AND r."collectionId" = i."collectionId")) THEN
 RAISE EXCEPTION 'Assign an active fertilizer recipe to the plant definition before scheduling fertilizing. Disable dependent fertilizing cadences before removing the final recipe.';
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['PlantDefinitionCareCadence','PlantInstanceCareCadenceOverride','PlantHusbandryGuide','FertilizerRecipe','PlantInstance'] LOOP
 EXECUTE format('CREATE TRIGGER cadence_dependency_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION lock_care_cadence_dependencies()', t);
 EXECUTE format('CREATE TRIGGER cadence_dependency_check AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION validate_care_cadence_dependencies()', t);
 END LOOP;
END $$;

-- Keep existing schedule sync and structured husbandry writers interoperable.
CREATE FUNCTION sync_legacy_care_cadence() RETURNS trigger LANGUAGE plpgsql AS $$
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
  ON CONFLICT ("plantInstanceId","activity") DO UPDATE SET "mode" = EXCLUDED."mode", "interval" = EXCLUDED."interval", "unit" = EXCLUDED."unit";
 ELSIF TG_TABLE_NAME = 'PlantHusbandryGuide' THEN
  IF TG_OP = 'UPDATE' AND NEW."fertilizationCadenceDays" IS NOT DISTINCT FROM OLD."fertilizationCadenceDays" AND NEW."fertilizationPaused" = OLD."fertilizationPaused" THEN RETURN NEW; END IF;
  IF NEW."fertilizationCadenceDays" IS NULL AND NOT NEW."fertilizationPaused" THEN RETURN NEW; END IF;
  DELETE FROM "PlantDefinitionCareCadence" WHERE "plantDefinitionId" = NEW."plantDefinitionId" AND "activity" = 'FERTILIZING';
  IF NOT NEW."fertilizationPaused" THEN
   INSERT INTO "PlantDefinitionCareCadence" VALUES ('guide-' || NEW."id", NEW."plantDefinitionId", 'FERTILIZING', NEW."fertilizationCadenceDays", 'DAY');
  END IF;
 ELSE
  IF TG_OP = 'UPDATE' AND NEW."fertilizationCadenceDays" IS NOT DISTINCT FROM OLD."fertilizationCadenceDays" AND NEW."fertilizationPaused" = OLD."fertilizationPaused" THEN RETURN NEW; END IF;
  IF NEW."fertilizationCadenceDays" IS NULL AND NOT NEW."fertilizationPaused" THEN RETURN NEW; END IF;
  INSERT INTO "PlantInstanceCareCadenceOverride" ("id","plantInstanceId","activity","mode","interval","unit")
  VALUES ('husbandry-' || NEW."id", NEW."plantInstanceId", 'FERTILIZING', CASE WHEN NEW."fertilizationPaused" THEN 'DISABLED' ELSE 'OVERRIDE' END, CASE WHEN NEW."fertilizationPaused" THEN NULL ELSE NEW."fertilizationCadenceDays" END, CASE WHEN NEW."fertilizationPaused" THEN NULL ELSE 'DAY' END)
  ON CONFLICT ("plantInstanceId","activity") DO UPDATE SET "mode" = EXCLUDED."mode", "interval" = EXCLUDED."interval", "unit" = EXCLUDED."unit";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_cadence_sync AFTER INSERT OR UPDATE ON "PlantCareAdjustment" FOR EACH ROW EXECUTE FUNCTION sync_legacy_care_cadence();
CREATE TRIGGER legacy_cadence_sync AFTER INSERT OR UPDATE ON "PlantHusbandryGuide" FOR EACH ROW EXECUTE FUNCTION sync_legacy_care_cadence();
CREATE TRIGGER legacy_cadence_sync AFTER INSERT OR UPDATE ON "PlantHusbandryOverride" FOR EACH ROW EXECUTE FUNCTION sync_legacy_care_cadence();

-- Completion from any existing entry point (queue, bulk, sitter, workflow) resets manual due dates.
CREATE FUNCTION reset_cadence_due_after_care() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task_name TEXT;
BEGIN
 task_name := CASE NEW."eventType" WHEN 'WATERED' THEN 'WATER' WHEN 'FERTILIZED' THEN 'FERTILIZE' WHEN 'REPOTTED' THEN 'REPOT' WHEN 'PRUNED' THEN 'PRUNE' WHEN 'PEST_CHECK' THEN 'PEST_CHECK' WHEN 'HEALTH_CHECK' THEN 'HEALTH_CHECK' END;
 IF task_name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "PlantCareEvent" WHERE "plantInstanceId" = NEW."plantInstanceId" AND "eventType" = NEW."eventType" AND "performedAt" > NEW."performedAt") THEN
  UPDATE "PlantCareAdjustment" SET "nextDueAt" = NULL, "snoozedUntil" = NULL WHERE "plantInstanceId" = NEW."plantInstanceId" AND "taskType" = task_name;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cadence_care_completion AFTER INSERT ON "PlantCareEvent" FOR EACH ROW EXECUTE FUNCTION reset_cadence_due_after_care();
