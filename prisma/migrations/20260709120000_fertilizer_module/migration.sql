-- CreateTable
CREATE TABLE "FertilizerProduct" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "productType" TEXT NOT NULL DEFAULT 'OTHER',
    "nitrogen" DECIMAL,
    "phosphorus" DECIMAL,
    "potassium" DECIMAL,
    "micronutrients" TEXT,
    "concentrationNotes" TEXT,
    "defaultDilution" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FertilizerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FertilizerRecipe" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "declaredNpk" TEXT,
    "calculatedNpk" TEXT,
    "applicationMethod" TEXT NOT NULL DEFAULT 'ROOT_DRENCH',
    "dilutionInstructions" TEXT,
    "doseAmount" TEXT,
    "doseUnit" TEXT,
    "waterVolume" TEXT,
    "waterVolumeUnit" TEXT,
    "strengthLabel" TEXT,
    "frequencyDays" INTEGER,
    "frequencyNotes" TEXT,
    "seasonalNotes" TEXT,
    "safetyNotes" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FertilizerRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FertilizerRecipeProduct" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amount" TEXT,
    "unit" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FertilizerRecipeProduct_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PlantHusbandryGuide" ADD COLUMN "fertilizerRecipeId" TEXT,
ADD COLUMN "fertilizationCadenceDays" INTEGER,
ADD COLUMN "fertilizationPaused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlantHusbandryOverride" ADD COLUMN "fertilizerRecipeId" TEXT,
ADD COLUMN "fertilizationCadenceDays" INTEGER,
ADD COLUMN "fertilizationPaused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlantCareEvent" ADD COLUMN "fertilizerRecipeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FertilizerProduct_collectionId_name_brand_key" ON "FertilizerProduct"("collectionId", "name", "brand");

-- CreateIndex
CREATE INDEX "FertilizerProduct_collectionId_idx" ON "FertilizerProduct"("collectionId");

-- CreateIndex
CREATE INDEX "FertilizerProduct_productType_idx" ON "FertilizerProduct"("productType");

-- CreateIndex
CREATE INDEX "FertilizerProduct_active_idx" ON "FertilizerProduct"("active");

-- CreateIndex
CREATE UNIQUE INDEX "FertilizerRecipe_collectionId_name_key" ON "FertilizerRecipe"("collectionId", "name");

-- CreateIndex
CREATE INDEX "FertilizerRecipe_collectionId_idx" ON "FertilizerRecipe"("collectionId");

-- CreateIndex
CREATE INDEX "FertilizerRecipe_applicationMethod_idx" ON "FertilizerRecipe"("applicationMethod");

-- CreateIndex
CREATE INDEX "FertilizerRecipe_active_idx" ON "FertilizerRecipe"("active");

-- CreateIndex
CREATE INDEX "FertilizerRecipe_draft_idx" ON "FertilizerRecipe"("draft");

-- CreateIndex
CREATE UNIQUE INDEX "FertilizerRecipeProduct_recipeId_productId_key" ON "FertilizerRecipeProduct"("recipeId", "productId");

-- CreateIndex
CREATE INDEX "FertilizerRecipeProduct_recipeId_idx" ON "FertilizerRecipeProduct"("recipeId");

-- CreateIndex
CREATE INDEX "FertilizerRecipeProduct_productId_idx" ON "FertilizerRecipeProduct"("productId");

-- CreateIndex
CREATE INDEX "FertilizerRecipeProduct_sortOrder_idx" ON "FertilizerRecipeProduct"("sortOrder");

-- CreateIndex
CREATE INDEX "PlantHusbandryGuide_fertilizerRecipeId_idx" ON "PlantHusbandryGuide"("fertilizerRecipeId");

-- CreateIndex
CREATE INDEX "PlantHusbandryOverride_fertilizerRecipeId_idx" ON "PlantHusbandryOverride"("fertilizerRecipeId");

-- CreateIndex
CREATE INDEX "PlantCareEvent_fertilizerRecipeId_idx" ON "PlantCareEvent"("fertilizerRecipeId");

-- AddForeignKey
ALTER TABLE "FertilizerProduct" ADD CONSTRAINT "FertilizerProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilizerRecipe" ADD CONSTRAINT "FertilizerRecipe_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilizerRecipeProduct" ADD CONSTRAINT "FertilizerRecipeProduct_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "FertilizerRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilizerRecipeProduct" ADD CONSTRAINT "FertilizerRecipeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FertilizerProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantHusbandryGuide" ADD CONSTRAINT "PlantHusbandryGuide_fertilizerRecipeId_fkey" FOREIGN KEY ("fertilizerRecipeId") REFERENCES "FertilizerRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantHusbandryOverride" ADD CONSTRAINT "PlantHusbandryOverride_fertilizerRecipeId_fkey" FOREIGN KEY ("fertilizerRecipeId") REFERENCES "FertilizerRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantCareEvent" ADD CONSTRAINT "PlantCareEvent_fertilizerRecipeId_fkey" FOREIGN KEY ("fertilizerRecipeId") REFERENCES "FertilizerRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
