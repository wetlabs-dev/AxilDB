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
  parseTreatmentPlanDraft,
  treatmentApplicationMethods,
  treatmentApplicationOutcomes,
  treatmentCategories,
  treatmentConditionTypes,
  treatmentDoseUnits,
  treatmentEffectiveness,
  treatmentFinalOutcomes,
  treatmentPetSafety,
  treatmentSafetyWarnings,
  treatmentStepTypes,
  treatmentSuitability,
  treatmentSlug,
  treatmentSnapshot,
  treatmentTargetAreas,
  addTreatmentDays,
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
const revalidatePlantLocationSurfaces = (collectionSlug: string, plantInstanceId: string) => {
  revalidatePath(collectionPath(collectionSlug, '/care'))
  revalidatePath(collectionPath(collectionSlug, '/instances'))
  revalidatePath(collectionPath(collectionSlug, '/locations'))
  revalidatePath(collectionPath(collectionSlug, `/instances/${plantInstanceId}`))
}

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
    name, slug, category, description: optional(fd, 'description'),
    targetSummary: optional(fd, 'targetSummary'), targetArea: allowed(value(fd, 'targetArea'), treatmentTargetAreas), instructions: optional(fd, 'instructions'),
    manufacturerDoseText: optional(fd, 'manufacturerDoseText'), defaultDoseAmount: number(fd, 'defaultDoseAmount'),
    defaultDoseUnit: allowed(value(fd, 'defaultDoseUnit'), treatmentDoseUnits), defaultWaterVolumeMl: number(fd, 'defaultWaterVolumeMl'),
    defaultStrength: optional(fd, 'defaultStrength', 160), applicationMethod: allowed(value(fd, 'applicationMethod'), treatmentApplicationMethods),
    minimumIntervalDays: integer(fd, 'minimumIntervalDays'), defaultRepeatCount: integer(fd, 'defaultRepeatCount'),
    defaultRepeatIntervalDays: integer(fd, 'defaultRepeatIntervalDays'), defaultFollowUpDays: integer(fd, 'defaultFollowUpDays'),
    maximumApplications: integer(fd, 'maximumApplications'), petSafety: allowed(value(fd, 'petSafety'), treatmentPetSafety),
    requiresQuarantine: checked(fd, 'requiresQuarantine'), reentryIntervalHours: integer(fd, 'reentryIntervalHours'),
    ventilationRequired: checked(fd, 'ventilationRequired'), indoorUseAllowed: value(fd, 'indoorUseAllowed') === '' ? null : value(fd, 'indoorUseAllowed') === 'true',
    outdoorApplicationPreferred: checked(fd, 'outdoorApplicationPreferred'), keepAwayAquaticSystems: checked(fd, 'keepAwayAquaticSystems'),
    temperatureMinC: number(fd, 'temperatureMinC'), temperatureMaxC: number(fd, 'temperatureMaxC'),
    avoidBlooms: checked(fd, 'avoidBlooms'), avoidHeat: checked(fd, 'avoidHeat'), avoidDirectLight: checked(fd, 'avoidDirectLight'),
    ppeRequirementsJson: json(ppeRequirements), safetyNotes: optional(fd, 'safetyNotes'), contraindications: optional(fd, 'contraindications'),
    incompatibilities: optional(fd, 'incompatibilities'), precautions: optional(fd, 'precautions'), disposalNotes: optional(fd, 'disposalNotes'),
    sourceUrlsJson: json(selected(fd, 'sourceUrls').slice(0, 10)),
  }
  const saved = await prisma.$transaction(async (tx) => {
    const treatment = id
      ? await tx.treatmentDefinition.update({ where: { id, collectionId: collection.id }, data })
      : await tx.treatmentDefinition.create({ data: { collectionId: collection.id, createdByUserId: user.id, ...data } })
    await tx.treatmentConditionType.deleteMany({ where: { treatmentDefinitionId: treatment.id } })
    await tx.treatmentDefinitionProduct.deleteMany({ where: { treatmentDefinitionId: treatment.id } })
    await tx.treatmentTagCaution.deleteMany({ where: { treatmentDefinitionId: treatment.id } })
    const suitability = allowed(value(fd, 'conditionSuitability'), treatmentSuitability) || 'POSSIBLE'
    if (conditionTypes.length) await tx.treatmentConditionType.createMany({ data: conditionTypes.map((conditionType) => ({ collectionId: collection.id, treatmentDefinitionId: treatment.id, conditionType, suitability })) })
    if (validProducts.length) await tx.treatmentDefinitionProduct.createMany({ data: validProducts.map((product, sortOrder) => ({ collectionId: collection.id, treatmentDefinitionId: treatment.id, treatmentProductId: product.id, sortOrder, amount: number(fd, `productAmount:${product.id}`), unit: optional(fd, `productUnit:${product.id}`, 40), role: optional(fd, `productRole:${product.id}`, 120) })) })
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
  const activePlans = await prisma.treatmentPlan.count({ where: { collectionId: collection.id, status: 'ACTIVE', steps: { some: { treatmentDefinitionId: id } } } })
  if (!active && activePlans && !checked(fd, 'acknowledgeActivePlans')) throw new Error(`This treatment is used by ${activePlans} active plan(s). Confirm archive to continue.`)
  const saved = await prisma.treatmentDefinition.update({ where: { id, collectionId: collection.id }, data: { active, archivedAt: active ? null : new Date() } })
  await emitDomainEvent(prisma, { eventType: active ? 'treatment.definition_updated' : 'treatment.definition_archived', collectionId: collection.id, aggregateId: saved.id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-definition:${saved.id}:${active ? 'restored' : 'archived'}:${saved.updatedAt.toISOString()}`, payload: { subjectId: saved.id, displayName: saved.name } })
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
    labelUrl: optional(fd, 'labelUrl', 1000), safetyDataSheetUrl: optional(fd, 'safetyDataSheetUrl', 1000), websiteUrl: optional(fd, 'websiteUrl', 1000),
    petSafety: allowed(value(fd, 'petSafety'), treatmentPetSafety), labelNotes: optional(fd, 'labelNotes'), notes: optional(fd, 'notes'),
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
  const saved = await prisma.treatmentProduct.update({ where: { id, collectionId: collection.id }, data: { active, archivedAt: active ? null : new Date() } })
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
  const requestedRepeats = integer(fd, 'repeatCount') ?? treatment.defaultRepeatCount
  const repeatCount = treatment.maximumApplications ? Math.min(requestedRepeats ?? 0, Math.max(0, treatment.maximumApplications - 1)) : requestedRepeats
  const customDraft = value(fd, 'planSteps')
  const steps = customDraft
    ? parseTreatmentPlanDraft(customDraft, startAt, treatment, timezone)
    : buildTreatmentPlanSteps({ startAt, timezone, treatment, repeatCount, repeatIntervalDays: integer(fd, 'repeatIntervalDays') ?? treatment.defaultRepeatIntervalDays, followUpDays: integer(fd, 'followUpDays') ?? treatment.defaultFollowUpDays })
  if (!steps.length) throw new Error('Add at least one treatment plan step.')
  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.treatmentPlan.create({ data: { collectionId: collection.id, plantInstanceId, plantConditionId, title: optional(fd, 'title', 200) || `${treatment.name} for ${plant.plantId}`, description: optional(fd, 'description'), targetCompletionAt: steps.at(-1)?.scheduledAt, assignedToUserId: optional(fd, 'assignedToUserId', 120), createdByUserId: user.id, updatedByUserId: user.id, steps: { create: steps.map((step) => ({ collectionId: collection.id, ...step, treatmentSnapshotJson: step.treatmentSnapshotJson ? json(step.treatmentSnapshotJson) : undefined })) } } })
    await emitDomainEvent(tx, { eventType: 'treatment.plan_started', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-plan-started:${created.id}`, payload: { subjectId: created.id, plantInstanceId, plantId: plant.plantId, displayName: created.title, treatmentDefinitionId: treatment.id } })
    if (plantConditionId) await emitDomainEvent(tx, { eventType: 'condition.treatment_linked', collectionId: collection.id, aggregateId: plantConditionId, actor: { id: user.id, role: user.role }, idempotencyKey: `condition-treatment-linked:${plantConditionId}:${created.id}`, payload: { subjectId: plantConditionId, plantInstanceId, plantId: plant.plantId, treatmentPlanId: created.id, displayName: created.title } })
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
  return { plant, treatment, condition, warnings, activeQuarantine }
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
  const intervalOverrideNote = optional(fd, 'intervalOverrideNote', 1000)
  if (blocking && !intervalOverrideNote) throw new Error('Explain the early-interval override before recording this application.')
  const productId = value(fd, 'treatmentProductId') || context.treatment.products[0]?.product.id || null
  const product = productId ? context.treatment.products.find((item) => item.product.id === productId)?.product : null
  if (productId && !product) throw new Error('The selected product is not linked to this treatment.')
  const timezone = timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } }))
  const appliedAt = parseDateTimeLocal(value(fd, 'appliedAt'), timezone) || new Date()
  const followUpDueAt = parseDateLocal(value(fd, 'followUpDueAt'), timezone) || (context.treatment.defaultFollowUpDays ? addTreatmentDays(appliedAt, context.treatment.defaultFollowUpDays, timezone) : null)
  const startQuarantine = checked(fd, 'startQuarantine') && !context.activeQuarantine
  const quarantineLocationId = value(fd, 'quarantineLocationId') || null
  const quarantineLocation = startQuarantine && quarantineLocationId ? await prisma.location.findFirstOrThrow({ where: { id: quarantineLocationId, collectionId: collection.id, status: 'ACTIVE' } }) : null
  const moveToQuarantine = startQuarantine && checked(fd, 'moveToQuarantine') && Boolean(quarantineLocation)
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
      targetArea: allowed(value(fd, 'targetArea'), treatmentTargetAreas), immediateResponse: optional(fd, 'immediateResponse'),
      instructionsSnapshot: context.treatment.instructions, safetySnapshotJson: json(treatmentSnapshot(context.treatment).safety),
      notes: optional(fd, 'notes'), adverseReaction: checked(fd, 'adverseReaction'), adverseReactionNotes: optional(fd, 'adverseReactionNotes'),
      followUpDueAt, intervalOverrideNote,
    } })
    if (treatmentPlanStepId) await tx.treatmentPlanStep.update({ where: { id: treatmentPlanStepId }, data: { status: 'COMPLETED', completedAt: appliedAt, completedByUserId: user.id, completionNotes: optional(fd, 'notes') } })
    await emitDomainEvent(tx, { eventType: 'treatment.applied', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, occurredAt: appliedAt, idempotencyKey: `treatment-application:${created.id}`, payload: { subjectId: created.id, plantInstanceId, plantId: context.plant.plantId, displayName: context.treatment.name, treatmentPlanId: planId, adverseReaction: created.adverseReaction } })
    if (created.adverseReaction) await emitDomainEvent(tx, { eventType: 'treatment.adverse_reaction_recorded', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, occurredAt: appliedAt, idempotencyKey: `treatment-adverse:${created.id}`, payload: { subjectId: created.id, plantInstanceId, plantId: context.plant.plantId, displayName: context.treatment.name, summary: created.adverseReactionNotes || 'Adverse reaction recorded' } })
    if (startQuarantine) {
      const quarantine = await tx.plantQuarantine.create({ data: { collectionId: collection.id, plantInstanceId, quarantineLocationId, reason: `Required for ${context.treatment.name}`, riskLevel: 'UNKNOWN', startDate: appliedAt, targetReleaseDate: followUpDueAt || addTreatmentDays(appliedAt, 14, timezone), notes: `Started from treatment application ${created.id}.`, createdByUserId: user.id } })
      await emitDomainEvent(tx, { eventType: 'quarantine.started', collectionId: collection.id, aggregateId: quarantine.id, actor: { id: user.id, role: user.role }, idempotencyKey: `quarantine:${quarantine.id}:started`, payload: { subjectId: quarantine.id, plantInstanceId, plantId: context.plant.plantId, displayName: context.plant.plantId, summary: quarantine.reason } })
      if (moveToQuarantine && quarantineLocation) {
        const move = await tx.plantLocationMove.create({ data: { collectionId: collection.id, plantInstanceId, fromLocationId: context.plant.currentLocationId, toLocationId: quarantineLocation.id, movedByUserId: user.id, notes: `Moved for ${context.treatment.name} treatment quarantine.` } })
        await tx.plantInstance.update({ where: { id: plantInstanceId }, data: { currentLocationId: quarantineLocation.id } })
        await emitDomainEvent(tx, { eventType: 'plant.location_moved', collectionId: collection.id, aggregateId: plantInstanceId, actor: { id: user.id, role: user.role }, idempotencyKey: `location-move:${move.id}`, payload: { subjectId: move.id, plantInstanceId, plantId: context.plant.plantId, displayName: context.plant.plantId, toLocation: { id: quarantineLocation.id, name: quarantineLocation.name, code: quarantineLocation.code }, summary: move.notes || undefined } })
      }
    }
    if (followUpDueAt && checked(fd, 'createFollowUpReminder')) await tx.reminder.create({ data: { collectionId: collection.id, userId: user.id, title: `Treatment follow-up: ${context.plant.plantId}`, body: `Review ${context.treatment.name} outcome.`, category: 'TREATMENT', entityType: 'TREATMENT_APPLICATION', entityId: created.id, dueAt: followUpDueAt, nextSendAt: followUpDueAt } })
    return created
  })
  await audit(user, 'CREATE', 'TREATMENT_APPLICATION', application.id, `Applied ${context.treatment.name} to ${context.plant.plantId}`, { planId, conditionId, warningsAcknowledged: context.warnings.length > 0 }, collection.id)
  if (moveToQuarantine) revalidatePlantLocationSurfaces(collection.slug, plantInstanceId)
  redirect(collectionPath(collection.slug, planId ? `/treatments/plans/${planId}` : `/instances/${plantInstanceId}#treatments`))
}

export async function completeTreatmentPlanStep(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentPlanStepId')
  const step = await prisma.treatmentPlanStep.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'PENDING' }, include: { plan: { include: { plantInstance: { select: { plantId: true } } } } } })
  if (step.stepType === 'APPLY_TREATMENT') throw new Error('Treatment application steps require application details.')
  if (step.stepType === 'PHOTO') {
    const photo = await prisma.photo.findFirst({ where: { collectionId: collection.id, entityType: 'TREATMENT_PLAN_STEP', entityId: id }, select: { id: true } })
    if (!photo) throw new Error('Upload an assessment photo before completing this step.')
  }
  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.treatmentPlanStep.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: now, completedByUserId: user.id, completionNotes: optional(fd, 'notes') } })
    if (result.count !== 1) return result
    if (step.stepType === 'START_QUARANTINE') {
      const active = await tx.plantQuarantine.findFirst({ where: { collectionId: collection.id, plantInstanceId: step.plan.plantInstanceId, status: 'ACTIVE' }, select: { id: true } })
      if (!active) {
        const quarantine = await tx.plantQuarantine.create({ data: { collectionId: collection.id, plantInstanceId: step.plan.plantInstanceId, reason: `Started by treatment plan step: ${step.title}`, riskLevel: 'UNKNOWN', startDate: now, targetReleaseDate: addTreatmentDays(now, 14, 'UTC'), notes: optional(fd, 'notes'), createdByUserId: user.id } })
        await emitDomainEvent(tx, { eventType: 'quarantine.started', collectionId: collection.id, aggregateId: quarantine.id, actor: { id: user.id, role: user.role }, idempotencyKey: `quarantine:${quarantine.id}:started`, payload: { subjectId: quarantine.id, plantInstanceId: step.plan.plantInstanceId, plantId: step.plan.plantInstance.plantId, displayName: step.plan.plantInstance.plantId, treatmentPlanId: step.treatmentPlanId, summary: quarantine.reason } })
      }
    }
    if (step.stepType === 'RELEASE_QUARANTINE') {
      const quarantine = await tx.plantQuarantine.findFirst({ where: { collectionId: collection.id, plantInstanceId: step.plan.plantInstanceId, status: 'ACTIVE' }, orderBy: { startDate: 'desc' } })
      if (quarantine) {
        await tx.plantQuarantine.update({ where: { id: quarantine.id }, data: { status: 'RELEASED', releasedAt: now, releasedByUserId: user.id, notes: optional(fd, 'notes') || quarantine.notes } })
        await emitDomainEvent(tx, { eventType: 'quarantine.released', collectionId: collection.id, aggregateId: quarantine.id, actor: { id: user.id, role: user.role }, idempotencyKey: `quarantine:${quarantine.id}:released`, payload: { subjectId: quarantine.id, plantInstanceId: step.plan.plantInstanceId, plantId: step.plan.plantInstance.plantId, displayName: step.plan.plantInstance.plantId, treatmentPlanId: step.treatmentPlanId, summary: optional(fd, 'notes') || 'Released during treatment plan.' } })
      }
    }
    await emitDomainEvent(tx, { eventType: 'treatment.plan_step_completed', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-plan-step:${id}:completed`, payload: { subjectId: id, plantInstanceId: step.plan.plantInstanceId, plantId: step.plan.plantInstance.plantId, treatmentPlanId: step.treatmentPlanId, displayName: step.title } })
    return result
  })
  if (updated.count !== 1) throw new Error('This step was already completed.')
  await audit(user, 'COMPLETE', 'TREATMENT_PLAN_STEP', id, `Completed ${step.title}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${step.treatmentPlanId}`))
}

export async function recordTreatmentOutcome(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(value(fd, 'collectionSlug'))
  const treatmentApplicationId = value(fd, 'treatmentApplicationId')
  const effectiveness = allowed(value(fd, 'effectiveness'), treatmentEffectiveness)
  const applicationOutcome = allowed(value(fd, 'outcome'), treatmentApplicationOutcomes) || 'UNKNOWN'
  if (!effectiveness) throw new Error('Choose an effectiveness rating.')
  const application = await prisma.treatmentApplication.findFirstOrThrow({ where: { id: treatmentApplicationId, collectionId: collection.id }, include: { plantInstance: { select: { plantId: true } } } })
  const outcome = await prisma.$transaction(async (tx) => {
    const created = await tx.treatmentApplicationOutcome.create({ data: { collectionId: collection.id, treatmentApplicationId, recordedByUserId: user.id, outcome: applicationOutcome, effectiveness, observedConditionSeverity: optional(fd, 'observedConditionSeverity', 40), conditionResponse: optional(fd, 'conditionResponse', 500), adverseEffects: optional(fd, 'adverseEffects', 1000), notes: optional(fd, 'notes') } })
    if (created.adverseEffects) await tx.treatmentApplication.update({ where: { id: application.id }, data: { adverseReaction: true } })
    await emitDomainEvent(tx, { eventType: 'treatment.application_outcome_recorded', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-outcome:${created.id}`, payload: { subjectId: created.id, plantInstanceId: application.plantInstanceId, plantId: application.plantInstance.plantId, displayName: application.treatmentNameSnapshot, effectiveness, outcome: applicationOutcome } })
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
      adverseReaction: checked(fd, 'adverseReaction'), adverseReactionNotes: optional(fd, 'adverseReactionNotes'), correctedAt: new Date(), correctedByUserId: user.id, correctionReason,
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
  const plan = await prisma.treatmentPlan.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'ACTIVE' }, include: { plantInstance: { select: { plantId: true } }, steps: true, condition: true } })
  if (!cancel && plan.steps.some((step) => step.required && step.status !== 'COMPLETED')) throw new Error('Complete all required plan steps before closing the plan.')
  const finalOutcome = cancel ? null : allowed(value(fd, 'finalOutcome'), treatmentFinalOutcomes)
  const finalEffectiveness = cancel ? null : allowed(value(fd, 'finalEffectiveness'), treatmentEffectiveness)
  if (!cancel && (!finalOutcome || !finalEffectiveness)) throw new Error('Record a final outcome and effectiveness rating.')
  const closeCondition = !cancel && checked(fd, 'closeCondition') && Boolean(plan.condition)
  const followUpAt = parseDateLocal(value(fd, 'conditionFollowUpAt'), timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } })))
  const saved = await prisma.$transaction(async (tx) => {
    const conditionReview = plan.condition ? { closeCondition, status: closeCondition ? 'RESOLVED' : (optional(fd, 'conditionStatus', 40) || plan.condition.status), severity: optional(fd, 'conditionSeverity', 40) || plan.condition.severity, followUpAt: followUpAt?.toISOString() || null } : null
    const updated = await tx.treatmentPlan.update({ where: { id }, data: { status: cancel ? 'CANCELLED' : 'COMPLETED', cancelledAt: cancel ? new Date() : null, completedAt: cancel ? null : new Date(), finalOutcome, finalEffectiveness, finalNotes: optional(fd, 'finalNotes'), conditionReviewJson: conditionReview ? json(conditionReview) : undefined, updatedByUserId: user.id } })
    if (!cancel && plan.condition) {
      await tx.plantCondition.update({ where: { id: plan.condition.id }, data: { status: closeCondition ? 'RESOLVED' : (optional(fd, 'conditionStatus', 40) || plan.condition.status), severity: optional(fd, 'conditionSeverity', 40) || plan.condition.severity, followUpAt, resolvedAt: closeCondition ? new Date() : null } })
      if (closeCondition) await emitDomainEvent(tx, { eventType: 'condition.resolved_after_treatment', collectionId: collection.id, aggregateId: plan.condition.id, actor: { id: user.id, role: user.role }, idempotencyKey: `condition-resolved-after-treatment:${plan.condition.id}:${id}`, payload: { subjectId: plan.condition.id, plantInstanceId: plan.plantInstanceId, plantId: plan.plantInstance.plantId, treatmentPlanId: id, displayName: plan.title } })
    }
    if (!cancel && followUpAt && checked(fd, 'createFollowUpReminder')) await tx.reminder.create({ data: { collectionId: collection.id, userId: user.id, title: `Condition follow-up: ${plan.plantInstance.plantId}`, body: `Review condition after ${plan.title}.`, category: 'TREATMENT', entityType: 'TREATMENT_PLAN', entityId: id, dueAt: followUpAt, nextSendAt: followUpAt } })
    await emitDomainEvent(tx, { eventType: cancel ? 'treatment.plan_cancelled' : 'treatment.plan_completed', collectionId: collection.id, aggregateId: id, actor: { id: user.id, role: user.role }, idempotencyKey: `treatment-plan-${cancel ? 'cancelled' : 'completed'}:${id}:${updated.updatedAt.toISOString()}`, payload: { subjectId: id, plantInstanceId: plan.plantInstanceId, plantId: plan.plantInstance.plantId, displayName: plan.title, finalOutcome, finalEffectiveness } })
    return updated
  })
  await audit(user, cancel ? 'CANCEL' : 'COMPLETE', 'TREATMENT_PLAN', id, `${cancel ? 'Cancelled' : 'Completed'} ${plan.title}`, { finalOutcome, finalEffectiveness }, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${saved.id}`))
}

export async function updateTreatmentPlanStep(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentPlanStepId')
  const step = await prisma.treatmentPlanStep.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'PENDING', plan: { status: 'ACTIVE' } } })
  const timezone = timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } }))
  const stepType = allowed(value(fd, 'stepType'), treatmentStepTypes) || step.stepType
  const saved = await prisma.treatmentPlanStep.update({ where: { id }, data: { title: optional(fd, 'title', 200) || step.title, instructions: optional(fd, 'instructions'), stepType, scheduledAt: parseDateLocal(value(fd, 'scheduledAt'), timezone) || step.scheduledAt, required: checked(fd, 'required') } })
  await audit(user, 'UPDATE', 'TREATMENT_PLAN_STEP', id, `Updated ${saved.title}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, `/treatments/plans/${step.treatmentPlanId}`))
}

export async function addTreatmentPlanStep(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const treatmentPlanId = value(fd, 'treatmentPlanId')
  const plan = await prisma.treatmentPlan.findFirstOrThrow({ where: { id: treatmentPlanId, collectionId: collection.id, status: 'ACTIVE' }, include: { steps: { orderBy: { sortOrder: 'desc' }, take: 1 } } })
  const timezone = timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } }))
  const stepType = allowed(value(fd, 'stepType'), treatmentStepTypes) || 'MANUAL_TASK'
  const treatmentDefinitionId = stepType === 'APPLY_TREATMENT' ? value(fd, 'treatmentDefinitionId') || null : null
  if (treatmentDefinitionId) await prisma.treatmentDefinition.findFirstOrThrow({ where: { id: treatmentDefinitionId, collectionId: collection.id } })
  const created = await prisma.treatmentPlanStep.create({ data: { collectionId: collection.id, treatmentPlanId, treatmentDefinitionId, stepType, title: optional(fd, 'title', 200) || 'New treatment step', instructions: optional(fd, 'instructions'), scheduledAt: parseDateLocal(value(fd, 'scheduledAt'), timezone) || new Date(), sortOrder: (plan.steps[0]?.sortOrder ?? -1) + 1, required: checked(fd, 'required') } })
  await audit(user, 'CREATE', 'TREATMENT_PLAN_STEP', created.id, `Added ${created.title}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, `/treatments/plans/${treatmentPlanId}`))
}

export async function skipTreatmentPlanStep(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentPlanStepId'); const skipReason = optional(fd, 'skipReason', 1000)
  if (!skipReason) throw new Error('Explain why this treatment step is being skipped.')
  const step = await prisma.treatmentPlanStep.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'PENDING', plan: { status: 'ACTIVE' } } })
  await prisma.treatmentPlanStep.update({ where: { id }, data: { status: 'SKIPPED', skippedAt: new Date(), skipReason, required: false } })
  await audit(user, 'SKIP', 'TREATMENT_PLAN_STEP', id, `Skipped ${step.title}`, { skipReason }, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${step.treatmentPlanId}`))
}

export async function duplicateTreatmentPlan(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentPlanId')
  const source = await prisma.treatmentPlan.findFirstOrThrow({ where: { id, collectionId: collection.id }, include: { steps: { orderBy: { sortOrder: 'asc' } }, plantInstance: { select: { plantId: true } } } })
  const startAt = new Date(); const firstAt = source.steps[0]?.scheduledAt || source.startedAt
  const created = await prisma.treatmentPlan.create({ data: { collectionId: collection.id, plantInstanceId: source.plantInstanceId, plantConditionId: source.plantConditionId, title: `${source.title} follow-up`, description: source.description, createdByUserId: user.id, updatedByUserId: user.id, steps: { create: source.steps.map((step, sortOrder) => ({ collectionId: collection.id, treatmentDefinitionId: step.treatmentDefinitionId, stepType: step.stepType, title: step.title, instructions: step.instructions, scheduledAt: new Date(startAt.getTime() + Math.max(0, step.scheduledAt.getTime() - firstAt.getTime())), sortOrder, required: step.required, treatmentSnapshotJson: step.treatmentSnapshotJson || undefined })) } } })
  await audit(user, 'CREATE', 'TREATMENT_PLAN', created.id, `Duplicated ${source.title}`, { sourcePlanId: id }, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${created.id}`))
}

export async function amendTreatmentPlanOutcome(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'treatmentPlanId'); const reason = optional(fd, 'amendmentReason', 1000)
  if (!reason) throw new Error('An amendment reason is required.')
  const plan = await prisma.treatmentPlan.findFirstOrThrow({ where: { id, collectionId: collection.id, status: 'COMPLETED' } })
  const finalOutcome = allowed(value(fd, 'finalOutcome'), treatmentFinalOutcomes) || plan.finalOutcome
  const finalEffectiveness = allowed(value(fd, 'finalEffectiveness'), treatmentEffectiveness) || plan.finalEffectiveness
  await prisma.treatmentPlan.update({ where: { id }, data: { finalOutcome, finalEffectiveness, finalNotes: optional(fd, 'finalNotes') || plan.finalNotes, finalOutcomeAmendmentReason: reason, updatedByUserId: user.id } })
  await audit(user, 'CORRECT', 'TREATMENT_PLAN', id, `Amended final outcome for ${plan.title}`, { reason, previousOutcome: plan.finalOutcome, finalOutcome }, collection.id)
  redirect(collectionPath(collection.slug, `/treatments/plans/${id}`))
}

export async function recordBatchTreatmentApplications(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(value(fd, 'collectionSlug'))
  const plantIds = [...new Set(selected(fd, 'plantInstanceId'))].slice(0, 250)
  if (!plantIds.length) throw new Error('Select at least one plant.')
  const treatmentDefinitionId = value(fd, 'treatmentDefinitionId')
  const treatment = await prisma.treatmentDefinition.findFirstOrThrow({ where: { id: treatmentDefinitionId, collectionId: collection.id, active: true }, include: { products: { include: { product: true }, orderBy: { sortOrder: 'asc' } }, conditionTypes: true, cautionTags: true } })
  const plants = await prisma.plantInstance.findMany({
    where: { id: { in: plantIds }, collectionId: collection.id, status: 'ACTIVE' },
    include: {
      plantDefinition: { include: { tags: true } },
      conditions: { where: { status: { in: ['OPEN', 'IMPROVING'] } }, orderBy: { observedAt: 'desc' } },
      blooms: { where: { bloomEndDate: null }, select: { id: true }, take: 1 },
      quarantines: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
      treatmentApplications: { where: { treatmentDefinitionId }, orderBy: { appliedAt: 'desc' }, select: { appliedAt: true }, take: 1 },
      _count: { select: { treatmentApplications: { where: { treatmentDefinitionId } } } },
    },
  })
  if (plants.length !== plantIds.length) throw new Error('One or more selected plants are unavailable in this collection.')
  const idempotencyKey = value(fd, 'idempotencyKey') || crypto.randomUUID()
  const timezone = timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: user.id }, select: { timezone: true } }))
  const appliedAt = parseDateTimeLocal(value(fd, 'appliedAt'), timezone) || new Date()
  const product = treatment.products.find((item) => item.product.id === value(fd, 'treatmentProductId'))?.product || treatment.products[0]?.product || null
  const shared = { doseAmount: number(fd, 'doseAmount'), doseUnit: allowed(value(fd, 'doseUnit'), treatmentDoseUnits), waterVolumeMl: number(fd, 'waterVolumeMl'), strength: optional(fd, 'strength', 160), applicationMethod: allowed(value(fd, 'applicationMethod'), treatmentApplicationMethods), targetArea: allowed(value(fd, 'targetArea'), treatmentTargetAreas), notes: optional(fd, 'notes') }
  const plantContexts = plants.map((plant) => {
    const condition = plant.conditions.find((item) => treatment.conditionTypes.some((type) => type.conditionType === item.category)) || null
    const plantTags = new Set(plant.plantDefinition.tags.map((assignment) => assignment.plantTagId))
    const warnings = treatmentSafetyWarnings({
      treatment,
      conditionCategory: condition?.category,
      applicableConditionTypes: treatment.conditionTypes.map((item) => item.conditionType),
      tagCautions: treatment.cautionTags.filter((item) => plantTags.has(item.plantTagId)),
      activeBloom: plant.blooms.length > 0,
      activeQuarantine: plant.quarantines.length > 0,
      lastAppliedAt: plant.treatmentApplications[0]?.appliedAt,
    })
    return { plant, condition, warnings }
  })
  if (treatment.maximumApplications != null && plantContexts.some(({ plant }) => plant._count.treatmentApplications >= treatment.maximumApplications!)) {
    throw new Error('At least one selected plant has reached this treatment\'s maximum application count.')
  }
  const hasWarnings = plantContexts.some((item) => item.warnings.length > 0)
  const hasBlockingWarnings = plantContexts.some((item) => item.warnings.some((warning) => warning.severity === 'BLOCKING'))
  if (hasWarnings && !checked(fd, 'acknowledgeWarnings')) throw new Error('Review and acknowledge the plant-specific safety warnings before recording this batch.')
  const intervalOverrideNote = optional(fd, 'intervalOverrideNote', 1000)
  if (hasBlockingWarnings && !intervalOverrideNote) throw new Error('Explain the early-interval override before recording this batch.')
  const batch = await prisma.$transaction(async (tx) => {
    const existing = await tx.treatmentApplicationBatch.findUnique({ where: { collectionId_idempotencyKey: { collectionId: collection.id, idempotencyKey } } })
    if (existing) return existing
    const created = await tx.treatmentApplicationBatch.create({ data: { collectionId: collection.id, treatmentDefinitionId, createdByUserId: user.id, idempotencyKey, appliedAt, sharedValuesJson: json(shared) } })
    for (const { plant, condition, warnings } of plantContexts) {
      const pendingStep = await tx.treatmentPlanStep.findFirst({ where: { collectionId: collection.id, treatmentDefinitionId, stepType: 'APPLY_TREATMENT', status: 'PENDING', plan: { plantInstanceId: plant.id, status: 'ACTIVE' } }, orderBy: { scheduledAt: 'asc' }, include: { plan: { select: { id: true } } } })
      const item = await tx.treatmentApplicationBatchItem.create({ data: { collectionId: collection.id, batchId: created.id, plantInstanceId: plant.id, plantConditionId: condition?.id || null, treatmentPlanStepId: pendingStep?.id || null, status: 'COMPLETED', warningSnapshotJson: json(warnings) } })
      const perPlantDose = number(fd, `doseAmount:${plant.id}`)
      const perPlantNotes = optional(fd, `notes:${plant.id}`)
      const application = await tx.treatmentApplication.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, plantConditionId: condition?.id || null, treatmentPlanId: pendingStep?.plan.id || null, treatmentPlanStepId: pendingStep?.id || null, treatmentDefinitionId, treatmentProductId: product?.id || null, treatmentApplicationBatchItemId: item.id, appliedByUserId: user.id, appliedAt, treatmentNameSnapshot: treatment.name, productNameSnapshot: product?.name || null, ...shared, doseAmount: perPlantDose ?? shared.doseAmount, notes: perPlantNotes || shared.notes, intervalOverrideNote, instructionsSnapshot: treatment.instructions, safetySnapshotJson: json({ ...treatmentSnapshot(treatment).safety, warnings }) } })
      if (pendingStep) await tx.treatmentPlanStep.update({ where: { id: pendingStep.id }, data: { status: 'COMPLETED', completedAt: appliedAt, completedByUserId: user.id, completionNotes: perPlantNotes || shared.notes } })
      await emitDomainEvent(tx, { eventType: 'treatment.applied', collectionId: collection.id, aggregateId: application.id, actor: { id: user.id, role: user.role }, correlationId: created.id, occurredAt: appliedAt, idempotencyKey: `treatment-application:${application.id}`, payload: { subjectId: application.id, plantInstanceId: plant.id, plantId: plant.plantId, displayName: treatment.name, treatmentPlanId: pendingStep?.plan.id || null, treatmentApplicationBatchId: created.id } })
    }
    await emitDomainEvent(tx, { eventType: 'treatment.batch_applied', collectionId: collection.id, aggregateId: created.id, actor: { id: user.id, role: user.role }, correlationId: created.id, idempotencyKey: `treatment-batch:${created.id}`, payload: { subjectId: created.id, displayName: treatment.name, itemCount: plants.length } })
    return created
  })
  await audit(user, 'CREATE', 'TREATMENT_APPLICATION_BATCH', batch.id, `Applied ${treatment.name} to ${plants.length} plants`, { plantCount: plants.length }, collection.id)
  redirect(collectionPath(collection.slug, `/treatments?view=batches&batch=${batch.id}`))
}

export async function ensureStarterTreatments(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const starters = [
    { name: 'Mosquito Bits tea', category: 'BIOLOGICAL', applicationMethod: 'SOIL_DRENCH', targetArea: 'SOIL_MEDIA', targetSummary: 'Review-required biological treatment template for fungus gnats.', conditionType: 'PESTS' },
    { name: 'Yellow sticky trap', category: 'PHYSICAL_BARRIER', applicationMethod: 'TRAP', targetArea: 'LOCATION_ENVIRONMENT', targetSummary: 'Monitoring and supportive physical trap template.', conditionType: 'PESTS' },
    { name: 'Manual pest removal', category: 'MECHANICAL', applicationMethod: 'MANUAL_REMOVAL', targetArea: 'FOLIAGE', targetSummary: 'Manual removal template; adapt to the plant and pest.', conditionType: 'PESTS' },
    { name: 'Increased airflow', category: 'ENVIRONMENTAL', applicationMethod: 'ENVIRONMENTAL_ADJUSTMENT', targetArea: 'LOCATION_ENVIRONMENT', targetSummary: 'Environmental adjustment template.', conditionType: 'FUNGAL' },
    { name: 'Isolation / quarantine', category: 'ISOLATION', applicationMethod: 'ISOLATION', targetArea: 'WHOLE_PLANT', targetSummary: 'Isolation template with no automatic move.', conditionType: 'OTHER' },
  ]
  for (const starter of starters) {
    const saved = await prisma.treatmentDefinition.upsert({ where: { collectionId_slug: { collectionId: collection.id, slug: treatmentSlug(starter.name) } }, update: {}, create: { collectionId: collection.id, createdByUserId: user.id, name: starter.name, slug: treatmentSlug(starter.name), category: starter.category, applicationMethod: starter.applicationMethod, targetArea: starter.targetArea, targetSummary: starter.targetSummary, safetyNotes: 'Review the actual product label and collection context before use.' } })
    await prisma.treatmentConditionType.upsert({ where: { treatmentDefinitionId_conditionType: { treatmentDefinitionId: saved.id, conditionType: starter.conditionType } }, update: {}, create: { collectionId: collection.id, treatmentDefinitionId: saved.id, conditionType: starter.conditionType, suitability: 'POSSIBLE' } })
  }
  await audit(user, 'CREATE', 'TREATMENT_STARTERS', collection.id, 'Ensured starter treatment templates', { count: starters.length }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/treatments'))
}
