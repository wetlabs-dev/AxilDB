-- Existing defaults remain scheduled; missing defaults and disabled overrides remain unresolved.
ALTER TABLE "PlantDefinitionCareCadence" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SCHEDULED';
ALTER TABLE "PlantDefinitionCareCadence" ALTER COLUMN "interval" DROP NOT NULL, ALTER COLUMN "unit" DROP NOT NULL;
ALTER TABLE "PlantDefinitionCareCadence" ADD CONSTRAINT "definition_cadence_state" CHECK (
 (status='SCHEDULED' AND interval IS NOT NULL AND unit IS NOT NULL) OR
 (status='NOT_APPLICABLE' AND activity IN ('FERTILIZING','REPOTTING','PRUNING') AND interval IS NULL AND unit IS NULL));
ALTER TABLE "PlantInstanceCareCadenceOverride" DROP CONSTRAINT "PlantInstanceCareCadenceOverride_check";
ALTER TABLE "PlantInstanceCareCadenceOverride" ADD CONSTRAINT "instance_cadence_state" CHECK (
 (mode='DISABLED' AND interval IS NULL AND unit IS NULL) OR
 (mode='NOT_APPLICABLE' AND activity IN ('FERTILIZING','REPOTTING','PRUNING') AND interval IS NULL AND unit IS NULL) OR
 (mode='OVERRIDE' AND interval IS NOT NULL AND interval BETWEEN 1 AND 3650 AND unit IS NOT NULL AND unit IN ('DAY','WEEK','MONTH','YEAR')));
ALTER TABLE "CareCadenceProposal" DROP CONSTRAINT "CadenceProposal_approved";
ALTER TABLE "CareCadenceProposal" ADD CONSTRAINT "CadenceProposal_approved" CHECK (status <> 'APPROVED' OR
 (applicability='NOT_APPLICABLE' AND activity IN ('FERTILIZING','REPOTTING','PRUNING') AND "approvedInterval" IS NULL AND "approvedUnit" IS NULL) OR
 (applicability='RECOMMENDED' AND "approvedInterval" IS NOT NULL AND "approvedInterval" BETWEEN 1 AND 3650 AND "approvedUnit" IS NOT NULL AND "approvedUnit" IN ('DAY','WEEK','MONTH','YEAR')));
-- Previously unapprovable AI findings are preserved; new N/A writes must use eligible activities.
CREATE FUNCTION validate_na_proposal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.applicability='NOT_APPLICABLE' AND NEW.activity NOT IN ('FERTILIZING','REPOTTING','PRUNING') THEN
 RAISE EXCEPTION 'Not applicable is not allowed for this activity'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER validate_na_proposal BEFORE INSERT OR UPDATE OF applicability, activity ON "CareCadenceProposal" FOR EACH ROW EXECUTE FUNCTION validate_na_proposal();
CREATE OR REPLACE FUNCTION validate_care_cadence_dependencies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
 SELECT 1 FROM "PlantDefinitionCareCadence" c JOIN "PlantDefinition" d ON d."id" = c."plantDefinitionId" JOIN "Collection" owner ON owner."id" = d."collectionId"
 WHERE c."activity" = 'FERTILIZING' AND c."status" = 'SCHEDULED' AND NOT EXISTS (
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
  ON CONFLICT ("plantInstanceId","activity") DO UPDATE SET "mode" = EXCLUDED."mode", "interval" = EXCLUDED."interval", "unit" = EXCLUDED."unit";
 ELSIF TG_TABLE_NAME = 'PlantHusbandryGuide' THEN
  IF TG_OP = 'UPDATE' AND NEW."fertilizationCadenceDays" IS NOT DISTINCT FROM OLD."fertilizationCadenceDays" AND NEW."fertilizationPaused" = OLD."fertilizationPaused" THEN RETURN NEW; END IF;
  IF NEW."fertilizationCadenceDays" IS NULL AND NOT NEW."fertilizationPaused" THEN RETURN NEW; END IF;
  DELETE FROM "PlantDefinitionCareCadence" WHERE "plantDefinitionId" = NEW."plantDefinitionId" AND "activity" = 'FERTILIZING';
  IF NOT NEW."fertilizationPaused" THEN
   INSERT INTO "PlantDefinitionCareCadence" ("id","plantDefinitionId","activity","interval","unit") VALUES ('guide-' || NEW."id", NEW."plantDefinitionId", 'FERTILIZING', NEW."fertilizationCadenceDays", 'DAY');
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
