import { Prisma, type PrismaClient } from '@prisma/client'
import { readFile } from 'fs/promises'
import path from 'path'
import { tokenUsage } from '@/lib/ai-usage'
import { aiUsageCostDollars } from '@/lib/ai-pricing'

const OPENAI_MODERATIONS_URL = 'https://api.openai.com/v1/moderations'
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_PLANT_CHECK_MODEL = 'gpt-5.4-mini'
const DEFAULT_IMAGE_MODERATION_MODEL = 'omni-moderation-latest'
const MAX_MODERATION_FAILURES = 3

type PlantContentState = 'yes' | 'no' | 'uncertain'

export type ImageSafetyModerationResult = {
  flagged: boolean
  categories?: Record<string, boolean>
  categoryScores?: Record<string, number>
  appliedInputTypes?: Record<string, string[]>
  reason: string
  model: string
  checkedAt: Date
}

export type PlantImageAnalysisResult = {
  containsPlant: PlantContentState
  confidence: number
  primarySubject: string | null
  imageType: string | null
  usableForIdentification: boolean
  suggestedCaption: string | null
  reason: string
  model: string
  checkedAt: Date
}

type PhotoModerationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CENSORED'
  | 'NO_PLANT_DETECTED'
  | 'UNCERTAIN_PLANT_CONTENT'
  | 'MODERATION_FAILED'
  | 'REMOVED'

export function imageModerationEnabled() {
  return process.env.AXILDB_IMAGE_MODERATION_ENABLED === 'true' && Boolean(process.env.OPENAI_API_KEY)
}

function localUploadPath(photoPath: string) {
  if (!photoPath.startsWith('/uploads/') || photoPath.includes('..')) throw new Error('Only local upload photos can be moderated.')
  return path.join(process.cwd(), 'public', photoPath)
}

function outputText(payload: any) {
  if (typeof payload.output_text === 'string') return payload.output_text
  const parts = payload.output
    ?.flatMap((item: any) => item.content || [])
    ?.map((content: any) => content.text)
    ?.filter(Boolean)
  return parts?.join('\n') || ''
}

function parseJsonObject(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced?.[1] || trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Plant image check response did not contain JSON.')
  return JSON.parse(body.slice(start, end + 1))
}

function boundedConfidence(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(1, parsed))
}

function hasCaption(value?: string | null) {
  return Boolean(value && value.trim())
}

function cleanSuggestedCaption(value: unknown) {
  if (typeof value !== 'string') return null
  const caption = value
    .replace(/[\r\n*_`#]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!caption) return null

  const words = caption.split(/\s+/).slice(0, 9)
  return words.join(' ').slice(0, 80).trim() || null
}

function flaggedCategorySummary(result: any) {
  const categories = result?.categories || {}
  const flagged = Object.entries(categories)
    .filter(([, value]) => value === true)
    .map(([key]) => key)
  return flagged.length ? `Flagged by OpenAI Moderation: ${flagged.join(', ')}.` : 'Flagged by OpenAI Moderation.'
}

function plantAnalysisStatus(analysis: PlantImageAnalysisResult): PhotoModerationStatus {
  if (analysis.containsPlant === 'yes') return 'APPROVED'
  if (analysis.containsPlant === 'uncertain') return 'UNCERTAIN_PLANT_CONTENT'
  return 'NO_PLANT_DETECTED'
}

async function auditModeration(prisma: PrismaClient, input: {
  collectionId?: string | null
  action: string
  entityId: string
  summary: string
  metadata?: unknown
}) {
  await prisma.auditLog.create({
    data: {
      collectionId: input.collectionId || null,
      action: input.action,
      entityType: 'PHOTO',
      entityId: input.entityId,
      summary: input.summary,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  })
}

async function recordModerationUsage(prisma: PrismaClient, input: {
  collectionId?: string | null
  userId?: string | null
  feature: 'AI_IMAGE_MODERATION' | 'AI_IMAGE_PLANT_CHECK'
  model?: string | null
  usagePayload: any
}) {
  if (!input.collectionId) return
  const usage = tokenUsage(input.usagePayload)
  const estimatedCostDollars = aiUsageCostDollars(usage, input.model)
  await prisma.aiUsageEvent.create({
    data: {
      collectionId: input.collectionId,
      userId: input.userId || null,
      feature: input.feature,
      model: input.model || null,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      webSearchCalls: usage.webSearchCalls,
      webSearchPreviewCalls: usage.webSearchPreviewCalls,
      estimatedCostDollars: estimatedCostDollars.toFixed(6),
    },
  })
}

async function imageDataUrl(photoPath: string) {
  const image = await readFile(localUploadPath(photoPath))
  return `data:image/jpeg;base64,${image.toString('base64')}`
}

async function runOpenAiModeration(photoPath: string): Promise<{ result: ImageSafetyModerationResult; usagePayload: any }> {
  const model = process.env.OPENAI_IMAGE_MODERATION_MODEL || DEFAULT_IMAGE_MODERATION_MODEL
  const dataUrl = await imageDataUrl(photoPath)
  const response = await fetch(OPENAI_MODERATIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text: 'Classify this uploaded AxilDB image for unsafe, NSFW, graphic, self-harm, sexual, hateful, harassing, violent, or illicit content.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || 'OpenAI Moderation API failed.')
  const first = payload.results?.[0]
  if (!first || typeof first.flagged !== 'boolean') throw new Error('OpenAI Moderation API returned an unreadable result.')
  return {
    usagePayload: payload,
    result: {
      flagged: first.flagged,
      categories: first.categories || undefined,
      categoryScores: first.category_scores || undefined,
      appliedInputTypes: first.category_applied_input_types || undefined,
      reason: first.flagged ? flaggedCategorySummary(first) : 'OpenAI Moderation did not flag unsafe content.',
      model: payload.model || model,
      checkedAt: new Date(),
    },
  }
}

async function runPlantImageCheck(photoPath: string, options: { requestCaption: boolean }): Promise<{ result: PlantImageAnalysisResult; usagePayload: any }> {
  const model = process.env.OPENAI_PLANT_IMAGE_CHECK_MODEL
    || process.env.OPENAI_PLANT_ID_MODEL
    || DEFAULT_PLANT_CHECK_MODEL
  const dataUrl = await imageDataUrl(photoPath)
  const responseKeys = options.requestCaption
    ? 'containsPlant, confidence, primarySubject, imageType, usableForIdentification, suggestedCaption, reason'
    : 'containsPlant, confidence, primarySubject, imageType, usableForIdentification, reason'
  const captionInstruction = options.requestCaption
    ? [
        'Also include suggestedCaption because the uploader did not provide a caption.',
        'suggestedCaption must be under 10 words, plain language, no emoji, no markdown, and no punctuation unless natural.',
        'Describe the visible plant or plant photo only. Do not include user names, collection names, private data, or species/cultivar names unless visually obvious from provided image context.',
        'If plant content is absent or uncertain, use a neutral caption such as "Possible plant close-up" or "Unclear plant image"; do not pretend certainty.',
      ].join(' ')
    : 'Do not include suggestedCaption because the uploader already provided a caption.'
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: [
        'Check whether this already-safety-moderated AxilDB upload contains plant-related visual content.',
        'Do not make NSFW, safety, or policy decisions. That has already been handled by OpenAI Moderation.',
        `Return strict JSON only with keys ${responseKeys}.`,
        'containsPlant must be exactly "yes", "no", or "uncertain".',
        'Use "yes" for a live plant, plant part, bloom, cutting, propagation, botanical specimen, plant label, or clear plant-photo context.',
        'Use "uncertain" when the image might contain plant content but is cropped, blurred, obstructed, abstract, or too ambiguous to tell.',
        'Use "no" for clearly non-plant images.',
        'Do not identify the species unless it is obvious from visible text. Keep reason short.',
        captionInstruction,
      ].join(' '),
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: 'Return the plant-content JSON for this uploaded image.' },
          { type: 'input_image', image_url: dataUrl },
        ],
      }],
      max_output_tokens: 450,
      store: false,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || 'OpenAI plant image check failed.')
  const parsed = parseJsonObject(outputText(payload))
  const containsPlant = parsed.containsPlant === 'yes' || parsed.containsPlant === 'uncertain' ? parsed.containsPlant : 'no'
  return {
    usagePayload: payload,
    result: {
      containsPlant,
      confidence: boundedConfidence(parsed.confidence),
      primarySubject: typeof parsed.primarySubject === 'string' && parsed.primarySubject.trim() ? parsed.primarySubject.trim().slice(0, 140) : null,
      imageType: typeof parsed.imageType === 'string' && parsed.imageType.trim() ? parsed.imageType.trim().slice(0, 80) : null,
      usableForIdentification: Boolean(parsed.usableForIdentification),
      suggestedCaption: options.requestCaption ? cleanSuggestedCaption(parsed.suggestedCaption) : null,
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim().slice(0, 500) : 'Plant-content check completed.',
      model,
      checkedAt: new Date(),
    },
  }
}

async function upsertReview(prisma: PrismaClient, input: {
  photoId: string
  collectionId?: string | null
  uploaderUserId?: string | null
  reviewType: 'NSFW' | 'NO_PLANT_DETECTED' | 'UNCERTAIN_PLANT_CONTENT'
  reason: string
  model: string
}) {
  await prisma.imageModerationReview.upsert({
    where: { photoId_reviewType_status: { photoId: input.photoId, reviewType: input.reviewType, status: 'PENDING' } },
    update: { reason: input.reason, model: input.model },
    create: {
      photoId: input.photoId,
      collectionId: input.collectionId,
      uploaderUserId: input.uploaderUserId,
      reviewType: input.reviewType,
      reason: input.reason,
      model: input.model,
    },
  })
}

export async function processPendingImageModeration(prisma: PrismaClient, limit = 10) {
  if (!imageModerationEnabled()) return { considered: 0, processed: 0, skipped: true }
  const photos = await prisma.photo.findMany({
    where: {
      moderationStatus: 'PENDING',
      moderationFailureCount: { lt: MAX_MODERATION_FAILURES },
      path: { startsWith: '/uploads/' },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  let processed = 0
  for (const photo of photos) {
    try {
      const { result: moderation, usagePayload: moderationPayload } = await runOpenAiModeration(photo.path)
      await recordModerationUsage(prisma, {
        collectionId: photo.collectionId,
        userId: photo.uploadedByUserId,
        feature: 'AI_IMAGE_MODERATION',
        model: moderation.model,
        usagePayload: moderationPayload,
      })

      if (moderation.flagged) {
        await prisma.photo.update({
          where: { id: photo.id },
          data: {
            moderationStatus: 'CENSORED',
            nsfwFlagged: true,
            plantDetected: null,
            plantConfidence: null,
            moderationCheckedAt: moderation.checkedAt,
            moderationReason: moderation.reason,
            moderationModel: moderation.model,
            moderationResultJson: {
              flagged: moderation.flagged,
              categories: moderation.categories || {},
              categoryScores: moderation.categoryScores || {},
              appliedInputTypes: moderation.appliedInputTypes || {},
            },
            plantAnalysisJson: Prisma.JsonNull,
            moderationFailureCount: 0,
            moderationLastError: null,
          },
        })
        await upsertReview(prisma, {
          photoId: photo.id,
          collectionId: photo.collectionId,
          uploaderUserId: photo.uploadedByUserId,
          reviewType: 'NSFW',
          reason: moderation.reason,
          model: moderation.model,
        })
        await auditModeration(prisma, {
          collectionId: photo.collectionId,
          action: 'FLAG_NSFW',
          entityId: photo.id,
          summary: 'OpenAI Moderation flagged photo as unsafe.',
          metadata: { reason: moderation.reason, model: moderation.model, categories: moderation.categories },
        })
        processed += 1
        continue
      }

      const currentCaption = await prisma.photo.findFirst({
        where: { id: photo.id, collectionId: photo.collectionId },
        select: { caption: true },
      })
      const requestCaption = !hasCaption(currentCaption?.caption)
      const { result: plantAnalysis, usagePayload: plantPayload } = await runPlantImageCheck(photo.path, { requestCaption })
      await recordModerationUsage(prisma, {
        collectionId: photo.collectionId,
        userId: photo.uploadedByUserId,
        feature: 'AI_IMAGE_PLANT_CHECK',
        model: plantAnalysis.model,
        usagePayload: plantPayload,
      })

      const status = plantAnalysisStatus(plantAnalysis)
      const plantDetected = plantAnalysis.containsPlant === 'yes'
        ? true
        : plantAnalysis.containsPlant === 'no'
          ? false
          : null
      await prisma.photo.update({
        where: { id: photo.id },
        data: {
          moderationStatus: status,
          nsfwFlagged: false,
          plantDetected,
          plantConfidence: plantAnalysis.confidence,
          moderationCheckedAt: plantAnalysis.checkedAt,
          moderationReason: plantAnalysis.reason,
          moderationModel: `${moderation.model} + ${plantAnalysis.model}`,
          moderationResultJson: {
            flagged: moderation.flagged,
            categories: moderation.categories || {},
            categoryScores: moderation.categoryScores || {},
            appliedInputTypes: moderation.appliedInputTypes || {},
          },
          plantAnalysisJson: {
            containsPlant: plantAnalysis.containsPlant,
            confidence: plantAnalysis.confidence,
            primarySubject: plantAnalysis.primarySubject,
            imageType: plantAnalysis.imageType,
            usableForIdentification: plantAnalysis.usableForIdentification,
            suggestedCaption: plantAnalysis.suggestedCaption,
            suggestedCaptionRequested: requestCaption,
            reason: plantAnalysis.reason,
            model: plantAnalysis.model,
          },
          moderationFailureCount: 0,
          moderationLastError: null,
        },
      })

      if (plantAnalysis.suggestedCaption) {
        await prisma.photo.updateMany({
          where: {
            id: photo.id,
            collectionId: photo.collectionId,
            OR: [
              { caption: null },
              { caption: '' },
            ],
          },
          data: { caption: plantAnalysis.suggestedCaption },
        })
      }

      if (status === 'NO_PLANT_DETECTED' || status === 'UNCERTAIN_PLANT_CONTENT') {
        const reviewType = status
        await upsertReview(prisma, {
          photoId: photo.id,
          collectionId: photo.collectionId,
          uploaderUserId: photo.uploadedByUserId,
          reviewType,
          reason: plantAnalysis.reason,
          model: plantAnalysis.model,
        })
        await auditModeration(prisma, {
          collectionId: photo.collectionId,
          action: reviewType,
          entityId: photo.id,
          summary: status === 'NO_PLANT_DETECTED'
            ? 'Plant image check did not detect plant content.'
            : 'Plant image check was uncertain about plant content.',
          metadata: { reason: plantAnalysis.reason, model: plantAnalysis.model, confidence: plantAnalysis.confidence },
        })
      }
      processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const nextFailureCount = photo.moderationFailureCount + 1
      await prisma.photo.update({
        where: { id: photo.id },
        data: {
          moderationStatus: nextFailureCount >= MAX_MODERATION_FAILURES ? 'MODERATION_FAILED' : 'PENDING',
          moderationFailureCount: { increment: 1 },
          moderationLastError: message,
        },
      })
      console.error('Image moderation failed', { photoId: photo.id, error: message })
    }
  }

  return { considered: photos.length, processed, skipped: false }
}
