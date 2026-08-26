import { createHash, randomUUID } from 'crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { evaluatePlantDefinitionCompletenessBatch, type CompletenessCategoryKey, type PlantDefinitionCompleteness } from '@/lib/plant-definition-completeness'
import { tokenUsage } from '@/lib/ai-usage'
import { estimateAiCostDollars, tokenUsageCostDollars } from '@/lib/ai-pricing'
import { backgroundServiceHealth } from '@/lib/background-services'
import { plantName } from '@/lib/utils'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const SETTINGS_ID = 'global'
const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING', 'DEFERRED', 'WAITING_FOR_HUMAN']
const TERMINAL_JOB_STATUSES = ['COMPLETED', 'SKIPPED', 'CANCELLED', 'EXPIRED']
const SIMPLE_ACCEPT_FIELDS = ['description', 'authority', 'wikipediaUrl', 'inaturalistUrl', 'powoUrl', 'gbifUrl'] as const

type CuratorPhase = 'ENRICHMENT' | 'REVIEW' | 'STEWARDSHIP'
export type CuratorJobInput = {
  collectionId: string
  plantDefinitionId?: string | null
  phase: CuratorPhase
  jobType: string
  targetField?: string | null
  targetEntityType?: string | null
  targetEntityId?: string | null
  reason: string
  priority: number
  dataHash: string
  manualBoost?: boolean
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date = new Date()) {
  const day = startOfLocalDay(date)
  day.setDate(day.getDate() - day.getDay())
  return day
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function dollars(value: unknown) {
  if (value == null) return 0
  return Number(value) || 0
}

function hashPayload(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
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
  if (start < 0 || end < start) throw new Error('AI Curator response did not contain JSON.')
  return JSON.parse(body.slice(start, end + 1))
}

function boundedConfidence(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(1, parsed))
}

function jsonOrNull(value: unknown) {
  if (value === undefined || value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

function suggestionExpiry(settings: any) {
  return addDays(new Date(), Number(settings.suggestionExpiryDays || 90))
}

function estimatedJobCost(model: string, targetField?: string | null) {
  const outputTokens = targetField === 'review' || targetField === 'stewardship' ? 1200 : 800
  return estimateAiCostDollars(1800, outputTokens, model)
}

export function curatorJobScope(input: Pick<CuratorJobInput, 'collectionId' | 'plantDefinitionId' | 'targetEntityType' | 'targetEntityId' | 'targetField'>) {
  const plantDefinitionId = input.plantDefinitionId || null
  return {
    plantDefinitionId,
    targetEntityType: input.targetEntityType || (plantDefinitionId ? 'PLANT_DEFINITION' : 'COLLECTION'),
    targetEntityId: input.targetEntityId || plantDefinitionId || input.collectionId,
    targetField: input.targetField || null,
  }
}

export async function ensureAiCuratorSettings(prisma: PrismaClient) {
  return prisma.aiCuratorSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  })
}

export function curatorPriorityScore(input: {
  completenessScore: number
  category?: CompletenessCategoryKey | 'review' | 'stewardship'
  instanceCount?: number
  estimatedCostDollars?: number
  manualBoost?: boolean
  blocked?: boolean
  ageDays?: number
}) {
  const completenessImpact = Math.max(0, 100 - input.completenessScore) * 1.6
  const gain = input.category === 'review' ? 18 : input.category === 'stewardship' ? 14 : {
    taxonomy: 28,
    husbandry: 26,
    references: 16,
    images: 12,
    authority: 18,
    fertilizer: 10,
    substrate: 12,
    tags: 6,
    validation: 8,
  }[input.category || 'references']
  const instanceWeight = Math.min(30, Math.log2((input.instanceCount || 0) + 1) * 8)
  const costEfficiency = Math.max(0, 18 - (input.estimatedCostDollars || 0) * 200)
  const dependencyReadiness = ['fertilizer', 'substrate'].includes(input.category || '') && input.completenessScore < 35 ? -20 : 0
  const manual = input.manualBoost ? 100 : 0
  const blocked = input.blocked ? -50 : 0
  const age = Math.min(25, input.ageDays || 0)
  return Math.round((completenessImpact + gain + instanceWeight + costEfficiency + dependencyReadiness + manual + blocked + age) * 10) / 10
}

async function hasDuplicateWork(prisma: PrismaClient, input: CuratorJobInput, rejectedCooldownDays: number) {
  const scope = curatorJobScope(input)
  const activeJob = await prisma.aiCuratorJob.findFirst({
    where: {
      collectionId: input.collectionId,
      jobType: input.jobType,
      phase: input.phase,
      plantDefinitionId: scope.plantDefinitionId,
      targetEntityType: scope.targetEntityType,
      targetEntityId: scope.targetEntityId,
      targetField: scope.targetField,
      status: { in: ACTIVE_JOB_STATUSES },
    },
    select: { id: true },
  })
  if (activeJob) return true

  const pendingSuggestion = await prisma.aiCuratorSuggestion.findFirst({
    where: {
      collectionId: input.collectionId,
      plantDefinitionId: scope.plantDefinitionId,
      phase: input.phase,
      targetField: scope.targetField,
      status: 'PENDING',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  })
  if (pendingSuggestion) return true

  const recentlyRejected = await prisma.aiCuratorSuggestion.findFirst({
    where: {
      collectionId: input.collectionId,
      plantDefinitionId: scope.plantDefinitionId,
      phase: input.phase,
      targetField: scope.targetField,
      status: 'REJECTED',
      reviewedAt: { gt: addDays(new Date(), -rejectedCooldownDays) },
    },
    select: { id: true },
  })
  return Boolean(recentlyRejected)
}

export async function enqueueAiCuratorJob(prisma: PrismaClient, input: CuratorJobInput) {
  const settings = await ensureAiCuratorSettings(prisma)
  const scope = curatorJobScope(input)
  if (await hasDuplicateWork(prisma, input, Number(settings.rejectedSuggestionCooldownDays || 90))) return null
  try {
    return await prisma.aiCuratorJob.create({
      data: {
        collectionId: input.collectionId,
        plantDefinitionId: scope.plantDefinitionId,
        phase: input.phase,
        jobType: input.jobType,
        targetEntityType: scope.targetEntityType,
        targetEntityId: scope.targetEntityId,
        targetField: scope.targetField,
        reason: input.reason,
        priority: input.priority,
        dataHash: input.dataHash,
        estimatedCostDollars: estimatedJobCost(settings.model, scope.targetField).toFixed(6),
        maxAttempts: settings.maxAttempts,
        model: settings.model,
        promptVersion: settings.promptVersion,
        expiresAt: suggestionExpiry(settings),
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
    throw error
  }
}

function jobsForCompleteness(collectionId: string, definition: any, completeness: PlantDefinitionCompleteness, settings: any, manualBoost = false): CuratorJobInput[] {
  const estimatedCostDollars = estimatedJobCost(settings.model)
  if (completeness.overallScore >= 90 && !completeness.provisional) {
    return [{
      collectionId,
      plantDefinitionId: definition.id,
      phase: 'REVIEW',
      jobType: 'FACT_CHECK_DEFINITION',
      targetField: 'review',
      reason: 'Definition reached practical completeness and is ready for holistic fact-checking.',
      priority: curatorPriorityScore({
        completenessScore: completeness.overallScore,
        category: 'review',
        instanceCount: definition._count?.instances || 0,
        estimatedCostDollars,
        manualBoost,
      }),
      dataHash: hashPayload({ id: definition.id, updatedAt: definition.updatedAt, phase: 'review', score: completeness.overallScore }),
      manualBoost,
    }]
  }

  return completeness.missingCategoryKeys.slice(0, manualBoost ? 5 : 3).map((category) => ({
    collectionId,
    plantDefinitionId: definition.id,
    phase: 'ENRICHMENT' as const,
    jobType: `ENRICH_${category.toUpperCase()}`,
    targetField: category,
    reason: `${completeness.statusLabel} definition is missing ${categoryLabels[category].toLowerCase()} information.`,
    priority: curatorPriorityScore({
      completenessScore: completeness.overallScore,
      category,
      instanceCount: definition._count?.instances || 0,
      estimatedCostDollars,
      manualBoost,
    }),
    dataHash: hashPayload({ id: definition.id, updatedAt: definition.updatedAt, category, score: completeness.overallScore }),
    manualBoost,
  }))
}

const categoryLabels: Record<CompletenessCategoryKey, string> = {
  taxonomy: 'taxonomy',
  husbandry: 'husbandry',
  references: 'references and description',
  images: 'type image',
  authority: 'taxonomic authority',
  fertilizer: 'fertilizer',
  substrate: 'substrate',
  tags: 'plant tags',
  validation: 'validation',
}

export async function enqueueReadinessCuratorJobs(prisma: PrismaClient, options: { collectionLimit?: number; definitionsPerCollection?: number } = {}) {
  const settings = await ensureAiCuratorSettings(prisma)
  const collections = await prisma.collection.findMany({
    where: { status: 'ACTIVE', aiFeaturesEnabled: true, aiCuratorEnabled: true },
    orderBy: { updatedAt: 'asc' },
    take: options.collectionLimit || 8,
    select: { id: true, updatedAt: true },
  })
  let created = 0

  for (const collection of collections) {
    const definitions = await prisma.plantDefinition.findMany({
      where: { collectionId: collection.id },
      orderBy: { updatedAt: 'asc' },
      take: options.definitionsPerCollection || 60,
      include: { _count: { select: { instances: true } } },
    })
    const completenessByDefinition = await evaluatePlantDefinitionCompletenessBatch(prisma, {
      collectionId: collection.id,
      definitionIds: definitions.map((definition) => definition.id),
    })
    for (const definition of definitions) {
      const completeness = completenessByDefinition.get(definition.id)
      if (!completeness) continue
      for (const job of jobsForCompleteness(collection.id, definition, completeness, settings)) {
        if (await enqueueAiCuratorJob(prisma, job)) created += 1
      }
    }

    const pendingStewardship = await prisma.aiCuratorJob.findFirst({
      where: { collectionId: collection.id, phase: 'STEWARDSHIP', status: { in: ACTIVE_JOB_STATUSES } },
      select: { id: true },
    })
    if (!pendingStewardship && definitions.length >= 2) {
      const average = Math.round([...completenessByDefinition.values()].reduce((total, item) => total + item.overallScore, 0) / completenessByDefinition.size)
      const job = await enqueueAiCuratorJob(prisma, {
        collectionId: collection.id,
        phase: 'STEWARDSHIP',
        jobType: 'COLLECTION_STEWARDSHIP_REVIEW',
        targetField: 'stewardship',
        reason: 'Look for collection-wide opportunities to link, merge, standardize, or clean up botanical records.',
        priority: curatorPriorityScore({ completenessScore: average, category: 'stewardship', estimatedCostDollars: estimatedJobCost(settings.model) }),
        dataHash: hashPayload({ collectionId: collection.id, updatedAt: collection.updatedAt, phase: 'stewardship' }),
      })
      if (job) created += 1
    }
  }

  await prisma.aiCuratorJob.updateMany({
    where: { collection: { OR: [{ aiCuratorEnabled: false }, { aiFeaturesEnabled: false }, { status: { not: 'ACTIVE' } }] }, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'DEFERRED', blockingReason: 'Collection is not currently participating in AI Curator.', retryConditions: 'Enable AI features and AI Curator for this active collection.' },
  })

  return { created, collections: collections.length }
}

export async function enqueueDefinitionResearchNow(prisma: PrismaClient, collectionId: string, plantDefinitionId: string) {
  const settings = await ensureAiCuratorSettings(prisma)
  const definition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id: plantDefinitionId, collectionId },
    include: { _count: { select: { instances: true } } },
  })
  const completenessByDefinition = await evaluatePlantDefinitionCompletenessBatch(prisma, { collectionId, definitionIds: [plantDefinitionId] })
  const completeness = completenessByDefinition.get(plantDefinitionId)
  if (!completeness) throw new Error('Plant definition readiness could not be evaluated.')
  let created = 0
  for (const job of jobsForCompleteness(collectionId, definition, completeness, settings, true)) {
    if (await enqueueAiCuratorJob(prisma, job)) created += 1
  }
  return { created, completeness }
}

export async function expireAiCuratorWork(prisma: PrismaClient, now = new Date()) {
  const [suggestions, jobs] = await Promise.all([
    prisma.aiCuratorSuggestion.updateMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', reviewNote: 'Expired before human review.' },
    }),
    prisma.aiCuratorJob.updateMany({
      where: { status: { in: ['QUEUED', 'DEFERRED'] }, expiresAt: { lte: now } },
      data: { status: 'EXPIRED', completedAt: now, resultSummary: 'Expired before processing.' },
    }),
  ])
  return { suggestions: suggestions.count, jobs: jobs.count }
}

async function currentValueForJob(prisma: PrismaClient, job: any) {
  if (!job.plantDefinitionId) return null
  const definition = await prisma.plantDefinition.findUnique({
    where: { id: job.plantDefinitionId },
    include: {
      aliases: { select: { name: true, aliasType: true, source: true } },
      tags: { include: { plantTag: { select: { name: true, category: true } } } },
      substrateRecommendations: { select: { notes: true, suitability: true } },
      husbandryGuide: true,
      taxonomicAuthority: { select: { name: true, abbreviation: true, authorityType: true } },
    },
  })
  if (!definition) return null
  if (job.targetField === 'description') return definition.description
  if (job.targetField === 'authority') return definition.authority
  if (job.targetField === 'references') return {
    wikipediaUrl: definition.wikipediaUrl,
    inaturalistUrl: definition.inaturalistUrl,
    powoUrl: definition.powoUrl,
    gbifUrl: definition.gbifUrl,
    description: definition.description,
  }
  if (job.targetField === 'tags') return definition.tags.map((tag) => tag.plantTag)
  if (job.targetField === 'taxonomy' || job.targetField === 'review') return {
    name: plantName(definition),
    genus: definition.genus,
    species: definition.species,
    hybridNotation: definition.hybridNotation,
    cultivarName: definition.cultivarName,
    authority: definition.authority,
    taxonomicAuthority: definition.taxonomicAuthority,
    references: {
      wikipediaUrl: definition.wikipediaUrl,
      inaturalistUrl: definition.inaturalistUrl,
      powoUrl: definition.powoUrl,
      gbifUrl: definition.gbifUrl,
    },
    description: definition.description,
    aliases: definition.aliases,
    tags: definition.tags.map((tag) => tag.plantTag),
    husbandryGuide: definition.husbandryGuide,
    substrateRecommendations: definition.substrateRecommendations,
  }
  return (definition as any)[job.targetField] ?? null
}

function waitingForHumanForJob(job: any) {
  if (job.targetField === 'images') return {
    blockingReason: 'AI Curator cannot create a reliable type image without a human-provided photograph.',
    humanActionRequired: 'Upload or mark a representative type image for this plant definition.',
    retryConditions: 'Retry after a type image is attached or a specimen photo is marked as representative.',
  }
  if (job.targetField === 'taxonomy') return {
    blockingReason: 'Taxonomy is incomplete enough that downstream research would be speculative.',
    humanActionRequired: 'Record the best known genus/species/cultivar placement or mark the definition as provisional.',
    retryConditions: 'Retry after the core identity is clarified.',
  }
  return null
}

async function callCuratorModel(settings: any, job: any, currentValue: unknown) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: Number(settings.temperature),
      max_output_tokens: Number(settings.maxTokens),
      reasoning: settings.reasoningEffort ? { effort: settings.reasoningEffort } : undefined,
      instructions: [
        'You are AI Curator for AxilDB, a botanical collection database.',
        'Prepare human-reviewable research suggestions only. Never instruct the system to directly modify records.',
        'Do not include private user details, emails, or unrelated collection data.',
        'Return strict JSON with keys: title, suggestedValue, reasoning, confidence, supportingReferences.',
        'supportingReferences must be an array of short objects with label and url when reliable public references are known; otherwise use an empty array.',
        'confidence must be from 0 to 1. Keep reasoning concise and explain uncertainty.',
      ].join(' '),
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: JSON.stringify({
            phase: job.phase,
            jobType: job.jobType,
            targetField: job.targetField,
            reason: job.reason,
            currentValue,
          }),
        }],
      }],
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || 'AI Curator model request failed.')
  return { payload, result: parseJsonObject(outputText(payload)) }
}

async function createSuggestionFromResult(prisma: PrismaClient, settings: any, job: any, currentValue: unknown, modelResult: any, actualCost: number | null) {
  const suggestion = await prisma.aiCuratorSuggestion.create({
    data: {
      collectionId: job.collectionId,
      plantDefinitionId: job.plantDefinitionId,
      jobId: job.id,
      phase: job.phase,
      suggestionType: job.jobType,
      targetEntityType: job.targetEntityType,
      targetEntityId: job.targetEntityId,
      targetField: job.targetField,
      title: String(modelResult.title || `${job.phase.toLowerCase()} suggestion`).slice(0, 180),
      currentValue: jsonOrNull(currentValue),
      suggestedValue: jsonOrNull(modelResult.suggestedValue),
      reasoning: String(modelResult.reasoning || 'AI Curator prepared this suggestion for human review.').slice(0, 4000),
      confidence: boundedConfidence(modelResult.confidence),
      supportingReferences: jsonOrNull(Array.isArray(modelResult.supportingReferences) ? modelResult.supportingReferences : []),
      promptVersion: settings.promptVersion,
      model: settings.model,
      estimatedCostDollars: job.estimatedCostDollars,
      actualCostDollars: actualCost == null ? undefined : actualCost.toFixed(6),
      sourceDataHash: job.dataHash,
      expiresAt: suggestionExpiry(settings),
    },
  })
  await prisma.aiCuratorJob.update({
    where: { id: job.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      actualCostDollars: actualCost == null ? undefined : actualCost.toFixed(6),
      confidence: suggestion.confidence,
      resultSummary: `Created suggestion: ${suggestion.title}`,
    },
  })
  return suggestion
}

async function claimNextJob(prisma: PrismaClient, workerId: string) {
  const now = new Date()
  const job = await prisma.aiCuratorJob.findFirst({
    where: {
      status: { in: ['QUEUED', 'DEFERRED'] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      collection: { status: 'ACTIVE', aiFeaturesEnabled: true, aiCuratorEnabled: true },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  })
  if (!job) return null
  const claimed = await prisma.aiCuratorJob.updateMany({
    where: { id: job.id, status: job.status },
    data: { status: 'RUNNING', claimedBy: workerId, claimedAt: now, attempts: { increment: 1 }, lastAttemptAt: now },
  })
  if (claimed.count !== 1) return null
  return prisma.aiCuratorJob.findUnique({ where: { id: job.id } })
}

async function processJob(prisma: PrismaClient, settings: any, job: any) {
  const humanBlock = waitingForHumanForJob(job)
  if (humanBlock) {
    await prisma.aiCuratorJob.update({
      where: { id: job.id },
      data: { status: 'WAITING_FOR_HUMAN', ...humanBlock, resultSummary: humanBlock.blockingReason },
    })
    return { status: 'WAITING_FOR_HUMAN' as const, cost: 0 }
  }
  if (!process.env.OPENAI_API_KEY) {
    await prisma.aiCuratorJob.update({
      where: { id: job.id },
      data: {
        status: 'DEFERRED',
        blockingReason: 'OPENAI_API_KEY is not configured for AI Curator.',
        retryConditions: 'Configure the OpenAI API key, then let the worker wake again.',
        nextRetryAt: addDays(new Date(), 1),
        resultSummary: 'Deferred because AI credentials are unavailable.',
      },
    })
    return { status: 'DEFERRED' as const, cost: 0 }
  }

  try {
    const currentValue = await currentValueForJob(prisma, job)
    const { payload, result } = await callCuratorModel(settings, job, currentValue)
    const usage = tokenUsage(payload)
    const actualCost = tokenUsageCostDollars(usage, settings.model)
    await createSuggestionFromResult(prisma, settings, job, currentValue, result, actualCost)
    await prisma.aiUsageEvent.create({
      data: {
        collectionId: job.collectionId,
        feature: 'AI_CURATOR',
        model: settings.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
    })
    return { status: 'COMPLETED' as const, cost: actualCost }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const exhausted = job.attempts >= job.maxAttempts
    await prisma.aiCuratorJob.update({
      where: { id: job.id },
      data: exhausted
        ? {
            status: 'WAITING_FOR_HUMAN',
            blockingReason: message.slice(0, 800),
            humanActionRequired: 'Review this job and either cancel it, adjust the definition, or retry after the underlying issue is resolved.',
            retryConditions: 'Manual review clears the blocker or changes the source record.',
            resultSummary: 'Stopped after repeated AI Curator failures.',
          }
        : {
            status: 'DEFERRED',
            blockingReason: message.slice(0, 800),
            nextRetryAt: addDays(new Date(), Math.min(7, job.attempts + 1)),
            resultSummary: 'Deferred after a model or parsing error.',
          },
    })
    return { status: exhausted ? 'WAITING_FOR_HUMAN' as const : 'DEFERRED' as const, cost: 0 }
  }
}

async function budgetSnapshot(prisma: PrismaClient, settings: any) {
  const [today, month] = await Promise.all([
    prisma.aiCuratorJob.aggregate({
      where: { completedAt: { gte: startOfLocalDay() } },
      _sum: { actualCostDollars: true, estimatedCostDollars: true },
    }),
    prisma.aiCuratorJob.aggregate({
      where: { completedAt: { gte: startOfMonth() } },
      _sum: { actualCostDollars: true, estimatedCostDollars: true },
    }),
  ])
  const todaySpend = dollars(today._sum.actualCostDollars) || dollars(today._sum.estimatedCostDollars)
  const monthSpend = dollars(month._sum.actualCostDollars) || dollars(month._sum.estimatedCostDollars)
  const dailyBudget = dollars(settings.dailyBudgetDollars)
  const monthlyBudget = dollars(settings.monthlyBudgetDollars)
  const hardLimit = Number(settings.hardLimitPercent || 100) / 100
  const softLimit = Number(settings.softLimitPercent || 80) / 100
  return {
    todaySpend,
    monthSpend,
    dailyBudget,
    monthlyBudget,
    remainingToday: Math.max(0, dailyBudget - todaySpend),
    remainingMonth: Math.max(0, monthlyBudget - monthSpend),
    hardStop: todaySpend >= dailyBudget * hardLimit || monthSpend >= monthlyBudget * hardLimit,
    softStop: todaySpend >= dailyBudget * softLimit || monthSpend >= monthlyBudget * softLimit,
  }
}

export async function processAiCuratorWake(prisma: PrismaClient) {
  const settings = await ensureAiCuratorSettings(prisma)
  const startedAt = new Date()
  if (!settings.enabled) return { status: 'STOPPED' as const, processed: 0, created: 0, summary: 'AI Curator is disabled.' }

  const expired = await expireAiCuratorWork(prisma)
  const seeded = await enqueueReadinessCuratorJobs(prisma)
  const workerId = randomUUID()
  const deadline = Date.now() + Number(settings.timeSliceSeconds || 75) * 1000
  const maxJobs = Math.max(1, Number(settings.concurrency || 1))
  let processed = 0
  let completed = 0
  let waitingForHuman = 0
  let deferred = 0
  let spent = 0

  while (processed < maxJobs && Date.now() < deadline) {
    const budget = await budgetSnapshot(prisma, settings)
    if (budget.hardStop || budget.remainingToday <= 0 || budget.remainingMonth <= 0) {
      return { status: 'WAITING' as const, processed, created: seeded.created, expired, summary: 'Budget exhausted.', spent }
    }
    const job = await claimNextJob(prisma, workerId)
    if (!job) break
    const result = await processJob(prisma, settings, job)
    processed += 1
    spent += result.cost
    if (result.status === 'COMPLETED') completed += 1
    if (result.status === 'WAITING_FOR_HUMAN') waitingForHuman += 1
    if (result.status === 'DEFERRED') deferred += 1
  }

  return {
    status: 'SUCCEEDED' as const,
    processed,
    completed,
    waitingForHuman,
    deferred,
    created: seeded.created,
    expired,
    spent,
    durationMs: Date.now() - startedAt.getTime(),
    summary: `Seeded ${seeded.created}; processed ${processed}; completed ${completed}; waiting ${waitingForHuman}; deferred ${deferred}.`,
  }
}

export async function aiCuratorDashboard(prisma: PrismaClient) {
  const settings = await ensureAiCuratorSettings(prisma)
  const now = new Date()
  const today = startOfLocalDay(now)
  const week = startOfWeek(now)
  const [queueRows, pendingSuggestions, completedToday, completedWeek, waitingJobs, currentJob, recentErrors, recentAccomplishments, enabledCollections, totalCollections, budget] = await Promise.all([
    prisma.aiCuratorJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.aiCuratorSuggestion.count({ where: { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.aiCuratorJob.count({ where: { status: 'COMPLETED', completedAt: { gte: today } } }),
    prisma.aiCuratorJob.count({ where: { status: 'COMPLETED', completedAt: { gte: week } } }),
    prisma.aiCuratorJob.findMany({
      where: { status: 'WAITING_FOR_HUMAN' },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 8,
      include: { collection: { select: { name: true, slug: true } }, plantDefinition: true },
    }),
    prisma.aiCuratorJob.findFirst({
      where: { status: 'RUNNING' },
      orderBy: { claimedAt: 'desc' },
      include: { collection: { select: { name: true, slug: true } }, plantDefinition: true },
    }),
    prisma.aiCuratorJob.findMany({
      where: { status: { in: ['DEFERRED', 'WAITING_FOR_HUMAN'] }, blockingReason: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { blockingReason: true, updatedAt: true },
    }),
    prisma.aiCuratorJob.findMany({
      where: { status: 'COMPLETED', resultSummary: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 8,
      include: { collection: { select: { name: true } }, plantDefinition: true },
    }),
    prisma.collection.count({ where: { status: 'ACTIVE', aiFeaturesEnabled: true, aiCuratorEnabled: true } }),
    prisma.collection.count({ where: { status: 'ACTIVE' } }),
    budgetSnapshot(prisma, settings),
  ])
  const queueStats = Object.fromEntries(queueRows.map((row) => [row.status, row._count._all]))
  const completedDefinitions = await prisma.plantDefinition.count({ where: { collection: { aiCuratorEnabled: true }, isValidated: true } })
  const collections = await prisma.collection.findMany({ where: { status: 'ACTIVE', aiCuratorEnabled: true }, select: { id: true } })
  let averageCompleteness = 0
  let definitionCount = 0
  for (const collection of collections.slice(0, 5)) {
    const completeness = await evaluatePlantDefinitionCompletenessBatch(prisma, { collectionId: collection.id })
    for (const result of completeness.values()) {
      averageCompleteness += result.overallScore
      definitionCount += 1
    }
  }
  averageCompleteness = definitionCount ? Math.round(averageCompleteness / definitionCount) : 0
  const health = await backgroundServiceHealth(prisma, {
    name: 'ai-curator',
    enabled: settings.enabled,
    cadence: `Every ${settings.cadenceMinutes} minutes`,
    concurrency: settings.concurrency,
    currentTask: currentJob ? `${currentJob.phase.toLowerCase()} for ${currentJob.plantDefinition ? plantName(currentJob.plantDefinition) : currentJob.collection.name}` : 'Sleeping',
    queueStats,
    runtimeMetrics: {
      dailyBudget: budget.dailyBudget,
      todaySpend: budget.todaySpend,
      pendingSuggestions,
      waitingForHuman: queueStats.WAITING_FOR_HUMAN || 0,
    },
  })

  return {
    settings,
    budget,
    queueStats,
    pendingSuggestions,
    completedToday,
    completedWeek,
    waitingJobs,
    currentJob,
    recentErrors,
    recentAccomplishments,
    enabledCollections,
    totalCollections,
    completedDefinitions,
    averageCompleteness,
    health,
    estimatedQueueCompletion: queueStats.QUEUED ? `${Math.ceil((queueStats.QUEUED || 0) / Math.max(1, settings.concurrency))} wake(s)` : 'Queue empty',
  }
}

export async function aiCuratorReviewQueue(prisma: PrismaClient) {
  const suggestions = await prisma.aiCuratorSuggestion.findMany({
    where: { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ plantDefinitionId: 'asc' }, { createdAt: 'asc' }],
    include: { collection: { select: { name: true, slug: true } }, plantDefinition: true },
  })
  const groups = new Map<string, { key: string; collectionName: string; collectionSlug: string; plantName: string; plantDefinitionId: string | null; suggestions: typeof suggestions }>()
  for (const suggestion of suggestions) {
    const key = suggestion.plantDefinitionId || `collection:${suggestion.collectionId}`
    const existing = groups.get(key)
    const group = existing || {
      key,
      collectionName: suggestion.collection.name,
      collectionSlug: suggestion.collection.slug,
      plantName: suggestion.plantDefinition ? plantName(suggestion.plantDefinition) : 'Collection stewardship',
      plantDefinitionId: suggestion.plantDefinitionId,
      suggestions: [] as typeof suggestions,
    }
    group.suggestions.push(suggestion)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function canApplyCuratorSuggestion(targetField?: string | null) {
  return SIMPLE_ACCEPT_FIELDS.includes(targetField as any) || targetField === 'references'
}

export function suggestedScalarValue(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return String((value as Record<string, unknown>).value || '').trim() || null
  }
  if (typeof value === 'string') return value.trim() || null
  return null
}
