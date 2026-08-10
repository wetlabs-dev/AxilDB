import type { Prisma, PrismaClient } from '@prisma/client'

export const substrateComponentCategories = [
  'COIR', 'MOSS', 'PERLITE', 'PUMICE', 'LAVA_ROCK', 'BARK', 'SOIL_MIX', 'MINERAL',
  'AGGREGATE', 'ORGANIC_AMENDMENT', 'SAND', 'SEMI_HYDRO_MEDIA', 'SYNTHETIC', 'OTHER',
] as const

export const substrateOrganicities = ['ORGANIC', 'INORGANIC', 'MIXED', 'UNKNOWN'] as const
export const substrateQualitativeValues = ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'UNKNOWN'] as const
export const substratePhTendencies = ['ACIDIC', 'SLIGHTLY_ACIDIC', 'NEUTRAL', 'SLIGHTLY_ALKALINE', 'ALKALINE', 'VARIABLE', 'UNKNOWN'] as const
export const substrateLongevities = ['SHORT', 'MODERATE', 'LONG', 'VERY_LONG', 'UNKNOWN'] as const
export const substrateModes = ['RECIPE', 'RECEIVED_SUBSTRATE', 'CUSTOM_UNKNOWN', 'NO_SUBSTRATE', 'UNKNOWN'] as const
export const substrateSuitabilities = ['PREFERRED', 'RECOMMENDED', 'ACCEPTABLE', 'SPECIAL_PURPOSE'] as const

export type SubstrateMode = typeof substrateModes[number]

export function substrateSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

export function substrateLabel(value?: string | null) {
  if (!value) return 'Unknown'
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function percentTotal(rows: Array<{ percentByVolume: Prisma.Decimal | number | string }>) {
  return rows.reduce((sum, row) => sum + Number(row.percentByVolume), 0)
}

export function validRecipeTotal(total: number) {
  return Math.abs(total - 100) <= 0.001
}

export function recipeVersionName(version?: any | null) {
  if (!version) return null
  return `${version.recipe?.name || 'Substrate recipe'} v${version.versionNumber}`
}

export function substrateAssignmentLabel(assignment?: any | null) {
  if (!assignment) return 'Unknown substrate'
  if (assignment.substrateMode === 'RECIPE') return recipeVersionName(assignment.recipeVersion) || 'Recipe not available'
  if (assignment.substrateMode === 'RECEIVED_SUBSTRATE') return 'Received Substrate'
  if (assignment.substrateMode === 'CUSTOM_UNKNOWN') return 'Custom / Unknown Mix'
  if (assignment.substrateMode === 'NO_SUBSTRATE') return 'No Substrate'
  return 'Unknown substrate'
}

export function compactRecipeComposition(version?: any | null) {
  return (version?.components || [])
    .map((row: any) => `${Number(row.percentByVolume)}% ${row.component?.name || 'component'}`)
    .join(' · ')
}

export const starterSubstrateComponents = [
  { key: 'coco-coir', name: 'Coco coir', category: 'COIR', organicity: 'ORGANIC', waterRetention: 'HIGH', aeration: 'MODERATE', drainage: 'MODERATE', longevity: 'MODERATE', phTendency: 'SLIGHTLY_ACIDIC', renewable: true },
  { key: 'sphagnum-bulk', name: 'Sphagnum moss (bulk)', category: 'MOSS', organicity: 'ORGANIC', waterRetention: 'VERY_HIGH', aeration: 'MODERATE', drainage: 'LOW', longevity: 'SHORT', phTendency: 'ACIDIC', renewable: true, particleSize: 'Bulk' },
  { key: 'sphagnum-premium', name: 'Sphagnum moss (premium)', category: 'MOSS', organicity: 'ORGANIC', waterRetention: 'VERY_HIGH', aeration: 'HIGH', drainage: 'MODERATE', longevity: 'MODERATE', phTendency: 'ACIDIC', renewable: true, particleSize: 'Premium long-fiber' },
  { key: 'perlite-fine', name: 'Perlite (fine)', category: 'PERLITE', organicity: 'INORGANIC', waterRetention: 'LOW', aeration: 'HIGH', drainage: 'HIGH', longevity: 'VERY_LONG', phTendency: 'NEUTRAL', renewable: false, particleSize: 'Fine' },
  { key: 'perlite-coarse', name: 'Perlite (coarse)', category: 'PERLITE', organicity: 'INORGANIC', waterRetention: 'VERY_LOW', aeration: 'VERY_HIGH', drainage: 'VERY_HIGH', longevity: 'VERY_LONG', phTendency: 'NEUTRAL', renewable: false, particleSize: 'Coarse' },
  { key: 'pumice', name: 'Pumice', category: 'PUMICE', organicity: 'INORGANIC', waterRetention: 'MODERATE', aeration: 'HIGH', drainage: 'HIGH', longevity: 'VERY_LONG', phTendency: 'NEUTRAL', renewable: false },
  { key: 'lava-crushed', name: 'Lava rock (crushed)', category: 'LAVA_ROCK', organicity: 'INORGANIC', waterRetention: 'LOW', aeration: 'HIGH', drainage: 'HIGH', longevity: 'VERY_LONG', phTendency: 'VARIABLE', renewable: false, particleSize: 'Crushed' },
  { key: 'lava-chunky', name: 'Lava rock (chunky)', category: 'LAVA_ROCK', organicity: 'INORGANIC', waterRetention: 'VERY_LOW', aeration: 'VERY_HIGH', drainage: 'VERY_HIGH', longevity: 'VERY_LONG', phTendency: 'VARIABLE', renewable: false, particleSize: 'Chunky' },
  { key: 'succulent-mix', name: 'Succulent mix', category: 'SOIL_MIX', organicity: 'MIXED', waterRetention: 'LOW', aeration: 'HIGH', drainage: 'VERY_HIGH', longevity: 'MODERATE', phTendency: 'VARIABLE', renewable: null },
  { key: 'african-violet-mix', name: 'African violet mix', category: 'SOIL_MIX', organicity: 'MIXED', waterRetention: 'HIGH', aeration: 'MODERATE', drainage: 'MODERATE', longevity: 'MODERATE', phTendency: 'SLIGHTLY_ACIDIC', renewable: null },
  { key: 'orchid-bark-medium', name: 'Orchid bark (medium)', category: 'BARK', organicity: 'ORGANIC', waterRetention: 'MODERATE', aeration: 'HIGH', drainage: 'HIGH', longevity: 'MODERATE', phTendency: 'SLIGHTLY_ACIDIC', renewable: true, particleSize: 'Medium' },
  { key: 'orchid-bark-fine', name: 'Orchid bark (fine)', category: 'BARK', organicity: 'ORGANIC', waterRetention: 'HIGH', aeration: 'MODERATE', drainage: 'MODERATE', longevity: 'MODERATE', phTendency: 'SLIGHTLY_ACIDIC', renewable: true, particleSize: 'Fine' },
  { key: 'worm-castings', name: 'Worm castings', category: 'ORGANIC_AMENDMENT', organicity: 'ORGANIC', waterRetention: 'HIGH', aeration: 'LOW', drainage: 'LOW', longevity: 'SHORT', phTendency: 'NEUTRAL', renewable: true },
  { key: 'silica-sand-coarse', name: 'Silica sand (coarse)', category: 'SAND', organicity: 'INORGANIC', waterRetention: 'VERY_LOW', aeration: 'MODERATE', drainage: 'HIGH', longevity: 'VERY_LONG', phTendency: 'NEUTRAL', renewable: false, particleSize: 'Coarse' },
  { key: 'leca', name: 'LECA', category: 'SEMI_HYDRO_MEDIA', organicity: 'INORGANIC', waterRetention: 'MODERATE', aeration: 'VERY_HIGH', drainage: 'VERY_HIGH', longevity: 'VERY_LONG', phTendency: 'NEUTRAL', renewable: false },
] as const

export const starterSubstrateRecipes = [
  { key: 'african-violet-mix', name: 'African Violet Mix', components: [['coco-coir', 5], ['perlite-fine', 20], ['african-violet-mix', 75]] },
  { key: 'alocasia-mix', name: 'Alocasia Mix', components: [['coco-coir', 30], ['perlite-coarse', 15], ['pumice', 20], ['orchid-bark-medium', 20], ['orchid-bark-fine', 10], ['worm-castings', 5]] },
  { key: 'aroid-mix', name: 'Aroid Mix', components: [['coco-coir', 25], ['perlite-coarse', 15], ['pumice', 20], ['orchid-bark-medium', 35], ['worm-castings', 5]] },
  { key: 'fern-mix', name: 'Fern Mix', components: [['coco-coir', 20], ['sphagnum-bulk', 15], ['perlite-fine', 20], ['pumice', 15], ['african-violet-mix', 5], ['orchid-bark-fine', 25]] },
  { key: 'hoya-mix', name: 'Hoya Mix', components: [['coco-coir', 10], ['perlite-coarse', 20], ['pumice', 20], ['orchid-bark-medium', 45], ['worm-castings', 5]] },
  { key: 'rooting-rehab-mix', name: 'Rooting / Rehab Mix', components: [['sphagnum-premium', 50], ['perlite-fine', 30], ['orchid-bark-fine', 20]] },
  { key: 'semi-hydro-mix', name: 'Semi-Hydro Mix', components: [['leca', 100]] },
  { key: 'succulent-mix', name: 'Succulent Mix', components: [['pumice', 30], ['lava-crushed', 10], ['lava-chunky', 10], ['succulent-mix', 40], ['silica-sand-coarse', 10]] },
  { key: 'tc-corm-mix', name: 'TC / Corm Mix', components: [['sphagnum-premium', 70], ['perlite-fine', 30]] },
  { key: 'begonia-mix', name: 'Begonia Mix', components: [['coco-coir', 15], ['sphagnum-bulk', 15], ['perlite-fine', 15], ['pumice', 15], ['african-violet-mix', 10], ['orchid-bark-fine', 25], ['worm-castings', 5]] },
  { key: 'sundew-mix', name: 'Sundew Mix', components: [['coco-coir', 30], ['sphagnum-bulk', 40], ['perlite-fine', 30]] },
  { key: 'nepenthes-mix', name: 'Nepenthes Mix', components: [['sphagnum-premium', 50], ['perlite-fine', 20], ['pumice', 10], ['orchid-bark-fine', 20]] },
] as const

type DbClient = PrismaClient | Prisma.TransactionClient

export async function ensureStarterSubstrates(db: DbClient, collectionId: string, createdByUserId?: string | null) {
  const componentIds = new Map<string, string>()
  for (const starter of starterSubstrateComponents) {
    const { key, ...componentData } = starter
    const existing = await db.substrateComponent.findFirst({
      where: { collectionId, OR: [{ starterKey: key }, { slug: substrateSlug(starter.name) }] },
      select: { id: true },
    })
    const component = existing || await db.substrateComponent.create({
      data: { collectionId, createdByUserId, starterKey: key, slug: substrateSlug(starter.name), ...componentData },
      select: { id: true },
    })
    componentIds.set(key, component.id)
  }

  for (const starter of starterSubstrateRecipes) {
    const existing = await db.substrateRecipe.findFirst({
      where: { collectionId, OR: [{ starterKey: starter.key }, { slug: substrateSlug(starter.name) }] },
      select: { id: true },
    })
    if (existing) continue
    const recipe = await db.substrateRecipe.create({
      data: { collectionId, createdByUserId, starterKey: starter.key, slug: substrateSlug(starter.name), name: starter.name, intendedUse: `${starter.name} starter formulation.` },
    })
    const version = await db.substrateRecipeVersion.create({
      data: {
        collectionId,
        substrateRecipeId: recipe.id,
        versionNumber: 1,
        totalPercent: 100,
        status: 'ACTIVE',
        changeSummary: 'Starter recipe',
        createdByUserId,
        components: {
          create: starter.components.map(([key, percentByVolume], sortOrder) => ({
            collectionId,
            substrateComponentId: componentIds.get(key)!,
            percentByVolume,
            sortOrder,
          })),
        },
      },
    })
    await db.substrateRecipe.update({ where: { id: recipe.id }, data: { activeVersionId: version.id } })
  }
}

export async function requireSubstrateRecipeVersion(db: DbClient, collectionId: string, id?: string | null) {
  if (!id) return null
  const version = await db.substrateRecipeVersion.findFirst({
    where: { id, collectionId },
    include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } },
  })
  if (!version) throw new Error('Substrate recipe version not found in this collection.')
  return version
}

export async function setPlantSubstrate(db: DbClient, input: {
  collectionId: string
  plantInstanceId: string
  mode: string
  recipeVersionId?: string | null
  description?: string | null
  notes?: string | null
  startedAt?: Date
  reason?: string | null
  changedByUserId?: string | null
  repottingCareEventId?: string | null
}) {
  const mode = substrateModes.includes(input.mode as SubstrateMode) ? input.mode as SubstrateMode : 'UNKNOWN'
  const recipeVersion = mode === 'RECIPE'
    ? await requireSubstrateRecipeVersion(db, input.collectionId, input.recipeVersionId)
    : null
  if (mode === 'RECIPE' && !recipeVersion) throw new Error('Choose a substrate recipe version.')
  await db.plantInstance.findFirstOrThrow({ where: { id: input.plantInstanceId, collectionId: input.collectionId }, select: { id: true } })
  const previous = await db.plantInstanceSubstrate.findUnique({
    where: { plantInstanceId: input.plantInstanceId },
    include: { recipeVersion: { include: { recipe: true } } },
  })
  const startedAt = input.startedAt || new Date()
  const description = mode === 'RECIPE' ? null : input.description || null
  const current = await db.plantInstanceSubstrate.upsert({
    where: { plantInstanceId: input.plantInstanceId },
    update: {
      substrateMode: mode,
      substrateRecipeVersionId: recipeVersion?.id || null,
      receivedSubstrateDescription: description,
      startedAt,
      notes: input.notes || null,
    },
    create: {
      collectionId: input.collectionId,
      plantInstanceId: input.plantInstanceId,
      substrateMode: mode,
      substrateRecipeVersionId: recipeVersion?.id || null,
      receivedSubstrateDescription: description,
      startedAt,
      notes: input.notes || null,
    },
    include: { recipeVersion: { include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } } } } },
  })
  const history = await db.plantSubstrateHistory.create({
    data: {
      collectionId: input.collectionId,
      plantInstanceId: input.plantInstanceId,
      previousMode: previous?.substrateMode || null,
      previousRecipeVersionId: previous?.substrateRecipeVersionId || null,
      previousDescription: previous?.receivedSubstrateDescription || null,
      newMode: mode,
      newRecipeVersionId: recipeVersion?.id || null,
      newDescription: description,
      changedAt: startedAt,
      reason: input.reason || (previous ? 'Substrate changed' : 'Initial substrate recorded'),
      repottingCareEventId: input.repottingCareEventId || null,
      changedByUserId: input.changedByUserId || null,
      notes: input.notes || null,
    },
  })
  return { current, history, previous, recipeVersion }
}
