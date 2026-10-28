'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import { emitDomainEvent } from '@/lib/events/emit'
import { TagReviewError, acceptedPlantTagColors, plantTagCategories, plantTagIcons, normalizePlantTagName, parseTagIds, plantTagSlug } from '@/lib/plant-tags'
import { applyMagicFillTags } from '@/lib/magic-fill-tags'
import { prisma } from '@/lib/prisma'

const value = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const allowed = (raw: string, values: readonly string[]) => values.includes(raw) ? raw : null

export async function savePlantTag(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id') || null
  const name = normalizePlantTagName(fd.get('name'))
  const slug = plantTagSlug(name)
  if (!name || !slug) throw new Error('Enter a tag name.')
  const duplicate = await prisma.plantTag.findFirst({ where: { collectionId: collection.id, slug, ...(id ? { NOT: { id } } : {}) } })
  if (duplicate) throw new Error(`A tag named ${duplicate.name} already exists in this collection.`)
  const data = {
    name, slug,
    icon: allowed(value(fd, 'icon'), plantTagIcons),
    category: allowed(value(fd, 'category'), plantTagCategories),
    colorToken: allowed(value(fd, 'colorToken'), acceptedPlantTagColors),
    description: value(fd, 'description').slice(0, 500) || null,
    publicVisible: fd.get('publicVisible') === 'on',
  }
  const tag = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.plantTag.update({ where: { id, collectionId: collection.id }, data })
      : await tx.plantTag.create({ data: { collectionId: collection.id, createdByUserId: user.id, ...data } })
    await emitDomainEvent(tx, { eventType: id ? 'tag.updated' : 'tag.created', collectionId: collection.id, aggregateId: saved.id, actor: { id: user.id, role: user.role }, idempotencyKey: `plant-tag:${saved.id}:${saved.updatedAt.toISOString()}`, payload: { subjectId: saved.id, displayName: saved.name, publicVisible: saved.publicVisible } })
    return saved
  })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'PLANT_TAG', tag.id, `${id ? 'Updated' : 'Created'} plant tag ${tag.name}`, { category: tag.category, publicVisible: tag.publicVisible }, collection.id)
  redirect(collectionPath(collection.slug, '/plant-tags'))
}

export async function setPlantTagActive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const active = value(fd, 'active') === 'true'
  const tag = await prisma.$transaction(async (tx) => {
    const saved = await tx.plantTag.update({ where: { id, collectionId: collection.id }, data: { active, archivedAt: active ? null : new Date() } })
    await emitDomainEvent(tx, { eventType: active ? 'tag.restored' : 'tag.archived', collectionId: collection.id, aggregateId: saved.id, actor: { id: user.id, role: user.role }, idempotencyKey: `plant-tag:${saved.id}:${active ? 'restore' : 'archive'}:${saved.updatedAt.toISOString()}`, payload: { subjectId: saved.id, displayName: saved.name } })
    return saved
  })
  await audit(user, active ? 'RESTORE' : 'ARCHIVE', 'PLANT_TAG', tag.id, `${active ? 'Restored' : 'Archived'} plant tag ${tag.name}`, undefined, collection.id)
  revalidatePath(collectionPath(collection.slug, '/plant-tags'))
}

export async function mergePlantTags(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const duplicateId = value(fd, 'duplicateId'); const canonicalId = value(fd, 'canonicalId')
  if (!duplicateId || !canonicalId || duplicateId === canonicalId) throw new Error('Choose two different tags.')
  const [duplicate, canonical] = await Promise.all([
    prisma.plantTag.findFirstOrThrow({ where: { id: duplicateId, collectionId: collection.id }, include: { definitions: true } }),
    prisma.plantTag.findFirstOrThrow({ where: { id: canonicalId, collectionId: collection.id } }),
  ])
  await prisma.$transaction(async (tx) => {
    for (const assignment of duplicate.definitions) {
      const existing = await tx.plantDefinitionTag.findUnique({ where: { plantDefinitionId_plantTagId: { plantDefinitionId: assignment.plantDefinitionId, plantTagId: canonical.id } } })
      if (existing) await tx.plantDefinitionTag.delete({ where: { id: assignment.id } })
      else await tx.plantDefinitionTag.update({ where: { id: assignment.id }, data: { plantTagId: canonical.id } })
    }
    const archived = await tx.plantTag.update({ where: { id: duplicate.id }, data: { active: false, archivedAt: new Date() } })
    await emitDomainEvent(tx, { eventType: 'tag.merged', collectionId: collection.id, aggregateId: canonical.id, actor: { id: user.id, role: user.role }, idempotencyKey: `plant-tag-merge:${duplicate.id}:${canonical.id}:${archived.updatedAt.toISOString()}`, payload: { subjectId: canonical.id, displayName: canonical.name, duplicateId: duplicate.id, affectedDefinitions: duplicate.definitions.length } })
  })
  await audit(user, 'MERGE', 'PLANT_TAG', canonical.id, `Merged plant tag ${duplicate.name} into ${canonical.name}`, { duplicateId, affectedDefinitions: duplicate.definitions.length }, collection.id)
  redirect(collectionPath(collection.slug, '/plant-tags'))
}

export async function savePlantDefinitionTags(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const plantDefinitionId = value(fd, 'plantDefinitionId')
  const requestedIds = parseTagIds(fd)
  await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId: collection.id } })
  const valid = await prisma.plantTag.findMany({ where: { id: { in: requestedIds }, collectionId: collection.id, active: true }, select: { id: true } })
  if (valid.length !== requestedIds.length) throw new Error('One or more selected tags are archived or belong to another collection.')
  const current = await prisma.plantDefinitionTag.findMany({ where: { collectionId: collection.id, plantDefinitionId, plantTag: { active: true } } })
  const next = new Set(valid.map((tag) => tag.id)); const previous = new Set(current.map((item) => item.plantTagId))
  await prisma.$transaction(async (tx) => {
    const removeIds = current.filter((item) => !next.has(item.plantTagId)).map((item) => item.id)
    if (removeIds.length) await tx.plantDefinitionTag.deleteMany({ where: { id: { in: removeIds } } })
    for (const plantTagId of next) if (!previous.has(plantTagId)) await tx.plantDefinitionTag.create({ data: { collectionId: collection.id, plantDefinitionId, plantTagId, source: 'USER', createdByUserId: user.id } })
    for (const plantTagId of next) if (!previous.has(plantTagId)) await emitDomainEvent(tx, { eventType: 'plant_definition.tag_added', collectionId: collection.id, aggregateId: plantDefinitionId, actor: { id: user.id, role: user.role }, idempotencyKey: `definition-tag-add:${plantDefinitionId}:${plantTagId}`, payload: { subjectId: plantDefinitionId, plantDefinitionId, plantTagId } })
    for (const item of current) if (!next.has(item.plantTagId)) await emitDomainEvent(tx, { eventType: 'plant_definition.tag_removed', collectionId: collection.id, aggregateId: plantDefinitionId, actor: { id: user.id, role: user.role }, idempotencyKey: `definition-tag-remove:${plantDefinitionId}:${item.plantTagId}:${item.id}`, payload: { subjectId: plantDefinitionId, plantDefinitionId, plantTagId: item.plantTagId } })
  })
  revalidatePath(collectionPath(collection.slug, '/plants'))
  redirect(collectionPath(collection.slug, `/plants/${plantDefinitionId}/edit#plant-tags`))
}

export async function createMagicFillPlantTags(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  try {
  const definitionId = value(fd, 'plantDefinitionId')
  if (!definitionId) throw new TagReviewError('Save the Plant Definition before creating or assigning tag suggestions.')
  let suggestions: Array<Record<string, unknown>>, existingIds: string[]
  try {
    suggestions = JSON.parse(value(fd, 'suggestions') || '[]')
    existingIds = JSON.parse(value(fd, 'existingTagIds') || '[]')
    if (!Array.isArray(suggestions) || !Array.isArray(existingIds) || suggestions.some(x => !x || typeof x !== 'object' || Array.isArray(x)) || existingIds.some(id => typeof id !== 'string' || id.length > 200)) throw new TagReviewError()
  } catch { throw new TagReviewError('The selected tag suggestions could not be read.') }
  if (!suggestions.length && !existingIds.length) throw new TagReviewError('Select at least one tag suggestion.')
  const tags = await applyMagicFillTags(prisma, { collectionId: collection.id, definitionId, userId: user.id, userRole: user.role, suggestions, existingIds })
  await audit(user, 'UPDATE', 'PLANT_DEFINITION', definitionId, 'Applied Magic Fill tag suggestions', { tagIds: tags.map(tag => tag.id) }, collection.id)
  revalidatePath(collectionPath(collection.slug, '/plant-tags'))
  revalidatePath(collectionPath(collection.slug, '/plants'))
  revalidatePath(collectionPath(collection.slug, `/plants/${definitionId}/edit`))
  return tags.map(tag => ({ id: tag.id, name: tag.name, icon: tag.icon, colorToken: tag.colorToken, category: tag.category, description: tag.description, active: tag.active, publicVisible: tag.publicVisible }))
  } catch (error) { return { error: error instanceof TagReviewError ? error.message : 'Could not confirm tag approval. Your edits are preserved; retry to reconcile the same tags.' } }
}
