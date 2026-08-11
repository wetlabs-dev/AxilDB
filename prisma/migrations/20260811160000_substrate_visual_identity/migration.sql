ALTER TABLE "SubstrateComponent"
  ADD COLUMN "displayColor" TEXT,
  ADD COLUMN "displayPattern" TEXT,
  ADD COLUMN "shortLabel" TEXT,
  ADD COLUMN "visualFamily" TEXT;

UPDATE "SubstrateComponent"
SET "displayColor" = defaults.color,
    "displayPattern" = defaults.pattern,
    "shortLabel" = defaults.label,
    "visualFamily" = defaults.family
FROM (VALUES
  ('coco-coir', '#9A7252', 'HORIZONTAL', 'Coco', 'COIR'),
  ('sphagnum-bulk', '#7D8956', 'DIAGONAL', 'Bulk sphagnum', 'SPHAGNUM'),
  ('sphagnum-premium', '#7D8956', 'CROSSHATCH', 'Premium sphagnum', 'SPHAGNUM'),
  ('perlite-fine', '#C7CBC4', 'DOTS', 'Fine perlite', 'PERLITE'),
  ('perlite-coarse', '#C7CBC4', 'DIAGONAL', 'Coarse perlite', 'PERLITE'),
  ('pumice', '#7D9095', 'SPECKLED', 'Pumice', 'PUMICE'),
  ('lava-crushed', '#835348', 'SPECKLED', 'Crushed lava', 'LAVA_ROCK'),
  ('lava-chunky', '#835348', 'GRID', 'Chunky lava', 'LAVA_ROCK'),
  ('succulent-mix', '#9A8A6D', 'CROSSHATCH', 'Succulent mix', 'SOIL_MIX'),
  ('african-violet-mix', '#82718D', 'DOTS', 'Violet mix', 'SOIL_MIX'),
  ('orchid-bark-medium', '#78553D', 'DIAGONAL', 'Medium bark', 'BARK'),
  ('orchid-bark-fine', '#78553D', 'DOTS', 'Fine bark', 'BARK'),
  ('worm-castings', '#51463D', 'SPECKLED', 'Castings', 'AMENDMENT'),
  ('silica-sand-coarse', '#B79A5F', 'HORIZONTAL', 'Coarse sand', 'SAND'),
  ('leca', '#AD6849', 'GRID', 'LECA', 'SEMI_HYDRO')
) AS defaults(key, color, pattern, label, family)
WHERE "SubstrateComponent"."starterKey" = defaults.key;
