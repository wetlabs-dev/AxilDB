import type { PrismaClient } from '@prisma/client'
import { collectBriefingSource } from '@/lib/briefing/collect'
import { BRIEFING_PROMPT_VERSION, fallbackBriefing, generateBriefing } from '@/lib/briefing/generate'
import { dateInputValue, timeZoneForPreference } from '@/lib/time'

export async function getOrCreateTodaysCollectionBriefing(prisma: PrismaClient, options: {
  collectionId: string
  collectionSlug: string
  userId: string
  timezone?: string | null
  force?: boolean
}) {
  const timezone = timeZoneForPreference({ timezone: options.timezone })
  const localDate = dateInputValue(new Date(), timezone)

  if (!options.force) {
    const existing = await prisma.collectionBriefing.findUnique({
      where: { collectionId_localDate: { collectionId: options.collectionId, localDate } },
    })
    if (existing) return existing
  } else {
    await prisma.collectionBriefing.deleteMany({ where: { collectionId: options.collectionId, localDate } })
  }

  const source = await collectBriefingSource(prisma, { ...options, timezone })
  const reserved = fallbackBriefing(source)
  let placeholder
  try {
    placeholder = await prisma.collectionBriefing.create({
      data: {
        collectionId: options.collectionId,
        localDate,
        timezone,
        model: null,
        promptVersion: BRIEFING_PROMPT_VERSION,
        sourceHash: source.sourceHash,
        status: 'FALLBACK',
        title: reserved.title,
        summaryMarkdown: reserved.summaryMarkdown,
        structuredJson: source as any,
        generatedByUserId: options.userId,
      },
    })
  } catch {
    const existing = await prisma.collectionBriefing.findUnique({
      where: { collectionId_localDate: { collectionId: options.collectionId, localDate } },
    })
    if (existing) return existing
    throw new Error('Unable to reserve today’s collection briefing.')
  }

  const generated = await generateBriefing(prisma, {
    collectionId: options.collectionId,
    userId: options.userId,
    source,
    force: options.force,
  })

  return prisma.collectionBriefing.update({
    where: { id: placeholder.id },
    data: {
      timezone,
      model: generated.model,
      promptVersion: BRIEFING_PROMPT_VERSION,
      sourceHash: source.sourceHash,
      status: generated.status,
      title: generated.title,
      summaryMarkdown: generated.summaryMarkdown,
      structuredJson: source as any,
      generatedAt: new Date(),
      generatedByUserId: options.userId,
    },
  })
}
