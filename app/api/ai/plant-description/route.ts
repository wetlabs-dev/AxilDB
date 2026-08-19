import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'
import { acceptedPlantName } from '@/lib/utils'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const requestLog = new Map<string, number[]>()

function trimmedString(value: unknown, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength)
}

function enforceWordLimit(text: string, maxWords = 40) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ').filter(Boolean)
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}.` : cleaned
}

function outputText(payload: any) {
  if (typeof payload.output_text === 'string') return payload.output_text
  const parts = payload.output
    ?.flatMap((item: any) => item.content || [])
    ?.map((content: any) => content.text)
    ?.filter(Boolean)
  return parts?.join(' ') || ''
}

function rateLimit(userId: string) {
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const limit = Number(process.env.OPENAI_DESCRIPTION_HOURLY_LIMIT || 20)
  const recent = (requestLog.get(userId) || []).filter((timestamp) => now - timestamp < hour)
  if (recent.length >= limit) return false
  recent.push(now)
  requestLog.set(userId, recent)
  return true
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
    return NextResponse.json({ error: 'Description generation limit reached. Try again later.' }, { status: 429 })
  }

  const genus = trimmedString(body.genus, 80)
  const species = trimmedString(body.species, 80).toLowerCase()
  const cultivarName = trimmedString(body.cultivarName, 100)

  if (!genus) {
    return NextResponse.json({ error: 'Genus is required.' }, { status: 400 })
  }

  const name = acceptedPlantName({ genus, species: species || null, cultivarName })
  const model = process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const prompt = `Write a brief botanical description of ${name} in under 40 words.`

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: 'You write concise, factual horticultural database copy. Return only the description, with no markdown.',
        input: prompt,
        max_output_tokens: 120,
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI description request failed.'
      await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_DESCRIPTION', model, success: false, error: message })
      await audit(user, 'ERROR', 'AI_DESCRIPTION', null, `Failed to generate description for ${name}`, { model, applyMode, error: message }, collection.id)
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const description = enforceWordLimit(outputText(payload))
    if (!description) {
      return NextResponse.json({ error: 'OpenAI returned an empty description.' }, { status: 502 })
    }

    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_DESCRIPTION', model, usage: tokenUsage(payload) })
    await audit(user, 'GENERATE', 'AI_DESCRIPTION', null, `Generated plant description for ${name}`, { model, applyMode }, collection.id)
    return NextResponse.json({ description })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI description request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_DESCRIPTION', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_DESCRIPTION', null, `Failed to generate description for ${name}`, { model, applyMode, error: message }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
