import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { recordAiUsage, requireAiFeatureAccess, tokenUsage } from '@/lib/ai-usage'
import { prisma } from '@/lib/prisma'
import { startOfDayInTimeZone, timeZoneForPreference } from '@/lib/time'
import { fmtDate, plantName, taxonomyLabel } from '@/lib/utils'
import { collectionPath } from '@/lib/collections'
import { summarizeTreatmentEffectiveness } from '@/lib/treatments'

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

function collectionDailyLimit() {
  const configured = Number(process.env.OPENAI_GREEN_THUMB_DAILY_COLLECTION_LIMIT || 5)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 5
}

async function collectionDailyUsage(collectionId: string, timezone?: string) {
  const since = startOfDayInTimeZone(new Date(), timezone)
  const used = await prisma.aiUsageEvent.count({
    where: {
      collectionId,
      feature: 'AI_GREEN_THUMB',
      createdAt: { gte: since },
    },
  })
  return { used, limit: collectionDailyLimit() }
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
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: user.id } })
  const timezone = timeZoneForPreference(preferences)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 503 })
  }
  if (!rateLimit(user.id)) {
    return NextResponse.json({ error: 'Green Thumb assist limit reached. Try again later.' }, { status: 429 })
  }

  const dailyUsage = await collectionDailyUsage(collection.id, timezone)
  if (dailyUsage.used >= dailyUsage.limit) {
    return NextResponse.json(
      { error: `This collection has reached its Green Thumb daily limit (${dailyUsage.limit} requests). Try again tomorrow.` },
      { status: 429 },
    )
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
      currentLocation: true,
      quarantines: { where: { status: 'ACTIVE' }, orderBy: { startDate: 'desc' }, take: 1 },
    },
  })

  if (!plant) return NextResponse.json({ error: 'Plant specimen not found in this collection.' }, { status: 404 })

  const existingToday = await prisma.plantCareEvent.findFirst({
    where: {
      collectionId: collection.id,
      plantInstanceId: plant.id,
      eventType: 'GREEN_THUMB_NOTE',
      performedAt: { gte: startOfDayInTimeZone(new Date(), timezone) },
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
  const openConditionTypes = [...new Set(plant.conditions.map((condition) => condition.category))]
  const availableTreatments = openConditionTypes.length ? await prisma.treatmentDefinition.findMany({
    where: { collectionId: collection.id, active: true, conditionTypes: { some: { conditionType: { in: openConditionTypes } } } },
    include: {
      conditionTypes: true,
      products: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
      planSteps: { include: { plan: { include: { applications: { include: { outcomes: true } } } } } },
    },
    orderBy: { name: 'asc' },
    take: 6,
  }) : []
  const [activeTreatmentPlans, recentTreatmentApplications] = await Promise.all([
    prisma.treatmentPlan.findMany({ where: { collectionId: collection.id, plantInstanceId: plant.id, status: 'ACTIVE' }, include: { steps: { orderBy: { scheduledAt: 'asc' } } }, take: 3 }),
    prisma.treatmentApplication.findMany({ where: { collectionId: collection.id, plantInstanceId: plant.id }, include: { outcomes: { orderBy: { observedAt: 'desc' }, take: 1 } }, orderBy: { appliedAt: 'desc' }, take: 5 }),
  ])

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
    structuredLocation: plant.currentLocation ? { code: plant.currentLocation.code, name: plant.currentLocation.name } : null,
    activeQuarantine: plant.quarantines[0] ? { riskLevel: plant.quarantines[0].riskLevel, targetReleaseDate: fmtDate(plant.quarantines[0].targetReleaseDate, timezone) } : null,
    acquired: fmtDate(plant.acquisitionDate, timezone),
    propagated: fmtDate(plant.propagationDate, timezone),
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
      observedAt: fmtDate(condition.observedAt, timezone),
      notes: condition.notes || null,
    })),
    recentCare: recentCareEvents.map((event) => ({
      type: event.eventType,
      date: fmtDate(event.performedAt, timezone),
      notes: event.notes || null,
    })),
    recentBlooms: plant.blooms.map((bloom) => ({
      start: fmtDate(bloom.bloomStartDate, timezone),
      peak: fmtDate(bloom.peakBloomDate, timezone),
      end: fmtDate(bloom.bloomEndDate, timezone),
      flowerCount: bloom.flowerCount || null,
      notes: bloom.notes || null,
    })),
    attachedPhoto: selectedPhoto ? { caption: selectedPhoto.caption || null } : null,
    activeTreatmentPlans: activeTreatmentPlans.map((plan) => ({ title: plan.title, progress: `${plan.steps.filter((step) => step.status === 'COMPLETED').length}/${plan.steps.length}`, nextStep: plan.steps.find((step) => step.status === 'PENDING')?.title || null })),
    recentTreatmentApplications: recentTreatmentApplications.map((application) => ({ treatment: application.treatmentNameSnapshot, appliedAt: fmtDate(application.appliedAt, timezone), adverseReaction: application.adverseReaction, outcome: application.outcomes[0]?.outcome || null, effectiveness: application.outcomes[0]?.effectiveness || null })),
    collectionTreatmentOptions: availableTreatments.map((treatment) => {
      const plans = [...new Map(treatment.planSteps.map((step) => [step.plan.id, step.plan])).values()]
      const effectiveness = summarizeTreatmentEffectiveness(plans)
      return {
        id: treatment.id,
        name: treatment.name,
        category: treatment.category,
        applicableConditions: treatment.conditionTypes.map((item) => item.conditionType),
        applicationMethod: treatment.applicationMethod,
        productNames: treatment.products.map((item) => item.product.name),
        targetSummary: treatment.targetSummary,
        safety: {
          requiresQuarantine: treatment.requiresQuarantine,
          ventilationRequired: treatment.ventilationRequired,
          indoorUseAllowed: treatment.indoorUseAllowed,
          minimumIntervalDays: treatment.minimumIntervalDays,
          safetyNotes: treatment.safetyNotes,
        },
        collectionOutcomeSummary: { completedPlans: effectiveness.completed, favorablePlans: effectiveness.effective, adverseReactions: effectiveness.adverse, label: effectiveness.label, sampleLabel: effectiveness.sampleLabel },
      }
    }),
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
          'You are AxilDB Green Thumb, a concise horticultural care assistant. Answer under 50 words. Directly address the user question for this exact plant scenario. Be practical and cautious. If relevant, prefer a named collectionTreatmentOption over inventing a treatment, mention its safety constraints, and treat collection outcomes as descriptive local records rather than scientific evidence. If no saved treatment fits, you may suggest a short reviewable treatment-definition idea, but never claim it was created, applied, or scheduled. If a photo is provided, use it only as supporting context and do not overstate certainty. Return plain text only, no markdown.',
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

    return NextResponse.json({
      answer,
      eventId: event.id,
      treatmentOptions: availableTreatments.slice(0, 3).map((treatment) => ({
        id: treatment.id,
        name: treatment.name,
        href: collectionPath(collection.slug, `/treatments?selected=${treatment.id}`),
        applyHref: collectionPath(collection.slug, `/treatments/apply?plant=${plant.id}&treatment=${treatment.id}${plant.conditions[0] ? `&condition=${plant.conditions[0].id}` : ''}`),
        startPlanHref: collectionPath(collection.slug, `/treatments?plant=${plant.id}&condition=${plant.conditions[0]?.id || ''}&selected=${treatment.id}`),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Green Thumb assist request failed.'
    await recordAiUsage({ collectionId: collection.id, userId: user.id, feature: 'AI_GREEN_THUMB', model, success: false, error: message })
    await audit(user, 'ERROR', 'AI_GREEN_THUMB', null, `Failed Green Thumb assist for ${plant.plantId}`, { model, error: message }, collection.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
