'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionLogger, requireCollectionManager } from '@/lib/collections'
import { emitDomainEvent } from '@/lib/events/emit'
import { prisma } from '@/lib/prisma'
import {
  percentTotal,
  setPlantSubstrate,
  substrateComponentCategories,
  substrateLongevities,
  substrateModes,
  substrateOrganicities,
  substratePhTendencies,
  substrateQualitativeValues,
  substrateSlug,
  substrateSuitabilities,
  validRecipeTotal,
} from '@/lib/substrates'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const nullable = (fd: FormData, key: string) => val(fd, key) || null
const allowed = <T extends readonly string[]>(value: string, values: T, fallback: T[number]) => values.includes(value as T[number]) ? value as T[number] : fallback
const back = (fd: FormData, fallback: string) => val(fd, 'back') || fallback

function recipeRows(fd: FormData) {
  const ids = fd.getAll('substrateComponentId').map(String)
  const percents = fd.getAll('percentByVolume').map(String)
  const notes = fd.getAll('componentNotes').map(String)
  const rows = ids.map((substrateComponentId, index) => ({
    substrateComponentId,
    percentByVolume: Number(percents[index]),
    notes: notes[index]?.trim() || null,
    sortOrder: index,
  })).filter((row) => row.substrateComponentId)
  if (new Set(rows.map((row) => row.substrateComponentId)).size !== rows.length) throw new Error('Each substrate component may appear only once per recipe version.')
  if (rows.some((row) => !Number.isFinite(row.percentByVolume) || row.percentByVolume <= 0 || row.percentByVolume > 100)) throw new Error('Each component percentage must be greater than 0 and no more than 100.')
  return rows
}

async function validateRows(collectionId: string, rows: ReturnType<typeof recipeRows>) {
  if (!rows.length) throw new Error('Add at least one substrate component.')
  const count = await prisma.substrateComponent.count({ where: { collectionId, active: true, id: { in: rows.map((row) => row.substrateComponentId) } } })
  if (count !== rows.length) throw new Error('One or more substrate components are unavailable in this collection.')
}

function componentData(fd: FormData, fallbackName?: string) {
  const name = val(fd, 'name') || fallbackName
  if (!name) throw new Error('Component name is required.')
  const renewable = val(fd, 'renewable')
  return {
    name,
    slug: substrateSlug(name),
    category: allowed(val(fd, 'category'), substrateComponentCategories, 'OTHER'),
    description: nullable(fd, 'description'),
    particleSize: nullable(fd, 'particleSize'),
    organicity: allowed(val(fd, 'organicity'), substrateOrganicities, 'UNKNOWN'),
    waterRetention: val(fd, 'waterRetention') ? allowed(val(fd, 'waterRetention'), substrateQualitativeValues, 'UNKNOWN') : null,
    aeration: val(fd, 'aeration') ? allowed(val(fd, 'aeration'), substrateQualitativeValues, 'UNKNOWN') : null,
    drainage: val(fd, 'drainage') ? allowed(val(fd, 'drainage'), substrateQualitativeValues, 'UNKNOWN') : null,
    cationExchangeCapacity: val(fd, 'cationExchangeCapacity') ? allowed(val(fd, 'cationExchangeCapacity'), substrateQualitativeValues, 'UNKNOWN') : null,
    longevity: val(fd, 'longevity') ? allowed(val(fd, 'longevity'), substrateLongevities, 'UNKNOWN') : null,
    phTendency: val(fd, 'phTendency') ? allowed(val(fd, 'phTendency'), substratePhTendencies, 'UNKNOWN') : null,
    renewable: renewable === 'YES' ? true : renewable === 'NO' ? false : null,
    notes: nullable(fd, 'notes'),
  }
}

export async function createSubstrateComponent(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const data = componentData(fd)
  const component = await prisma.$transaction(async (tx) => {
    const created = await tx.substrateComponent.create({ data: { collectionId: collection.id, createdByUserId: user.id, ...data } })
    await emitDomainEvent(tx, {
      eventType: 'substrate.component_created', collectionId: collection.id, aggregateId: created.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-component:${created.id}:created`,
      payload: { subjectId: created.id, recordId: created.id, recordType: 'SubstrateComponent', displayName: created.name, category: created.category },
    })
    return created
  })
  await audit(user, 'CREATE', 'SUBSTRATE_COMPONENT', component.id, `Created substrate component ${component.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/substrates'))
}

export async function updateSubstrateComponent(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'substrateComponentId')
  const existing = await prisma.substrateComponent.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.substrateComponent.update({ where: { id }, data: componentData(fd, existing.name) })
    await emitDomainEvent(tx, {
      eventType: 'substrate.component_updated', collectionId: collection.id, aggregateId: id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-component:${id}:updated:${result.updatedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'SubstrateComponent', displayName: result.name, category: result.category },
    })
    return result
  })
  await audit(user, 'UPDATE', 'SUBSTRATE_COMPONENT', id, `Updated substrate component ${updated.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/substrates'))
}

export async function toggleSubstrateComponentArchive(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'substrateComponentId')
  const component = await prisma.substrateComponent.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const active = !component.active
  await prisma.$transaction(async (tx) => {
    const updated = await tx.substrateComponent.update({ where: { id }, data: { active, archivedAt: active ? null : new Date() } })
    await emitDomainEvent(tx, {
      eventType: active ? 'substrate.component_updated' : 'substrate.component_archived', collectionId: collection.id, aggregateId: id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-component:${id}:${active ? 'restored' : 'archived'}:${updated.updatedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'SubstrateComponent', displayName: updated.name },
    })
  })
  await audit(user, 'UPDATE', 'SUBSTRATE_COMPONENT', id, `${active ? 'Restored' : 'Archived'} substrate component ${component.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/substrates'))
}

export async function createSubstrateRecipe(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const name = val(fd, 'name')
  if (!name) throw new Error('Recipe name is required.')
  const rows = recipeRows(fd)
  await validateRows(collection.id, rows)
  const total = percentTotal(rows)
  const activate = val(fd, 'status') === 'ACTIVE'
  if (activate && !validRecipeTotal(total)) throw new Error(`Active recipes must total exactly 100%. Current total: ${total}%.`)
  const recipe = await prisma.$transaction(async (tx) => {
    const family = await tx.substrateRecipe.create({ data: {
      collectionId: collection.id,
      name,
      slug: substrateSlug(name),
      description: nullable(fd, 'description'),
      intendedUse: nullable(fd, 'intendedUse'),
      createdByUserId: user.id,
    } })
    const version = await tx.substrateRecipeVersion.create({ data: {
      collectionId: collection.id,
      substrateRecipeId: family.id,
      versionNumber: 1,
      changeSummary: nullable(fd, 'changeSummary') || 'Initial formulation',
      notes: nullable(fd, 'notes'),
      totalPercent: total,
      status: activate ? 'ACTIVE' : 'DRAFT',
      createdByUserId: user.id,
      components: { create: rows.map((row) => ({ collectionId: collection.id, ...row })) },
    } })
    if (activate) await tx.substrateRecipe.update({ where: { id: family.id }, data: { activeVersionId: version.id } })
    await emitDomainEvent(tx, {
      eventType: 'substrate.recipe_created', collectionId: collection.id, aggregateId: family.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-recipe:${family.id}:created`,
      payload: { subjectId: family.id, recordId: version.id, recordType: 'SubstrateRecipeVersion', displayName: `${family.name} v1`, status: version.status, totalPercent: total },
    })
    if (activate) await emitDomainEvent(tx, {
      eventType: 'substrate.recipe_version_activated', collectionId: collection.id, aggregateId: family.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-recipe:${family.id}:v1:activated`,
      payload: { subjectId: family.id, recordId: version.id, recordType: 'SubstrateRecipeVersion', displayName: `${family.name} v1`, versionNumber: 1 },
    })
    return { family, version }
  })
  await audit(user, 'CREATE', 'SUBSTRATE_RECIPE', recipe.family.id, `Created substrate recipe ${recipe.family.name} v1`, { status: recipe.version.status, total }, collection.id)
  redirect(collectionPath(collection.slug, `/substrates?recipe=${recipe.family.id}`))
}

export async function updateSubstrateRecipeFamily(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'substrateRecipeId')
  const recipe = await prisma.substrateRecipe.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const name = val(fd, 'name') || recipe.name
  const updated = await prisma.substrateRecipe.update({ where: { id }, data: { name, slug: substrateSlug(name), description: nullable(fd, 'description'), intendedUse: nullable(fd, 'intendedUse') } })
  await audit(user, 'UPDATE', 'SUBSTRATE_RECIPE', id, `Updated substrate recipe ${updated.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/substrates'))
}

export async function saveSubstrateRecipeDraft(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'substrateRecipeVersionId')
  const existing = await prisma.substrateRecipeVersion.findFirstOrThrow({ where: { id, collectionId: collection.id }, include: { recipe: true } })
  if (existing.status !== 'DRAFT') throw new Error('Published substrate recipe versions are immutable. Create a new version instead.')
  const rows = recipeRows(fd)
  await validateRows(collection.id, rows)
  const total = percentTotal(rows)
  await prisma.$transaction(async (tx) => {
    await tx.substrateRecipeComponent.deleteMany({ where: { substrateRecipeVersionId: id } })
    await tx.substrateRecipeVersion.update({ where: { id }, data: {
      changeSummary: nullable(fd, 'changeSummary'), notes: nullable(fd, 'notes'), totalPercent: total,
      components: { create: rows.map((row) => ({ collectionId: collection.id, ...row })) },
    } })
  })
  await audit(user, 'UPDATE', 'SUBSTRATE_RECIPE_VERSION', id, `Updated draft ${existing.recipe.name} v${existing.versionNumber}`, { total }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/substrates'))
}

export async function createSubstrateRecipeVersion(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const recipeId = val(fd, 'substrateRecipeId')
  const recipe = await prisma.substrateRecipe.findFirstOrThrow({ where: { id: recipeId, collectionId: collection.id }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } })
  const sourceVersionId = val(fd, 'sourceVersionId') || recipe.activeVersionId || recipe.versions[0]?.id
  if (!sourceVersionId) throw new Error('No recipe version is available to copy.')
  const source = await prisma.substrateRecipeVersion.findFirstOrThrow({ where: { id: sourceVersionId, collectionId: collection.id, substrateRecipeId: recipe.id }, include: { components: { orderBy: { sortOrder: 'asc' } } } })
  const nextNumber = (recipe.versions[0]?.versionNumber || 0) + 1
  const created = await prisma.$transaction(async (tx) => {
    const version = await tx.substrateRecipeVersion.create({ data: {
      collectionId: collection.id, substrateRecipeId: recipe.id, versionNumber: nextNumber,
      changeSummary: nullable(fd, 'changeSummary') || `Copied from v${source.versionNumber}`,
      notes: source.notes, totalPercent: source.totalPercent, status: 'DRAFT', createdByUserId: user.id,
      components: { create: source.components.map((row) => ({ collectionId: collection.id, substrateComponentId: row.substrateComponentId, percentByVolume: row.percentByVolume, sortOrder: row.sortOrder, notes: row.notes })) },
    } })
    await emitDomainEvent(tx, {
      eventType: 'substrate.recipe_version_created', collectionId: collection.id, aggregateId: recipe.id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-recipe:${recipe.id}:v${nextNumber}:created`,
      payload: { subjectId: recipe.id, recordId: version.id, recordType: 'SubstrateRecipeVersion', displayName: `${recipe.name} v${nextNumber}`, sourceVersion: source.versionNumber },
    })
    return version
  })
  await audit(user, 'CREATE', 'SUBSTRATE_RECIPE_VERSION', created.id, `Created ${recipe.name} v${nextNumber}`, undefined, collection.id)
  redirect(collectionPath(collection.slug, `/substrates?recipe=${recipe.id}&version=${created.id}`))
}

export async function activateSubstrateRecipeVersion(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'substrateRecipeVersionId')
  const version = await prisma.substrateRecipeVersion.findFirstOrThrow({ where: { id, collectionId: collection.id }, include: { recipe: true, components: true } })
  const total = percentTotal(version.components)
  if (!validRecipeTotal(total)) throw new Error(`Active recipes must total exactly 100%. Current total: ${total}%.`)
  await prisma.$transaction(async (tx) => {
    await tx.substrateRecipeVersion.updateMany({ where: { substrateRecipeId: version.substrateRecipeId, status: 'ACTIVE', NOT: { id } }, data: { status: 'SUPERSEDED', supersededAt: new Date() } })
    await tx.substrateRecipeVersion.update({ where: { id }, data: { status: 'ACTIVE', supersededAt: null, totalPercent: total } })
    await tx.substrateRecipe.update({ where: { id: version.substrateRecipeId }, data: { activeVersionId: id } })
    await emitDomainEvent(tx, {
      eventType: 'substrate.recipe_version_activated', collectionId: collection.id, aggregateId: version.substrateRecipeId,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-recipe:${version.substrateRecipeId}:v${version.versionNumber}:activated`,
      payload: { subjectId: version.substrateRecipeId, recordId: id, recordType: 'SubstrateRecipeVersion', displayName: `${version.recipe.name} v${version.versionNumber}`, versionNumber: version.versionNumber },
    })
  })
  await audit(user, 'ACTIVATE', 'SUBSTRATE_RECIPE_VERSION', id, `Activated ${version.recipe.name} v${version.versionNumber}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/substrates'))
}

export async function toggleSubstrateRecipeArchive(fd: FormData) {
  const { user, collection } = await requireCollectionManager(val(fd, 'collectionSlug'))
  const id = val(fd, 'substrateRecipeId')
  const recipe = await prisma.substrateRecipe.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  const archivedAt = recipe.archivedAt ? null : new Date()
  await prisma.$transaction(async (tx) => {
    await tx.substrateRecipe.update({ where: { id }, data: { archivedAt } })
    await emitDomainEvent(tx, {
      eventType: 'substrate.recipe_archived', collectionId: collection.id, aggregateId: id,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-recipe:${id}:${archivedAt ? 'archived' : 'restored'}:${Date.now()}`,
      payload: { subjectId: id, recordId: id, recordType: 'SubstrateRecipe', displayName: recipe.name, archived: Boolean(archivedAt) },
    })
  })
  await audit(user, 'UPDATE', 'SUBSTRATE_RECIPE', id, `${archivedAt ? 'Archived' : 'Restored'} substrate recipe ${recipe.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/substrates'))
}

export async function addSubstrateRecommendation(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const plantDefinitionId = val(fd, 'plantDefinitionId')
  const substrateRecipeVersionId = val(fd, 'substrateRecipeVersionId')
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, OR: [{ collectionId: collection.id }, { collectionId: null, isValidated: true }] }, select: { id: true } })
  await prisma.substrateRecipeVersion.findFirstOrThrow({ where: { id: substrateRecipeVersionId, collectionId: collection.id }, select: { id: true } })
  const count = await prisma.plantDefinitionSubstrateRecommendation.count({ where: { collectionId: collection.id, plantDefinitionId } })
  const recommendation = await prisma.$transaction(async (tx) => {
    const created = await tx.plantDefinitionSubstrateRecommendation.create({ data: {
      collectionId: collection.id, plantDefinitionId, substrateRecipeVersionId, rank: count + 1,
      suitability: allowed(val(fd, 'suitability'), substrateSuitabilities, 'RECOMMENDED'), notes: nullable(fd, 'notes'), source: val(fd, 'source') || 'MANUAL',
    } })
    await emitDomainEvent(tx, {
      eventType: 'plant_definition.substrate_recommendation_added', collectionId: collection.id, aggregateId: plantDefinitionId,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-recommendation:${created.id}:created`,
      payload: { subjectId: plantDefinitionId, recordId: created.id, recordType: 'PlantDefinitionSubstrateRecommendation', recipeVersionId: substrateRecipeVersionId, rank: created.rank, suitability: created.suitability },
    })
    return created
  })
  await audit(user, 'CREATE', 'PLANT_DEFINITION_SUBSTRATE_RECOMMENDATION', recommendation.id, 'Added substrate recommendation', undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit`))
}

export async function updateSubstrateRecommendation(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'recommendationId')
  const recommendation = await prisma.plantDefinitionSubstrateRecommendation.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  await prisma.plantDefinitionSubstrateRecommendation.update({ where: { id }, data: {
    rank: Math.max(1, Number(val(fd, 'rank')) || recommendation.rank),
    suitability: allowed(val(fd, 'suitability'), substrateSuitabilities, 'RECOMMENDED'),
    notes: nullable(fd, 'notes'),
  } })
  await audit(user, 'UPDATE', 'PLANT_DEFINITION_SUBSTRATE_RECOMMENDATION', id, 'Updated substrate recommendation', undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, `/plants/${recommendation.plantDefinitionId}/edit`))
}

export async function removeSubstrateRecommendation(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(val(fd, 'collectionSlug'))
  const id = val(fd, 'recommendationId')
  const recommendation = await prisma.plantDefinitionSubstrateRecommendation.findFirstOrThrow({ where: { id, collectionId: collection.id } })
  await prisma.$transaction(async (tx) => {
    await tx.plantDefinitionSubstrateRecommendation.delete({ where: { id } })
    await emitDomainEvent(tx, {
      eventType: 'plant_definition.substrate_recommendation_removed', collectionId: collection.id, aggregateId: recommendation.plantDefinitionId,
      actor: { id: user.id, role: user.role }, idempotencyKey: `substrate-recommendation:${id}:removed`,
      payload: { subjectId: recommendation.plantDefinitionId, recordId: id, recipeVersionId: recommendation.substrateRecipeVersionId },
    })
  })
  await audit(user, 'DELETE', 'PLANT_DEFINITION_SUBSTRATE_RECOMMENDATION', id, 'Removed substrate recommendation', undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, `/plants/${recommendation.plantDefinitionId}/edit`))
}

export async function assignPlantSubstrate(fd: FormData) {
  const { user, collection } = await requireCollectionLogger(val(fd, 'collectionSlug'))
  const plantInstanceId = val(fd, 'plantInstanceId')
  const mode = allowed(val(fd, 'substrateMode'), substrateModes, 'UNKNOWN')
  const changedAt = val(fd, 'startedAt') ? new Date(val(fd, 'startedAt')) : new Date()
  const result = await prisma.$transaction(async (tx) => {
    const changed = await setPlantSubstrate(tx, {
      collectionId: collection.id, plantInstanceId, mode, recipeVersionId: nullable(fd, 'substrateRecipeVersionId'),
      description: nullable(fd, 'receivedSubstrateDescription'), notes: nullable(fd, 'substrateNotes'), startedAt: changedAt,
      reason: nullable(fd, 'reason'), changedByUserId: user.id,
    })
    const eventType = mode === 'RECEIVED_SUBSTRATE' ? 'plant.received_substrate_recorded' : changed.previous ? 'plant.substrate_changed' : 'plant.substrate_assigned'
    await emitDomainEvent(tx, {
      eventType, collectionId: collection.id, aggregateId: plantInstanceId, occurredAt: changedAt,
      actor: { id: user.id, role: user.role }, idempotencyKey: `plant:${plantInstanceId}:substrate:${changed.history.id}`,
      payload: { subjectId: plantInstanceId, recordId: changed.history.id, recordType: 'PlantSubstrateHistory', previousMode: changed.previous?.substrateMode, previousRecipeVersionId: changed.previous?.substrateRecipeVersionId, newMode: mode, newRecipeVersionId: changed.recipeVersion?.id, displayName: changed.current.recipeVersion ? `${changed.current.recipeVersion.recipe.name} v${changed.current.recipeVersion.versionNumber}` : mode.replaceAll('_', ' ') },
    })
    return changed
  })
  await audit(user, 'UPDATE', 'PLANT_INSTANCE_SUBSTRATE', result.current.id, 'Recorded plant substrate', { mode }, collection.id)
  redirect(back(fd, collectionPath(collection.slug, `/instances/${plantInstanceId}#substrate`)))
}
