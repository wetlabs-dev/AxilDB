import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma as database } from '@/lib/prisma'
import { type AuthUser } from '@/lib/auth'
import { collectionPath, requireCollectionAdmin, requireCollectionLogger } from '@/lib/collections'
import { addCalendarDays, calendarDayIndexInTimeZone, formatDate, parseDateLocal, timeZoneForPreference } from '@/lib/time'
import { nextOccurrence } from '@/lib/reminders'
import { descendantLocationIds } from '@/lib/locations'
import { getCareQueue } from '@/lib/care-queue'
import { emitDomainEvent } from '@/lib/events/emit'
import { requireSubstrateRecipeVersion, setPlantSubstrate, substrateModes } from '@/lib/substrates'
import { executeCareOperation, type CareOperationIdentity } from '@/lib/care-queue-operations'
import type { CareQueueAction } from '@/lib/care-queue-optimistic'

export type MutationContext = Awaited<ReturnType<typeof requireCollectionLogger>>
export type MutationResult = { destination?: string; duplicate?: boolean; events?: number; completed?: number; skipped?: number }
const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim() || undefined
const clearableVal = (fd: FormData, key: string) => fd.has(key) ? val(fd, key) || null : undefined
const boundedInt = (value: string | undefined, fallback: number, min: number, max: number) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback
// Existing mutation boundaries now run inside the operation receipt's outer transaction.
const withinMutation = <T>(tx: Prisma.TransactionClient, run: (tx: Prisma.TransactionClient) => Promise<T>) => run(tx)
async function mutationAudit(tx: Prisma.TransactionClient, user: AuthUser | null, action: string, entityType: string, entityId?: string | null, summary?: string, metadata?: unknown, collectionId?: string | null) {
  await tx.auditLog.create({ data: { collectionId, userId: user?.id, userEmail: user?.email, userRole: user?.role, action, entityType, entityId, summary, metadata: metadata ? JSON.stringify(metadata) : undefined } })
}
async function verifiedFertilizerRecipeId(tx: Prisma.TransactionClient, collectionId: string, recipeId?: string | null) {
  if (!recipeId) return null
  return (await tx.fertilizerRecipe.findFirstOrThrow({ where: { id: recipeId, collectionId }, select: { id: true } })).id
}
async function requireMutationReminder(tx: Prisma.TransactionClient, context: MutationContext, id: string) {
  const reminder = await tx.reminder.findFirstOrThrow({ where: { id, collectionId: context.collection.id }, include: { user: { include: { emailPreference: true } } } })
  if (reminder.userId !== context.user.id) await requireCollectionAdmin(context.collection.slug)
  return { reminder }
}
export const careEventForTask = (taskType?: string | null) => {
  if (taskType === 'PRUNE') return 'PRUNED'
  if (taskType === 'WATER') return 'WATERED'
  if (taskType === 'FERTILIZE') return 'FERTILIZED'
  if (taskType === 'REPOT') return 'REPOTTED'
  if (taskType === 'PROPAGATION_CHECK') return 'PROPAGATION_CHECK'
  if (taskType === 'PEST_CHECK') return 'PEST_CHECK'
  if (taskType === 'HEALTH_CHECK') return 'HEALTH_CHECK'
  if (taskType === 'BLOOM_CHECK') return 'BLOOM_CHECK'
  return 'OTHER'
}
const careEventForBulkCare = (careType?: string | null) => {
  if (careType === 'WATERING') return 'WATERED'
  if (careType === 'FERTILIZING') return 'FERTILIZED'
  if (careType === 'REPOTTING') return 'REPOTTED'
  if (careType === 'PEST_CHECK') return 'PEST_CHECK'
  if (careType === 'HEALTH_CHECK') return 'HEALTH_CHECK'
  if (careType === 'PROPAGATION_CHECK') return 'PROPAGATION_CHECK'
  if (careType === 'BLOOM_CHECK') return 'BLOOM_CHECK'
  return 'OTHER'
}
const domainEventForCare = (eventType: string) => {
  if (eventType === 'WATERED') return 'care.watered' as const
  if (eventType === 'FERTILIZED') return 'care.fertilized' as const
  if (eventType === 'REPOTTED') return 'care.repotting_completed' as const
  if (eventType === 'PEST_CHECK') return 'care.pest_checked' as const
  return 'care.health_checked' as const
}
const queueTaskForBulkCare = (careType?: string | null) => {
  if (careType === 'WATERING') return 'WATER'
  if (careType === 'FERTILIZING') return 'FERTILIZE'
  if (['PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK'].includes(careType || '')) return careType
  if (careType === 'OTHER') return 'REMINDER'
  return null
}
const conditionSeverityValue = (value?: string | null) =>
  ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(value || '') ? value! : 'MODERATE'
const conditionStatusValue = (value?: string | null) =>
  ['OPEN', 'IMPROVING', 'RESOLVED'].includes(value || '') ? value! : 'OPEN'
const conditionQueueTaskType = (category?: string | null, taskType?: string | null) =>
  taskType === 'PEST_CHECK' || category === 'PESTS' ? 'PEST_CHECK' : 'HEALTH_CHECK'

function appendConditionNote(existing: string | null | undefined, note: string | undefined, label: string) {
  if (!note) return existing || null
  const entry = `[${new Date().toISOString()}] ${label}: ${note}`
  return [existing, entry].filter(Boolean).join('\n\n')
}

async function complete(prisma: Prisma.TransactionClient, context: MutationContext, fd: FormData): Promise<MutationResult> {
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const taskType = val(fd, 'taskType') || 'OTHER'
  const reminderId = val(fd, 'reminderId')

  if (reminderId) {
    const { reminder } = await requireMutationReminder(prisma, context, reminderId)
    const completedAt = new Date()
    const reminderTimezone = timeZoneForPreference(reminder.user.emailPreference)
    const nextSendAt = nextOccurrence(completedAt, reminder.rrule, reminderTimezone)
    await prisma.reminder.update({
      where: { id: reminderId },
      data: nextSendAt
        ? { dueAt: nextSendAt, nextSendAt, completedAt: null }
        : { completedAt, nextSendAt: null },
    })
    if (reminder.entityType === 'PLANT_INSTANCE' && reminder.entityId) {
      await prisma.plantCareAdjustment.updateMany({
        where: { collectionId: context.collection.id, plantInstanceId: reminder.entityId, taskType: 'REMINDER' },
        data: { snoozedUntil: null, nextDueAt: null },
      })
    }
    await mutationAudit(prisma, context.user, 'COMPLETE', 'REMINDER', reminderId, `Completed care reminder ${reminder.title}`, undefined, context.collection.id)
    return {}
  }

  const plantInstanceId = val(fd, 'plantInstanceId')!
  const plant = await prisma.plantInstance.findFirstOrThrow({
    where: { id: plantInstanceId, collectionId: context.collection.id, status: 'ACTIVE' },
    select: { id: true, plantId: true },
  })
  const fertilizerRecipeId = taskType === 'FERTILIZE'
    ? await verifiedFertilizerRecipeId(prisma, context.collection.id, val(fd, 'fertilizerRecipeId') || null)
    : null
  const substrateMode = taskType === 'REPOT' && substrateModes.includes(val(fd, 'substrateMode') as any)
    ? val(fd, 'substrateMode')!
    : null
  if (taskType === 'REPOT' && !substrateMode) throw new Error('Choose the new substrate type.')
  const substrateRecipeVersionId = substrateMode === 'RECIPE'
    ? (await requireSubstrateRecipeVersion(prisma, context.collection.id, val(fd, 'substrateRecipeVersionId')))?.id || null
    : null
  const performedAt = parseDateLocal(val(fd, 'performedAt'), timezone) || new Date()

  const event = await withinMutation(prisma, async (tx) => {
    const created = await tx.plantCareEvent.create({ data: {
      collectionId: context.collection.id,
      plantInstanceId,
      userId: context.user.id,
      eventType: careEventForTask(taskType),
      performedAt,
      notes: val(fd, 'notes'),
      fertilizerRecipeId,
      substrateRecipeVersionId,
      metadata: {
        taskType,
        conditionId: val(fd, 'conditionId') || null,
        bloomEventId: val(fd, 'bloomEventId') || null,
        fertilizerRecipeId,
        fertilizerStrength: val(fd, 'fertilizerStrength') || null,
        fertilizerDose: val(fd, 'fertilizerDose') || null,
        fertilizerWaterVolume: val(fd, 'fertilizerWaterVolume') || null,
        substrateMode,
        substrateRecipeVersionId,
      },
    } })
    if (taskType === 'REPOT' && substrateMode) {
      await setPlantSubstrate(tx, {
        collectionId: context.collection.id,
        plantInstanceId,
        mode: substrateMode,
        recipeVersionId: substrateRecipeVersionId,
        description: val(fd, 'receivedSubstrateDescription') || null,
        notes: val(fd, 'substrateNotes') || val(fd, 'notes') || null,
        startedAt: performedAt,
        reason: 'Repotted from care queue',
        changedByUserId: context.user.id,
        repottingCareEventId: created.id,
      })
    }
    await tx.plantCareAdjustment.updateMany({
    where: { collectionId: context.collection.id, plantInstanceId, taskType },
    data: { snoozedUntil: null, nextDueAt: null },
    })
    await emitDomainEvent(tx, {
      eventType: domainEventForCare(created.eventType), collectionId: context.collection.id, aggregateId: created.id,
      actor: { id: context.user.id, role: context.user.role }, occurredAt: created.performedAt,
      idempotencyKey: `care:${created.id}:created`, payload: { subjectId: created.id, recordId: created.id, recordType: 'PlantCareEvent', plantInstanceId, plantId: plant.plantId, displayName: plant.plantId, taskType, summary: created.notes || undefined, fertilizerRecipeId, substrateRecipeVersionId },
    })
    return created
  })
  await mutationAudit(prisma, context.user, 'CREATE', 'PLANT_CARE_EVENT', event.id, `Completed ${taskType.toLowerCase().replaceAll('_', ' ')} for ${plant.plantId}`, undefined, context.collection.id)
  return {}
}

async function snooze(prisma: Prisma.TransactionClient, context: MutationContext, fd: FormData): Promise<MutationResult> {
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const taskType = val(fd, 'taskType')!
  await prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: context.collection.id }, select: { id: true } })
  const days = boundedInt(val(fd, 'days'), 1, 1, 30)
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const snoozedUntil = addCalendarDays(new Date(), days, timeZoneForPreference(preferences))

  await prisma.plantCareAdjustment.upsert({
    where: { collectionId_plantInstanceId_taskType: { collectionId: context.collection.id, plantInstanceId, taskType } },
    create: {
      collectionId: context.collection.id,
      plantInstanceId,
      userId: context.user.id,
      taskType,
      snoozedUntil,
    },
    update: { snoozedUntil, disabled: false, userId: context.user.id },
  })
  await mutationAudit(prisma, context.user, 'SNOOZE', 'PLANT_CARE_ADJUSTMENT', plantInstanceId, `Snoozed ${taskType.toLowerCase().replaceAll('_', ' ')} for ${days} day${days === 1 ? '' : 's'}`, undefined, context.collection.id)
  return {}
}

async function resolve(prisma: Prisma.TransactionClient, context: MutationContext, fd: FormData): Promise<MutationResult> {
  const conditionId = val(fd, 'conditionId')!
  const condition = await prisma.plantCondition.findFirstOrThrow({
    where: { id: conditionId, collectionId: context.collection.id, status: { in: ['OPEN', 'IMPROVING'] } },
    include: { plantInstance: { select: { id: true, plantId: true } } },
  })
  const taskType = conditionQueueTaskType(condition.category, val(fd, 'taskType'))
  const performedAt = new Date()
  const note = val(fd, 'resolutionNote') || val(fd, 'notes')

  await withinMutation(prisma, async (tx) => {
    await tx.plantCondition.update({
      where: { id: condition.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: performedAt,
        followUpAt: null,
        notes: appendConditionNote(condition.notes, note, 'Resolved from care queue'),
      },
    })
    await tx.plantCareEvent.create({
      data: {
        collectionId: context.collection.id,
        plantInstanceId: condition.plantInstanceId,
        userId: context.user.id,
        eventType: careEventForTask(taskType),
        performedAt,
        notes: note || `Resolved ${condition.category.toLowerCase().replaceAll('_', ' ')} condition.`,
        metadata: {
          source: 'CARE_QUEUE_CONDITION_RESOLVE',
          taskType,
          conditionId: condition.id,
        },
      },
    })
    await tx.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId: condition.plantInstanceId, taskType },
      data: { snoozedUntil: null, nextDueAt: null },
    })
  })

  await mutationAudit(prisma, context.user, 'RESOLVE', 'PLANT_CONDITION', condition.id, `Resolved ${condition.category.toLowerCase().replaceAll('_', ' ')} for ${condition.plantInstance.plantId}`, { source: 'CARE_QUEUE' }, context.collection.id)
  return {}
}

async function update(prisma: Prisma.TransactionClient, context: MutationContext, fd: FormData): Promise<MutationResult> {
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const conditionId = val(fd, 'conditionId')!
  const condition = await prisma.plantCondition.findFirstOrThrow({
    where: { id: conditionId, collectionId: context.collection.id, status: { in: ['OPEN', 'IMPROVING'] } },
    include: { plantInstance: { select: { id: true, plantId: true } } },
  })
  const taskType = conditionQueueTaskType(condition.category, val(fd, 'taskType'))
  const status = conditionStatusValue(val(fd, 'status'))
  const followUpAt = parseDateLocal(val(fd, 'followUpAt'), timezone) || null
  const note = val(fd, 'updateNote') || val(fd, 'notes')
  const performedAt = new Date()

  await withinMutation(prisma, async (tx) => {
    await tx.plantCondition.update({
      where: { id: condition.id },
      data: {
        severity: conditionSeverityValue(val(fd, 'severity') || condition.severity),
        status,
        followUpAt: status === 'RESOLVED' ? null : followUpAt,
        resolvedAt: status === 'RESOLVED' ? (condition.resolvedAt || performedAt) : null,
        notes: appendConditionNote(condition.notes, note, 'Updated from care queue'),
      },
    })
    await tx.plantCareEvent.create({
      data: {
        collectionId: context.collection.id,
        plantInstanceId: condition.plantInstanceId,
        userId: context.user.id,
        eventType: careEventForTask(taskType),
        performedAt,
        notes: [
          `Condition updated to ${status.toLowerCase()} / ${conditionSeverityValue(val(fd, 'severity') || condition.severity).toLowerCase()}.`,
          followUpAt && status !== 'RESOLVED' ? `Follow up ${formatDate(followUpAt, timezone)}.` : '',
          note || '',
        ].filter(Boolean).join('\n'),
        metadata: {
          source: 'CARE_QUEUE_CONDITION_UPDATE',
          taskType,
          conditionId: condition.id,
          conditionStatus: status,
        },
      },
    })
    await tx.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId: condition.plantInstanceId, taskType },
      data: { snoozedUntil: null, nextDueAt: null },
    })
  })

  await mutationAudit(prisma, context.user, 'UPDATE', 'PLANT_CONDITION', condition.id, `Updated ${condition.category.toLowerCase().replaceAll('_', ' ')} from care queue for ${condition.plantInstance.plantId}`, { source: 'CARE_QUEUE', status, followUpAt }, context.collection.id)
  return {}
}

async function attention(prisma: Prisma.TransactionClient, context: MutationContext, fd: FormData): Promise<MutationResult> {
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const conditionId = val(fd, 'conditionId')!
  const condition = await prisma.plantCondition.findFirstOrThrow({
    where: { id: conditionId, collectionId: context.collection.id, status: { in: ['OPEN', 'IMPROVING'] } },
    include: { plantInstance: { select: { id: true, plantId: true } } },
  })
  const taskType = conditionQueueTaskType(condition.category, val(fd, 'taskType'))
  const followUpAt = parseDateLocal(val(fd, 'followUpAt'), timezone) || null
  const note = val(fd, 'attentionNote') || val(fd, 'notes')
  const performedAt = new Date()

  await withinMutation(prisma, async (tx) => {
    await tx.plantCondition.update({
      where: { id: condition.id },
      data: {
        status: condition.status === 'IMPROVING' ? 'IMPROVING' : 'OPEN',
        followUpAt,
        resolvedAt: null,
        notes: appendConditionNote(condition.notes, note, 'Still needs attention from care queue'),
      },
    })
    await tx.plantCareEvent.create({
      data: {
        collectionId: context.collection.id,
        plantInstanceId: condition.plantInstanceId,
        userId: context.user.id,
        eventType: careEventForTask(taskType),
        performedAt,
        notes: [
          `Condition still needs attention.`,
          followUpAt ? `Follow up ${formatDate(followUpAt, timezone)}.` : '',
          note || '',
        ].filter(Boolean).join('\n'),
        metadata: {
          source: 'CARE_QUEUE_CONDITION_STILL_NEEDS_ATTENTION',
          taskType,
          conditionId: condition.id,
        },
      },
    })
    await tx.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId: condition.plantInstanceId, taskType },
      data: { snoozedUntil: null, nextDueAt: null },
    })
  })

  await mutationAudit(prisma, context.user, 'UPDATE', 'PLANT_CONDITION', condition.id, `Kept ${condition.category.toLowerCase().replaceAll('_', ' ')} open from care queue for ${condition.plantInstance.plantId}`, { source: 'CARE_QUEUE', followUpAt }, context.collection.id)
  return {}
}

async function establish(prisma: Prisma.TransactionClient, context: MutationContext, fd: FormData): Promise<MutationResult> {
  const plantInstanceId = val(fd, 'plantInstanceId')!
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const plant = await prisma.plantInstance.findFirstOrThrow({
    where: {
      id: plantInstanceId,
      collectionId: context.collection.id,
      status: 'ACTIVE',
      instanceType: { in: ['PROPAGATION', 'ACQUIRED_PROPAGATION'] },
    },
    select: {
      id: true,
      plantId: true,
      propagationDate: true,
      acquisitionDate: true,
      createdAt: true,
      propagationEstablishedAt: true,
    },
  })
  const start = plant.propagationDate || plant.acquisitionDate || plant.createdAt
  const ageDays = Math.max(0, calendarDayIndexInTimeZone(new Date(), timezone) - calendarDayIndexInTimeZone(start, timezone))
  if (ageDays < 14) throw new Error('Propagation can be marked established starting on day 14.')

  if (!plant.propagationEstablishedAt) {
    await prisma.plantInstance.update({
      where: { id: plantInstanceId },
      data: { propagationEstablishedAt: new Date() },
    })
    await prisma.plantCareAdjustment.updateMany({
      where: { collectionId: context.collection.id, plantInstanceId, taskType: 'PROPAGATION_CHECK' },
      data: { snoozedUntil: null, disabled: true },
    })
    await mutationAudit(prisma, context.user, 'UPDATE', 'PLANT_INSTANCE', plantInstanceId, `Marked propagation established for ${plant.plantId}`, { ageDays }, context.collection.id)
  }

  return {}
}

async function bulk(prisma: Prisma.TransactionClient, context: MutationContext, fd: FormData): Promise<MutationResult> {
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const locationId = val(fd, 'locationId')!
  const includeNested = fd.get('includeNested') === 'on'
  const includeArchived = fd.get('includeArchived') === 'on'
  const careType = val(fd, 'careType') || 'OTHER'
  const sharedNote = val(fd, 'sharedNote') || ''
  const sharedResult = val(fd, 'sharedResult') || ''
  const fertilizerRecipeId = careType === 'FERTILIZING'
    ? await verifiedFertilizerRecipeId(prisma, context.collection.id, val(fd, 'fertilizerRecipeId') || null)
    : null
  const substrateMode = careType === 'REPOTTING' && substrateModes.includes(val(fd, 'substrateMode') as any)
    ? val(fd, 'substrateMode')!
    : null
  const substrateRecipeVersionId = substrateMode === 'RECIPE'
    ? (await requireSubstrateRecipeVersion(prisma, context.collection.id, val(fd, 'substrateRecipeVersionId')))?.id || null
    : null
  const performedAt = parseDateLocal(val(fd, 'performedAt'), timezone) || new Date()
  const selectedIds = fd.getAll('plantInstanceId').map((item) => String(item)).filter(Boolean)
  const batchId = val(fd, 'bulkCareBatchId') || randomUUID()

  if (!selectedIds.length) {
    throw new Error('Choose at least one plant.')
  }

  const [location, allLocations] = await Promise.all([
    prisma.location.findFirstOrThrow({ where: { id: locationId, collectionId: context.collection.id }, select: { id: true, name: true, code: true } }),
    prisma.location.findMany({ where: { collectionId: context.collection.id }, select: { id: true, parentLocationId: true } }),
  ])
  const allowedLocationIds = includeNested
    ? [location.id, ...Array.from(descendantLocationIds(location.id, allLocations))]
    : [location.id]
  const plants = await prisma.plantInstance.findMany({
    where: {
      id: { in: selectedIds },
      collectionId: context.collection.id,
      currentLocationId: { in: allowedLocationIds },
      ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
    },
    select: { id: true, plantId: true },
  })
  const validIds = new Set(plants.map((plant) => plant.id))
  const skipped = selectedIds.filter((id) => fd.get(`skip:${id}`) === 'on' || !validIds.has(id))
  const skippedDetails = skipped.map((id) => ({
    plantInstanceId: id,
    reason: val(fd, `skipReason:${id}`) || (validIds.has(id) ? 'Skipped by user' : 'Plant not eligible for this location scope'),
  }))
  const eventPlants = plants.filter((plant) => !skipped.includes(plant.id))

  if (!eventPlants.length) {
    throw new Error('All selected plants were skipped or are outside the chosen location.')
  }

  // Preserve the existing batch identity across simultaneous tabs as well as retries.
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${context.collection.id + ':' + batchId}, 0))`
  const existingBatch = await prisma.plantCareEvent.findFirst({
    where: {
      collectionId: context.collection.id,
      metadata: { path: ['bulkCareBatchId'], equals: batchId },
    },
    select: { id: true },
  })
  if (existingBatch) {
    return { duplicate: true, destination: collectionPath(context.collection.slug, `/care/bulk?locationId=${encodeURIComponent(locationId)}&includeNested=${includeNested ? '1' : '0'}&bulk=duplicate`) }
  }

  const queueTaskType = queueTaskForBulkCare(careType)
  const queueItems = queueTaskType
    ? await getCareQueue(prisma, {
        collectionId: context.collection.id,
        collectionSlug: context.collection.slug,
        userId: context.user.id,
        timezone,
      })
    : []
  const matchingQueueItems = queueItems.filter((item) =>
    !item.completedAt
    && item.plantInstanceId
    && validIds.has(item.plantInstanceId)
    && !skipped.includes(item.plantInstanceId)
    && item.taskType === queueTaskType
    && item.dueAt <= new Date()
  )
  const matchingReminderIds = [...new Set(matchingQueueItems.map((item) => item.reminderId).filter(Boolean) as string[])]

  const events = await withinMutation(prisma, async (tx) => {
    const created = []
    for (const plant of eventPlants) {
      const noteOverride = val(fd, `note:${plant.id}`) || ''
      const resultOverride = val(fd, `result:${plant.id}`) || ''
      const notes = [
        sharedNote,
        sharedResult ? `Result: ${sharedResult}` : '',
        noteOverride ? `Plant note: ${noteOverride}` : '',
        resultOverride ? `Plant result: ${resultOverride}` : '',
      ].filter(Boolean).join('\n')
      const event = await tx.plantCareEvent.create({
        data: {
          collectionId: context.collection.id,
          plantInstanceId: plant.id,
          userId: context.user.id,
          eventType: careEventForBulkCare(careType),
          performedAt,
          notes,
          fertilizerRecipeId,
          substrateRecipeVersionId,
          metadata: {
            source: 'BULK_CARE',
            bulkCareBatchId: batchId,
            locationId,
            includeNested,
            careType,
            fertilizerRecipeId,
            fertilizerStrength: val(fd, 'fertilizerStrength') || null,
            fertilizerDose: val(fd, 'fertilizerDose') || null,
            fertilizerWaterVolume: val(fd, 'fertilizerWaterVolume') || null,
            sharedResult: sharedResult || null,
            noteOverride: noteOverride || null,
            resultOverride: resultOverride || null,
          },
        },
      })
      if (careType === 'REPOTTING' && substrateMode) {
        const substrate = await setPlantSubstrate(tx, {
          collectionId: context.collection.id,
          plantInstanceId: plant.id,
          mode: substrateMode,
          recipeVersionId: substrateRecipeVersionId,
          description: clearableVal(fd, 'receivedSubstrateDescription'),
          notes: clearableVal(fd, 'substrateNotes'),
          startedAt: performedAt,
          reason: 'Repotting',
          changedByUserId: context.user.id,
          repottingCareEventId: event.id,
        })
        await emitDomainEvent(tx, {
          eventType: 'plant.substrate_changed', collectionId: context.collection.id, aggregateId: plant.id,
          actor: { id: context.user.id, role: context.user.role }, occurredAt: performedAt, correlationId: batchId,
          idempotencyKey: `plant:${plant.id}:substrate:${substrate.history.id}`,
          payload: { subjectId: plant.id, plantInstanceId: plant.id, plantId: plant.plantId, recordId: substrate.history.id, recordType: 'PlantSubstrateHistory', newMode: substrateMode, newRecipeVersionId: substrateRecipeVersionId, displayName: substrate.recipeVersion ? `${substrate.recipeVersion.recipe.name} v${substrate.recipeVersion.versionNumber}` : substrateMode.replaceAll('_', ' ') },
        })
      }
      await emitDomainEvent(tx, {
        eventType: domainEventForCare(event.eventType), collectionId: context.collection.id, aggregateId: event.id,
        actor: { id: context.user.id, role: context.user.role }, occurredAt: event.performedAt, correlationId: batchId,
        idempotencyKey: `care:${event.id}:created`, payload: { subjectId: event.id, recordId: event.id, recordType: 'PlantCareEvent', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, careType, summary: notes || undefined, bulkCareBatchId: batchId, fertilizerRecipeId },
      })
      created.push(event)
    }

    if (queueTaskType) {
      await tx.plantCareAdjustment.updateMany({
        where: { collectionId: context.collection.id, plantInstanceId: { in: eventPlants.map((plant) => plant.id) }, taskType: queueTaskType },
        data: { snoozedUntil: null },
      })
    }

    for (const reminderId of matchingReminderIds) {
      const reminder = await tx.reminder.findFirst({
        where: { id: reminderId, collectionId: context.collection.id, userId: context.user.id },
        include: { user: { include: { emailPreference: true } } },
      })
      if (!reminder) continue
      const reminderTimezone = timeZoneForPreference(reminder.user.emailPreference)
      const nextSendAt = nextOccurrence(performedAt, reminder.rrule, reminderTimezone)
      await tx.reminder.update({
        where: { id: reminder.id },
        data: nextSendAt ? { dueAt: nextSendAt, nextSendAt, completedAt: null } : { completedAt: performedAt, nextSendAt: null },
      })
    }

    await emitDomainEvent(tx, {
      eventType: 'care.bulk_batch_completed', collectionId: context.collection.id, aggregateId: batchId,
      actor: { id: context.user.id, role: context.user.role }, occurredAt: performedAt, correlationId: batchId,
      idempotencyKey: `care-batch:${batchId}:completed`, payload: { subjectId: batchId, displayName: `${location.code} ${location.name}`, careType, count: created.length, plantInstanceIds: eventPlants.map((plant) => plant.id), skipped: skippedDetails },
    })
    return created
  })

  await mutationAudit(prisma, context.user, 'CREATE', 'BULK_CARE_BATCH', batchId, `Recorded ${careType.toLowerCase().replaceAll('_', ' ')} for ${events.length} plant(s) in ${location.code} ${location.name}`, {
    locationId,
    includeNested,
    includeArchived,
    careType,
    selected: selectedIds.length,
    eventsCreated: events.length,
    skipped: skipped.length,
    skippedDetails,
    queueItemsCompleted: matchingQueueItems.length,
    reminderIds: matchingReminderIds,
  }, context.collection.id)

  const params = new URLSearchParams({
    locationId,
    includeNested: includeNested ? '1' : '0',
    bulk: 'success',
    events: String(events.length),
    completed: String(matchingQueueItems.length),
    skipped: String(skipped.length),
  })
  return { destination: collectionPath(context.collection.slug, `/care/bulk?${params.toString()}`), events: events.length, completed: matchingQueueItems.length, skipped: skipped.length }
}

const actions = { complete, snooze, resolve, update, attention, establish, bulk }
export function applyCareQueueMutation(tx: Prisma.TransactionClient, context: MutationContext, action: CareQueueAction, fd: FormData) {
  return actions[action](tx, context, fd)
}
export async function runCareQueueMutation(action: CareQueueAction, fd: FormData, identity?: CareOperationIdentity) {
  const context = await requireCollectionLogger(val(fd, 'collectionSlug'))
  return executeCareOperation(database, { collectionId: context.collection.id, userId: context.user.id, action, fd, identity }, tx => applyCareQueueMutation(tx, context, action, fd))
}
