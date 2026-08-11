import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'
import { recipeAiContext } from '@/lib/fertilizers'
import { husbandryFieldNames } from '@/lib/husbandry'
import { prisma } from '@/lib/prisma'
import { normalizeAndRankSubstrateRecommendations, substrateRecipePhysicalProfile } from '@/lib/substrate-recommendations'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const requestLog = new Map<string, number[]>()

function trimmedString(value: unknown, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function outputText(payload: any) {
  if (typeof payload.output_text === 'string') return payload.output_text
  const parts = payload.output
    ?.flatMap((item: any) => item.content || [])
    ?.map((content: any) => content.text)
    ?.filter(Boolean)
  return parts?.join(' ') || ''
}

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('OpenAI returned non-JSON output.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function rateLimit(userId: string) {
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const limit = Number(process.env.OPENAI_HUSBANDRY_FILL_HOURLY_LIMIT || process.env.OPENAI_MAGIC_FILL_HOURLY_LIMIT || 10)
  const recent = (requestLog.get(userId) || []).filter((timestamp) => now - timestamp < hour)
  if (recent.length >= limit) return false
  recent.push(now)
  requestLog.set(userId, recent)
  return true
}

function normalizeFields(raw: any, model: string) {
  const fields: Record<string, string | null> = {}
  for (const field of husbandryFieldNames) {
    const value = trimmedString(raw?.[field], 700)
    fields[field] = value || null
  }
  fields.reviewStatus = 'DRAFT'
  fields.reviewNotes = trimmedString(raw?.reviewNotes, 700) || 'AI-generated husbandry draft. Review before relying on this guide.'
  fields.aiModel = model
  return fields
}

function normalizeFertilizerRecommendation(raw: any, recipeIds: Set<string>) {
  const allowedTypes = new Set(['USE_EXISTING_RECIPE', 'CREATE_NEW_RECIPE', 'NO_FERTILIZER_RECOMMENDED', 'UNCERTAIN'])
  const type = allowedTypes.has(raw?.fertilizerRecommendationType) ? raw.fertilizerRecommendationType : 'UNCERTAIN'
  const recommendedRecipeId = recipeIds.has(String(raw?.recommendedRecipeId || '')) ? String(raw.recommendedRecipeId) : null
  return {
    fertilizerRecommendationType: type,
    recommendedRecipeId: type === 'USE_EXISTING_RECIPE' ? recommendedRecipeId : null,
    recommendedRecipeName: trimmedString(raw?.recommendedRecipeName, 160) || null,
    reasoning: trimmedString(raw?.reasoning, 700) || 'Review fertilizer needs before applying.',
    suggestedFrequency: trimmedString(raw?.suggestedFrequency, 200) || null,
    suggestedStrength: trimmedString(raw?.suggestedStrength, 200) || null,
    seasonalNotes: trimmedString(raw?.seasonalNotes, 300) || null,
    newRecipeDraft: raw?.newRecipeDraft && type === 'CREATE_NEW_RECIPE'
      ? {
          name: trimmedString(raw.newRecipeDraft.name, 160),
          targetNpkOrStyle: trimmedString(raw.newRecipeDraft.targetNpkOrStyle, 160),
          applicationMethod: trimmedString(raw.newRecipeDraft.applicationMethod, 80) || 'OTHER',
          dilutionOrStrength: trimmedString(raw.newRecipeDraft.dilutionOrStrength, 220),
          suggestedFrequency: trimmedString(raw.newRecipeDraft.suggestedFrequency, 220),
          productTypeSuggestions: trimmedString(raw.newRecipeDraft.productTypeSuggestions, 300),
          cautionNotes: trimmedString(raw.newRecipeDraft.cautionNotes, 300),
        }
      : null,
  }
}

function normalizeSubstrateRecommendation(raw: any, recipes: Map<string, ReturnType<typeof substrateRecipePhysicalProfile>>, componentIds: Set<string>) {
  const substrateRecommendations = normalizeAndRankSubstrateRecommendations(raw, recipes)
  const suggestedComponents = (Array.isArray(raw?.newRecipeSuggestion?.components) ? raw.newRecipeSuggestion.components : [])
    .map((item: any) => ({ componentId: String(item?.componentId || ''), percentByVolume: Number(item?.percentByVolume) }))
    .filter((item: any) => componentIds.has(item.componentId) && Number.isFinite(item.percentByVolume) && item.percentByVolume > 0 && item.percentByVolume <= 100)
  const total = suggestedComponents.reduce((sum: number, item: any) => sum + item.percentByVolume, 0)
  const newRecipeSuggestion = suggestedComponents.length && Math.abs(total - 100) <= 0.001
    ? { name: trimmedString(raw?.newRecipeSuggestion?.name, 160) || 'Suggested substrate recipe', reason: trimmedString(raw?.newRecipeSuggestion?.reason, 600) || null, components: suggestedComponents }
    : null
  return { substrateRecommendations, newRecipeSuggestion }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const access = await requireAiFeatureAccess(trimmedString(body.collectionSlug, 80))
  if (access.error) return access.error
  const { user, collection } = access.context
  const applyMode = body.applyMode === 'REPLACE_ALL' ? 'REPLACE_ALL' : 'FILL_MISSING'
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  if (!rateLimit(user.id)) return NextResponse.json({ error: 'Husbandry fill limit reached. Try again later.' }, { status: 429 })

  const plant = body.plant || {}
  const genus = trimmedString(plant.genus, 80)
  const species = trimmedString(plant.species, 80).toLowerCase()
  const cultivarName = trimmedString(plant.cultivarName, 120)
  const name = `${genus} ${species}${cultivarName ? ` '${cultivarName}'` : ''}`.trim()
  if (!genus || !species) return NextResponse.json({ error: 'Genus and species are required.' }, { status: 400 })
  const [fertilizerRecipes, substrateVersions, substrateComponents] = await Promise.all([
    prisma.fertilizerRecipe.findMany({
      where: { collectionId: collection.id, active: true },
      include: { products: { include: { product: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ draft: 'asc' }, { name: 'asc' }],
      take: 20,
    }),
    prisma.substrateRecipeVersion.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE', recipe: { archivedAt: null } },
      include: { recipe: true, components: { include: { component: true }, orderBy: { sortOrder: 'asc' } }, _count: { select: { currentAssignments: true, recommendations: true } } },
      orderBy: { recipe: { name: 'asc' } },
      take: 30,
    }),
    prisma.substrateComponent.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' }, take: 50 }),
  ])
  const fertilizerRecipeIds = new Set(fertilizerRecipes.map((recipe) => recipe.id))
  const substrateProfiles = new Map(substrateVersions.map((version) => [version.id, substrateRecipePhysicalProfile(version.components.map((row) => ({ percentByVolume: Number(row.percentByVolume), component: row.component })))]))
  const substrateComponentIds = new Set(substrateComponents.map((component) => component.id))

  const model = process.env.OPENAI_HUSBANDRY_FILL_MODEL || process.env.OPENAI_MAGIC_FILL_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const prompt = {
    task: 'Draft a complete plant husbandry guide for a horticultural accession system.',
    plant: {
      genus,
      species,
      hybridNotation: trimmedString(plant.hybridNotation, 120) || null,
      cultivarName: cultivarName || null,
      authority: trimmedString(plant.authority, 160) || null,
      provisionalTaxon: trimmedString(plant.provisionalTaxon, 200) || null,
      description: trimmedString(plant.description, 500) || null,
      wikipediaUrl: trimmedString(plant.wikipediaUrl, 500) || null,
      inaturalistUrl: trimmedString(plant.inaturalistUrl, 500) || null,
      powoUrl: trimmedString(plant.powoUrl, 500) || null,
      gbifUrl: trimmedString(plant.gbifUrl, 500) || null,
      aliases: Array.isArray(plant.aliases) ? plant.aliases.slice(0, 8).map((alias: any) => trimmedString(alias.name, 160)).filter(Boolean) : [],
    },
    activeFertilizerRecipes: fertilizerRecipes.map(recipeAiContext),
    activeSubstrateRecipes: substrateVersions.map((version) => ({
      recipeVersionId: version.id,
      familyName: version.recipe.name,
      version: version.versionNumber,
      intendedUse: version.recipe.intendedUse,
      composition: version.components.map((row) => ({ componentId: row.component.id, name: row.component.name, category: row.component.category, percentByVolume: Number(row.percentByVolume), particleSize: row.component.particleSize, waterRetention: row.component.waterRetention, aeration: row.component.aeration, drainage: row.component.drainage, organicity: row.component.organicity, phTendency: row.component.phTendency, longevity: row.component.longevity })),
      notes: version.notes,
      currentPlantCount: version._count.currentAssignments,
      recommendationCount: version._count.recommendations,
      physicalProfile: substrateProfiles.get(version.id),
    })),
    activeSubstrateComponents: substrateComponents.map((component) => ({ id: component.id, name: component.name, category: component.category, particleSize: component.particleSize, waterRetention: component.waterRetention, aeration: component.aeration, drainage: component.drainage, phTendency: component.phTendency })),
    rules: [
      'Return only valid JSON, with no markdown.',
      'Attempt to fill every field with concise practical husbandry guidance.',
      'Use short phrases or one short sentence per field; avoid long paragraphs.',
      'If information varies by cultivar, write cautious general guidance and note cultivar variation.',
      'Do not claim certainty for conservation, toxicity, or edibility unless widely established; use cautious wording.',
      'Evaluate fertilizer cautiously. If the plant is sensitive, slow-growing, dormant, or commonly grown without feeding, choose NO_FERTILIZER_RECOMMENDED or UNCERTAIN.',
      'If an active collection fertilizer recipe fits, use USE_EXISTING_RECIPE and return its exact id and name. Do not invent recipe ids.',
      'If no existing recipe fits but fertilizer is useful, choose CREATE_NEW_RECIPE and provide practical draft details without pretending exact chemical calculations are certain.',
      'Use unknown only when no useful inference can be made.',
      'First infer a target substrate profile for water retention, aeration, and drainage using only VERY_LOW, LOW, MODERATE, HIGH, or VERY_HIGH.',
      'Compare every active substrate recipe against that target and the plant taxonomy, root physiology, growth habit, and rot sensitivity. Recipe names and popularity are weak evidence; composition and physical fit are primary evidence.',
      'Rank up to four existing substrate recipe versions when suitable. Return the best overall fit first, use each exact recipeVersionId, use PREFERRED only once, and assign comparative confidence values.',
      'For semi-succulent, epiphytic, or trailing taxa, favor airy and freely draining mixes over dense moisture-retentive mixes unless reliable species guidance indicates otherwise.',
      'Only propose a new substrate recipe when the existing recipes are unsuitable. Use only listed component IDs, total exactly 100 percent by volume, and explain the gap cautiously.',
      'summaryWater, summaryLight, and summaryToxicity must be short badge-friendly phrases.',
    ],
    jsonShape: {
      ...Object.fromEntries([...husbandryFieldNames, 'reviewNotes'].map((field) => [field, 'string|null'])),
      fertilizerRecommendationType: 'USE_EXISTING_RECIPE|CREATE_NEW_RECIPE|NO_FERTILIZER_RECOMMENDED|UNCERTAIN',
      recommendedRecipeId: 'string|null',
      recommendedRecipeName: 'string|null',
      reasoning: 'string',
      suggestedFrequency: 'string|null',
      suggestedStrength: 'string|null',
      seasonalNotes: 'string|null',
      newRecipeDraft: {
        name: 'string|null',
        targetNpkOrStyle: 'string|null',
        applicationMethod: 'string|null',
        dilutionOrStrength: 'string|null',
        suggestedFrequency: 'string|null',
        productTypeSuggestions: 'string|null',
        cautionNotes: 'string|null',
      },
      substrateRecommendations: [{ recipeVersionId: 'exact listed id', rank: 'number', suitability: 'PREFERRED|RECOMMENDED|ACCEPTABLE|SPECIAL_PURPOSE', confidence: 'number 0-1|null', reason: 'string|null' }],
      substrateTargetProfile: { waterRetention: 'VERY_LOW|LOW|MODERATE|HIGH|VERY_HIGH', aeration: 'VERY_LOW|LOW|MODERATE|HIGH|VERY_HIGH', drainage: 'VERY_LOW|LOW|MODERATE|HIGH|VERY_HIGH' },
      newRecipeSuggestion: { name: 'string|null', reason: 'string|null', components: [{ componentId: 'exact listed id', percentByVolume: 'number' }] },
    },
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: 'You are a careful horticultural husbandry assistant. Return only machine-parseable JSON. Prefer concise, practical care guidance.',
        input: JSON.stringify(prompt),
        max_output_tokens: 2800,
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI husbandry fill request failed.'
      await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_HUSBANDRY_FILL', model, success: false, error: message })
      await audit(user, 'ERROR', 'AI_HUSBANDRY_FILL', null, `Failed husbandry fill for ${name}`, { model, applyMode, error: message }, collection.id)
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const raw = extractJson(outputText(payload))
    const fields = normalizeFields(raw, model)
    const fertilizerRecommendation = normalizeFertilizerRecommendation(raw, fertilizerRecipeIds)
    const substrateRecommendation = normalizeSubstrateRecommendation(raw, substrateProfiles, substrateComponentIds)
    const substrateById = new Map(substrateVersions.map((version) => [version.id, version]))
    const componentById = new Map(substrateComponents.map((component) => [component.id, component]))
    const displaySubstrateRecommendation = {
      substrateRecommendations: substrateRecommendation.substrateRecommendations.map((item: any) => {
        const version = substrateById.get(item.recipeVersionId)
        return { ...item, displayName: version ? `${version.recipe.name} v${version.versionNumber}` : 'Substrate recipe', components: version?.components.map((row) => ({ id: row.id, percentByVolume: Number(row.percentByVolume), component: row.component })) || [] }
      }),
      newRecipeSuggestion: substrateRecommendation.newRecipeSuggestion ? { ...substrateRecommendation.newRecipeSuggestion, components: substrateRecommendation.newRecipeSuggestion.components.map((item: any) => ({ ...item, componentName: componentById.get(item.componentId)?.name || 'Component', component: componentById.get(item.componentId) || { id: item.componentId, name: 'Component' } })) } : null,
    }
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_HUSBANDRY_FILL', model, usage: tokenUsage(payload) })
    await audit(user, 'GENERATE', 'AI_HUSBANDRY_FILL', null, `Generated husbandry fill for ${name}`, { model, applyMode }, collection.id)
    return NextResponse.json({ fields, fertilizerRecommendation, substrateRecommendation: displaySubstrateRecommendation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI husbandry fill request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_HUSBANDRY_FILL', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_HUSBANDRY_FILL', null, `Failed husbandry fill for ${name}`, { model, applyMode, error: message }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
