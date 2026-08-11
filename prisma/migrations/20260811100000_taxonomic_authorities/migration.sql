ALTER TABLE "GoverningBody" RENAME TO "TaxonomicAuthority";
ALTER TABLE "TaxonomicAuthority" RENAME CONSTRAINT "GoverningBody_pkey" TO "TaxonomicAuthority_pkey";
ALTER TABLE "TaxonomicAuthority" RENAME CONSTRAINT "GoverningBody_collectionId_fkey" TO "TaxonomicAuthority_collectionId_fkey";
ALTER INDEX "GoverningBody_collectionId_idx" RENAME TO "TaxonomicAuthority_collectionId_idx";

ALTER TABLE "PlantDefinition" RENAME COLUMN "governingBodyId" TO "taxonomicAuthorityId";
ALTER TABLE "PlantDefinition" RENAME CONSTRAINT "PlantDefinition_governingBodyId_fkey" TO "PlantDefinition_taxonomicAuthorityId_fkey";
ALTER INDEX "PlantDefinition_governingBodyId_idx" RENAME TO "PlantDefinition_taxonomicAuthorityId_idx";

ALTER TABLE "TaxonomicAuthority"
  ADD COLUMN "authorityType" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "registrationUrl" TEXT,
  ADD COLUMN "cultivarSearchUrl" TEXT,
  ADD COLUMN "membershipUrl" TEXT,
  ADD COLUMN "externalAuthorityUrl" TEXT,
  ADD COLUMN "otherResourcesJson" JSONB,
  ADD COLUMN "importProvider" TEXT,
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "importedAt" TIMESTAMP(3),
  ADD COLUMN "lastUrlCheckAt" TIMESTAMP(3),
  ADD COLUMN "urlHealthStatus" TEXT,
  ADD COLUMN "urlHealthDetailsJson" JSONB,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "PlantDefinition"
  ADD COLUMN "automaticTaxonomicAuthorityId" TEXT,
  ADD COLUMN "taxonomicAuthoritySource" TEXT NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "taxonomicAuthorityMatchReason" TEXT,
  ADD COLUMN "taxonomicAuthorityMatchPriority" INTEGER,
  ADD COLUMN "taxonomicPlacementJson" JSONB,
  ADD COLUMN "registrationRequired" BOOLEAN,
  ADD COLUMN "registrationStatus" TEXT,
  ADD COLUMN "registrationDate" TIMESTAMP(3),
  ADD COLUMN "registrationApplicationDate" TIMESTAMP(3),
  ADD COLUMN "cultivarAccepted" BOOLEAN,
  ADD COLUMN "officialCultivarName" TEXT,
  ADD COLUMN "registrationPublicationReference" TEXT;

UPDATE "PlantDefinition"
SET "taxonomicAuthoritySource" = 'MANUAL'
WHERE "taxonomicAuthorityId" IS NOT NULL;

CREATE TABLE "TaxonomicAuthorityScopeRule" (
  "id" TEXT NOT NULL,
  "taxonomicAuthorityId" TEXT NOT NULL,
  "rank" TEXT NOT NULL,
  "taxonName" TEXT NOT NULL,
  "qualifier" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxonomicAuthorityScopeRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxonomicAuthorityPublication" (
  "id" TEXT NOT NULL,
  "taxonomicAuthorityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "purpose" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxonomicAuthorityPublication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantDefinitionAuthorityMatch" (
  "id" TEXT NOT NULL,
  "plantDefinitionId" TEXT NOT NULL,
  "taxonomicAuthorityId" TEXT NOT NULL,
  "scopeRuleId" TEXT,
  "matchReason" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "isSelected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlantDefinitionAuthorityMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxonomicAuthority_authorityType_idx" ON "TaxonomicAuthority"("authorityType");
CREATE INDEX "TaxonomicAuthority_name_idx" ON "TaxonomicAuthority"("name");
CREATE UNIQUE INDEX "TaxonomicAuthority_collectionId_importProvider_externalId_key" ON "TaxonomicAuthority"("collectionId", "importProvider", "externalId");
CREATE UNIQUE INDEX "TaxonomicAuthorityScopeRule_taxonomicAuthorityId_rank_taxonName_qualifier_key" ON "TaxonomicAuthorityScopeRule"("taxonomicAuthorityId", "rank", "taxonName", "qualifier");
CREATE INDEX "TaxonomicAuthorityScopeRule_taxonomicAuthorityId_priority_idx" ON "TaxonomicAuthorityScopeRule"("taxonomicAuthorityId", "priority");
CREATE INDEX "TaxonomicAuthorityScopeRule_rank_taxonName_idx" ON "TaxonomicAuthorityScopeRule"("rank", "taxonName");
CREATE INDEX "TaxonomicAuthorityPublication_taxonomicAuthorityId_idx" ON "TaxonomicAuthorityPublication"("taxonomicAuthorityId");
CREATE INDEX "TaxonomicAuthorityPublication_name_idx" ON "TaxonomicAuthorityPublication"("name");
CREATE UNIQUE INDEX "PlantDefinitionAuthorityMatch_plantDefinitionId_taxonomicAuthorityId_key" ON "PlantDefinitionAuthorityMatch"("plantDefinitionId", "taxonomicAuthorityId");
CREATE INDEX "PlantDefinitionAuthorityMatch_plantDefinitionId_priority_idx" ON "PlantDefinitionAuthorityMatch"("plantDefinitionId", "priority");
CREATE INDEX "PlantDefinitionAuthorityMatch_taxonomicAuthorityId_idx" ON "PlantDefinitionAuthorityMatch"("taxonomicAuthorityId");
CREATE INDEX "PlantDefinitionAuthorityMatch_scopeRuleId_idx" ON "PlantDefinitionAuthorityMatch"("scopeRuleId");
CREATE INDEX "PlantDefinition_automaticTaxonomicAuthorityId_idx" ON "PlantDefinition"("automaticTaxonomicAuthorityId");

ALTER TABLE "PlantDefinition" ADD CONSTRAINT "PlantDefinition_automaticTaxonomicAuthorityId_fkey" FOREIGN KEY ("automaticTaxonomicAuthorityId") REFERENCES "TaxonomicAuthority"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaxonomicAuthorityScopeRule" ADD CONSTRAINT "TaxonomicAuthorityScopeRule_taxonomicAuthorityId_fkey" FOREIGN KEY ("taxonomicAuthorityId") REFERENCES "TaxonomicAuthority"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxonomicAuthorityPublication" ADD CONSTRAINT "TaxonomicAuthorityPublication_taxonomicAuthorityId_fkey" FOREIGN KEY ("taxonomicAuthorityId") REFERENCES "TaxonomicAuthority"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionAuthorityMatch" ADD CONSTRAINT "PlantDefinitionAuthorityMatch_plantDefinitionId_fkey" FOREIGN KEY ("plantDefinitionId") REFERENCES "PlantDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionAuthorityMatch" ADD CONSTRAINT "PlantDefinitionAuthorityMatch_taxonomicAuthorityId_fkey" FOREIGN KEY ("taxonomicAuthorityId") REFERENCES "TaxonomicAuthority"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDefinitionAuthorityMatch" ADD CONSTRAINT "PlantDefinitionAuthorityMatch_scopeRuleId_fkey" FOREIGN KEY ("scopeRuleId") REFERENCES "TaxonomicAuthorityScopeRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
