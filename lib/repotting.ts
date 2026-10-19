import { Prisma } from '@prisma/client'
import {
  selectRepottingWindow,
  windowOccurrence,
  windowFingerprint,
} from '@/lib/repotting-windows'
import { defaultTimeZone } from '@/lib/time'

type Db = Prisma.TransactionClient
export async function queueRepotting(
  tx: Db,
  input: {
    collectionId: string
    instanceId: string
    timezone?: string
    windowId?: string
    year?: number
    source?: 'MANUAL' | 'CARE_QUEUE'
    reminderId?: string
    assessmentDueAt?: Date
    notes?: string
  }
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.instanceId}), 7421)`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(9427, 1)`
  const plant = await tx.plantInstance.findFirstOrThrow({
    where: {
      id: input.instanceId,
      collectionId: input.collectionId,
      status: 'ACTIVE',
    },
    include: {
      plantDefinition: {
        include: {
          primaryRepottingWindow: true,
          alternateRepottingWindow: true,
        },
      },
    },
  })
  const existing = await tx.repottingQueueItem.findFirst({
    where: { plantInstanceId: plant.id, status: 'QUEUED' },
  })
  if (input.reminderId)
    await tx.reminder.findFirstOrThrow({
      where: {
        id: input.reminderId,
        collectionId: input.collectionId,
        entityType: 'PLANT_INSTANCE',
        entityId: plant.id,
        category: 'REPOTTING',
      },
    })
  if (existing) {
    if (input.reminderId)
      await tx.repottingQueueItem.update({
        where: { id: existing.id },
        data: { sourceReminderId: input.reminderId },
      })
    return existing
  }
  const d = plant.plantDefinition,
    tz = input.timezone || defaultTimeZone(),
    now = new Date()
  const selection = selectRepottingWindow({
    primaryWindow: d.primaryRepottingWindow,
    alternateWindow: d.alternateRepottingWindow,
    referenceDate: now,
    timezone: tz,
  })
  let selected = selection
  if (input.windowId) {
    const window = await tx.repottingWindow.findFirstOrThrow({
      where: { id: input.windowId, isActive: true },
    })
    selected = {
      ...windowOccurrence(window, input.year!, tz),
      selectionReason: 'PRIMARY_NEXT',
    }
  }
  if (!selected || selected.endDate < now)
    throw new Error(
      'No eligible repotting window. Configure windows or choose a future occurrence.'
    )
  return tx.repottingQueueItem.create({
    data: {
      plantInstanceId: plant.id,
      repottingWindowId: selected.windowId,
      scheduledYear: selected.year,
      source: input.source || 'MANUAL',
      sourceReminderId: input.reminderId,
      assessmentDueAt: input.assessmentDueAt,
      notes: input.notes,
      assignmentSnapshot: {
        primary: d.primaryRepottingWindowId,
        alternate: d.alternateRepottingWindowId,
      },
    },
  })
}
export async function validateWindowAssignments(
  tx: Db,
  primary: string | null,
  alternate: string | null
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(9427, 1)`
  if (alternate && !primary)
    throw new Error('Choose a primary window before an alternate.')
  if (primary && primary === alternate)
    throw new Error('Primary and alternate must be different.')
  const ids = [primary, alternate].filter(Boolean) as string[]
  if (
    (await tx.repottingWindow.count({
      where: { id: { in: ids }, isActive: true },
    })) !== ids.length
  )
    throw new Error('Choose existing active windows.')
}
export async function applyWindowRecommendation(
  tx: Db,
  suggestion: any,
  value: any
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(9427, 1)`
  const d = await tx.plantDefinition.findFirstOrThrow({
    where: {
      id: suggestion.plantDefinitionId,
      collectionId: suggestion.collectionId,
    },
  })
  const prior = suggestion.currentValue?.focus?.currentValue
  if (
    !prior ||
    prior.primaryWindowId !== d.primaryRepottingWindowId ||
    prior.alternateWindowId !== d.alternateRepottingWindowId
  )
    throw new Error(
      'Repotting assignments changed after research. Research again before approval.'
    )
  const catalog = suggestion.currentValue?.repottingWindows || []
  if (!validWindowRecommendation(value, catalog))
    throw new Error(
      'Review a valid primary recommendation with independent confidence, reasoning and assumptions.'
    )
  for (const id of [value.primaryWindowId, value.alternateWindowId].filter(
    Boolean
  )) {
    const current = await tx.repottingWindow.findUniqueOrThrow({
        where: { id },
      }),
      old = catalog.find((w: any) => w.id === id)
    if (!old || windowFingerprint(old) !== windowFingerprint(current))
      throw new Error(
        'Repotting window dates or availability changed. Research again before approval.'
      )
  }
  await validateWindowAssignments(
    tx,
    value.primaryWindowId || null,
    value.alternateWindowId || null
  )
  for (const key of ['primaryConfidence', 'alternateConfidence'])
    if (
      value[key] != null &&
      (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1)
    )
      throw new Error('Invalid window confidence.')
  await tx.plantDefinition.update({
    where: { id: d.id },
    data: {
      primaryRepottingWindowId: value.primaryWindowId || null,
      alternateRepottingWindowId: value.alternateWindowId || null,
    },
  })
  return true
}

export function validWindowRecommendation(value: any, catalog: any[]) {
  if (!value || typeof value !== 'object') return false
  if (!value.primaryWindowId) return false
  if (value.alternateWindowId === value.primaryWindowId) return false
  for (const [id, confidence, reason] of [
    [value.primaryWindowId, value.primaryConfidence, value.primaryReasoning],
    [
      value.alternateWindowId,
      value.alternateConfidence,
      value.alternateReasoning,
    ],
  ]) {
    if (!id) continue
    if (
      !catalog.some((w) => w.id === id && w.isActive) ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      typeof reason !== 'string' ||
      !reason.trim()
    )
      return false
  }
  return (
    Array.isArray(value.researchAssumptions) &&
    value.researchAssumptions.every((x: any) => typeof x === 'string')
  )
}
