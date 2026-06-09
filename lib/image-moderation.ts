import type { PrismaClient } from '@prisma/client'
import { readFile } from 'fs/promises'
import path from 'path'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'

export type ImageModerationResult = {
  nsfwFlagged: boolean
  nsfwReason?: string | null
  plantDetected: boolean
  plantConfidence?: number | null
  plantReason?: string | null
  model: string
  checkedAt: Date
}

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
  if (start < 0 || end < start) throw new Error('Moderation response did not contain JSON.')
  return JSON.parse(body.slice(start, end + 1))
}

function tokenUsage(payload: any) {
  const usage = payload?.usage || {}
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || null
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || null
  const totalTokens = Number(usage.total_tokens ?? ((inputTokens || 0) + (outputTokens || 0))) || null
  return { inputTokens, outputTokens, totalTokens }
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
  model?: string | null
  usagePayload: any
}) {
  if (!input.collectionId) return
  const usage = tokenUsage(input.usagePayload)
  await prisma.aiUsageEvent.create({
    data: {
      collectionId: input.collectionId,
      userId: input.userId || null,
      feature: 'AI_IMAGE_MODERATION',
      model: input.model || null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    },
  })
}

async function analyzeImage(photoPath: string, collectionId?: string | null): Promise<{ result: ImageModerationResult; usagePayload: any }> {
  const model = process.env.OPENAI_IMAGE_MODERATION_MODEL
    || process.env.OPENAI_PLANT_IMAGE_CHECK_MODEL
    || process.env.OPENAI_PLANT_ID_MODEL
    || DEFAULT_MODEL
  const image = await readFile(localUploadPath(photoPath))
  const dataUrl = `data:image/jpeg;base64,${image.toString('base64')}`
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: [
        'Review this uploaded AxilDB image for safety and plant relevance.',
        'Return strict JSON only with keys nsfwFlagged, nsfwReason, plantDetected, plantConfidence, plantReason.',
        'nsfwFlagged should be true for explicit sexual content, nudity, graphic sexual content, or clearly inappropriate adult imagery.',
        'plantDetected should be true when a live plant, plant part, bloom, cutting, propagation, botanical specimen, or plant label/photo context is visible.',
        'Do not identify the plant species. Do not include unrelated details.',
      ].join(' '),
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: 'Moderate this image and check whether it appears to contain plant-related visual content.' },
          { type: 'input_image', image_url: dataUrl },
        ],
      }],
      max_output_tokens: 350,
      store: false,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || 'OpenAI image moderation failed.')
  const parsed = parseJsonObject(outputText(payload))
  return {
    usagePayload: payload,
    result: {
      nsfwFlagged: Boolean(parsed.nsfwFlagged),
      nsfwReason: typeof parsed.nsfwReason === 'string' ? parsed.nsfwReason : null,
      plantDetected: Boolean(parsed.plantDetected),
      plantConfidence: typeof parsed.plantConfidence === 'number' ? Math.max(0, Math.min(1, parsed.plantConfidence)) : null,
      plantReason: typeof parsed.plantReason === 'string' ? parsed.plantReason : null,
      model,
      checkedAt: new Date(),
    },
  }
}

export async function processPendingImageModeration(prisma: PrismaClient, limit = 10) {
  if (!imageModerationEnabled()) return { considered: 0, processed: 0, skipped: true }
  const photos = await prisma.photo.findMany({
    where: {
      moderationStatus: 'PENDING',
      moderationFailureCount: { lt: 3 },
      path: { startsWith: '/uploads/' },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  let processed = 0
  for (const photo of photos) {
    try {
      const { result, usagePayload } = await analyzeImage(photo.path, photo.collectionId)
      const status = result.nsfwFlagged
        ? 'CENSORED'
        : result.plantDetected
          ? 'APPROVED'
          : 'NEEDS_UPLOADER_CONFIRMATION'
      const reason = result.nsfwFlagged
        ? result.nsfwReason || 'Image was flagged as inappropriate.'
        : result.plantDetected
          ? result.plantReason || 'Plant content detected.'
          : result.plantReason || 'No plant detected.'

      await prisma.photo.update({
        where: { id: photo.id },
        data: {
          moderationStatus: status,
          nsfwFlagged: result.nsfwFlagged,
          plantDetected: result.plantDetected,
          plantConfidence: result.plantConfidence,
          moderationCheckedAt: result.checkedAt,
          moderationReason: reason,
          moderationModel: result.model,
          moderationLastError: null,
        },
      })

      if (status === 'CENSORED') {
        await prisma.imageModerationReview.upsert({
          where: { photoId_reviewType_status: { photoId: photo.id, reviewType: 'NSFW', status: 'PENDING' } },
          update: { reason, model: result.model },
          create: {
            photoId: photo.id,
            collectionId: photo.collectionId,
            uploaderUserId: photo.uploadedByUserId,
            reviewType: 'NSFW',
            reason,
            model: result.model,
          },
        })
        await auditModeration(prisma, {
          collectionId: photo.collectionId,
          action: 'FLAG_NSFW',
          entityId: photo.id,
          summary: 'Image moderation flagged photo as inappropriate.',
          metadata: { reason, model: result.model },
        })
      } else if (status === 'NEEDS_UPLOADER_CONFIRMATION') {
        await prisma.imageModerationReview.upsert({
          where: { photoId_reviewType_status: { photoId: photo.id, reviewType: 'NO_PLANT_DETECTED', status: 'PENDING' } },
          update: { reason, model: result.model },
          create: {
            photoId: photo.id,
            collectionId: photo.collectionId,
            uploaderUserId: photo.uploadedByUserId,
            reviewType: 'NO_PLANT_DETECTED',
            reason,
            model: result.model,
          },
        })
        await auditModeration(prisma, {
          collectionId: photo.collectionId,
          action: 'NO_PLANT_DETECTED',
          entityId: photo.id,
          summary: 'Image moderation did not detect plant content.',
          metadata: { reason, model: result.model },
        })
      }
      await recordModerationUsage(prisma, { collectionId: photo.collectionId, userId: photo.uploadedByUserId, model: result.model, usagePayload })
      processed += 1
    } catch (error) {
      await prisma.photo.update({
        where: { id: photo.id },
        data: {
          moderationFailureCount: { increment: 1 },
          moderationLastError: error instanceof Error ? error.message : String(error),
        },
      })
      console.error('Image moderation failed', { photoId: photo.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return { considered: photos.length, processed, skipped: false }
}
