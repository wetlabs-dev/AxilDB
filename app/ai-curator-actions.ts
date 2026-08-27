'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireServerAdmin } from '@/lib/auth'
import { collectionPath, requireCollectionAdmin } from '@/lib/collections'
import { environmentalHusbandryFields, husbandryFieldNames } from '@/lib/husbandry'
import { prisma } from '@/lib/prisma'
import { canApplyCuratorSuggestion, enqueueDefinitionResearchNow, ensureAiCuratorSettings, suggestedScalarValue } from '@/lib/ai-curator'
import { plantName } from '@/lib/utils'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const checked = (fd: FormData, key: string) => val(fd, key) === 'on' || val(fd, key) === 'true'
const aliasTypes = new Set(['SYNONYM', 'TRADE_NAME', 'OBSOLETE_TAXONOMY', 'COMMON_NAME', 'MISAPPLIED_NAME', 'SHORTHAND'])
const aliasConfidenceLevels = new Set(['CONFIRMED', 'PROBABLE', 'AI_DETERMINED', 'UNCERTAIN', 'TRADE_ASSUMED', 'DISPUTED'])
const substrateSuitabilityValues = new Set(['PREFERRED', 'RECOMMENDED', 'ACCEPTABLE', 'SPECIAL_PURPOSE'])
const fertilizerApplicationMethods = new Set(['ROOT_DRENCH', 'FOLIAR', 'TOP_DRESS', 'OTHER'])
const numericHusbandryFields = new Set(['environmentTemperatureMinC', 'environmentTemperatureMaxC', 'environmentNightTemperatureMinC', 'environmentNightTemperatureMaxC', 'environmentHumidityMinPercent', 'environmentHumidityMaxPercent', 'environmentLightMinLux', 'environmentLightMaxLux', 'environmentPhotoperiodMinHours', 'environmentPhotoperiodMaxHours'])
const booleanHusbandryFields = new Set(['environmentAvoidDrafts'])
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function suggestionRecord(value: unknown) {
  return isRecord(value) && isRecord(value.value) ? value.value : isRecord(value) ? value : {}
}

function suggestedList(value: unknown, key: string) {
  const source = suggestionRecord(value)
  if (Array.isArray(source[key])) return source[key]
  if (Array.isArray(value)) return value
  return []
}

function stringValue(value: unknown) {
  return String(value || '').trim()
}

function nullableString(value: unknown) {
  return stringValue(value) || null
}

function boundedSuggestionConfidence(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(1, parsed))
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

async function applyTagsSuggestion(suggestion: any, overrideValue: unknown, user: { id: string }) {
  const rows = suggestedList(overrideValue, 'tags')
  const ids = rows.map((row) => isRecord(row) ? stringValue(row.id || row.plantTagId) : stringValue(row)).filter(Boolean)
  const names = rows.map((row) => isRecord(row) ? stringValue(row.name || row.slug) : '').filter(Boolean)
  if (!ids.length && !names.length) return false
  const tags = await prisma.plantTag.findMany({
    where: {
      collectionId: suggestion.collectionId,
      active: true,
      OR: [
        ...(ids.length ? [{ id: { in: ids } }] : []),
        ...(names.length ? [{ name: { in: names } }, { slug: { in: names.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) } }] : []),
      ],
    },
    select: { id: true },
  })
  if (!tags.length) return false
  const result = await prisma.plantDefinitionTag.createMany({
    data: tags.map((tag) => ({
      collectionId: suggestion.collectionId,
      plantDefinitionId: suggestion.plantDefinitionId,
      plantTagId: tag.id,
      source: 'AI',
      confidence: boundedSuggestionConfidence(suggestion.confidence),
      createdByUserId: user.id,
    })),
    skipDuplicates: true,
  })
  return result.count > 0
}

async function applyAliasesSuggestion(suggestion: any, overrideValue: unknown) {
  const rows = suggestedList(overrideValue, 'aliases')
    .map((row) => {
      const record: Record<string, unknown> = isRecord(row) ? row : { name: row }
      const aliasType = stringValue(record.aliasType || 'SYNONYM').toUpperCase()
      const confidence = stringValue(record.confidence || 'AI_DETERMINED').toUpperCase()
      return {
        name: stringValue(record.name).slice(0, 200),
        aliasType: aliasTypes.has(aliasType) ? aliasType : 'SYNONYM',
        confidence: aliasConfidenceLevels.has(confidence) ? confidence : 'AI_DETERMINED',
        source: nullableString(record.source) || 'AI Curator',
        notes: nullableString(record.notes),
      }
    })
    .filter((row) => row.name)
  if (!rows.length) return false
  const existing = await prisma.plantAlias.findMany({
    where: { plantDefinitionId: suggestion.plantDefinitionId },
    select: { name: true, aliasType: true },
  })
  const existingKeys = new Set(existing.map((alias) => `${alias.name.toLowerCase()}::${alias.aliasType}`))
  const data = rows
    .filter((row) => !existingKeys.has(`${row.name.toLowerCase()}::${row.aliasType}`))
    .map((row) => ({ collectionId: suggestion.collectionId, plantDefinitionId: suggestion.plantDefinitionId, ...row }))
  if (!data.length) return false
  const result = await prisma.plantAlias.createMany({ data })
  return result.count > 0
}

async function applySubstrateSuggestion(suggestion: any, overrideValue: unknown) {
  const rows = suggestedList(overrideValue, 'recommendations')
    .map((row, index) => isRecord(row) ? {
      substrateRecipeVersionId: stringValue(row.recipeVersionId || row.substrateRecipeVersionId),
      rank: Math.max(1, Number(row.rank) || index + 1),
      suitability: substrateSuitabilityValues.has(stringValue(row.suitability).toUpperCase()) ? stringValue(row.suitability).toUpperCase() : 'RECOMMENDED',
      notes: nullableString(row.reason) || nullableString(row.notes),
      confidence: boundedSuggestionConfidence(row.confidence),
    } : null)
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.substrateRecipeVersionId))
    .slice(0, 4)
  if (!rows.length) return false
  const validVersions = await prisma.substrateRecipeVersion.findMany({
    where: { collectionId: suggestion.collectionId, status: 'ACTIVE', recipe: { archivedAt: null }, id: { in: rows.map((row) => row.substrateRecipeVersionId) } },
    select: { id: true },
  })
  const validIds = new Set(validVersions.map((version) => version.id))
  const validRows = rows.filter((row) => validIds.has(row.substrateRecipeVersionId))
  if (!validRows.length) return false
  for (const row of validRows) {
    await prisma.plantDefinitionSubstrateRecommendation.upsert({
      where: { collectionId_plantDefinitionId_substrateRecipeVersionId: { collectionId: suggestion.collectionId, plantDefinitionId: suggestion.plantDefinitionId, substrateRecipeVersionId: row.substrateRecipeVersionId } },
      update: { rank: row.rank, suitability: row.suitability, notes: row.notes, confidence: row.confidence, source: 'AI' },
      create: { collectionId: suggestion.collectionId, plantDefinitionId: suggestion.plantDefinitionId, ...row, source: 'AI' },
    })
  }
  return true
}

async function createSuggestedFertilizerRecipe(suggestion: any, rawRecipe: Record<string, unknown>) {
  const name = stringValue(rawRecipe.name).slice(0, 160)
  if (!name) return null
  const products = Array.isArray(rawRecipe.products) ? rawRecipe.products : []
  const productRows = products
    .map((row, index) => isRecord(row) ? {
      productId: stringValue(row.productId),
      amount: nullableString(row.amount),
      unit: nullableString(row.unit),
      notes: nullableString(row.notes),
      sortOrder: index,
    } : null)
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.productId))
  if (productRows.length) {
    const validProductCount = await prisma.fertilizerProduct.count({ where: { collectionId: suggestion.collectionId, active: true, id: { in: productRows.map((row) => row.productId) } } })
    if (validProductCount !== productRows.length) return null
  }
  const existing = await prisma.fertilizerRecipe.findUnique({ where: { collectionId_name: { collectionId: suggestion.collectionId, name } }, select: { id: true } })
  if (existing) return existing.id
  const recipe = await prisma.fertilizerRecipe.create({
    data: {
      collectionId: suggestion.collectionId,
      name,
      description: nullableString(rawRecipe.description) || 'AI Curator suggested fertilizer recipe draft.',
      declaredNpk: nullableString(rawRecipe.declaredNpk),
      applicationMethod: fertilizerApplicationMethods.has(stringValue(rawRecipe.applicationMethod).toUpperCase()) ? stringValue(rawRecipe.applicationMethod).toUpperCase() : 'OTHER',
      dilutionInstructions: nullableString(rawRecipe.dilutionInstructions),
      strengthLabel: nullableString(rawRecipe.strengthLabel),
      frequencyDays: Number.isFinite(Number(rawRecipe.frequencyDays)) ? Math.max(1, Math.floor(Number(rawRecipe.frequencyDays))) : null,
      frequencyNotes: nullableString(rawRecipe.frequencyNotes),
      seasonalNotes: nullableString(rawRecipe.seasonalNotes),
      safetyNotes: nullableString(rawRecipe.safetyNotes),
      notes: nullableString(rawRecipe.notes),
      active: true,
      draft: true,
      products: { create: productRows },
    },
  })
  return recipe.id
}

async function applyFertilizerSuggestion(suggestion: any, overrideValue: unknown) {
  const input = suggestionRecord(overrideValue)
  let fertilizerRecipeId = stringValue(input.fertilizerRecipeId || input.recipeId) || null
  if (!fertilizerRecipeId && isRecord(input.newRecipe)) fertilizerRecipeId = await createSuggestedFertilizerRecipe(suggestion, input.newRecipe)
  if (!fertilizerRecipeId) return false
  const recipe = await prisma.fertilizerRecipe.findFirst({ where: { id: fertilizerRecipeId, collectionId: suggestion.collectionId, active: true }, select: { id: true } })
  if (!recipe) return false
  await prisma.plantHusbandryGuide.upsert({
    where: { plantDefinitionId: suggestion.plantDefinitionId },
    update: {
      sourcePlantDefinitionId: null,
      fertilizerRecipeId: recipe.id,
      fertilizationCadenceDays: Number.isFinite(Number(input.fertilizationCadenceDays)) ? Math.max(1, Math.floor(Number(input.fertilizationCadenceDays))) : undefined,
      aiModel: suggestion.model,
      aiGeneratedAt: new Date(),
    },
    create: {
      collectionId: suggestion.collectionId,
      plantDefinitionId: suggestion.plantDefinitionId,
      fertilizerRecipeId: recipe.id,
      fertilizationCadenceDays: Number.isFinite(Number(input.fertilizationCadenceDays)) ? Math.max(1, Math.floor(Number(input.fertilizationCadenceDays))) : undefined,
      aiModel: suggestion.model,
      aiGeneratedAt: new Date(),
    },
  })
  return true
}

async function applyTaxonomicAuthoritySuggestion(suggestion: any, overrideValue: unknown) {
  const input = suggestionRecord(overrideValue)
  const taxonomicAuthorityId = stringValue(input.taxonomicAuthorityId || input.authorityId)
  if (!taxonomicAuthorityId) return false
  const authority = await prisma.taxonomicAuthority.findFirst({ where: { id: taxonomicAuthorityId, OR: [{ collectionId: suggestion.collectionId }, { collectionId: null }] }, select: { id: true } })
  if (!authority) return false
  await prisma.plantDefinition.update({
    where: { id: suggestion.plantDefinitionId },
    data: {
      taxonomicAuthorityId: authority.id,
      taxonomicAuthoritySource: 'AI',
      taxonomicAuthorityMatchReason: nullableString(input.matchReason) || 'AI Curator suggested this authority covers the definition.',
      taxonomicAuthorityMatchPriority: 0,
    },
  })
  return true
}

async function applyHusbandrySuggestion(suggestion: any, overrideValue: unknown) {
  const input = suggestionRecord(overrideValue)
  const fields = isRecord(input.fields) ? input.fields : input
  const data: Record<string, string | number | boolean | null | Date> = {
    sourcePlantDefinitionId: null,
    reviewStatus: 'DRAFT',
    reviewNotes: 'Accepted AI Curator husbandry suggestion.',
    aiModel: suggestion.model || null,
    aiGeneratedAt: new Date(),
  }
  for (const field of [...husbandryFieldNames, ...environmentalHusbandryFields]) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) continue
    const value = fields[field]
    if (numericHusbandryFields.has(field)) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) data[field] = field.includes('Lux') ? Math.floor(parsed) : parsed
    } else if (booleanHusbandryFields.has(field)) {
      data[field] = value === true || String(value).toLowerCase() === 'true'
    } else {
      data[field] = nullableString(value)
    }
  }
  if (Object.keys(data).length <= 5) return false
  await prisma.plantHusbandryGuide.upsert({
    where: { plantDefinitionId: suggestion.plantDefinitionId },
    update: data as any,
    create: { collectionId: suggestion.collectionId, plantDefinitionId: suggestion.plantDefinitionId, ...data } as any,
  })
  return true
}

async function applyCuratorSuggestionValue(suggestion: any, overrideValue: unknown, user: { id: string }) {
  if (!suggestion.plantDefinitionId || !canApplyCuratorSuggestion(suggestion.targetField)) return false
  if (suggestion.targetField === 'references') {
    const data = referenceUpdateData(overrideValue)
    if (!Object.keys(data).length) return false
    await prisma.plantDefinition.update({ where: { id: suggestion.plantDefinitionId }, data })
    return true
  }
  if (suggestion.targetField === 'tags') return applyTagsSuggestion(suggestion, overrideValue, user)
  if (suggestion.targetField === 'aliases') return applyAliasesSuggestion(suggestion, overrideValue)
  if (suggestion.targetField === 'substrate') return applySubstrateSuggestion(suggestion, overrideValue)
  if (suggestion.targetField === 'fertilizer') return applyFertilizerSuggestion(suggestion, overrideValue)
  if (suggestion.targetField === 'authority') return applyTaxonomicAuthoritySuggestion(suggestion, overrideValue)
  if (suggestion.targetField === 'husbandry') return applyHusbandrySuggestion(suggestion, overrideValue)
  const value = suggestedScalarValue(overrideValue)
  if (!suggestion.targetField || value === null) return false
  await prisma.plantDefinition.update({
    where: { id: suggestion.plantDefinitionId },
    data: { [suggestion.targetField]: value },
  })
  return true
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
  const applied = await applyCuratorSuggestionValue(suggestion, overrideValue, user)

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
