ALTER TABLE "PlantInstance" ADD COLUMN "acquisitionLabel" TEXT;
ALTER TABLE "PlantDefinition" ADD COLUMN "identificationStatus" TEXT NOT NULL DEFAULT 'IDENTIFIED';

UPDATE "PlantInstance" AS instance
SET "acquisitionLabel" = definition."acquisitionLabel"
FROM "PlantDefinition" AS definition
WHERE instance."plantDefinitionId" = definition."id"
  AND definition."acquisitionLabel" IS NOT NULL
  AND BTRIM(definition."acquisitionLabel") <> '';

UPDATE "PlantDefinition" AS definition
SET "acquisitionInterestNotes" = CONCAT_WS(
  E'\n',
  NULLIF(BTRIM(definition."acquisitionInterestNotes"), ''),
  'Legacy definition acquisition label: ' || definition."acquisitionLabel"
)
WHERE definition."acquisitionLabel" IS NOT NULL
  AND BTRIM(definition."acquisitionLabel") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "PlantInstance" AS instance
    WHERE instance."plantDefinitionId" = definition."id"
  );

UPDATE "PlantDefinition"
SET "identificationStatus" = 'PROVISIONAL'
WHERE "provisionalTaxon" IS NOT NULL
  AND BTRIM("provisionalTaxon") <> ''
  AND "isValidated" = false;

UPDATE "PlantDefinition"
SET "validationNotes" = CONCAT_WS(
      E'\n',
      NULLIF(BTRIM("validationNotes"), ''),
      'Legacy provisional taxon removed during identity migration: ' || "provisionalTaxon"
    ),
    "provisionalTaxon" = NULL,
    "identificationStatus" = 'IDENTIFIED'
WHERE "isValidated" = true
  AND "provisionalTaxon" IS NOT NULL
  AND BTRIM("provisionalTaxon") <> '';

ALTER TABLE "PlantDefinition" DROP COLUMN "acquisitionLabel";

CREATE INDEX "PlantDefinition_identificationStatus_idx" ON "PlantDefinition"("identificationStatus");
