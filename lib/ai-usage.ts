import { NextResponse } from 'next/server'
import { requireCollectionLogger } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'

export function tokenUsage(payload: any) {
  const usage = payload?.usage || {}
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || null
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || null
  const totalTokens = Number(usage.total_tokens ?? ((inputTokens || 0) + (outputTokens || 0))) || null
  return { inputTokens, outputTokens, totalTokens }
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
  usage?: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null }
  success?: boolean
  error?: string | null
}) {
  await prisma.aiUsageEvent.create({
    data: {
      collectionId: input.collectionId,
      userId: input.userId || null,
      feature: input.feature,
      model: input.model || null,
      inputTokens: input.usage?.inputTokens || null,
      outputTokens: input.usage?.outputTokens || null,
      totalTokens: input.usage?.totalTokens || null,
      success: input.success !== false,
      error: input.error ? input.error.slice(0, 500) : null,
    },
  })
}
