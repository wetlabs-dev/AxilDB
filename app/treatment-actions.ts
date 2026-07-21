'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionLogger } from '@/lib/collections'
import { emitDomainEvent } from '@/lib/events/emit'
import { prisma } from '@/lib/prisma'
import { parseDateLocal, parseDateTimeLocal, timeZoneForPreference } from '@/lib/time'
import {
  buildTreatmentPlanSteps,
  treatmentApplicationMethods,
  treatmentCategories,
  treatmentConditionTypes,
  treatmentDoseUnits,
  treatmentEffectiveness,
  treatmentFinalOutcomes,
  treatmentSafetyWarnings,
  treatmentSlug,
  treatmentSnapshot,
} from '@/lib/treatments'

const value = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const optional = (fd: FormData, key: string, max = 4000) => value(fd, key).slice(0, max) || null
const checked = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true'
const number = (fd: FormData, key: string) => {
  const raw = value(fd, key)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}
const integer = (fd: FormData, key: string) => {
  const parsed = number(fd, key)
  return parsed == null ? null : Math.round(parsed)
}
const allowed = <T extends readonly string[]>(raw: string, values: T) => values.includes(raw) ? raw : null
const selected = (fd: FormData, key: string) => fd.getAll(key).map(String).map((item) => item.trim()).filter(Boolean)
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

export async function saveTreatmentDefinition(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id') || null
  const name = value(fd, 'name').slice(0, 160)
  const slug = treatmentSlug(name)
  const category = allowed(value(fd, 'category'), treatmentCategories)
  if (!name || !slug || !category) throw new Error('Enter a treatment name and category.')
  const conditionTypes = selected(fd, 'conditionTypes').filter((item) => treatmentConditionTypes.includes(item as typeof treatmentConditionTypes[number]))
  const productIds = selected(fd, 'productIds')
  const tagCautionIds = selected(fd, 'cautionTagIds')
  const ppeRequirements = selected(fd, 'ppeRequirements').slice(0, 12)
  const validProducts = await prisma.treatmentProduct.findMany({ where: { id: { in: productIds }, collectionId: collection.id }, select: { id: true } })
  const validTags = await prisma.plantTag.findMany({ where: { id: { in: tagCautionIds }, collectionId: collection.id, active: true }, select: { id: true, name: true } })
  if (validProducts.length !== productIds.length || validTags.length !== tagCautionIds.length) throw new Error('A selected product or caution tag is not available in this collection.')
  const duplicate = await prisma.treatmentDefinition.findFirst({ where: { collectionId: collection.id, slug, ...(id ? { NOT: { id } } : {}) } })
  if (duplicate) throw new Error(`A treatment named ${duplicate.name} already exists.`)
  const data = {
    name, slug, category,
    targetSummary: optional(fd, 'targetSummary'), instructions: optional(fd, 'instructions'),
    manufacturerDoseText: optional(fd, 'manufacturerDoseText'), defaultDoseAmount: number(fd, 'defaultDoseAmount'),
    defaultDoseUnit: allowed(value(fd, 'defaultDoseUnit'), treatmentDoseUnits), defaultWaterVolumeMl: number(fd, 'defaultWaterVolumeMl'),
    defaultStrength: optional(fd, 'defaultStrength', 160), applicationMethod: allowed(value(fd, 'applicationMethod'), treatmentApplicationMethods),
    minimumIntervalDays: integer(fd, 'minimumIntervalDays'), defaultRepeatCount: integer(fd, 'defaultRepeatCount'),
    defaultRepeatIntervalDays: integer(fd, 'defaultRepeatIntervalDays'), defaultFollowUpDays: integer(fd, 'defaultFollowUpDays'),
    requiresQuarantine: checked(fd, 'requiresQuarantine'), reentryIntervalHours: integer(fd, 'reentryIntervalHours'),
    ventilationRequired: checked(fd, 'ventilationRequired'), indoorUseAllowed: value(fd, 'indoorUseAllowed') === '' ? null : value(fd, 'indoorUseAllowed') === 'true',
    avoidBlooms: checked(fd, 'avoidBlooms'), avoidHeat: checked(fd, 'avoidHeat'), avoidDirectLight: checked(fd, 'avoidDirectLight'),
    ppeRequirementsJson: json(ppeRequirements), safetyNotes: optional(fd, 'safetyNotes'), contraindications: optional(fd, 'contraindications'),
  }
  const saved = await prisma.$transaction(async (tx) => {
    const treatment = id
      ? await tx.treatmentDefinition.update({ where: { id, collectionId: collection.id }, data })
      : await tx.treatmentDefinition.create({ data: { collectionId: collection.id, createdByUserId: user.id, ...data } })
    await tx.treatmentConditionType.deleteMany({ where: { treatmentDefinitionId: treatment.id } })
    await tx.treatmentDefinitionProduct.deleteMany({ where: { treatmentDefinitionId: treatment.id } })
    await tx.treatmentTagCaution.deleteMany({ where: { treatmentDefinitionId: treatment.id } })
    if (conditionTypes.length) await tx.treatmentConditionType.createMany({ data: conditionTypes.map((conditionType) => ({ collectionId: collection.id, treatmentDefinitionId: treatment.id, conditionType })) })
    if (validProducts.length) await tx.treatmentDefinitionProduct.createMany({ data: validProducts.map((product, sortOrder) => ({ collectionId: collection.id, treatmentDefinitionId: treatment.id, treatmentProductId: product.id, sortOrder })) })
    if (validTags.length) await tx.treatmentTagCaution.createMany({ data: validTags.map((tag) => ({ collectionId: collection.id, treatmentDefinitionId: treatment.id, plantTagId: tag.id, warningText: `Use extra caution for plants tagged ${tag.name}.` })) })
    await emitDomainEvent(tx, { eventType: id ? 'treatment.definition_updated' : 'treatment.definition_created', collectionId: collection.id, aggregateId: treatment.id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-definition:${treatment.id}:${treatment.updatedAt.toISOString()}`, payload: { subjectId: treatment.id, displayName: treatment.name, category: treatment.category } })
    return treatment
  })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'TREATMENT_DEFINITION', saved.id, `${id ? 'Updated' : 'Created'} treatment ${saved.name}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, `/treatments?selected=${saved.id}`))
}

export async function setTreatmentDefinitionActive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id'); const active = value(fd, 'active') === 'true'
  const saved = await prisma.treatmentDefinition.update({ where: { id, collectionId: collection.id }, data: { active } })
  await audit(user, active ? 'RESTORE' : 'ARCHIVE', 'TREATMENT_DEFINITION', saved.id, `${active ? 'Activated' : 'Archived'} treatment ${saved.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/treatments'))
}

export async function saveTreatmentProduct(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id') || null
  const name = value(fd, 'name').slice(0, 160)
  if (!name) throw new Error('Enter a product name.')
  const data = {
    name, manufacturer: optional(fd, 'manufacturer', 160), productType: optional(fd, 'productType', 120),
    activeIngredient: optional(fd, 'activeIngredient', 300), concentration: optional(fd, 'concentration', 120),
    registrationNumber: optional(fd, 'registrationNumber', 120), form: optional(fd, 'form', 80), containerSize: optional(fd, 'containerSize', 80),
    purchaseDate: value(fd, 'purchaseDate') ? new Date(`${value(fd, 'purchaseDate')}T12:00:00Z`) : null,
    expirationDate: value(fd, 'expirationDate') ? new Date(`${value(fd, 'expirationDate')}T12:00:00Z`) : null,
    lotNumber: optional(fd, 'lotNumber', 120), storageLocation: optional(fd, 'storageLocation', 200),
    labelUrl: optional(fd, 'labelUrl', 1000), safetyDataSheetUrl: optional(fd, 'safetyDataSheetUrl', 1000), labelNotes: optional(fd, 'labelNotes'),
  }
  const saved = await prisma.$transaction(async (tx) => {
    const product = id
      ? await tx.treatmentProduct.update({ where: { id, collectionId: collection.id }, data })
      : await tx.treatmentProduct.create({ data: { collectionId: collection.id, createdByUserId: user.id, ...data } })
    await emitDomainEvent(tx, { eventType: id ? 'treatment.product_updated' : 'treatment.product_created', collectionId: collection.id, aggregateId: product.id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-product:${product.id}:${product.updatedAt.toISOString()}`, payload: { subjectId: product.id, displayName: product.name } })
    return product
  })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'TREATMENT_PRODUCT', saved.id, `${id ? 'Updated' : 'Created'} treatment product ${saved.name}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, '/treatments?view=products'))
}

export async function setTreatmentProductActive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id'); const active = value(fd, 'active') === 'true'
  const saved = await prisma.treatmentProduct.update({ where: { id, collectionId: collection.id }, data: { active } })
  await audit(user, active ? 'RESTORE' : 'ARCHIVE', 'TREATMENT_PRODUCT', saved.id, `${active ? 'Activated' : 'Archived'} treatment product ${saved.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/treatments'))
}

export async function startTreatmentPlan(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  let plantInstanceId = value(fd, 'plantInstanceId'); const plantConditionId = value(fd, 'plantConditionId') || null
  const treatmentDefinitionId = value(fd, 'treatmentDefinitionId')
  const selectedCondition = plantConditionId ? await prisma.plantCondition.findFirstOrThrow({ where: { id: plantConditionId, collectionId: collection.id, status: { in: ['OPEN', 'IMPROVING'] } } }) : null
  if (selectedCondition) plantInstanceId = selectedCondition.plantInstanceId
  const [plant, treatment, condition] = await Promise.all([
    prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId: collection.id }, select: { id: true, plantId: true } }),
    prisma.treatmentDefinition.findFirstOrThrow({ where: { id: treatmentDefinitionId, collectionId: collection.id, active: true } }),
    Promise.resolve(selectedCondition),
  ])
  if (condition) {
    const active = await prisma.treatmentPlan.findFirst({ where: { collectionId: collection.id, plantConditionId: condition.id, status: 'ACTIVE' } })
    if (active && !checked(fd, 'replaceExisting')) throw new Error('This condition already has an active treatment plan. Confirm replacement before starting another.')
    if (active) await prisma.treatmentPlan.update({ where: { id: active.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), finalNotes: 'Replaced by a new treatment plan.' } })
  }
  const timezone = timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } }))
  const startAt = parseDateLocal(value(fd, 'startAt'), timezone) || new Date()
  const steps = buildTreatmentPlanSteps({ startAt, timezone, treatment, repeatCount: integer(fd, 'repeatCount') ?? treatment.defaultRepeatCount, repeatIntervalDays: integer(fd, 'repeatIntervalDays') ?? treatment.defaultRepeatIntervalDays, followUpDays: integer(fd, 'followUpDays') ?? treatment.defaultFollowUpDays })
  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.treatmentPlan.create({ data: { collectionId: collection.id, plantInstanceId, plantConditionId, title: optional(fd, 'title', 200) || `${treatment.name} for ${plant.plantId}`, createdByUserId: user.id, updatedByUserId: user.id, steps: { create: steps.map((step) => ({ collectionId: collection.id, ...step, treatmentSnapshotJson: json(step.treatmentSnapshotJson) })) } } })
    await emitDomainEvent(tx, { eventType: 'treatment.plan_started', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-plan-started:${created.id}`, payload: { subjectId: created.id, plantInstanceId, plantId: plant.plantId, displayName: created.title, treatmentDefinitionId: treatment.id } })
    return created
  })
  await audit(user, 'CREATE', 'TREATMENT_PLAN', plan.id, `Started ${plan.title}`, { plantInstanceId, plantConditionId }, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${plan.id}`))
}

async function applicationContext(collectionId: string, plantInstanceId: string, treatmentDefinitionId: string, conditionId?: string | null) {
  const [plant, treatment, condition, activeBloom, activeQuarantine, lastApplication] = await Promise.all([
    prisma.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId }, include: { plantDefinition: { include: { tags: { include: { plantTag: true } } } } } }),
    prisma.treatmentDefinition.findFirstOrThrow({ where: { id: treatmentDefinitionId, collectionId, active: true }, include: { conditionTypes: true, cautionTags: true, products: { include: { product: true }, orderBy: { sortOrder: 'asc' } } } }),
    conditionId ? prisma.plantCondition.findFirstOrThrow({ where: { id: conditionId, collectionId, plantInstanceId } }) : Promise.resolve(null),
    prisma.bloomEvent.findFirst({ where: { collectionId, plantInstanceId, bloomEndDate: null }, select: { id: true } }),
    prisma.plantQuarantine.findFirst({ where: { collectionId, plantInstanceId, status: 'ACTIVE' }, select: { id: true } }),
    prisma.treatmentApplication.findFirst({ where: { collectionId, plantInstanceId, treatmentDefinitionId }, orderBy: { appliedAt: 'desc' }, select: { appliedAt: true } }),
  ])
  const plantTags = new Set(plant.plantDefinition.tags.map((assignment) => assignment.plantTagId))
  const warnings = treatmentSafetyWarnings({ treatment, conditionCategory: condition?.category, applicableConditionTypes: treatment.conditionTypes.map((item) => item.conditionType), tagCautions: treatment.cautionTags.filter((item) => plantTags.has(item.plantTagId)), activeBloom: Boolean(activeBloom), activeQuarantine: Boolean(activeQuarantine), lastAppliedAt: lastApplication?.appliedAt })
  return { plant, treatment, condition, warnings }
}

export async function recordTreatmentApplication(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(value(fd, 'collectionSlug'))
  const treatmentPlanStepId = value(fd, 'treatmentPlanStepId') || null
  let plantInstanceId = value(fd, 'plantInstanceId'); let conditionId = value(fd, 'plantConditionId') || null
  let treatmentDefinitionId = value(fd, 'treatmentDefinitionId'); let planId: string | null = null
  if (treatmentPlanStepId) {
    const step = await prisma.treatmentPlanStep.findFirstOrThrow({ where: { id: treatmentPlanStepId, collectionId: collection.id }, include: { plan: true } })
    if (step.status !== 'PENDING' || step.stepType !== 'APPLY_TREATMENT' || !step.treatmentDefinitionId) {
      redirect(collectionPath(collection.slug, `/treatments/plans/${step.treatmentPlanId}`))
    }
    plantInstanceId = step.plan.plantInstanceId; conditionId = step.plan.plantConditionId; treatmentDefinitionId = step.treatmentDefinitionId; planId = step.treatmentPlanId
  }
  const context = await applicationContext(collection.id, plantInstanceId, treatmentDefinitionId, conditionId)
  const blocking = context.warnings.some((warning) => warning.severity === 'BLOCKING')
  if ((context.warnings.length || blocking) && !checked(fd, 'acknowledgeWarnings')) throw new Error('Review and acknowledge the treatment safety warnings before recording this application.')
  const productId = value(fd, 'treatmentProductId') || context.treatment.products[0]?.product.id || null
  const product = productId ? context.treatment.products.find((item) => item.product.id === productId)?.product : null
  if (productId && !product) throw new Error('The selected product is not linked to this treatment.')
  const timezone = timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } }))
  const appliedAt = parseDateTimeLocal(value(fd, 'appliedAt'), timezone) || new Date()
  const application = await prisma.$transaction(async (tx) => {
    if (treatmentPlanStepId) {
      const claimed = await tx.treatmentPlanStep.updateMany({ where: { id: treatmentPlanStepId, collectionId: collection.id, status: 'PENDING' }, data: { status: 'IN_PROGRESS' } })
      if (claimed.count !== 1) throw new Error('This treatment step is already being completed.')
    }
    const created = await tx.treatmentApplication.create({ data: {
      collectionId: collection.id, plantInstanceId, plantConditionId: conditionId, treatmentPlanId: planId, treatmentPlanStepId,
      treatmentDefinitionId, treatmentProductId: productId, appliedByUserId: user.id, appliedAt,
      treatmentNameSnapshot: context.treatment.name, productNameSnapshot: product?.name || null,
      doseAmount: number(fd, 'doseAmount'), doseUnit: allowed(value(fd, 'doseUnit'), treatmentDoseUnits), waterVolumeMl: number(fd, 'waterVolumeMl'),
      strength: optional(fd, 'strength', 160), applicationMethod: allowed(value(fd, 'applicationMethod'), treatmentApplicationMethods),
      instructionsSnapshot: context.treatment.instructions, safetySnapshotJson: json(treatmentSnapshot(context.treatment).safety),
      notes: optional(fd, 'notes'), adverseReaction: checked(fd, 'adverseReaction'),
    } })
    if (treatmentPlanStepId) await tx.treatmentPlanStep.update({ where: { id: treatmentPlanStepId }, data: { status: 'COMPLETED', completedAt: appliedAt, completedByUserId: user.id, completionNotes: optional(fd, 'notes') } })
    await emitDomainEvent(tx, { eventType: 'treatment.applied', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, occurredAt: appliedAt, idempotencyKey: `treatment-application:${created.id}`, payload: { subjectId: created.id, plantInstanceId, plantId: context.plant.plantId, displayName: context.treatment.name, treatmentPlanId: planId, adverseReaction: created.adverseReaction } })
    return created
  })
  await audit(user, 'CREATE', 'TREATMENT_APPLICATION', application.id, `Applied ${context.treatment.name} to ${context.plant.plantId}`, { planId, conditionId, warningsAcknowledged: context.warnings.length > 0 }, collection.id)
  redirect(collectionPath(collection.slug, planId ? `/treatments/plans/${planId}` : `/instances/${plantInstanceId}#treatments`))
}

export async function completeTreatmentPlanStep(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentPlanStepId')
  const step = await prisma.treatmentPlanStep.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'PENDING' }, include: { plan: { include: { plantInstance: { select: { plantId: true } } } } } })
  if (step.stepType === 'APPLY_TREATMENT') throw new Error('Treatment application steps require application details.')
  const updated = await prisma.treatmentPlanStep.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: new Date(), completedByUserId: user.id, completionNotes: optional(fd, 'notes') } })
  if (updated.count !== 1) throw new Error('This step was already completed.')
  await audit(user, 'COMPLETE', 'TREATMENT_PLAN_STEP', id, `Completed ${step.title}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${step.treatmentPlanId}`))
}

export async function recordTreatmentOutcome(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(value(fd, 'collectionSlug'))
  const treatmentApplicationId = value(fd, 'treatmentApplicationId')
  const effectiveness = allowed(value(fd, 'effectiveness'), treatmentEffectiveness)
  if (!effectiveness) throw new Error('Choose an effectiveness rating.')
  const application = await prisma.treatmentApplication.findFirstOrThrow({ where: { id: treatmentApplicationId, collectionId: collection.id }, include: { plantInstance: { select: { plantId: true } } } })
  const outcome = await prisma.$transaction(async (tx) => {
    const created = await tx.treatmentApplicationOutcome.create({ data: { collectionId: collection.id, treatmentApplicationId, recordedByUserId: user.id, effectiveness, conditionResponse: optional(fd, 'conditionResponse', 500), adverseEffects: optional(fd, 'adverseEffects', 1000), notes: optional(fd, 'notes') } })
    if (created.adverseEffects) await tx.treatmentApplication.update({ where: { id: application.id }, data: { adverseReaction: true } })
    await emitDomainEvent(tx, { eventType: 'treatment.outcome_recorded', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-outcome:${created.id}`, payload: { subjectId: created.id, plantInstanceId: application.plantInstanceId, plantId: application.plantInstance.plantId, displayName: application.treatmentNameSnapshot, effectiveness } })
    return created
  })
  await audit(user, 'CREATE', 'TREATMENT_APPLICATION_OUTCOME', outcome.id, `Recorded ${effectiveness.toLowerCase()} outcome for ${application.treatmentNameSnapshot}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, application.treatmentPlanId ? `/treatments/plans/${application.treatmentPlanId}` : `/instances/${application.plantInstanceId}#treatments`))
}

export async function correctTreatmentApplication(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentApplicationId')
  const correctionReason = optional(fd, 'correctionReason', 1000)
  if (!correctionReason) throw new Error('Explain why this historical application record is being corrected.')
  const existing = await prisma.treatmentApplication.findFirstOrThrow({ where: { id, collectionId: collection.id }, include: { plantInstance: { select: { plantId: true } } } })
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.treatmentApplication.update({ where: { id }, data: {
      doseAmount: number(fd, 'doseAmount'), doseUnit: allowed(value(fd, 'doseUnit'), treatmentDoseUnits),
      waterVolumeMl: number(fd, 'waterVolumeMl'), strength: optional(fd, 'strength', 160),
      applicationMethod: allowed(value(fd, 'applicationMethod'), treatmentApplicationMethods), notes: optional(fd, 'notes'),
      adverseReaction: checked(fd, 'adverseReaction'), correctedAt: new Date(), correctionReason,
    } })
    await emitDomainEvent(tx, { eventType: 'treatment.application_corrected', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-application-corrected:${id}:${updated.updatedAt.toISOString()}`, payload: { subjectId: id, plantInstanceId: existing.plantInstanceId, plantId: existing.plantInstance.plantId, displayName: existing.treatmentNameSnapshot, correctionReason } })
    return updated
  })
  await audit(user, 'CORRECT', 'TREATMENT_APPLICATION', id, `Corrected ${existing.treatmentNameSnapshot} application`, { correctionReason }, collection.id)
  redirect(collectionPath(collection.slug, existing.treatmentPlanId ? `/treatments/plans/${existing.treatmentPlanId}` : `/instances/${existing.plantInstanceId}#treatments`))
}

export async function closeTreatmentPlan(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentPlanId'); const cancel = value(fd, 'mode') === 'cancel'
  const plan = await prisma.treatmentPlan.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'ACTIVE' }, include: { plantInstance: { select: { plantId: true } }, steps: true } })
  if (!cancel && plan.steps.some((step) => step.required && step.status !== 'COMPLETED')) throw new Error('Complete all required plan steps before closing the plan.')
  const finalOutcome = cancel ? null : allowed(value(fd, 'finalOutcome'), treatmentFinalOutcomes)
  const finalEffectiveness = cancel ? null : allowed(value(fd, 'finalEffectiveness'), treatmentEffectiveness)
  if (!cancel && (!finalOutcome || !finalEffectiveness)) throw new Error('Record a final outcome and effectiveness rating.')
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.treatmentPlan.update({ where: { id }, data: { status: cancel ? 'CANCELLED' : 'COMPLETED', cancelledAt: cancel ? new Date() : null, completedAt: cancel ? null : new Date(), finalOutcome, finalEffectiveness, finalNotes: optional(fd, 'finalNotes'), updatedByUserId: user.id } })
    await emitDomainEvent(tx, { eventType: cancel ? 'treatment.plan_cancelled' : 'treatment.plan_completed', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-plan-${cancel ? 'cancelled' : 'completed'}:${id}:${updated.updatedAt.toISOString()}`, payload: { subjectId: id, plantInstanceId: plan.plantInstanceId, plantId: plan.plantInstance.plantId, displayName: plan.title, finalOutcome, finalEffectiveness } })
    return updated
  })
  await audit(user, cancel ? 'CANCEL' : 'COMPLETE', 'TREATMENT_PLAN', id, `${cancel ? 'Cancelled' : 'Completed'} ${plan.title}`, { finalOutcome, finalEffectiveness }, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${saved.id}`))
}
