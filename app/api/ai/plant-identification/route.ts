import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'
import { prisma } from '@/lib/prisma'
import { findMatchingValidatedDefinition } from '@/lib/validated-definitions'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const requestLog = new Map<string, number[]>()

function trimmedString(value: unknown, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function nullish(value: unknown, maxLength = 500) {
  const text = trimmedString(value, maxLength)
  return text || null
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

function rateLimit(userId: string) {
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const limit = Number(process.env.OPENAI_PLANT_ID_HOURLY_LIMIT || process.env.OPENAI_MAGIC_FILL_HOURLY_LIMIT || 10)
  const recent = (requestLog.get(userId) || []).filter((timestamp) => now - timestamp < hour)
  if (recent.length >= limit) return false
  recent.push(now)
  requestLog.set(userId, recent)
  return true
}

function normalizeAliases(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => trimmedString(item, 200))
        .filter(Boolean)
        .slice(0, 8)
    : []
}

function normalizeResult(raw: any) {
  const confidenceLevel = String(raw?.confidenceLevel || 'LOW').toUpperCase()
  return {
    genus: nullish(raw?.genus, 80),
    species: nullish(raw?.species, 80)?.toLowerCase() || null,
    hybridNotation: nullish(raw?.hybridNotation, 120),
    cultivarName: confidenceLevel === 'HIGH' ? nullish(raw?.cultivarName, 120) : null,
    confidenceLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(confidenceLevel) ? confidenceLevel : 'LOW',
    confidenceExplanation: nullish(raw?.confidenceExplanation, 700) || 'Review this AI-assisted identification before saving.',
    possibleAlternatives: Array.isArray(raw?.possibleAlternatives)
      ? raw.possibleAlternatives.map((item: unknown) => trimmedString(item, 180)).filter(Boolean).slice(0, 5)
      : [],
    suggestedAliases: normalizeAliases(raw?.suggestedAliases),
    suggestedDescription: nullish(raw?.suggestedDescription, 700),
    warnings: Array.isArray(raw?.warnings)
      ? raw.warnings.map((item: unknown) => trimmedString(item, 240)).filter(Boolean).slice(0, 5)
      : ['AI plant identification is a draft, not an authoritative determination.'],
    suggestedReferences: Array.isArray(raw?.suggestedReferences)
      ? raw.suggestedReferences.map(url).filter(Boolean).slice(0, 5)
      : [],
  }
}

export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Identification request could not be read.' }, { status: 400 })
  }

  const access = await requireAiFeatureAccess(trimmedString(form.get('collectionSlug'), 80))
  if (access.error) return access.error
  const { user, collection } = access.context
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  if (!rateLimit(user.id)) return NextResponse.json({ error: 'ID My Plant limit reached. Try again later.' }, { status: 429 })

  const description = trimmedString(form.get('description'), 1200)
  const knownNames = trimmedString(form.get('knownNames'), 500)
  const image = form.get('image') as File | null
  const hasImage = Boolean(image && image.size > 0)
  if (!description && !knownNames && !hasImage) {
    return NextResponse.json({ error: 'Add a description, a known name, or a clear plant photo first.' }, { status: 400 })
  }
  if (hasImage && image) {
    if (image.type && !SUPPORTED_IMAGE_TYPES.has(image.type)) {
      return NextResponse.json({ error: 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.' }, { status: 400 })
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image is too large. Use an image under 6 MB.' }, { status: 400 })
    }
  }

  const model = process.env.OPENAI_PLANT_ID_MODEL || process.env.OPENAI_MAGIC_FILL_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const requestSummary = description || knownNames || (hasImage ? 'image-only identification' : 'plant identification')
  const prompt = {
    task: 'Suggest a cautious plant identification draft for AxilDB.',
    userInput: { description, knownNames, imageProvided: hasImage },
    rules: [
      'Return only valid JSON, with no markdown.',
      'This is assistive identification, not authoritative taxonomy.',
      'Never claim certainty. Prefer likely, possible, or uncertain language.',
      'If the evidence is weak, keep genus/species null or low confidence instead of hallucinating.',
      'Use lowercase for species.',
      'Do not invent cultivar registration numbers, governing bodies, or cultivar registration details.',
      'Do not fill cultivarName unless strongly supported by the user-provided evidence.',
      'Suggest common names and trade names as aliases when useful.',
      'Suggest reference URLs only when likely relevant and public.',
    ],
    jsonShape: {
      genus: 'string|null',
      species: 'string|null',
      hybridNotation: 'string|null',
      cultivarName: 'string|null',
      confidenceLevel: 'LOW|MEDIUM|HIGH',
      confidenceExplanation: 'string',
      possibleAlternatives: ['string'],
      suggestedAliases: ['string'],
      suggestedDescription: 'string|null',
      warnings: ['string'],
      suggestedReferences: ['string'],
    },
  }

  try {
    const content: any[] = [{ type: 'input_text', text: JSON.stringify(prompt) }]
    if (hasImage && image) {
      const bytes = Buffer.from(await image.arrayBuffer())
      const mime = image.type || 'image/jpeg'
      content.push({ type: 'input_image', image_url: `data:${mime};base64,${bytes.toString('base64')}` })
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: 'You are a careful botanical identification assistant. Return only machine-parseable JSON. Use null when evidence is insufficient.',
        input: [{ role: 'user', content }],
        max_output_tokens: 1200,
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI plant identification request failed.'
      await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_PLANT_IDENTIFICATION', model, success: false, error: message })
      await audit(user, 'ERROR', 'AI_PLANT_IDENTIFICATION', null, 'Failed ID My Plant request', { model, error: message, hasImage }, collection.id)
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const suggestion = normalizeResult(extractJson(outputText(payload)))
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_PLANT_IDENTIFICATION', model, usage: tokenUsage(payload) })
    await audit(user, 'GENERATE', 'AI_PLANT_IDENTIFICATION', null, `Generated ID My Plant suggestion for ${requestSummary.slice(0, 80)}`, {
      model,
      hasImage,
      confidenceLevel: suggestion.confidenceLevel,
      genus: suggestion.genus,
      species: suggestion.species,
    }, collection.id)
    const validatedMatch = await findMatchingValidatedDefinition(prisma, suggestion)
    return NextResponse.json({
      suggestion,
      validatedMatch: validatedMatch
        ? {
            id: validatedMatch.id,
            genus: validatedMatch.genus,
            species: validatedMatch.species,
            hybridNotation: validatedMatch.hybridNotation,
            cultivarName: validatedMatch.cultivarName,
          }
        : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI plant identification request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_PLANT_IDENTIFICATION', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_PLANT_IDENTIFICATION', null, 'Failed ID My Plant request', { model, error: message, hasImage }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
