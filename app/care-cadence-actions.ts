'use server'

import { configureDefinitionCadence } from '@/lib/care-cadence-service'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { parseDateLocal, timeZoneForPreference } from '@/lib/time'
import { audit } from '@/lib/auth'
import {
  requireCollectionAdmin,
  requireCollectionLogger,
} from '@/lib/collections'
import { cadenceActivities, validateCadenceState } from '@/lib/care-cadences'
import { isHistoricalConstituent } from '@/lib/plant-instance-merges'

export async function saveCareCadences(fd: FormData) {
  const get = (key: string) => String(fd.get(key) || '')
  const instanceId = get('plantInstanceId')
  const onlyActivity = get('activity')
  if (
    onlyActivity &&
    !cadenceActivities.some((row) => row.activity === onlyActivity)
  )
    throw new Error('Invalid care activity.')
  const context = instanceId
    ? await requireCollectionLogger(get('collectionSlug'))
    : await requireCollectionAdmin(get('collectionSlug'))
  const preference = await prisma.emailPreference.findUnique({
    where: { userId: context.user.id },
  })
  const timezone = timeZoneForPreference(preference)
  const changes: unknown[] = []
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
      const instance = instanceId
        ? await tx.plantInstance.findFirstOrThrow({
            where: { id: instanceId, collectionId: context.collection.id },
          })
        : null
      if (instance && isHistoricalConstituent(instance.status))
        throw new Error('This historical specimen is read-only.')
      const definitionId =
        instance?.plantDefinitionId || get('plantDefinitionId')
      await tx.plantDefinition.findFirstOrThrow({
        where: { id: definitionId, collectionId: context.collection.id },
      })
      if ((!onlyActivity || onlyActivity === 'FERTILIZING') && instanceId) {
        await tx.plantHusbandryOverride.updateMany({
          where: {
            plantInstanceId: instanceId,
            collectionId: context.collection.id,
          },
          data: { fertilizationCadenceDays: null, fertilizationPaused: false },
        })
      } else if (!onlyActivity || onlyActivity === 'FERTILIZING') {
        await tx.plantHusbandryGuide.updateMany({
          where: {
            plantDefinitionId: definitionId,
            collectionId: context.collection.id,
          },
          data: { fertilizationCadenceDays: null, fertilizationPaused: false },
        })
      }
      for (const { activity, task } of cadenceActivities.filter(
        (row) => !onlyActivity || row.activity === onlyActivity
      )) {
        const mode = get(`${activity}.mode`)
        if (
          !(
            instanceId
              ? ['INHERIT', 'OVERRIDE', 'DISABLED', 'NOT_APPLICABLE']
              : ['OVERRIDE', 'DISABLED', 'NOT_APPLICABLE']
          ).includes(mode)
        )
          throw new Error('Invalid cadence mode.')
        const interval =
          mode === 'OVERRIDE' ? Number(get(`${activity}.interval`)) : null
        const unit = mode === 'OVERRIDE' ? get(`${activity}.unit`) : null
        const status =
          mode === 'NOT_APPLICABLE'
            ? 'NOT_APPLICABLE'
            : mode === 'OVERRIDE'
              ? 'SCHEDULED'
              : 'NOT_SCHEDULED'
        if (mode !== 'INHERIT')
          validateCadenceState(activity, status, interval, unit)
        if (
          mode !== 'OVERRIDE' &&
          (get(`${activity}.interval`) || get(`${activity}.unit`))
        )
          throw new Error('Unscheduled decisions cannot include an interval.')
        const previous = instanceId
          ? await tx.plantInstanceCareCadenceOverride.findUnique({
              where: {
                plantInstanceId_activity: {
                  plantInstanceId: instanceId,
                  activity,
                },
              },
            })
          : await tx.plantDefinitionCareCadence.findUnique({
              where: {
                plantDefinitionId_activity: {
                  plantDefinitionId: definitionId,
                  activity,
                },
              },
            })
        changes.push({
          activity,
          previous,
          decision: { mode, status, interval, unit },
        })
        if (instanceId) {
          await tx.plantInstanceCareCadenceOverride.deleteMany({
            where: { plantInstanceId: instanceId, activity },
          })
          if (mode !== 'INHERIT')
            await tx.plantInstanceCareCadenceOverride.create({
              data: {
                plantInstanceId: instanceId,
                activity,
                mode,
                interval,
                unit,
              },
            })
          const initialDate = get(`${activity}.initialDate`)
          if (initialDate && !['NOT_APPLICABLE', 'DISABLED'].includes(mode)) {
            const nextDueAt = parseDateLocal(initialDate, timezone)
            if (!nextDueAt) throw new Error('Choose a valid initial due date.')
            await tx.plantCareAdjustment.upsert({
              where: {
                collectionId_plantInstanceId_taskType: {
                  collectionId: context.collection.id,
                  plantInstanceId: instanceId,
                  taskType: task,
                },
              },
              create: {
                collectionId: context.collection.id,
                plantInstanceId: instanceId,
                taskType: task,
                nextDueAt,
                userId: context.user.id,
              },
              update: { nextDueAt },
            })
          }
          // The structured editor supersedes old sync cadence/disabled settings; retain initial dates and snoozes.
          await tx.plantCareAdjustment.updateMany({
            where: {
              collectionId: context.collection.id,
              plantInstanceId: instanceId,
              taskType: task,
            },
            data: {
              cadenceOverrideDays: null,
              disabled: false,
              ...(['NOT_APPLICABLE', 'DISABLED'].includes(mode)
                ? { nextDueAt: null, snoozedUntil: null }
                : {}),
            },
          })
        } else {
          await configureDefinitionCadence(tx, {
            definitionId,
            activity,
            status,
            interval,
            unit,
          })
        }
      }
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Assign an active fertilizer recipe')
    )
      throw new Error(
        'Assign an active fertilizer recipe to the plant definition before scheduling fertilizing. Disable dependent fertilizing cadences before removing its final recipe.'
      )
    throw error
  }
  await audit(
    context.user,
    'UPDATE',
    instanceId ? 'PLANT_INSTANCE' : 'PLANT_DEFINITION',
    instanceId || get('plantDefinitionId'),
    'Updated care cadences',
    { source: 'MANUAL', changes },
    context.collection.id
  )
  revalidatePath('/', 'layout')
}
