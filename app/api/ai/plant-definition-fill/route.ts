import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'
import { prisma } from '@/lib/prisma'
import { acceptedPlantName } from '@/lib/utils'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const requestLog = new Map<string, number[]>()

const aliasTypes = new Set(['SYNONYM', 'TRADE_NAME', 'OBSOLETE_TAXONOMY', 'COMMON_NAME', 'MISAPPLIED_NAME', 'SHORTHAND'])
const confidenceLevels = new Set(['CONFIRMED', 'PROBABLE', 'AI_DETERMINED', 'UNCERTAIN', 'TRADE_ASSUMED', 'DISPUTED'])

function trimmedString(value: unknown, maxLength = 200) {
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
  const limit = Number(process.env.OPENAI_MAGIC_FILL_HOURLY_LIMIT || 10)
  const recent = (requestLog.get(userId) || []).filter((timestamp) => now - timestamp < hour)
  if (recent.length >= limit) return false
  recent.push(now)
  requestLog.set(userId, recent)
  return true
}

function nullish(value: unknown, maxLength = 500) {
  const text = trimmedString(value, maxLength)
  return text || null
}

function url(value: unknown) {
  const text = nullish(value, 500)
  if (!text) return null
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function normalizeAlias(alias: any) {
  const name = nullish(alias?.name, 200)
  if (!name) return null
  const aliasType = String(alias?.aliasType || 'SYNONYM').toUpperCase()
  const confidence = String(alias?.confidence || 'UNCERTAIN').toUpperCase()
  return {
    name,
    aliasType: aliasTypes.has(aliasType) ? aliasType : 'SYNONYM',
    confidence: confidenceLevels.has(confidence) ? confidence : 'UNCERTAIN',
    source: nullish(alias?.source, 200),
    notes: nullish(alias?.notes, 300),
  }
}

function normalizeFields(raw: any, originalName: string) {
  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.map(normalizeAlias).filter(Boolean).slice(0, 8)
    : []

  const acquisition = raw.acquisitionPlan && typeof raw.acquisitionPlan === 'object' ? raw.acquisitionPlan : {}
  const recommendation = {
    catSafety: nullish(acquisition.catSafety, 240),
    confidence: nullish(acquisition.confidence, 80) || 'UNCERTAIN',
    difficulty: nullish(acquisition.difficulty, 160),
    desiredSpecimenSize: nullish(acquisition.desiredSpecimenSize, 160),
    approximatePriceRange: nullish(acquisition.approximatePriceRange, 160),
    environmentSuitability: nullish(acquisition.environmentSuitability, 500),
    sensitivities: nullish(acquisition.sensitivities, 500),
    locationCharacteristics: nullish(acquisition.locationCharacteristics, 500),
    warnings: nullish(acquisition.warnings, 500),
    researchSummary: nullish(acquisition.researchSummary, 800),
    suggestedLocationId: nullish(acquisition.suggestedLocationId, 100),
    locationCompatibility: nullish(acquisition.locationCompatibility, 500),
    sources: Array.isArray(acquisition.sources) ? acquisition.sources.map(url).filter(Boolean).slice(0, 8) : [],
  }
  return {
    genus: nullish(raw.genus, 80),
    species: nullish(raw.species, 80)?.toLowerCase() || null,
    hybridNotation: nullish(raw.hybridNotation, 120),
    cultivarName: nullish(raw.cultivarName, 120),
    authority: nullish(raw.authority, 160),
    cultivarRegistrationNumber: nullish(raw.cultivarRegistrationNumber, 120),
    taxonomicOrder: nullish(raw.taxonomicOrder, 120),
    taxonomicFamily: nullish(raw.taxonomicFamily, 120),
    taxonomicTribe: nullish(raw.taxonomicTribe, 120),
    taxonomicSection: nullish(raw.taxonomicSection, 120),
    wikipediaUrl: url(raw.wikipediaUrl),
    inaturalistUrl: url(raw.inaturalistUrl),
    powoUrl: url(raw.powoUrl),
    gbifUrl: url(raw.gbifUrl),
    description: nullish(raw.description, 500),
    aliases,
    reviewNote: nullish(raw.reviewNote, 500) || `Review AI-filled data for ${originalName} before saving.`,
    acquisitionPlan: recommendation,
    suggestedTags: Array.isArray(raw.suggestedTags) ? raw.suggestedTags.slice(0, 8) : [],
    newTagSuggestions: Array.isArray(raw.newTagSuggestions) ? raw.newTagSuggestions.slice(0, 5) : [],
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const access = await requireAiFeatureAccess(trimmedString(body.collectionSlug, 80))
  if (access.error) return access.error
  const { user, collection } = access.context
  const applyMode = body.applyMode === 'REPLACE_ALL' ? 'REPLACE_ALL' : 'FILL_MISSING'
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  }
  if (!rateLimit(user.id)) {
    return NextResponse.json({ error: 'Magic fill limit reached. Try again later.' }, { status: 429 })
  }

  const genus = trimmedString(body.genus, 80)
  const species = trimmedString(body.species, 80).toLowerCase()
  const hybridNotation = trimmedString(body.hybridNotation, 120)
  const cultivarName = trimmedString(body.cultivarName, 120)
  const taxonomicAuthorities = Array.isArray(body.taxonomicAuthorities)
    ? body.taxonomicAuthorities.map((item: any) => ({
        id: trimmedString(item.id, 80),
        name: trimmedString(item.name, 160),
      abbreviation: trimmedString(item.abbreviation, 40),
      scopeRules: Array.isArray(item.scopeRules) ? item.scopeRules.map((rule: any) => ({
        rank: trimmedString(rule.rank, 40),
        taxonName: trimmedString(rule.taxonName, 160),
        priority: Number(rule.priority) || 0,
      })).filter((rule: any) => rule.rank && rule.taxonName).slice(0, 30) : [],
      })).filter((item: any) => item.id && item.name)
    : []
  const [locations, plantTags] = await Promise.all([prisma.location.findMany({
    where: { collectionId: collection.id, status: 'ACTIVE', environmentProfile: { isNot: null } },
    include: { locationType: true, environmentProfile: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 40,
  }), prisma.plantTag.findMany({ where: { collectionId: collection.id, active: true }, select: { id: true, name: true, category: true, description: true }, orderBy: { name: 'asc' }, take: 120 })])
  const locationProfiles = locations.map((location) => ({
    id: location.id,
    category: location.locationType.name,
    temperatureC: [location.environmentProfile?.temperatureMinC, location.environmentProfile?.temperatureMaxC],
    humidityPercent: [location.environmentProfile?.humidityMinPercent, location.environmentProfile?.humidityMaxPercent],
    lightLevel: location.environmentProfile?.lightLevel,
    lightExposure: location.environmentProfile?.lightExposure,
    airflow: location.environmentProfile?.airflowLevel,
    stability: location.environmentProfile?.environmentStability,
  }))

  if (!genus) {
    return NextResponse.json({ error: 'Genus is required.' }, { status: 400 })
  }

  const originalName = acceptedPlantName({ genus, species: species || null, hybridNotation, cultivarName })
  const model = process.env.OPENAI_MAGIC_FILL_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const prompt = {
    task: 'Fill plant definition fields for a horticultural accession database.',
    originalInput: { genus, species: species || null, hybridNotation, cultivarName },
    taxonomicAuthorities,
    collectionLocationProfiles: locationProfiles,
    collectionPlantTags: plantTags,
    rules: [
      'Return only valid JSON, with no markdown.',
      'If the supplied genus/species is outdated, return the currently accepted genus/species and include the supplied name as an alias with aliasType OBSOLETE_TAXONOMY or SYNONYM.',
      'Use lowercase for species.',
      'An accepted horticultural cultivar name may intentionally omit a species epithet. In that case return species as null; do not fill in sp. or infer an epithet merely to complete the binomial.',
      'Return the literal species value sp. only when the species is genuinely undetermined. Blank/null and sp. are distinct identity states.',
      'Do not invent cultivar registration numbers. If unknown, use null.',
      'Prefer authoritative URLs. POWO should be Plants of the World Online, GBIF should be gbif.org, iNaturalist should be an iNaturalist taxon page, Wikipedia should be a relevant article if one exists.',
      'Taxonomic Authorities are provided only as compact scope context. Do not choose or invent an authority; AxilDB performs deterministic scope matching after the user saves.',
      'Keep description factual and under 40 words.',
      'Return 1 to 6 useful aliases when meaningful synonyms, obsolete names, common names, trade names, misapplied names, or shorthand labels are known. Do not fabricate aliases if none are known.',
      'For common houseplants or horticultural taxa, include widely used common names as aliases.',
      'If you change the accepted genus or species from the supplied input, aliases must include the original supplied binomial.',
      'Allowed aliasType values: SYNONYM, TRADE_NAME, OBSOLETE_TAXONOMY, COMMON_NAME, MISAPPLIED_NAME, SHORTHAND.',
      'Allowed confidence values: CONFIRMED, PROBABLE, UNCERTAIN, TRADE_ASSUMED, DISPUTED.',
      'Draft an optional acquisitionPlan using cautious, practical horticultural language. Do not set wishlist priority or status.',
      'Typical prices are approximate and time-sensitive. Use null when reliable market information is unavailable.',
      'Use reputable grower, botanical garden, extension, registry, or manufacturer sources and return source URLs.',
      'Compare requirements to the compact collectionLocationProfiles. Suggest an ID only when it is a plausible fit, and explain cautions. Never assign it.',
      'Suggest only reasonably supported traits. Prefer IDs from collectionPlantTags. Propose a new tag only when no existing tag fits.',
      'Never treat subjective rarity or beauty as a trait. Cat-safety suggestions require authoritative support and cautious confidence.',
    ],
    jsonShape: {
      genus: 'string|null',
      species: 'string|null',
      hybridNotation: 'string|null',
      cultivarName: 'string|null',
      authority: 'string|null',
      cultivarRegistrationNumber: 'string|null',
      taxonomicOrder: 'string|null',
      taxonomicFamily: 'string|null',
      taxonomicTribe: 'string|null',
      taxonomicSection: 'string|null',
      wikipediaUrl: 'string|null',
      inaturalistUrl: 'string|null',
      powoUrl: 'string|null',
      gbifUrl: 'string|null',
      description: 'string|null',
      aliases: [{ name: 'string', aliasType: 'SYNONYM', confidence: 'CONFIRMED', source: 'string|null', notes: 'string|null' }],
      reviewNote: 'string|null',
      acquisitionPlan: {
        catSafety: 'string|null', confidence: 'string|null', difficulty: 'string|null', desiredSpecimenSize: 'string|null',
        approximatePriceRange: 'string|null', environmentSuitability: 'string|null', sensitivities: 'string|null',
        locationCharacteristics: 'string|null', warnings: 'string|null', researchSummary: 'string|null',
        suggestedLocationId: 'string|null', locationCompatibility: 'string|null', sources: ['https://example.org/source'],
      },
      suggestedTags: [{ tagId: 'existing tag ID', tagName: 'string', confidence: 0.8, reason: 'string' }],
      newTagSuggestions: [{ name: 'string', icon: 'stable concept or null', category: 'string', description: 'string', confidence: 0.8, reason: 'string' }],
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
        instructions: 'You are careful botanical taxonomy assistant. Return only machine-parseable JSON. Use null when you are not confident.',
        input: JSON.stringify(prompt),
        max_output_tokens: 2200,
        tools: [{ type: 'web_search_preview' }],
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI magic fill request failed.'
      await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_MAGIC_FILL', model, success: false, error: message })
      await audit(user, 'ERROR', 'AI_MAGIC_FILL', null, `Failed magic fill for ${originalName}`, { model, applyMode, error: message }, collection.id)
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const fields = normalizeFields(extractJson(outputText(payload)), originalName)
    const catalogIds = new Set(plantTags.map((tag) => tag.id))
    fields.suggestedTags = fields.suggestedTags.map((suggestion: any) => ({ tagId: trimmedString(suggestion?.tagId, 100), tagName: trimmedString(suggestion?.tagName, 60), confidence: Math.max(0, Math.min(1, Number(suggestion?.confidence || 0))), reason: trimmedString(suggestion?.reason, 240) })).filter((suggestion: any) => catalogIds.has(suggestion.tagId) && suggestion.confidence >= 0.6)
    fields.newTagSuggestions = fields.newTagSuggestions.map((suggestion: any) => ({ name: trimmedString(suggestion?.name, 60), category: trimmedString(suggestion?.category, 40), description: trimmedString(suggestion?.description, 300), confidence: Math.max(0, Math.min(1, Number(suggestion?.confidence || 0))), reason: trimmedString(suggestion?.reason, 240) })).filter((suggestion: any) => suggestion.name && suggestion.confidence >= 0.7)
    const acceptedIdentity = acceptedPlantName({ genus: fields.genus || genus, species: fields.species, hybridNotation: fields.hybridNotation, cultivarName: fields.cultivarName }).toLowerCase()
    const originalIdentity = originalName.toLowerCase()
    if (acceptedIdentity !== originalIdentity && !fields.aliases.some((alias: { name: string }) => alias.name.toLowerCase() === originalIdentity)) {
      fields.aliases.unshift({
        name: originalName,
        aliasType: 'OBSOLETE_TAXONOMY',
        confidence: 'PROBABLE',
        source: 'AxilDB AI draft',
        notes: 'Original submitted name before accepted-name correction.',
      })
      fields.aliases = fields.aliases.slice(0, 8)
    }
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_MAGIC_FILL', model, usage: tokenUsage(payload) })
    await audit(user, 'GENERATE', 'AI_MAGIC_FILL', null, `Generated magic fill for ${originalName}`, { model, applyMode, reviewNote: fields.reviewNote }, collection.id)
    return NextResponse.json({ fields })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI magic fill request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_MAGIC_FILL', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_MAGIC_FILL', null, `Failed magic fill for ${originalName}`, { model, applyMode, error: message }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
