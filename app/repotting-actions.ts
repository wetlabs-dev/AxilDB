'use server'
import { requireServerAdmin } from '@/lib/auth'
import {
  requireCollectionAdmin,
  requireCollectionLogger,
  collectionPath,
} from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { validateAnnualWindow, windowOccurrence } from '@/lib/repotting-windows'
import { queueRepotting, validateWindowAssignments } from '@/lib/repotting'
import { applyCareQueueMutation } from '@/lib/care-queue-mutations'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { timeZoneForPreference } from '@/lib/time'
const value = (fd: FormData, k: string) => String(fd.get(k) || '').trim()
function refresh(slug: string) {
  revalidatePath('/', 'layout')
  revalidatePath(collectionPath(slug, '/care/repotting'))
}
export async function manageRepottingWindow(fd: FormData) {
  const user = await requireServerAdmin(),
    id = value(fd, 'id'),
    action = value(fd, 'action')
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9427, 1)`
    if (id)
      await tx.$executeRaw`SELECT id FROM "RepottingWindow" WHERE id=${id} FOR UPDATE`
    if (action === 'DELETE') {
      const references = await tx.repottingWindow.findUniqueOrThrow({
        where: { id },
        include: {
          _count: {
            select: {
              primaryDefinitions: true,
              alternateDefinitions: true,
              queueItems: true,
            },
          },
        },
      })
      if (Object.values(references._count).some(Boolean))
        throw new Error(
          'This window is referenced. Deactivate it instead; retained queue history must be preserved.'
        )
      await tx.repottingWindow.delete({ where: { id } })
    } else {
      const data = {
        name: value(fd, 'name').slice(0, 100),
        description: value(fd, 'description').slice(0, 2000) || null,
        startMonth: Number(fd.get('startMonth')),
        startDay: Number(fd.get('startDay')),
        endMonth: Number(fd.get('endMonth')),
        endDay: Number(fd.get('endDay')),
        sortOrder: Number(fd.get('sortOrder')),
        isActive: fd.get('isActive') === 'on',
      }
      if (
        !data.name ||
        !Number.isInteger(data.sortOrder) ||
        Math.abs(data.sortOrder) > 10000
      )
        throw new Error('Enter a name and a valid order.')
      validateAnnualWindow(data)
      if (
        id &&
        !data.isActive &&
        (await tx.repottingQueueItem.count({
          where: { repottingWindowId: id, status: 'QUEUED' },
        }))
      )
        throw new Error(
          'Reschedule or remove active queue entries before deactivating this window.'
        )
      if (id) await tx.repottingWindow.update({ where: { id }, data })
      else await tx.repottingWindow.create({ data })
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action,
        entityType: 'REPOTTING_WINDOW',
        entityId: id || null,
        summary: 'Managed repotting window',
      },
    })
  })
  revalidatePath('/', 'layout')
}
export async function saveRepottingAssignments(fd: FormData) {
  const { collection, user } = await requireCollectionAdmin(
    value(fd, 'collectionSlug')
  )
  await prisma.$transaction(async (tx) => {
    const id = value(fd, 'definitionId'),
      primary = value(fd, 'primary') || null,
      alternate = value(fd, 'alternate') || null
    await tx.plantDefinition.findFirstOrThrow({
      where: { id, collectionId: collection.id },
    })
    await validateWindowAssignments(tx, primary, alternate)
    await tx.plantDefinition.update({
      where: { id },
      data: {
        primaryRepottingWindowId: primary,
        alternateRepottingWindowId: alternate,
      },
    })
    await tx.auditLog.create({
      data: {
        collectionId: collection.id,
        userId: user.id,
        action: 'UPDATE',
        entityType: 'PLANT_DEFINITION',
        entityId: id,
        summary: 'Updated seasonal repotting windows',
      },
    })
  })
  refresh(collection.slug)
}
export async function addToRepottingQueue(fd: FormData) {
  const context = await requireCollectionLogger(value(fd, 'collectionSlug'))
  const timezone = timeZoneForPreference(
    await prisma.emailPreference.findUnique({
      where: { userId: context.user.id },
    })
  )
  await prisma.$transaction(async (tx) => {
    const item = await queueRepotting(tx, {
      collectionId: context.collection.id,
      instanceId: value(fd, 'plantInstanceId'),
      timezone,
      windowId: value(fd, 'windowId') || undefined,
      year: Number(fd.get('year')),
      notes: value(fd, 'notes'),
    })
    await tx.auditLog.create({
      data: {
        collectionId: context.collection.id,
        userId: context.user.id,
        action: 'CREATE',
        entityType: 'REPOTTING_QUEUE',
        entityId: item.id,
        summary: 'Scheduled repotting; no care completion recorded',
      },
    })
  })
  refresh(context.collection.slug)
  redirect(collectionPath(context.collection.slug, '/care/repotting'))
}
export async function updateRepottingQueue(fd: FormData) {
  const context = await requireCollectionLogger(value(fd, 'collectionSlug')),
    action = value(fd, 'action')
  const ids = [...new Set(fd.getAll('itemId').map(String))]
  if (!ids.length || ids.length > 50)
    throw new Error('Select between 1 and 50 entries.')
  if (fd.get('confirmed') !== 'on')
    throw new Error('Confirm this operation before continuing.')
  const tz = timeZoneForPreference(
    await prisma.emailPreference.findUnique({
      where: { userId: context.user.id },
    })
  )
  await prisma.$transaction(
    async (tx) => {
      if (action === 'RESCHEDULE')
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(9427, 1)`
      for (const id of ids.sort()) {
        await tx.$executeRaw`SELECT id FROM "RepottingQueueItem" WHERE id=${id} FOR UPDATE`
        const item = await tx.repottingQueueItem.findFirstOrThrow({
          where: { id, plantInstance: { collectionId: context.collection.id } },
        })
        if (item.status !== 'QUEUED') continue
        if (action === 'COMPLETE') {
          const details = new FormData()
          for (const [k, v] of fd.entries()) details.append(k, v)
          details.set('plantInstanceId', item.plantInstanceId)
          details.set('taskType', 'REPOT')
          await applyCareQueueMutation(tx, context, 'complete', details)
        } else if (action === 'CANCEL')
          await tx.repottingQueueItem.update({
            where: { id },
            data: { status: 'CANCELED', canceledAt: new Date() },
          })
        else if (action === 'RESCHEDULE') {
          const w = await tx.repottingWindow.findFirstOrThrow({
              where: { id: value(fd, 'windowId'), isActive: true },
            }),
            year = Number(fd.get('year'))
          if (windowOccurrence(w, year, tz).endDate < new Date())
            throw new Error('Choose a current or future occurrence.')
          const definition = await tx.plantInstance.findUniqueOrThrow({
            where: { id: item.plantInstanceId },
            include: { plantDefinition: true },
          })
          await tx.repottingQueueItem.update({
            where: { id },
            data: {
              assignmentSnapshot: {
                primary: definition.plantDefinition.primaryRepottingWindowId,
                alternate:
                  definition.plantDefinition.alternateRepottingWindowId,
              },
              repottingWindowId: w.id,
              scheduledYear: year,
              notes: value(fd, 'notes') || item.notes,
            },
          })
        } else throw new Error('Invalid queue action.')
        await tx.auditLog.create({
          data: {
            collectionId: context.collection.id,
            userId: context.user.id,
            action,
            entityType: 'REPOTTING_QUEUE',
            entityId: id,
            summary: `Repotting planner: ${action.toLowerCase()}`,
          },
        })
      }
    },
    { timeout: 30000 }
  )
  refresh(context.collection.slug)
}
