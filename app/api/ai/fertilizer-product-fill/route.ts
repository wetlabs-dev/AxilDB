import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const requestLog = new Map<string, number[]>()

const nutrientFields = [
  'nitrogen',
  'phosphorus',
  'potassium',
  'calcium',
  'magnesium',
  'sulfur',
  'iron',
  'manganese',
  'zinc',
  'copper',
  'boron',
  'molybdenum',
  'chlorine',
  'nickel',
  'silicon',
] as const

function trimmedString(value: unknown, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function numericPercent(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null
  return parsed
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
  const limit = Number(process.env.OPENAI_FERTILIZER_FILL_HOURLY_LIMIT || process.env.OPENAI_MAGIC_FILL_HOURLY_LIMIT || 10)
  const recent = (requestLog.get(userId) || []).filter((timestamp) => now - timestamp < hour)
  if (recent.length >= limit) return false
  recent.push(now)
  requestLog.set(userId, recent)
  return true
}

function normalizeDraft(raw: any, model: string) {
  const draft: Record<string, any> = {
    name: trimmedString(raw?.name, 180) || null,
    brand: trimmedString(raw?.brand, 180) || null,
    productType: trimmedString(raw?.productType, 80) || null,
    guaranteedAnalysisNotes: trimmedString(raw?.guaranteedAnalysisNotes, 900) || null,
    manufacturerRecommendedDilution: trimmedString(raw?.manufacturerRecommendedDilution, 240) || null,
    manufacturerFeedAmount: trimmedString(raw?.manufacturerFeedAmount, 80) || null,
    manufacturerFeedUnit: trimmedString(raw?.manufacturerFeedUnit, 80) || null,
    manufacturerFeedWaterVolume: trimmedString(raw?.manufacturerFeedWaterVolume, 80) || null,
    manufacturerFeedWaterUnit: trimmedString(raw?.manufacturerFeedWaterUnit, 80) || null,
    manufacturerFeedNotes: trimmedString(raw?.manufacturerFeedNotes, 400) || null,
    usageNotes: trimmedString(raw?.usageNotes, 500) || null,
    sourceUrl: trimmedString(raw?.sourceUrl, 700) || null,
    sourceName: trimmedString(raw?.sourceName, 240) || null,
    dataConfidence: ['AI_DRAFT', 'UNCERTAIN', 'VERIFIED'].includes(raw?.dataConfidence) ? raw.dataConfidence : 'AI_DRAFT',
    warnings: trimmedString(raw?.warnings, 700) || null,
    aiModel: model,
    aiFilledAt: new Date().toISOString(),
  }
  for (const field of nutrientFields) draft[field] = numericPercent(raw?.[field])
  return draft
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const access = await requireAiFeatureAccess(trimmedString(body.collectionSlug, 80))
  if (access.error) return access.error
  const { user, collection } = access.context
  const applyMode = body.applyMode === 'REPLACE_ALL' ? 'REPLACE_ALL' : 'FILL_MISSING'
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  if (!rateLimit(user.id)) return NextResponse.json({ error: 'Fertilizer Magic Fill limit reached. Try again later.' }, { status: 429 })

  const name = trimmedString(body.name, 180)
  const brand = trimmedString(body.brand, 180)
  const productType = trimmedString(body.productType, 80)
  if (!name && !brand) return NextResponse.json({ error: 'Product name or brand is required.' }, { status: 400 })

  const model = process.env.OPENAI_FERTILIZER_FILL_MODEL || process.env.OPENAI_MAGIC_FILL_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const prompt = {
    task: 'Find public manufacturer or product-label fertilizer information and return a cautious structured draft.',
    product: { name, brand, productType },
    rules: [
      'Return only valid JSON, with no markdown.',
      'Prefer manufacturer product pages, product label PDFs, SDS/label documents, or official retailer label images.',
      'Do not invent guaranteed analysis values. Leave nutrient fields null unless a percent value is clearly stated.',
      'Use percent by weight for nutrient fields.',
      'If nutrients are listed as chelated forms or unusual compounds, preserve that label language in guaranteedAnalysisNotes.',
      'Do not confuse recipe strength with manufacturer label feed rate.',
      'Keep usage notes concise and include warnings/caveats when source data is uncertain.',
      'If you cannot find reliable source data, leave fields blank and set dataConfidence to UNCERTAIN.',
    ],
    jsonShape: {
      name: 'string|null',
      brand: 'string|null',
      productType: 'string|null',
      nitrogen: 'number|null',
      phosphorus: 'number|null',
      potassium: 'number|null',
      calcium: 'number|null',
      magnesium: 'number|null',
      sulfur: 'number|null',
      iron: 'number|null',
      manganese: 'number|null',
      zinc: 'number|null',
      copper: 'number|null',
      boron: 'number|null',
      molybdenum: 'number|null',
      chlorine: 'number|null',
      nickel: 'number|null',
      silicon: 'number|null',
      guaranteedAnalysisNotes: 'string|null',
      manufacturerRecommendedDilution: 'string|null',
      manufacturerFeedAmount: 'string|null',
      manufacturerFeedUnit: 'string|null',
      manufacturerFeedWaterVolume: 'string|null',
      manufacturerFeedWaterUnit: 'string|null',
      manufacturerFeedNotes: 'string|null',
      usageNotes: 'string|null',
      sourceUrl: 'string|null',
      sourceName: 'string|null',
      dataConfidence: 'AI_DRAFT|UNCERTAIN|VERIFIED',
      warnings: 'string|null',
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
        instructions: 'You are a careful horticultural product-label assistant. Use web search when available, cite source URL/name in the JSON, and return only machine-parseable JSON.',
        input: JSON.stringify(prompt),
        tools: [{ type: 'web_search_preview' }],
        max_output_tokens: 1800,
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI fertilizer product fill request failed.'
      await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_FERTILIZER_PRODUCT_FILL', model, success: false, error: message })
      await audit(user, 'ERROR', 'AI_FERTILIZER_PRODUCT_FILL', null, `Failed fertilizer product fill for ${[brand, name].filter(Boolean).join(' ') || 'product'}`, { model, applyMode, error: message }, collection.id)
      return NextResponse.json({ error: message }, { status: response.status })
    }

    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_FERTILIZER_PRODUCT_FILL', model, usage: tokenUsage(payload, { webSearchPreviewRequested: true }) })
    const draft = normalizeDraft(extractJson(outputText(payload)), model)
    await audit(user, 'GENERATE', 'AI_FERTILIZER_PRODUCT_FILL', null, `Generated fertilizer product fill for ${[brand, name].filter(Boolean).join(' ') || 'product'}`, { model, applyMode }, collection.id)
    return NextResponse.json({ draft })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI fertilizer product fill request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_FERTILIZER_PRODUCT_FILL', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_FERTILIZER_PRODUCT_FILL', null, `Failed fertilizer product fill for ${[brand, name].filter(Boolean).join(' ') || 'product'}`, { model, applyMode, error: message }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
