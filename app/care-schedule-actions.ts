'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionLogger, requireCollectionManager } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { normalizeCareTypes, parseTargetDueAt, resolveQuietDayShift, schedulableCareTypes } from '@/lib/care-scheduling'
import { descendantLocationIds } from '@/lib/locations'
import { parseDateLocal, timeZoneForPreference } from '@/lib/time'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const optional = (fd: FormData, key: string) => val(fd, key) || null
const boundedInt = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export async function createQuietDay(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = val(fd, 'timezone') || timeZoneForPreference(preferences)
  const quietType = ['ONE_TIME', 'WEEKLY_RECURRING', 'DATE_RANGE'].includes(val(fd, 'quietType')) ? val(fd, 'quietType') : 'ONE_TIME'
  const quietDay = await prisma.collectionQuietDay.create({
    data: {
      collectionId: context.collection.id,
      createdByUserId: context.user.id,
      name: val(fd, 'name') || 'Quiet day',
      description: optional(fd, 'description'),
      quietType,
      date: quietType === 'ONE_TIME' ? parseDateLocal(val(fd, 'date'), timezone) : null,
      startDate: quietType === 'DATE_RANGE' ? parseDateLocal(val(fd, 'startDate'), timezone) : null,
      endDate: quietType === 'DATE_RANGE' ? parseDateLocal(val(fd, 'endDate'), timezone) : null,
      dayOfWeek: quietType === 'WEEKLY_RECURRING' ? boundedInt(val(fd, 'dayOfWeek'), 0, 0, 6) : null,
      timezone,
      active: fd.get('active') !== 'off',
    },
  })
  await audit(context.user, 'CREATE', 'COLLECTION_QUIET_DAY', quietDay.id, `Created quiet day ${quietDay.name}`, { quietType }, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/collection-settings'))
  redirect(collectionPath(context.collection.slug, '/collection-settings?quiet=created'))
}

export async function deleteQuietDay(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'quietDayId')
  const quietDay = await prisma.collectionQuietDay.findFirstOrThrow({ where: { id, collectionId: context.collection.id } })
  await prisma.collectionQuietDay.delete({ where: { id } })
  await audit(context.user, 'DELETE', 'COLLECTION_QUIET_DAY', id, `Deleted quiet day ${quietDay.name}`, undefined, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/collection-settings'))
  redirect(collectionPath(context.collection.slug, '/collection-settings?quiet=deleted'))
}

export async function updateQuietDayShiftRule(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const careType = schedulableCareTypes.includes(val(fd, 'careType') as any) ? val(fd, 'careType') : 'REMINDER'
  const direction = ['EARLIER', 'LATER', 'SMART'].includes(val(fd, 'defaultShiftDirection')) ? val(fd, 'defaultShiftDirection') : 'LATER'
  const rule = await prisma.collectionQuietDayShiftRule.upsert({
    where: { collectionId_careType: { collectionId: context.collection.id, careType } },
    create: {
      collectionId: context.collection.id,
      careType,
      defaultShiftDirection: direction,
      maxShiftDaysBefore: boundedInt(val(fd, 'maxShiftDaysBefore'), 2, 0, 14),
      maxShiftDaysAfter: boundedInt(val(fd, 'maxShiftDaysAfter'), 2, 0, 14),
      active: fd.get('active') !== 'off',
    },
    update: {
      defaultShiftDirection: direction,
      maxShiftDaysBefore: boundedInt(val(fd, 'maxShiftDaysBefore'), 2, 0, 14),
      maxShiftDaysAfter: boundedInt(val(fd, 'maxShiftDaysAfter'), 2, 0, 14),
      active: fd.get('active') !== 'off',
    },
  })
  await audit(context.user, 'UPDATE', 'COLLECTION_QUIET_DAY_SHIFT_RULE', rule.id, `Updated quiet-day shift rule for ${careType}`, undefined, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/collection-settings'))
  redirect(collectionPath(context.collection.slug, '/collection-settings?quiet=rule-updated'))
}

export async function applyCareScheduleSync(fd: FormData) {
  const context = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = val(fd, 'timezone') || timeZoneForPreference(preferences)
  const targetDueAt = parseTargetDueAt(val(fd, 'targetDate'), optional(fd, 'targetTime'), timezone)
  const careTypes = normalizeCareTypes(fd.getAll('careType')).filter((type) => ['WATER', 'PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK', 'REMINDER'].includes(type))
  const plantIds = Array.from(new Set(fd.getAll('plantInstanceId').map((value) => String(value || '')).filter(Boolean)))
  const locationId = optional(fd, 'locationId')
  const includeNested = fd.get('includeNested') === 'on' || fd.get('includeNested') === '1'
  const createMissing = fd.get('createMissing') !== 'off'
  if (!plantIds.length || !careTypes.length) redirect(collectionPath(context.collection.slug, '/care/sync?error=missing-selection'))

  const locations = locationId
    ? await prisma.location.findMany({ where: { collectionId: context.collection.id }, select: { id: true, parentLocationId: true } })
    : []
  const allowedLocationIds = locationId
    ? [locationId, ...(includeNested ? Array.from(descendantLocationIds(locationId, locations)) : [])]
    : []
  const plants = await prisma.plantInstance.findMany({
    where: {
      id: { in: plantIds },
      collectionId: context.collection.id,
      status: 'ACTIVE',
      ...(allowedLocationIds.length ? { currentLocationId: { in: allowedLocationIds } } : {}),
    },
    select: { id: true, plantId: true },
  })
  if (!plants.length) redirect(collectionPath(context.collection.slug, '/care/sync?error=no-eligible-plants'))

  const existingAdjustments = await prisma.plantCareAdjustment.findMany({
    where: { collectionId: context.collection.id, plantInstanceId: { in: plants.map((plant) => plant.id) }, taskType: { in: careTypes } },
  })
  const adjustmentByKey = new Map(existingAdjustments.map((adjustment) => [`${adjustment.plantInstanceId}:${adjustment.taskType}`, adjustment]))
  const [quietDays, quietRules] = await Promise.all([
    prisma.collectionQuietDay.findMany({ where: { collectionId: context.collection.id, active: true } }),
    prisma.collectionQuietDayShiftRule.findMany({ where: { collectionId: context.collection.id, active: true } }),
  ])
  const quietRuleByType = new Map(quietRules.map((rule) => [rule.careType, rule]))

  const batch = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.careScheduleSyncBatch.create({
      data: {
        collectionId: context.collection.id,
        createdByUserId: context.user.id,
        locationId,
        includeNested,
        targetDueAt,
        timezone,
        selectedCareTypesJson: careTypes as unknown as Prisma.InputJsonValue,
        mode: 'ALIGN_NEXT_DUE',
        createMissing,
        notes: optional(fd, 'notes'),
      },
    })
    for (const plant of plants) {
      for (const careType of careTypes) {
        const existing = adjustmentByKey.get(`${plant.id}:${careType}`)
        if (!existing && !createMissing) {
          await tx.careScheduleSyncItem.create({
            data: {
              batchId: createdBatch.id,
              collectionId: context.collection.id,
              plantInstanceId: plant.id,
              careType,
              action: 'SKIPPED',
              skipReason: 'Missing schedule and create missing schedules was disabled.',
            },
          })
          continue
        }
        const quietShift = resolveQuietDayShift({
          dueAt: targetDueAt,
          careType,
          quietDays,
          rule: quietRuleByType.get(careType),
          timezone,
        })
        const adjustedDueAt = quietShift?.adjustedDueAt || targetDueAt
        await tx.plantCareAdjustment.upsert({
          where: { collectionId_plantInstanceId_taskType: { collectionId: context.collection.id, plantInstanceId: plant.id, taskType: careType } },
          create: {
            collectionId: context.collection.id,
            plantInstanceId: plant.id,
            userId: context.user.id,
            taskType: careType,
            nextDueAt: adjustedDueAt,
            disabled: false,
            notes: `Care schedule synced by ${context.user.email}.`,
          },
          update: {
            userId: context.user.id,
            nextDueAt: adjustedDueAt,
            disabled: false,
            snoozedUntil: null,
          },
        })
        await tx.careScheduleSyncItem.create({
          data: {
            batchId: createdBatch.id,
            collectionId: context.collection.id,
            plantInstanceId: plant.id,
            careType,
            previousDueAt: existing?.nextDueAt || null,
            newDueAt: adjustedDueAt,
            previousCadenceJson: existing?.cadenceOverrideDays ? { cadenceOverrideDays: existing.cadenceOverrideDays } : Prisma.JsonNull,
            action: existing ? 'UPDATED' : 'CREATED',
          },
        })
        if (quietShift && quietShift.adjustedDueAt.getTime() !== targetDueAt.getTime()) {
          await tx.careQuietDayAdjustment.create({
            data: {
              collectionId: context.collection.id,
              plantInstanceId: plant.id,
              quietDayId: quietShift.quietDay.id || null,
              careType,
              originalDueAt: targetDueAt,
              adjustedDueAt,
              shiftDirection: quietShift.shiftDirection,
              ruleUsed: quietShift.ruleUsed,
              reason: quietShift.reason,
            },
          })
        }
      }
    }
    return createdBatch
  })

  await audit(context.user, 'CREATE', 'CARE_SCHEDULE_SYNC_BATCH', batch.id, `Synced care schedules for ${plants.length} plant(s)`, {
    plantCount: plants.length,
    careTypes,
    targetDueAt,
    mode: 'ALIGN_NEXT_DUE',
    createMissing,
  }, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/care'))
  revalidatePath(collectionPath(context.collection.slug, '/care/sync'))
  redirect(collectionPath(context.collection.slug, `/care/sync?synced=${batch.id}`))
}
