'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionLogger, requireCollectionManager } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { normalizeCareTypes, parseTargetDueAt, schedulableCareTypes } from '@/lib/care-scheduling'
import { descendantLocationIds } from '@/lib/locations'
import { timeZoneForPreference } from '@/lib/time'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const optional = (fd: FormData, key: string) => val(fd, key) || null
const checked = (fd: FormData, key: string, defaultValue = false) => {
  const values = fd.getAll(key)
  if (values.length === 0) return defaultValue
  return values.some((value) => ['on', '1', 'true'].includes(String(value)))
}
const boundedInt = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export async function createQuietDay(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const draft = { kind: 'create', name: val(fd, 'name').slice(0, 100) || 'Quiet day', description: val(fd, 'description').slice(0, 2000), active: fd.get('active') !== 'off', quietType: val(fd, 'quietType'), date: val(fd, 'date'), startDate: val(fd, 'startDate'), endDate: val(fd, 'endDate'), dayOfWeek: Number(val(fd, 'dayOfWeek')) }
  redirect(collectionPath(context.collection.slug, `/care/quiet-day-review?draft=${encodeURIComponent(JSON.stringify(draft))}`))
}

export async function deleteQuietDay(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const draft = { kind: 'remove', id: val(fd, 'quietDayId') }
  redirect(collectionPath(context.collection.slug, `/care/quiet-day-review?draft=${encodeURIComponent(JSON.stringify(draft))}`))
}

export async function updateQuietDayShiftRule(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const careType = schedulableCareTypes.includes(val(fd, 'careType') as any) ? val(fd, 'careType') : 'REMINDER'
  const direction = ['EARLIER', 'LATER', 'SMART'].includes(val(fd, 'defaultShiftDirection')) ? val(fd, 'defaultShiftDirection') : 'LATER'
  const draft = { kind: 'rule', careType, defaultShiftDirection: direction, maxShiftDaysBefore: boundedInt(val(fd, 'maxShiftDaysBefore'), 2, 0, 14), maxShiftDaysAfter: boundedInt(val(fd, 'maxShiftDaysAfter'), 2, 0, 14), active: fd.get('active') !== 'off' }
  redirect(collectionPath(context.collection.slug, `/care/quiet-day-review?draft=${encodeURIComponent(JSON.stringify(draft))}`))
}

export async function applyCareScheduleSync(fd: FormData) {
  const context = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = val(fd, 'timezone') || timeZoneForPreference(preferences)
  const targetDueAt = parseTargetDueAt(val(fd, 'targetDate'), optional(fd, 'targetTime'), timezone)
  const careTypes = normalizeCareTypes(fd.getAll('careType')).filter((type) => ['WATER', 'FERTILIZE', 'PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK', 'REMINDER'].includes(type))
  const plantIds = Array.from(new Set(fd.getAll('plantInstanceId').map((value) => String(value || '')).filter(Boolean)))
  const definitionId = optional(fd, 'definitionId')
  const locationId = optional(fd, 'locationId')
  const includeNested = checked(fd, 'includeNested', true)
  const createMissing = checked(fd, 'createMissing', true)
  const syncCadence = checked(fd, 'syncCadence', false)
  const rawCadenceDays = Number(val(fd, 'cadenceDays') || '7')
  const cadenceDays = Number.isFinite(rawCadenceDays) ? Math.max(1, Math.min(365, Math.floor(rawCadenceDays))) : 7
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
      ...(definitionId ? { plantDefinitionId: definitionId } : {}),
      ...(allowedLocationIds.length ? { currentLocationId: { in: allowedLocationIds } } : {}),
    },
    select: { id: true, plantId: true },
  })
  if (!plants.length) redirect(collectionPath(context.collection.slug, '/care/sync?error=no-eligible-plants'))

  const existingAdjustments = await prisma.plantCareAdjustment.findMany({
    where: { collectionId: context.collection.id, plantInstanceId: { in: plants.map((plant) => plant.id) }, taskType: { in: careTypes } },
  })
  const adjustmentByKey = new Map(existingAdjustments.map((adjustment) => [`${adjustment.plantInstanceId}:${adjustment.taskType}`, adjustment]))
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
        mode: syncCadence ? 'ALIGN_NEXT_DUE_AND_CADENCE' : 'ALIGN_NEXT_DUE',
        createMissing,
        syncCadence,
        cadenceDays: syncCadence ? cadenceDays : null,
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
        const adjustedDueAt = targetDueAt
        await tx.plantCareAdjustment.upsert({
          where: { collectionId_plantInstanceId_taskType: { collectionId: context.collection.id, plantInstanceId: plant.id, taskType: careType } },
          create: {
            collectionId: context.collection.id,
            plantInstanceId: plant.id,
            userId: context.user.id,
            taskType: careType,
            nextDueAt: adjustedDueAt,
            cadenceOverrideDays: syncCadence ? cadenceDays : null,
            disabled: false,
            notes: `Care schedule synced by ${context.user.email}.`,
          },
          update: {
            userId: context.user.id,
            nextDueAt: adjustedDueAt,
            ...(syncCadence ? { cadenceOverrideDays: cadenceDays } : {}),
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
            newCadenceJson: syncCadence ? { cadenceOverrideDays: cadenceDays } : Prisma.JsonNull,
            action: existing ? 'UPDATED' : 'CREATED',
          },
        })

      }
    }
    return createdBatch
  })

  await audit(context.user, 'CREATE', 'CARE_SCHEDULE_SYNC_BATCH', batch.id, `Synced care schedules for ${plants.length} plant(s)`, {
    plantCount: plants.length,
    careTypes,
    targetDueAt,
    mode: syncCadence ? 'ALIGN_NEXT_DUE_AND_CADENCE' : 'ALIGN_NEXT_DUE',
    createMissing,
    syncCadence,
    cadenceDays: syncCadence ? cadenceDays : null,
  }, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/care'))
  revalidatePath(collectionPath(context.collection.slug, '/care/sync'))
  redirect(collectionPath(context.collection.slug, `/care/sync?synced=${batch.id}`))
}
