'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireServerAdmin } from '@/lib/auth'
import { collectionPath, requireCollectionAdmin } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { canApplyCuratorSuggestion, enqueueDefinitionResearchNow, ensureAiCuratorSettings, suggestedScalarValue } from '@/lib/ai-curator'
import { plantName } from '@/lib/utils'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const checked = (fd: FormData, key: string) => val(fd, key) === 'on' || val(fd, key) === 'true'
const boundedInt = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
const boundedFloat = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function jsonValueFromForm(value: string, fallback: unknown) {
  if (!value.trim()) return fallback as Prisma.InputJsonValue
  try {
    return JSON.parse(value) as Prisma.InputJsonValue
  } catch {
    return value.trim()
  }
}

function referenceUpdateData(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const data: Record<string, string | null> = {}
  for (const key of ['wikipediaUrl', 'inaturalistUrl', 'powoUrl', 'gbifUrl', 'description']) {
    if (Object.prototype.hasOwnProperty.call(input, key)) data[key] = String(input[key] || '').trim() || null
  }
  return data
}

export async function updateAiCuratorSettings(fd: FormData) {
  await requireServerAdmin()
  const current = await ensureAiCuratorSettings(prisma)
  await prisma.aiCuratorSettings.update({
    where: { id: current.id },
    data: {
      enabled: checked(fd, 'enabled'),
      model: val(fd, 'model') || current.model,
      temperature: boundedFloat(val(fd, 'temperature'), current.temperature, 0, 2),
      reasoningEffort: val(fd, 'reasoningEffort') || current.reasoningEffort,
      maxTokens: boundedInt(val(fd, 'maxTokens'), current.maxTokens, 100, 8000),
      dailyBudgetDollars: boundedFloat(val(fd, 'dailyBudgetDollars'), Number(current.dailyBudgetDollars), 0, 10000).toFixed(2),
      monthlyBudgetDollars: boundedFloat(val(fd, 'monthlyBudgetDollars'), Number(current.monthlyBudgetDollars), 0, 250000).toFixed(2),
      softLimitPercent: boundedInt(val(fd, 'softLimitPercent'), current.softLimitPercent, 1, 100),
      hardLimitPercent: boundedInt(val(fd, 'hardLimitPercent'), current.hardLimitPercent, 1, 100),
      concurrency: boundedInt(val(fd, 'concurrency'), current.concurrency, 1, 16),
      cadenceMinutes: boundedInt(val(fd, 'cadenceMinutes'), current.cadenceMinutes, 1, 1440),
      timeSliceSeconds: boundedInt(val(fd, 'timeSliceSeconds'), current.timeSliceSeconds, 10, 900),
      maxAttempts: boundedInt(val(fd, 'maxAttempts'), current.maxAttempts, 1, 10),
      suggestionExpiryDays: boundedInt(val(fd, 'suggestionExpiryDays'), current.suggestionExpiryDays, 1, 365),
      rejectedSuggestionCooldownDays: boundedInt(val(fd, 'rejectedSuggestionCooldownDays'), current.rejectedSuggestionCooldownDays, 1, 365),
    },
  })
  revalidatePath('/server/ai-curator')
  redirect('/server/ai-curator?settings=updated')
}

export async function setCollectionAiCurator(fd: FormData) {
  await requireServerAdmin()
  const collectionId = val(fd, 'collectionId')
  const enabled = checked(fd, 'enabled')
  await prisma.collection.update({ where: { id: collectionId }, data: { aiCuratorEnabled: enabled } })
  if (!enabled) {
    await prisma.aiCuratorJob.updateMany({
      where: { collectionId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: {
        status: 'DEFERRED',
        blockingReason: 'AI Curator was disabled for this collection.',
        retryConditions: 'Enable AI Curator for the collection.',
      },
    })
  }
  revalidatePath('/server/collections')
  revalidatePath('/server/ai-curator')
  redirect('/server/collections')
}

export async function requestAiCuratorResearchNow(fd: FormData) {
  const collectionSlug = val(fd, 'collectionSlug')
  const plantDefinitionId = val(fd, 'plantDefinitionId')
  const back = val(fd, 'back') || collectionPath(collectionSlug, '/plants')
  const { collection } = await requireCollectionAdmin(collectionSlug)
  if (!collection.aiFeaturesEnabled || !collection.aiCuratorEnabled) {
    throw new Error('AI Curator must be enabled for this collection before research can be queued.')
  }
  await enqueueDefinitionResearchNow(prisma, collection.id, plantDefinitionId)
  revalidatePath(back.split('?')[0])
  redirect(`${back}${back.includes('?') ? '&' : '?'}curator=queued`)
}

export async function reviewAiCuratorSuggestion(fd: FormData) {
  const user = await requireServerAdmin()
  const suggestionId = val(fd, 'suggestionId')
  const action = val(fd, 'action')
  const reviewNote = val(fd, 'reviewNote') || null
  const suggestion = await prisma.aiCuratorSuggestion.findUniqueOrThrow({
    where: { id: suggestionId },
    include: { collection: true, plantDefinition: true },
  })
  if (suggestion.status !== 'PENDING') throw new Error('This AI Curator suggestion has already been reviewed.')

  if (action === 'REJECT') {
    await prisma.aiCuratorSuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedByUserId: user.id, reviewNote },
    })
    revalidatePath('/server/ai-curator')
    redirect('/server/ai-curator?review=rejected')
  }

  const overrideValue = fd.has('suggestedValueJson')
    ? jsonValueFromForm(val(fd, 'suggestedValueJson'), suggestion.suggestedValue)
    : suggestion.suggestedValue as Prisma.InputJsonValue
  let applied = false

  if (suggestion.plantDefinitionId && canApplyCuratorSuggestion(suggestion.targetField)) {
    if (suggestion.targetField === 'references') {
      const data = referenceUpdateData(overrideValue)
      if (Object.keys(data).length) {
        await prisma.plantDefinition.update({ where: { id: suggestion.plantDefinitionId }, data })
        applied = true
      }
    } else {
      const value = suggestedScalarValue(overrideValue)
      if (suggestion.targetField && value !== null) {
        await prisma.plantDefinition.update({
          where: { id: suggestion.plantDefinitionId },
          data: { [suggestion.targetField]: value },
        })
        applied = true
      }
    }
  }

  await prisma.aiCuratorSuggestion.update({
    where: { id: suggestion.id },
    data: {
      status: 'ACCEPTED',
      suggestedValue: overrideValue,
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
      reviewNote: reviewNote || (applied ? 'Accepted and applied by server admin.' : 'Accepted for manual follow-up.'),
    },
  })
  if (suggestion.plantDefinition) {
    await prisma.auditLog.create({
      data: {
        collectionId: suggestion.collectionId,
        action: 'ACCEPT',
        entityType: 'AI_CURATOR_SUGGESTION',
        entityId: suggestion.id,
        summary: `Accepted AI Curator suggestion for ${plantName(suggestion.plantDefinition)}`,
        metadata: JSON.stringify({ applied, targetField: suggestion.targetField }),
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
      },
    })
  }
  revalidatePath('/server/ai-curator')
  if (suggestion.plantDefinitionId) revalidatePath(collectionPath(suggestion.collection.slug, `/plants/${suggestion.plantDefinitionId}/edit`))
  redirect(`/server/ai-curator?review=${applied ? 'accepted' : 'accepted-manual'}`)
}

export async function resolveAiCuratorJob(fd: FormData) {
  await requireServerAdmin()
  const jobId = val(fd, 'jobId')
  const action = val(fd, 'action')
  if (action === 'CANCEL') {
    await prisma.aiCuratorJob.update({ where: { id: jobId }, data: { status: 'CANCELLED', completedAt: new Date(), resultSummary: 'Cancelled by server admin.' } })
  } else if (action === 'RETRY') {
    await prisma.aiCuratorJob.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        blockingReason: null,
        humanActionRequired: null,
        retryConditions: null,
        nextRetryAt: null,
      },
    })
  }
  revalidatePath('/server/ai-curator')
  redirect('/server/ai-curator')
}
