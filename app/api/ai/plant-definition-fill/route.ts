import { NextResponse } from 'next/server'
import { audit, requireCreateUser } from '@/lib/auth'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const requestLog = new Map<string, number[]>()

const aliasTypes = new Set(['SYNONYM', 'TRADE_NAME', 'OBSOLETE_TAXONOMY', 'COMMON_NAME', 'MISAPPLIED_NAME', 'SHORTHAND'])
const confidenceLevels = new Set(['CONFIRMED', 'PROBABLE', 'UNCERTAIN', 'TRADE_ASSUMED', 'DISPUTED'])

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

  return {
    genus: nullish(raw.genus, 80),
    species: nullish(raw.species, 80)?.toLowerCase() || null,
    hybridNotation: nullish(raw.hybridNotation, 120),
    cultivarName: nullish(raw.cultivarName, 120),
    authority: nullish(raw.authority, 160),
    cultivarRegistrationNumber: nullish(raw.cultivarRegistrationNumber, 120),
    governingBody: nullish(raw.governingBody, 160),
    wikipediaUrl: url(raw.wikipediaUrl),
    inaturalistUrl: url(raw.inaturalistUrl),
    powoUrl: url(raw.powoUrl),
    gbifUrl: url(raw.gbifUrl),
    description: nullish(raw.description, 500),
    aliases,
    reviewNote: nullish(raw.reviewNote, 500) || `Review AI-filled data for ${originalName} before saving.`,
  }
}

export async function POST(req: Request) {
  const user = await requireCreateUser()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  }
  if (!rateLimit(user.id)) {
    return NextResponse.json({ error: 'Magic fill limit reached. Try again later.' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const genus = trimmedString(body.genus, 80)
  const species = trimmedString(body.species, 80).toLowerCase()
  const hybridNotation = trimmedString(body.hybridNotation, 120)
  const cultivarName = trimmedString(body.cultivarName, 120)
  const governingBodies = Array.isArray(body.governingBodies)
    ? body.governingBodies.map((item: any) => ({
        id: trimmedString(item.id, 80),
        name: trimmedString(item.name, 160),
        abbreviation: trimmedString(item.abbreviation, 40),
      })).filter((item: any) => item.id && item.name)
    : []

  if (!genus || !species) {
    return NextResponse.json({ error: 'Genus and species are required.' }, { status: 400 })
  }

  const originalName = `${genus} ${species}${hybridNotation ? ` ${hybridNotation}` : ''}${cultivarName ? ` '${cultivarName}'` : ''}`
  const model = process.env.OPENAI_MAGIC_FILL_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const prompt = {
    task: 'Fill plant definition fields for a horticultural accession database.',
    originalInput: { genus, species, hybridNotation, cultivarName },
    governingBodies,
    rules: [
      'Return only valid JSON, with no markdown.',
      'If the supplied genus/species is outdated, return the currently accepted genus/species and include the supplied name as an alias with aliasType OBSOLETE_TAXONOMY or SYNONYM.',
      'Use lowercase for species.',
      'Do not invent cultivar registration numbers. If unknown, use null.',
      'Prefer authoritative URLs. POWO should be Plants of the World Online, GBIF should be gbif.org, iNaturalist should be an iNaturalist taxon page, Wikipedia should be a relevant article if one exists.',
      'Use one of the provided governingBodies by name or abbreviation only when it clearly applies; otherwise null.',
      'Keep description factual and under 40 words.',
      'Return 1 to 6 useful aliases when meaningful synonyms, obsolete names, common names, trade names, misapplied names, or shorthand labels are known. Do not fabricate aliases if none are known.',
      'For common houseplants or horticultural taxa, include widely used common names as aliases.',
      'If you change the accepted genus or species from the supplied input, aliases must include the original supplied binomial.',
      'Allowed aliasType values: SYNONYM, TRADE_NAME, OBSOLETE_TAXONOMY, COMMON_NAME, MISAPPLIED_NAME, SHORTHAND.',
      'Allowed confidence values: CONFIRMED, PROBABLE, UNCERTAIN, TRADE_ASSUMED, DISPUTED.',
    ],
    jsonShape: {
      genus: 'string|null',
      species: 'string|null',
      hybridNotation: 'string|null',
      cultivarName: 'string|null',
      authority: 'string|null',
      cultivarRegistrationNumber: 'string|null',
      governingBody: 'string|null',
      wikipediaUrl: 'string|null',
      inaturalistUrl: 'string|null',
      powoUrl: 'string|null',
      gbifUrl: 'string|null',
      description: 'string|null',
      aliases: [{ name: 'string', aliasType: 'SYNONYM', confidence: 'CONFIRMED', source: 'string|null', notes: 'string|null' }],
      reviewNote: 'string|null',
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
        max_output_tokens: 1400,
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI magic fill request failed.'
      await audit(user, 'ERROR', 'AI_MAGIC_FILL', null, `Failed magic fill for ${originalName}`, { model, error: message })
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const fields = normalizeFields(extractJson(outputText(payload)), originalName)
    const acceptedBinomial = `${fields.genus || genus} ${fields.species || species}`.trim().toLowerCase()
    const originalBinomial = `${genus} ${species}`.trim().toLowerCase()
    if (acceptedBinomial !== originalBinomial && !fields.aliases.some((alias: { name: string }) => alias.name.toLowerCase() === originalBinomial)) {
      fields.aliases.unshift({
        name: `${genus} ${species}`,
        aliasType: 'OBSOLETE_TAXONOMY',
        confidence: 'PROBABLE',
        source: 'AxilDB AI draft',
        notes: 'Original submitted name before accepted-name correction.',
      })
      fields.aliases = fields.aliases.slice(0, 8)
    }
    await audit(user, 'GENERATE', 'AI_MAGIC_FILL', null, `Generated magic fill for ${originalName}`, { model, reviewNote: fields.reviewNote })
    return NextResponse.json({ fields })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI magic fill request failed.'
    await audit(user, 'ERROR', 'AI_MAGIC_FILL', null, `Failed magic fill for ${originalName}`, { model, error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
