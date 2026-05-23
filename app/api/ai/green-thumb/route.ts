import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName, taxonomyLabel } from '@/lib/utils'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const requestLog = new Map<string, number[]>()

function trimmedString(value: unknown, maxLength = 1000) {
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

function enforceWordLimit(text: string, maxWords = 50) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ').filter(Boolean)
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}.` : cleaned
}

function rateLimit(userId: string) {
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const limit = Number(process.env.OPENAI_GREEN_THUMB_HOURLY_LIMIT || process.env.OPENAI_DESCRIPTION_HOURLY_LIMIT || 20)
  const recent = (requestLog.get(userId) || []).filter((timestamp) => now - timestamp < hour)
  if (recent.length >= limit) return false
  recent.push(now)
  requestLog.set(userId, recent)
  return true
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function mimeTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

async function imageDataUrl(photoPath: string) {
  if (!photoPath.startsWith('/')) throw new Error('Selected photo is not a local upload.')
  const localPath = path.join(process.cwd(), 'public', photoPath.replace(/^\/+/, ''))
  const bytes = await readFile(localPath)
  return `data:${mimeTypeFor(localPath)};base64,${bytes.toString('base64')}`
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const access = await requireAiFeatureAccess(trimmedString(body.collectionSlug, 80))
  if (access.error) return access.error
  const { user, collection } = access.context
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  }
  if (!rateLimit(user.id)) {
    return NextResponse.json({ error: 'Green Thumb assist limit reached. Try again later.' }, { status: 429 })
  }

  const plantInstanceId = trimmedString(body.plantInstanceId, 120)
  const question = trimmedString(body.question, 500)
  const photoId = trimmedString(body.photoId, 120)

  if (!plantInstanceId || !question) {
    return NextResponse.json({ error: 'A plant and care question are required.' }, { status: 400 })
  }

  const plant = await prisma.plantInstance.findFirst({
    where: { id: plantInstanceId, collectionId: collection.id },
    include: {
      plantDefinition: { include: { aliases: { orderBy: { name: 'asc' } }, husbandryGuide: true } },
      husbandryOverride: true,
      blooms: { orderBy: { bloomStartDate: 'desc' }, take: 3 },
      conditions: { where: { status: { in: ['OPEN', 'IMPROVING'] } }, orderBy: { observedAt: 'desc' }, take: 5 },
    },
  })

  if (!plant) return NextResponse.json({ error: 'Plant specimen not found in this collection.' }, { status: 404 })

  const existingToday = await prisma.plantCareEvent.findFirst({
    where: {
      collectionId: collection.id,
      plantInstanceId: plant.id,
      eventType: 'GREEN_THUMB_NOTE',
      performedAt: { gte: startOfToday() },
    },
    select: { id: true, performedAt: true },
  })

  if (existingToday) {
    return NextResponse.json({ error: 'Green Thumb assist has already been used for this specimen today. You can ask another question tomorrow.' }, { status: 429 })
  }

  const recentCareEvents = await prisma.plantCareEvent.findMany({
    where: { collectionId: collection.id, plantInstanceId: plant.id, NOT: { eventType: 'GREEN_THUMB_NOTE' } },
    orderBy: { performedAt: 'desc' },
    take: 5,
  })

  const sourceHusbandryGuide = plant.plantDefinition.husbandryGuide?.sourcePlantDefinitionId
    ? await prisma.plantHusbandryGuide.findFirst({
        where: {
          collectionId: collection.id,
          plantDefinitionId: plant.plantDefinition.husbandryGuide.sourcePlantDefinitionId,
        },
      })
    : null
  const baseHusbandryGuide = sourceHusbandryGuide || plant.plantDefinition.husbandryGuide

  const selectedPhoto = photoId
    ? await prisma.photo.findFirst({
        where: { id: photoId, collectionId: collection.id, entityType: 'PLANT_INSTANCE', entityId: plant.id },
        select: { id: true, path: true, caption: true },
      })
    : null

  let selectedImageUrl: string | null = null
  if (photoId && !selectedPhoto) {
    return NextResponse.json({ error: 'Selected photo was not found for this plant.' }, { status: 404 })
  }

  if (selectedPhoto) {
    try {
      selectedImageUrl = await imageDataUrl(selectedPhoto.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Selected photo could not be read.'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  const model = process.env.OPENAI_GREEN_THUMB_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  const name = plantName(plant.plantDefinition)
  const context = {
    collection: collection.name,
    plantId: plant.plantId,
    plantName: name,
    type: plant.instanceType,
    status: plant.status,
    location: plant.location || null,
    acquired: fmtDate(plant.acquisitionDate),
    propagated: fmtDate(plant.propagationDate),
    source: plant.source || null,
    distributor: plant.distributor || null,
    definition: {
      genus: plant.plantDefinition.genus,
      species: plant.plantDefinition.species,
      cultivarName: plant.plantDefinition.cultivarName,
      authorCitation: plant.plantDefinition.authority,
      confidence: plant.plantDefinition.confidence,
      provisionalTaxon: plant.plantDefinition.provisionalTaxon,
      aliases: plant.plantDefinition.aliases.slice(0, 8).map((alias) => ({
        name: alias.name,
        type: taxonomyLabel(alias.aliasType),
        confidence: taxonomyLabel(alias.confidence),
      })),
    },
    husbandrySummary: {
      water: plant.husbandryOverride?.summaryWater || baseHusbandryGuide?.summaryWater || null,
      light: plant.husbandryOverride?.summaryLight || baseHusbandryGuide?.summaryLight || null,
      toxicity: plant.husbandryOverride?.summaryToxicity || baseHusbandryGuide?.summaryToxicity || null,
      care: plant.husbandryOverride?.summaryCare || baseHusbandryGuide?.summaryCare || null,
    },
    openConditions: plant.conditions.map((condition) => ({
      category: condition.category,
      severity: condition.severity,
      status: condition.status,
      observedAt: fmtDate(condition.observedAt),
      notes: condition.notes || null,
    })),
    recentCare: recentCareEvents.map((event) => ({
      type: event.eventType,
      date: fmtDate(event.performedAt),
      notes: event.notes || null,
    })),
    recentBlooms: plant.blooms.map((bloom) => ({
      start: fmtDate(bloom.bloomStartDate),
      peak: fmtDate(bloom.peakBloomDate),
      end: fmtDate(bloom.bloomEndDate),
      flowerCount: bloom.flowerCount || null,
      notes: bloom.notes || null,
    })),
    attachedPhoto: selectedPhoto ? { caption: selectedPhoto.caption || null } : null,
  }

  const prompt = `Plant context JSON:\n${JSON.stringify(context)}\n\nUser care question: ${question}`
  const inputContent: any[] = [{ type: 'input_text', text: prompt }]
  if (selectedImageUrl) {
    inputContent.push({ type: 'input_image', image_url: selectedImageUrl, detail: 'low' })
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
        instructions:
          'You are AxilDB Green Thumb, a concise horticultural care assistant. Answer under 50 words. Directly address the user question for this exact plant scenario. Be practical and cautious. If a photo is provided, use it only as supporting context and do not overstate certainty. Return plain text only, no markdown.',
        input: [{ role: 'user', content: inputContent }],
        max_output_tokens: 150,
        store: false,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'Green Thumb assist request failed.'
      await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_GREEN_THUMB', model, success: false, error: message })
      await audit(user, 'ERROR', 'AI_GREEN_THUMB', null, `Failed Green Thumb assist for ${plant.plantId}`, { model, error: message }, collection.id)
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const answer = enforceWordLimit(outputText(payload), 50)
    if (!answer) {
      return NextResponse.json({ error: 'OpenAI returned an empty care response.' }, { status: 502 })
    }

    const event = await prisma.plantCareEvent.create({
      data: {
        collectionId: collection.id,
        plantInstanceId: plant.id,
        userId: user.id,
        eventType: 'GREEN_THUMB_NOTE',
        performedAt: new Date(),
        notes: answer,
        metadata: {
          source: 'GREEN_THUMB',
          question,
          model,
          photoId: selectedPhoto?.id || null,
          photoCaption: selectedPhoto?.caption || null,
        },
      },
    })

    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_GREEN_THUMB', model, usage: tokenUsage(payload) })
    await audit(user, 'GENERATE', 'AI_GREEN_THUMB', event.id, `Generated Green Thumb care note for ${plant.plantId}`, { model, photoIncluded: !!selectedPhoto }, collection.id)

    return NextResponse.json({ answer, eventId: event.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Green Thumb assist request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_GREEN_THUMB', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_GREEN_THUMB', null, `Failed Green Thumb assist for ${plant.plantId}`, { model, error: message }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
