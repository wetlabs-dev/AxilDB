'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionLogger, requireCollectionManager } from '@/lib/collections'
import { collectionRoleAtLeast } from '@/lib/roles'
import { addCalendarDays, parseDateLocal, parseDateTimeLocal, timeZoneForPreference } from '@/lib/time'
import { normalizeQuarantineRiskLevel, quarantineChecklistItems } from '@/lib/locations'
import { workflowStepTypes } from '@/lib/workflows'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const optional = (fd: FormData, key: string) => val(fd, key) || null
const back = (fd: FormData) => val(fd, 'back') || '/'
const uniqueIds = (values: FormDataEntryValue[]) => Array.from(new Set(values.map((value) => String(value)).filter(Boolean)))

function validStepType(value: string) {
  return workflowStepTypes.includes(value as any) ? value : 'CUSTOM_TASK'
}

function careEventForWorkflowStep(stepType: string, fallback?: string | null) {
  if (stepType === 'WATER') return 'WATERED'
  if (stepType === 'FERTILIZE') return 'FERTILIZED'
  if (stepType === 'PEST_CHECK') return 'PEST_CHECK'
  if (stepType === 'HEALTH_CHECK') return 'HEALTH_CHECK'
  if (stepType === 'PROPAGATION_CHECK') return 'PROPAGATION_CHECK'
  if (stepType === 'BLOOM_CHECK') return 'BLOOM_CHECK'
  return fallback || 'OTHER'
}

async function workflowRunWithSteps(runId: string, collectionId: string) {
  return prisma.workflowRun.findFirstOrThrow({
    where: { id: runId, collectionId },
    include: {
      steps: { orderBy: { sortOrder: 'asc' } },
      plants: { include: { plantInstance: true } },
      location: true,
    },
  })
}

export async function createWorkflowTemplate(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const template = await prisma.workflowTemplate.create({
    data: {
      collectionId: context.collection.id,
      createdByUserId: context.user.id,
      name: val(fd, 'name') || 'Untitled workflow',
      description: optional(fd, 'description'),
      category: optional(fd, 'category'),
      triggerType: optional(fd, 'triggerType'),
      triggerConfigJson: val(fd, 'triggerConfigJson') ? { note: val(fd, 'triggerConfigJson') } : undefined,
      isTriggerEnabled: false,
    },
  })
  await audit(context.user, 'CREATE', 'WORKFLOW_TEMPLATE', template.id, `Created workflow template ${template.name}`, undefined, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, '/workflows'))
  redirect(collectionPath(context.collection.slug, `/workflows/templates/${template.id}`))
}

export async function updateWorkflowTemplate(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'templateId')
  const template = await prisma.workflowTemplate.findFirstOrThrow({ where: { id, collectionId: context.collection.id } })
  await prisma.workflowTemplate.update({
    where: { id },
    data: {
      name: val(fd, 'name') || template.name,
      description: optional(fd, 'description'),
      category: optional(fd, 'category'),
      triggerType: optional(fd, 'triggerType'),
      triggerConfigJson: val(fd, 'triggerConfigJson') ? { note: val(fd, 'triggerConfigJson') } : undefined,
      isTriggerEnabled: false,
    },
  })
  await audit(context.user, 'UPDATE', 'WORKFLOW_TEMPLATE', id, `Updated workflow template ${template.name}`, undefined, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, `/workflows/templates/${id}`))
  redirect(back(fd))
}

export async function archiveWorkflowTemplate(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'templateId')
  const template = await prisma.workflowTemplate.findFirstOrThrow({ where: { id, collectionId: context.collection.id } })
  await prisma.workflowTemplate.update({ where: { id }, data: { isArchived: true } })
  await audit(context.user, 'ARCHIVE', 'WORKFLOW_TEMPLATE', id, `Archived workflow template ${template.name}`, undefined, context.collection.id)
  redirect(collectionPath(context.collection.slug, '/workflows'))
}

export async function copyWorkflowTemplate(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'templateId')
  const template = await prisma.workflowTemplate.findFirstOrThrow({
    where: { id, collectionId: context.collection.id },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  })
  const copy = await prisma.workflowTemplate.create({
    data: {
      collectionId: context.collection.id,
      createdByUserId: context.user.id,
      name: `${template.name} copy`,
      description: template.description,
      category: template.category,
      triggerType: template.triggerType,
      triggerConfigJson: template.triggerConfigJson as any,
      isTriggerEnabled: false,
      steps: {
        create: template.steps.map((step) => ({
          stepType: step.stepType,
          title: step.title,
          instructions: step.instructions,
          required: step.required,
          sortOrder: step.sortOrder,
          configJson: step.configJson as any,
          outputBehavior: step.outputBehavior,
        })),
      },
    },
  })
  await audit(context.user, 'COPY', 'WORKFLOW_TEMPLATE', copy.id, `Copied workflow template ${template.name}`, { sourceTemplateId: template.id }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/workflows/templates/${copy.id}`))
}

export async function addWorkflowStep(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const templateId = val(fd, 'templateId')
  const template = await prisma.workflowTemplate.findFirstOrThrow({
    where: { id: templateId, collectionId: context.collection.id },
    include: { _count: { select: { steps: true } } },
  })
  await prisma.workflowStep.create({
    data: {
      templateId,
      stepType: validStepType(val(fd, 'stepType')),
      title: val(fd, 'title') || 'New workflow step',
      instructions: optional(fd, 'instructions'),
      required: fd.get('required') !== 'off',
      sortOrder: (template._count.steps + 1) * 10,
      outputBehavior: 'RECORD_OR_CONFIRM',
    },
  })
  await audit(context.user, 'CREATE', 'WORKFLOW_STEP', templateId, `Added step to ${template.name}`, undefined, context.collection.id)
  redirect(back(fd))
}

export async function updateWorkflowStep(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'stepId')
  const step = await prisma.workflowStep.findFirstOrThrow({ where: { id, template: { collectionId: context.collection.id } }, include: { template: true } })
  await prisma.workflowStep.update({
    where: { id },
    data: {
      stepType: validStepType(val(fd, 'stepType')),
      title: val(fd, 'title') || step.title,
      instructions: optional(fd, 'instructions'),
      required: fd.get('required') === 'on',
      configJson: val(fd, 'configJson') ? { note: val(fd, 'configJson') } : undefined,
    },
  })
  await audit(context.user, 'UPDATE', 'WORKFLOW_STEP', id, `Updated workflow step ${step.title}`, undefined, context.collection.id)
  redirect(back(fd))
}

export async function moveWorkflowStep(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'stepId')
  const direction = val(fd, 'direction') === 'down' ? 1 : -1
  const step = await prisma.workflowStep.findFirstOrThrow({ where: { id, template: { collectionId: context.collection.id } }, include: { template: { include: { steps: { orderBy: { sortOrder: 'asc' } } } } } })
  const steps = step.template.steps
  const index = steps.findIndex((candidate) => candidate.id === id)
  const swap = steps[index + direction]
  if (swap) {
    await prisma.$transaction([
      prisma.workflowStep.update({ where: { id: step.id }, data: { sortOrder: swap.sortOrder } }),
      prisma.workflowStep.update({ where: { id: swap.id }, data: { sortOrder: step.sortOrder } }),
    ])
  }
  redirect(back(fd))
}

export async function duplicateWorkflowStep(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'stepId')
  const step = await prisma.workflowStep.findFirstOrThrow({ where: { id, template: { collectionId: context.collection.id } } })
  await prisma.workflowStep.create({
    data: {
      templateId: step.templateId,
      stepType: step.stepType,
      title: `${step.title} copy`,
      instructions: step.instructions,
      required: step.required,
      sortOrder: step.sortOrder + 1,
      configJson: step.configJson as any,
      outputBehavior: step.outputBehavior,
    },
  })
  redirect(back(fd))
}

export async function deleteWorkflowStep(fd: FormData) {
  const context = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'stepId')
  await prisma.workflowStep.deleteMany({ where: { id, template: { collectionId: context.collection.id } } })
  await audit(context.user, 'DELETE', 'WORKFLOW_STEP', id, 'Deleted workflow step', undefined, context.collection.id)
  redirect(back(fd))
}

export async function startWorkflowRun(fd: FormData) {
  const context = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const templateId = val(fd, 'templateId')
  const scopeType = ['COLLECTION', 'LOCATION', 'PLANTS'].includes(val(fd, 'scopeType')) ? val(fd, 'scopeType') : 'COLLECTION'
  const template = await prisma.workflowTemplate.findFirstOrThrow({
    where: { id: templateId, collectionId: context.collection.id, isArchived: false },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  })
  const locationId = scopeType === 'LOCATION' ? optional(fd, 'locationId') : null
  if (locationId) await prisma.location.findFirstOrThrow({ where: { id: locationId, collectionId: context.collection.id } })
  const explicitPlantIds = uniqueIds(fd.getAll('plantInstanceId'))
  const plants = explicitPlantIds.length
    ? await prisma.plantInstance.findMany({ where: { id: { in: explicitPlantIds }, collectionId: context.collection.id, status: 'ACTIVE' }, select: { id: true } })
    : locationId
      ? await prisma.plantInstance.findMany({ where: { collectionId: context.collection.id, currentLocationId: locationId, status: 'ACTIVE' }, select: { id: true } })
      : []
  const run = await prisma.workflowRun.create({
    data: {
      collectionId: context.collection.id,
      templateId: template.id,
      title: val(fd, 'title') || template.name,
      scopeType,
      locationId,
      assignedToUserId: optional(fd, 'assignedToUserId'),
      startedByUserId: context.user.id,
      triggerType: template.triggerType,
      triggerConfigJson: template.triggerConfigJson as any,
      isTriggerEnabled: false,
      plants: { create: plants.map((plant) => ({ collectionId: context.collection.id, plantInstanceId: plant.id })) },
      steps: {
        create: template.steps.map((step) => ({
          collectionId: context.collection.id,
          templateStepId: step.id,
          stepType: step.stepType,
          title: step.title,
          instructions: step.instructions,
          required: step.required,
          sortOrder: step.sortOrder,
          configJson: step.configJson as any,
        })),
      },
    },
  })
  await audit(context.user, 'START', 'WORKFLOW_RUN', run.id, `Started workflow ${run.title}`, { templateId: template.id, scopeType, locationId, plantCount: plants.length }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/workflows/runs/${run.id}`))
}

export async function completeWorkflowRunStep(fd: FormData) {
  const context = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const stepId = val(fd, 'runStepId')
  const step = await prisma.workflowRunStep.findFirstOrThrow({
    where: { id: stepId, collectionId: context.collection.id },
    include: { run: { include: { plants: true } } },
  })
  if (step.status !== 'PENDING' || step.run.status !== 'ACTIVE') redirect(back(fd))
  if (['RELOCATE', 'START_QUARANTINE', 'RELEASE_QUARANTINE'].includes(step.stepType) && !collectionRoleAtLeast(context.role, 'GARDENER')) {
    throw new Error('This workflow step requires gardener access.')
  }

  const preferences = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
  const timezone = timeZoneForPreference(preferences)
  const selectedPlantIds = uniqueIds(fd.getAll('plantInstanceId'))
  const fallbackPlantIds = step.run.plants.map((plant) => plant.plantInstanceId)
  const targetPlantIds = selectedPlantIds.length ? selectedPlantIds : fallbackPlantIds
  const plants = targetPlantIds.length
    ? await prisma.plantInstance.findMany({
        where: { id: { in: targetPlantIds }, collectionId: context.collection.id, status: { not: 'ARCHIVED' } },
        select: { id: true, plantId: true, currentLocationId: true },
      })
    : []
  const notes = optional(fd, 'notes')
  const performedAt = parseDateLocal(val(fd, 'performedAt'), timezone) || new Date()
  const createdRecords: { type: string; id: string }[] = []

  if (['WATER', 'FERTILIZE', 'PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK', 'CREATE_CARE_EVENT'].includes(step.stepType)) {
    for (const plant of plants) {
      const event = await prisma.plantCareEvent.create({
        data: {
          collectionId: context.collection.id,
          plantInstanceId: plant.id,
          userId: context.user.id,
          eventType: careEventForWorkflowStep(step.stepType, optional(fd, 'careEventType')),
          performedAt,
          notes,
          metadata: { source: 'WORKFLOW', workflowRunId: step.runId, workflowRunStepId: step.id, result: optional(fd, 'result') },
        },
      })
      createdRecords.push({ type: 'PLANT_CARE_EVENT', id: event.id })
    }
    if (fd.get('createCondition') === 'on') {
      for (const plant of plants) {
        const condition = await prisma.plantCondition.create({
          data: {
            collectionId: context.collection.id,
            plantInstanceId: plant.id,
            userId: context.user.id,
            category: step.stepType === 'PEST_CHECK' ? 'PESTS' : 'OTHER',
            severity: val(fd, 'severity') || 'MODERATE',
            status: val(fd, 'conditionStatus') || 'OPEN',
            observedAt: performedAt,
            notes,
          },
        })
        createdRecords.push({ type: 'PLANT_CONDITION', id: condition.id })
      }
    }
  }

  if (step.stepType === 'ADD_NOTE') {
    const targetType = plants[0] ? 'PLANT_INSTANCE' : step.run.locationId ? 'LOCATION' : 'COLLECTION'
    const targets = plants.length ? plants.map((plant) => plant.id) : [step.run.locationId || context.collection.id]
    for (const entityId of targets) {
      const note = await prisma.note.create({
        data: { collectionId: context.collection.id, entityType: targetType, entityId, note: notes || step.title },
      })
      createdRecords.push({ type: 'NOTE', id: note.id })
    }
  }

  if (step.stepType === 'RELOCATE') {
    const destinationLocationId = optional(fd, 'destinationLocationId')
    const destination = destinationLocationId ? await prisma.location.findFirstOrThrow({ where: { id: destinationLocationId, collectionId: context.collection.id } }) : null
    for (const plant of plants) {
      await prisma.plantInstance.update({
        where: { id: plant.id },
        data: { currentLocationId: destination?.id || null, location: destination?.name || null },
      })
      const move = await prisma.plantLocationMove.create({
        data: {
          collectionId: context.collection.id,
          plantInstanceId: plant.id,
          fromLocationId: plant.currentLocationId,
          toLocationId: destination?.id || null,
          movedByUserId: context.user.id,
          notes,
        },
      })
      createdRecords.push({ type: 'PLANT_LOCATION_MOVE', id: move.id })
    }
  }

  if (step.stepType === 'START_QUARANTINE') {
    const targetReleaseDate = parseDateLocal(val(fd, 'targetReleaseDate'), timezone) || addCalendarDays(new Date(), 14, timezone)
    for (const plant of plants) {
      const existing = await prisma.plantQuarantine.findFirst({ where: { collectionId: context.collection.id, plantInstanceId: plant.id, status: 'ACTIVE' } })
      if (existing) continue
      const quarantine = await prisma.plantQuarantine.create({
        data: {
          collectionId: context.collection.id,
          plantInstanceId: plant.id,
          quarantineLocationId: optional(fd, 'quarantineLocationId'),
          reason: val(fd, 'reason') || 'Workflow quarantine',
          riskLevel: normalizeQuarantineRiskLevel(val(fd, 'riskLevel')),
          startDate: performedAt,
          targetReleaseDate,
          notes,
          checklistJson: quarantineChecklistItems.map((label) => ({ label, done: false })) as any,
          createdByUserId: context.user.id,
        },
      })
      createdRecords.push({ type: 'PLANT_QUARANTINE', id: quarantine.id })
    }
  }

  if (step.stepType === 'RELEASE_QUARANTINE') {
    for (const plant of plants) {
      const quarantine = await prisma.plantQuarantine.findFirst({ where: { collectionId: context.collection.id, plantInstanceId: plant.id, status: 'ACTIVE' } })
      if (!quarantine) continue
      await prisma.plantQuarantine.update({ where: { id: quarantine.id }, data: { status: 'RELEASED', releasedAt: new Date(), releasedByUserId: context.user.id, notes: notes || quarantine.notes } })
      createdRecords.push({ type: 'PLANT_QUARANTINE_RELEASE', id: quarantine.id })
    }
  }

  if (step.stepType === 'CREATE_REMINDER') {
    const dueAt = parseDateTimeLocal(val(fd, 'dueAt'), timezone) || addCalendarDays(new Date(), 7, timezone)
    const targets = plants.length ? plants.map((plant) => ({ type: 'PLANT_INSTANCE', id: plant.id })) : [{ type: step.run.locationId ? 'LOCATION' : 'COLLECTION', id: step.run.locationId || context.collection.id }]
    for (const target of targets) {
      const reminder = await prisma.reminder.create({
        data: {
          collectionId: context.collection.id,
          userId: context.user.id,
          title: val(fd, 'reminderTitle') || step.title,
          body: notes,
          category: val(fd, 'category') || 'GENERAL',
          entityType: target.type,
          entityId: target.id,
          dueAt,
          nextSendAt: dueAt,
          rrule: optional(fd, 'rrule'),
        },
      })
      createdRecords.push({ type: 'REMINDER', id: reminder.id })
    }
  }

  await prisma.workflowRunStep.update({
    where: { id: step.id },
    data: {
      status: 'COMPLETED',
      completedByUserId: context.user.id,
      completedAt: new Date(),
      notes,
      outputJson: { result: optional(fd, 'result'), createdRecords } as any,
      createdRecordType: createdRecords[0]?.type || null,
      createdRecordId: createdRecords[0]?.id || null,
    },
  })
  await audit(context.user, 'COMPLETE', 'WORKFLOW_RUN_STEP', step.id, `Completed workflow step ${step.title}`, { workflowRunId: step.runId, createdRecords }, context.collection.id)
  revalidatePath(collectionPath(context.collection.slug, `/workflows/runs/${step.runId}`))
  for (const plant of plants) revalidatePath(collectionPath(context.collection.slug, `/instances/${plant.id}`))
  redirect(back(fd))
}

export async function skipWorkflowRunStep(fd: FormData) {
  const context = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const id = val(fd, 'runStepId')
  const step = await prisma.workflowRunStep.findFirstOrThrow({ where: { id, collectionId: context.collection.id }, include: { run: true } })
  if (step.run.status !== 'ACTIVE') redirect(back(fd))
  await prisma.workflowRunStep.update({ where: { id }, data: { status: 'SKIPPED', completedByUserId: context.user.id, completedAt: new Date(), notes: optional(fd, 'notes') } })
  await audit(context.user, 'SKIP', 'WORKFLOW_RUN_STEP', id, `Skipped workflow step ${step.title}`, undefined, context.collection.id)
  redirect(back(fd))
}

export async function completeWorkflowRun(fd: FormData) {
  const context = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'runId')
  const run = await workflowRunWithSteps(id, context.collection.id)
  const requiredPending = run.steps.some((step) => step.required && step.status === 'PENDING')
  if (requiredPending) redirect(`${back(fd)}?workflow=required-pending`)
  await prisma.workflowRun.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), summary: optional(fd, 'summary') } })
  await audit(context.user, 'COMPLETE', 'WORKFLOW_RUN', id, `Completed workflow ${run.title}`, undefined, context.collection.id)
  redirect(collectionPath(context.collection.slug, '/workflows?run=completed'))
}

export async function cancelWorkflowRun(fd: FormData) {
  const context = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'runId')
  const run = await prisma.workflowRun.findFirstOrThrow({ where: { id, collectionId: context.collection.id } })
  await prisma.workflowRun.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), summary: optional(fd, 'summary') } })
  await audit(context.user, 'CANCEL', 'WORKFLOW_RUN', id, `Cancelled workflow ${run.title}`, undefined, context.collection.id)
  redirect(collectionPath(context.collection.slug, '/workflows?run=cancelled'))
}
