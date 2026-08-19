-- A null species means the accepted horticultural name intentionally omits an epithet.
-- Literal "sp." remains available for genuinely undetermined species.
ALTER TABLE "PlantDefinition" ALTER COLUMN "species" DROP NOT NULL;
