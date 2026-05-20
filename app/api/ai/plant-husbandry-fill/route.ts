import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'
import { husbandryFieldNames } from '@/lib/husbandry'

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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const access = await requireAiFeatureAccess(trimmedString(body.collectionSlug, 80))
  if (access.error) return access.error
  const { user, collection } = access.context
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  if (!rateLimit(user.id)) return NextResponse.json({ error: 'Husbandry fill limit reached. Try again later.' }, { status: 429 })

  const plant = body.plant || {}
  const genus = trimmedString(plant.genus, 80)
  const species = trimmedString(plant.species, 80).toLowerCase()
  const cultivarName = trimmedString(plant.cultivarName, 120)
  const name = `${genus} ${species}${cultivarName ? ` '${cultivarName}'` : ''}`.trim()
  if (!genus || !species) return NextResponse.json({ error: 'Genus and species are required.' }, { status: 400 })

  const model = process.env.OPENAI_HUSBANDRY_FILL_MODEL || process.env.OPENAI_MAGIC_FILL_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const prompt = {
    task: 'Draft a complete plant husbandry guide for a horticultural accession system.',
    plant: {
      genus,
      species,
      hybridNotation: trimmedString(plant.hybridNotation, 120) || null,
      cultivarName: cultivarName || null,
      authority: trimmedString(plant.authority, 160) || null,
      acquisitionLabel: trimmedString(plant.acquisitionLabel, 200) || null,
      provisionalTaxon: trimmedString(plant.provisionalTaxon, 200) || null,
      description: trimmedString(plant.description, 500) || null,
      wikipediaUrl: trimmedString(plant.wikipediaUrl, 500) || null,
      inaturalistUrl: trimmedString(plant.inaturalistUrl, 500) || null,
      powoUrl: trimmedString(plant.powoUrl, 500) || null,
      gbifUrl: trimmedString(plant.gbifUrl, 500) || null,
      aliases: Array.isArray(plant.aliases) ? plant.aliases.slice(0, 8).map((alias: any) => trimmedString(alias.name, 160)).filter(Boolean) : [],
    },
    rules: [
      'Return only valid JSON, with no markdown.',
      'Attempt to fill every field with concise practical husbandry guidance.',
      'Use short phrases or one short sentence per field; avoid long paragraphs.',
      'If information varies by cultivar, write cautious general guidance and note cultivar variation.',
      'Do not claim certainty for conservation, toxicity, or edibility unless widely established; use cautious wording.',
      'Use unknown only when no useful inference can be made.',
      'summaryWater, summaryLight, and summaryToxicity must be short badge-friendly phrases.',
    ],
    jsonShape: Object.fromEntries([...husbandryFieldNames, 'reviewNotes'].map((field) => [field, 'string|null'])),
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
        max_output_tokens: 2200,
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI husbandry fill request failed.'
      await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_HUSBANDRY_FILL', model, success: false, error: message })
      await audit(user, 'ERROR', 'AI_HUSBANDRY_FILL', null, `Failed husbandry fill for ${name}`, { model, error: message }, collection.id)
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const fields = normalizeFields(extractJson(outputText(payload)), model)
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_HUSBANDRY_FILL', model, usage: tokenUsage(payload) })
    await audit(user, 'GENERATE', 'AI_HUSBANDRY_FILL', null, `Generated husbandry fill for ${name}`, { model }, collection.id)
    return NextResponse.json({ fields })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI husbandry fill request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_HUSBANDRY_FILL', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_HUSBANDRY_FILL', null, `Failed husbandry fill for ${name}`, { model, error: message }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
