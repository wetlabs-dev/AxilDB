'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { parseDateLocal, timeZoneForPreference } from '@/lib/time'
import { audit } from '@/lib/auth'
import { requireCollectionAdmin, requireCollectionLogger } from '@/lib/collections'
import { cadenceActivities, validateCadence } from '@/lib/care-cadences'
import { isHistoricalConstituent } from '@/lib/plant-instance-merges'

export async function saveCareCadences(fd: FormData) {
  const get = (key: string) => String(fd.get(key) || '')
  const instanceId = get('plantInstanceId')
  const context = instanceId ? await requireCollectionLogger(get('collectionSlug')) : await requireCollectionAdmin(get('collectionSlug'))
  const preference = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preference)
  try {
    await prisma.$transaction(async tx => {
      const instance = instanceId ? await tx.plantInstance.findFirstOrThrow({ where: { id: instanceId, collectionId: context.collection.id } }) : null
      if (instance && isHistoricalConstituent(instance.status)) throw new Error('This historical specimen is read-only.')
      const definitionId = instance?.plantDefinitionId || get('plantDefinitionId')
      await tx.plantDefinition.findFirstOrThrow({ where: { id: definitionId, collectionId: context.collection.id } })
      if (instanceId) {
        await tx.plantHusbandryOverride.updateMany({ where: { plantInstanceId: instanceId, collectionId: context.collection.id }, data: { fertilizationCadenceDays: null, fertilizationPaused: false } })
      } else {
        await tx.plantHusbandryGuide.updateMany({ where: { plantDefinitionId: definitionId, collectionId: context.collection.id }, data: { fertilizationCadenceDays: null, fertilizationPaused: false } })
      }
      for (const { activity, task } of cadenceActivities) {
        const mode = get(`${activity}.mode`)
        if (!(instanceId ? ['INHERIT', 'OVERRIDE', 'DISABLED'] : ['OVERRIDE', 'DISABLED']).includes(mode)) throw new Error('Invalid cadence mode.')
        const interval = mode === 'OVERRIDE' ? Number(get(`${activity}.interval`)) : null
        const unit = mode === 'OVERRIDE' ? get(`${activity}.unit`) : null
        if (mode === 'OVERRIDE') validateCadence(interval!, unit!)
        if (instanceId) {
          await tx.plantInstanceCareCadenceOverride.deleteMany({ where: { plantInstanceId: instanceId, activity } })
          if (mode !== 'INHERIT') await tx.plantInstanceCareCadenceOverride.create({ data: { plantInstanceId: instanceId, activity, mode, interval, unit } })
          const initialDate = get(`${activity}.initialDate`)
          if (initialDate) {
            const nextDueAt = parseDateLocal(initialDate, timezone)
            if (!nextDueAt) throw new Error('Choose a valid initial due date.')
            await tx.plantCareAdjustment.upsert({
              where: { collectionId_plantInstanceId_taskType: { collectionId: context.collection.id, plantInstanceId: instanceId, taskType: task } },
              create: { collectionId: context.collection.id, plantInstanceId: instanceId, taskType: task, nextDueAt, userId: context.user.id },
              update: { nextDueAt },
            })
          }
          // The structured editor supersedes old sync cadence/disabled settings; retain initial dates and snoozes.
          await tx.plantCareAdjustment.updateMany({ where: { collectionId: context.collection.id, plantInstanceId: instanceId, taskType: task }, data: { cadenceOverrideDays: null, disabled: false } })
        } else {
          await tx.plantDefinitionCareCadence.deleteMany({ where: { plantDefinitionId: definitionId, activity } })
          if (mode === 'OVERRIDE') await tx.plantDefinitionCareCadence.create({ data: { plantDefinitionId: definitionId, activity, interval: interval!, unit: unit! } })
        }
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Assign an active fertilizer recipe')) throw new Error('Assign an active fertilizer recipe to the plant definition before scheduling fertilizing. Disable dependent fertilizing cadences before removing its final recipe.')
    throw error
  }
  await audit(context.user, 'UPDATE', instanceId ? 'PLANT_INSTANCE' : 'PLANT_DEFINITION', instanceId || get('plantDefinitionId'), 'Updated care cadences', undefined, context.collection.id)
  revalidatePath('/', 'layout')
}
