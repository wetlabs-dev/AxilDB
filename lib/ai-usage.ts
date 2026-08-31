import { NextResponse } from 'next/server'
import { requireCollectionLogger } from '@/lib/collections'
import { aiUsageCostDollars } from '@/lib/ai-pricing'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'

function positiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

function responseWebSearchCallCount(payload: any) {
  const output = Array.isArray(payload?.output) ? payload.output : []
  return output.filter((item: any) => {
    const type = typeof item?.type === 'string' ? item.type : ''
    return type === 'web_search_call' || type === 'web_search_preview_call' || type.startsWith('web_search')
  }).length
}

export function tokenUsage(payload: any, options?: {
  webSearchRequested?: boolean
  webSearchPreviewRequested?: boolean
}) {
  const usage = payload?.usage || {}
  const inputTokens = positiveInteger(usage.input_tokens ?? usage.prompt_tokens)
  const outputTokens = positiveInteger(usage.output_tokens ?? usage.completion_tokens)
  const cachedInputTokens = positiveInteger(
    usage.input_tokens_details?.cached_tokens
      ?? usage.prompt_tokens_details?.cached_tokens
      ?? usage.cached_tokens,
  )
  const totalTokens = positiveInteger(usage.total_tokens) || ((inputTokens || 0) + (outputTokens || 0) || null)
  const discoveredSearchCalls = responseWebSearchCallCount(payload)
  const webSearchPreviewCalls = options?.webSearchPreviewRequested
    ? Math.max(1, discoveredSearchCalls)
    : 0
  const webSearchCalls = options?.webSearchRequested
    ? Math.max(1, discoveredSearchCalls)
    : (!options?.webSearchPreviewRequested ? discoveredSearchCalls : 0)
  return { inputTokens, cachedInputTokens, outputTokens, totalTokens, webSearchCalls, webSearchPreviewCalls }
}

export async function requireAiFeatureAccess(collectionSlug?: string) {
  const context = await requireCollectionLogger(collectionSlug)
  if (!context.collection.aiFeaturesEnabled && !isServerAdminRole(context.user.role)) {
    return {
      error: NextResponse.json(
        { error: 'AI features are not enabled for this collection. A collection manager can request access from Collection Settings.' },
        { status: 403 },
      ),
      context,
    }
  }
  return { context }
}

export async function recordAiUsage(input: {
  collectionId: string
  userId?: string | null
  feature: string
  model?: string | null
  usage?: {
    inputTokens?: number | null
    cachedInputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    webSearchCalls?: number | null
    webSearchPreviewCalls?: number | null
  }
  success?: boolean
  error?: string | null
}) {
  const estimatedCostDollars = input.usage ? aiUsageCostDollars(input.usage, input.model) : 0
  await prisma.aiUsageEvent.create({
    data: {
      collectionId: input.collectionId,
      userId: input.userId || null,
      feature: input.feature,
      model: input.model || null,
      inputTokens: input.usage?.inputTokens || null,
      cachedInputTokens: input.usage?.cachedInputTokens || null,
      outputTokens: input.usage?.outputTokens || null,
      totalTokens: input.usage?.totalTokens || null,
      webSearchCalls: input.usage?.webSearchCalls || 0,
      webSearchPreviewCalls: input.usage?.webSearchPreviewCalls || 0,
      estimatedCostDollars: estimatedCostDollars.toFixed(6),
      success: input.success !== false,
      error: input.error ? input.error.slice(0, 500) : null,
    },
  })
}
