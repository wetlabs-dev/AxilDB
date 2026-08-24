'use server'

import { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, getCurrentCollectionSlug, requireCollectionAdmin } from '@/lib/collections'
import { emitDomainEvent } from '@/lib/events/emit'
import { PLANT_INSTANCE_HISTORICAL_CONSTITUENT, plantInstanceMergeReasonValues } from '@/lib/plant-instance-merges'
import { prisma } from '@/lib/prisma'

const value = (formData: FormData, key: string) => String(formData.get(key) || '').trim()
const jsonValue = (input: unknown) => JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue

export async function mergePlantInstances(formData: FormData) {
  const slug = value(formData, 'collectionSlug') || await getCurrentCollectionSlug()
  const { user, collection } = await requireCollectionAdmin(slug)
  const selectedIds = Array.from(new Set(formData.getAll('plantInstanceIds').map(String).filter(Boolean)))
  const survivingPlantInstanceId = value(formData, 'survivingPlantInstanceId')
  const reason = value(formData, 'reason')
  const notes = value(formData, 'notes') || null
  const mergeDateValue = value(formData, 'mergeDate')
  const mergeDate = mergeDateValue ? new Date(`${mergeDateValue}T12:00:00`) : new Date()

  if (selectedIds.length < 2) throw new Error('Select at least two active plant instances to merge.')
  if (!selectedIds.includes(survivingPlantInstanceId)) throw new Error('The surviving plant must be one of the selected specimens.')
  if (!plantInstanceMergeReasonValues.has(reason as never)) throw new Error('Choose a valid merge reason.')
  if (Number.isNaN(mergeDate.getTime())) throw new Error('Choose a valid merge date.')
  if (mergeDate.getTime() > Date.now() + 86_400_000) throw new Error('The merge date cannot be in the future.')

  const selectionFields = ['instanceType', 'currentLocationId', 'source', 'distributor', 'stockNumber', 'acquisitionLabel', 'purchasePrice', 'substrate', 'husbandry'] as const
  const selections = Object.fromEntries(selectionFields.map((field) => [field, value(formData, `${field}SourceId`) || survivingPlantInstanceId]))

  const result = await prisma.$transaction(async (tx) => {
    const instances = await tx.plantInstance.findMany({
      where: { id: { in: selectedIds }, collectionId: collection.id },
      include: { mergeConstituent: true, currentSubstrate: true, husbandryOverride: true },
      orderBy: [{ acquisitionDate: 'asc' }, { createdAt: 'asc' }],
    })
    if (instances.length !== selectedIds.length) throw new Error('One or more selected specimens no longer exist in this collection.')
    const definitionIds = new Set(instances.map((instance) => instance.plantDefinitionId))
    if (definitionIds.size !== 1) throw new Error('Only specimens with the same plant definition can be potted together.')
    if (instances.some((instance) => instance.status !== 'ACTIVE' || instance.mergeConstituent)) throw new Error('Every selected specimen must still be active and unmerged.')

    const byId = new Map(instances.map((instance) => [instance.id, instance]))
    const survivor = byId.get(survivingPlantInstanceId)
    if (!survivor) throw new Error('The selected survivor is unavailable.')
    const constituentPlants = instances.filter((instance) => instance.id !== survivor.id)
    const selected = (field: typeof selectionFields[number]) => byId.get(selections[field]) || survivor

    await tx.plantInstance.update({
      where: { id: survivor.id },
      data: {
        instanceType: selected('instanceType').instanceType,
        currentLocationId: selected('currentLocationId').currentLocationId,
        source: selected('source').source,
        distributor: selected('distributor').distributor,
        stockNumber: selected('stockNumber').stockNumber,
        acquisitionLabel: selected('acquisitionLabel').acquisitionLabel,
        purchasePrice: selected('purchasePrice').purchasePrice,
      },
    })

    const substrateSource = selected('substrate').currentSubstrate
    if (substrateSource && substrateSource.plantInstanceId !== survivor.id) {
      const existing = survivor.currentSubstrate
      await tx.plantInstanceSubstrate.upsert({
        where: { plantInstanceId: survivor.id },
        update: {
          substrateMode: substrateSource.substrateMode,
          substrateRecipeVersionId: substrateSource.substrateRecipeVersionId,
          receivedSubstrateDescription: substrateSource.receivedSubstrateDescription,
          startedAt: substrateSource.startedAt,
          notes: substrateSource.notes,
        },
        create: {
          collectionId: collection.id,
          plantInstanceId: survivor.id,
          substrateMode: substrateSource.substrateMode,
          substrateRecipeVersionId: substrateSource.substrateRecipeVersionId,
          receivedSubstrateDescription: substrateSource.receivedSubstrateDescription,
          startedAt: substrateSource.startedAt,
          notes: substrateSource.notes,
        },
      })
      await tx.plantSubstrateHistory.create({ data: {
        collectionId: collection.id, plantInstanceId: survivor.id,
        previousMode: existing?.substrateMode, previousRecipeVersionId: existing?.substrateRecipeVersionId, previousDescription: existing?.receivedSubstrateDescription,
        newMode: substrateSource.substrateMode, newRecipeVersionId: substrateSource.substrateRecipeVersionId, newDescription: substrateSource.receivedSubstrateDescription,
        changedAt: mergeDate, reason: 'Selected during Pot Together merge', changedByUserId: user.id, notes: `Current substrate selected from ${selected('substrate').plantId}.`,
      } })
    }
    const husbandrySource = selected('husbandry').husbandryOverride
    if (husbandrySource && husbandrySource.plantInstanceId !== survivor.id) {
      const { id: _id, plantInstanceId: _plantInstanceId, createdAt: _createdAt, updatedAt: _updatedAt, ...husbandryData } = husbandrySource
      await tx.plantHusbandryOverride.upsert({
        where: { plantInstanceId: survivor.id },
        update: husbandryData,
        create: { ...husbandryData, collectionId: collection.id, plantInstanceId: survivor.id },
      })
    }

    const merge = await tx.plantInstanceMerge.create({
      data: {
        collectionId: collection.id,
        survivingPlantInstanceId: survivor.id,
        mergeDate,
        reason,
        notes,
        metadataSelectionsJson: jsonValue(selections),
        createdByUserId: user.id,
        constituents: {
          create: constituentPlants.map((instance) => ({
            plantInstanceId: instance.id,
            originalPlantId: instance.plantId,
            originalSnapshotJson: jsonValue({
              plantId: instance.plantId,
              status: instance.status,
              instanceType: instance.instanceType,
              acquisitionDate: instance.acquisitionDate,
              propagationDate: instance.propagationDate,
              currentLocationId: instance.currentLocationId,
              source: instance.source,
              distributor: instance.distributor,
              stockNumber: instance.stockNumber,
              acquisitionLabel: instance.acquisitionLabel,
              purchasePrice: instance.purchasePrice?.toString() || null,
            }),
          })),
        },
      },
    })

    const constituentIds = constituentPlants.map((instance) => instance.id)
    await tx.plantInstance.updateMany({
      where: { id: { in: constituentIds }, collectionId: collection.id, status: 'ACTIVE' },
      data: {
        status: PLANT_INSTANCE_HISTORICAL_CONSTITUENT,
        currentLocationId: null,
        archiveDate: mergeDate,
        archiveReason: 'MERGED_INTO_SURVIVOR',
        archiveNotes: `Merged into ${survivor.plantId}.`,
      },
    })
    await tx.reminder.updateMany({
      where: { collectionId: collection.id, entityType: 'PLANT_INSTANCE', entityId: { in: constituentIds }, completedAt: null, pausedAt: null },
      data: { pausedAt: mergeDate, nextSendAt: null },
    })
    await tx.plantCareAdjustment.updateMany({
      where: { collectionId: collection.id, plantInstanceId: { in: constituentIds } },
      data: { disabled: true, snoozedUntil: null, nextDueAt: null },
    })
    const exhibitEntries = await tx.collectionExhibitPlant.findMany({ where: { plantInstanceId: { in: constituentIds } }, orderBy: { sortOrder: 'asc' } })
    for (const exhibitId of new Set(exhibitEntries.map((entry) => entry.exhibitId))) {
      const entries = exhibitEntries.filter((entry) => entry.exhibitId === exhibitId)
      const survivorEntry = await tx.collectionExhibitPlant.findUnique({ where: { exhibitId_plantInstanceId: { exhibitId, plantInstanceId: survivor.id } } })
      if (survivorEntry) await tx.collectionExhibitPlant.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } })
      else if (entries[0]) {
        await tx.collectionExhibitPlant.update({ where: { id: entries[0].id }, data: { plantInstanceId: survivor.id } })
        if (entries.length > 1) await tx.collectionExhibitPlant.deleteMany({ where: { id: { in: entries.slice(1).map((entry) => entry.id) } } })
      }
    }
    const activeWorkflowEntries = await tx.workflowRunPlant.findMany({ where: { plantInstanceId: { in: constituentIds }, run: { status: 'ACTIVE' } } })
    for (const runId of new Set(activeWorkflowEntries.map((entry) => entry.runId))) {
      const entries = activeWorkflowEntries.filter((entry) => entry.runId === runId)
      const survivorEntry = await tx.workflowRunPlant.findUnique({ where: { runId_plantInstanceId: { runId, plantInstanceId: survivor.id } } })
      if (survivorEntry) await tx.workflowRunPlant.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } })
      else if (entries[0]) {
        await tx.workflowRunPlant.update({ where: { id: entries[0].id }, data: { plantInstanceId: survivor.id } })
        if (entries.length > 1) await tx.workflowRunPlant.deleteMany({ where: { id: { in: entries.slice(1).map((entry) => entry.id) } } })
      }
    }
    for (const constituent of constituentPlants) {
      const origin = `Originally recorded on ${constituent.plantId}.`
      const [conditions, treatmentPlans, quarantines] = await Promise.all([
        tx.plantCondition.findMany({ where: { collectionId: collection.id, plantInstanceId: constituent.id, status: { not: 'RESOLVED' } }, select: { id: true, notes: true } }),
        tx.treatmentPlan.findMany({ where: { collectionId: collection.id, plantInstanceId: constituent.id, status: 'ACTIVE' }, select: { id: true, description: true } }),
        tx.plantQuarantine.findMany({ where: { collectionId: collection.id, plantInstanceId: constituent.id, status: 'ACTIVE' }, select: { id: true, notes: true } }),
      ])
      for (const condition of conditions) await tx.plantCondition.update({ where: { id: condition.id }, data: { plantInstanceId: survivor.id, notes: [condition.notes, origin].filter(Boolean).join('\n\n') } })
      for (const plan of treatmentPlans) await tx.treatmentPlan.update({ where: { id: plan.id }, data: { plantInstanceId: survivor.id, description: [plan.description, origin].filter(Boolean).join('\n\n') } })
      for (const quarantine of quarantines) await tx.plantQuarantine.update({ where: { id: quarantine.id }, data: { plantInstanceId: survivor.id, notes: [quarantine.notes, origin].filter(Boolean).join('\n\n') } })
      const activeBlooms = await tx.bloomEvent.findMany({ where: { collectionId: collection.id, plantInstanceId: constituent.id, bloomEndDate: null }, select: { id: true, notes: true } })
      for (const bloom of activeBlooms) await tx.bloomEvent.update({ where: { id: bloom.id }, data: { plantInstanceId: survivor.id, notes: [bloom.notes, origin].filter(Boolean).join('\n\n') } })
    }

    const payload = {
      subjectId: survivor.id,
      plantInstanceId: survivor.id,
      plantId: survivor.plantId,
      displayName: survivor.plantId,
      mergeId: merge.id,
      reason,
      summary: notes || `${constituentPlants.length} specimen${constituentPlants.length === 1 ? '' : 's'} merged into ${survivor.plantId}.`,
      constituentPlants: constituentPlants.map((instance) => ({ id: instance.id, plantId: instance.plantId })),
    }
    await emitDomainEvent(tx, {
      eventType: 'plant.merged', collectionId: collection.id, aggregateId: survivor.id,
      actor: { id: user.id, role: user.role }, occurredAt: mergeDate,
      idempotencyKey: `plant-merge:${merge.id}:survivor`, payload,
    })
    for (const constituent of constituentPlants) {
      await emitDomainEvent(tx, {
        eventType: 'plant.merged', collectionId: collection.id, aggregateId: constituent.id,
        actor: { id: user.id, role: user.role }, occurredAt: mergeDate,
        idempotencyKey: `plant-merge:${merge.id}:constituent:${constituent.id}`,
        payload: { ...payload, subjectId: constituent.id, plantInstanceId: constituent.id, plantId: constituent.plantId, survivingPlantInstanceId: survivor.id, survivingPlantId: survivor.plantId },
      })
    }
    return { merge, survivor, constituentPlants }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 })

  await audit(user, 'MERGE', 'PLANT_INSTANCE', result.survivor.id, `Merged ${result.constituentPlants.map((plant) => plant.plantId).join(', ')} into ${result.survivor.plantId}`, {
    mergeId: result.merge.id,
    reason,
    constituentPlantIds: result.constituentPlants.map((plant) => plant.id),
    metadataSelections: selections,
  }, collection.id)

  redirect(collectionPath(collection.slug, `/instances/${result.survivor.id}#merged-specimens`))
}
