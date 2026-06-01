import type { PrismaClient } from '@prisma/client'
import { recordAiUsage, tokenUsage } from '@/lib/ai-usage'
import type { BriefingSource } from '@/lib/briefing/collect'

export const BRIEFING_PROMPT_VERSION = 'collection-briefing-v1'
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'

function outputText(payload: any) {
  if (typeof payload.output_text === 'string') return payload.output_text
  const parts = payload.output
    ?.flatMap((item: any) => item.content || [])
    ?.map((content: any) => content.text)
    ?.filter(Boolean)
  return parts?.join('\n') || ''
}

function line(label: string, count: number) {
  return count ? `- ${label}: ${count}` : `- ${label}: none noted`
}

export function fallbackBriefing(source: BriefingSource, status: 'FALLBACK' | 'FAILED' = 'FALLBACK') {
  const overdue = source.careQueue.filter((item) => item.overdueDays > 0).length
  const due = source.careQueue.length
  const markdown = [
    'A concise non-AI summary is shown for today.',
    '',
    '### Needs attention',
    line('Due or overdue care queue items', due),
    line('Overdue care queue items', overdue),
    line('Open plant conditions', source.conditions.length),
    '',
    '### Coming up soon',
    line('Reminders due soon', source.reminders.length),
    line('Recent propagations to review', source.propagations.length),
    '',
    '### Worth checking',
    line('Plants not updated in more than 60 days', source.stalePlants.length),
    line('Sport candidates or sport lines', source.sports.length),
    '',
    '### Recent activity',
    line('Recent care events', source.recentCare.length),
    line('Recent notes', source.recentNotes.length),
    line('Recent photo records', source.recentPhotoMetadata.length),
    '',
    '### Quiet notes / no action needed',
    source.recentArchived.length ? `- ${source.recentArchived.length} plant${source.recentArchived.length === 1 ? '' : 's'} archived recently.` : '- No recent archive activity noted.',
  ].join('\n')

  return {
    status,
    title: "Today's Collection Briefing",
    summaryMarkdown: markdown,
    model: null,
  }
}

function dailyCollectionLimit() {
  const configured = Number(process.env.OPENAI_BRIEFING_DAILY_COLLECTION_LIMIT || 1)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 1
}

async function dailyUsage(prisma: PrismaClient, collectionId: string, now = new Date()) {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  return prisma.aiUsageEvent.count({
    where: {
      collectionId,
      feature: 'AI_COLLECTION_BRIEFING',
      success: true,
      createdAt: { gte: start },
    },
  })
}

export async function generateBriefing(prisma: PrismaClient, input: {
  collectionId: string
  userId: string
  source: BriefingSource
  force?: boolean
}) {
  if (process.env.AXILDB_AI_BRIEFING_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) {
    return fallbackBriefing(input.source)
  }

  const model = process.env.OPENAI_BRIEFING_MODEL || process.env.OPENAI_DESCRIPTION_MODEL || DEFAULT_MODEL
  if (!input.force && await dailyUsage(prisma, input.collectionId) >= dailyCollectionLimit()) {
    return fallbackBriefing(input.source)
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: [
          'You are generating a concise botanical collection briefing for AxilDB.',
          'Use only the supplied data. Do not invent observations.',
          'Use cautious language for inferred reminders.',
          'Do not include private user identity data.',
          'Do not provide medical or pesticide safety claims beyond supplied records.',
          'Write in a calm, practical, lightly warm tone.',
          'Output markdown only with these sections: Needs attention, Coming up soon, Worth checking, Recent activity, Quiet notes / no action needed.',
          'Use standard markdown headings and simple bullets. When referring to a specimen, include its plantId exactly as supplied so AxilDB can link it.',
        ].join(' '),
        input: JSON.stringify(input.source),
        max_output_tokens: 900,
        store: false,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || 'OpenAI briefing request failed.'
      await recordAiUsage({ collectionId: input.collectionId, userId: input.userId, feature: 'AI_COLLECTION_BRIEFING', model, success: false, error: message })
      return fallbackBriefing(input.source, 'FAILED')
    }

    const markdown = outputText(payload).trim()
    if (!markdown) return fallbackBriefing(input.source, 'FAILED')
    await recordAiUsage({ collectionId: input.collectionId, userId: input.userId, feature: 'AI_COLLECTION_BRIEFING', model, usage: tokenUsage(payload) })
    return {
      status: 'READY' as const,
      title: "Today's Collection Briefing",
      summaryMarkdown: markdown.slice(0, 8000),
      model,
    }
  } catch (error) {
    await recordAiUsage({
      collectionId: input.collectionId,
      userId: input.userId,
      feature: 'AI_COLLECTION_BRIEFING',
      model,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
    return fallbackBriefing(input.source, 'FAILED')
  }
}
