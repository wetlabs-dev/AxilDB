import type { PrismaClient } from '@prisma/client'
import { plantTagConfiguration, plantTagSlug, TagReviewError } from '@/lib/plant-tags'
import { emitDomainEvent } from '@/lib/events/emit'

export async function applyMagicFillTags(db: PrismaClient, input: { collectionId: string; definitionId: string; userId: string; userRole: string; suggestions: Array<Record<string, unknown>>; existingIds: string[] }) {
  if (input.suggestions.length > 5 || input.existingIds.length > 8) throw new TagReviewError('Too many tag suggestions.')
  const configs = input.suggestions.map(raw => plantTagConfiguration(raw, true))
  if (configs.some(tag => !tag.name || !plantTagSlug(tag.name))) throw new TagReviewError('Enter a valid tag name.')
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plant-tags:${input.collectionId}`}, 0))`
    await tx.plantDefinition.findFirstOrThrow({ where: { id: input.definitionId, collectionId: input.collectionId } })
    const tags = await tx.plantTag.findMany({ where: { id: { in: [...new Set(input.existingIds)] }, collectionId: input.collectionId, active: true } })
    if (tags.length !== new Set(input.existingIds).size) throw new TagReviewError('One or more tags are unavailable in this collection.')
    for (const config of configs) {
      const slug = plantTagSlug(config.name)
      const existing = await tx.plantTag.findUnique({ where: { collectionId_slug: { collectionId: input.collectionId, slug } } })
      if (existing && !existing.active) throw new TagReviewError(`${existing.name} is archived. Restore it from Plant Tags before assigning it.`)
      const tag = existing || await tx.plantTag.upsert({ where: { collectionId_slug: { collectionId: input.collectionId, slug } }, update: {}, create: { ...config, slug, collectionId: input.collectionId, createdByUserId: input.userId } })
      if (!tag.active) throw new TagReviewError(`${tag.name} is archived.`)
      if (!existing) await emitDomainEvent(tx, { eventType: 'tag.created', collectionId: input.collectionId, aggregateId: tag.id, actor: { id: input.userId, role: input.userRole }, idempotencyKey: `plant-tag:${tag.id}:${tag.updatedAt.toISOString()}`, payload: { subjectId: tag.id, displayName: tag.name, publicVisible: tag.publicVisible, source: 'MAGIC_FILL' } })
      if (!tags.some(item => item.id === tag.id)) tags.push(tag)
    }
    for (const tag of tags) {
      const where = { plantDefinitionId: input.definitionId, plantTagId: tag.id }
      const existing = await tx.plantDefinitionTag.findUnique({ where: { plantDefinitionId_plantTagId: where } })
      if (!existing) {
        await tx.plantDefinitionTag.create({ data: { ...where, collectionId: input.collectionId, source: 'MAGIC_FILL', createdByUserId: input.userId } })
        await emitDomainEvent(tx, { eventType: 'plant_definition.tag_added', collectionId: input.collectionId, aggregateId: input.definitionId, actor: { id: input.userId, role: input.userRole }, idempotencyKey: `definition-tag-add:${input.definitionId}:${tag.id}`, payload: { subjectId: input.definitionId, plantDefinitionId: input.definitionId, plantTagId: tag.id, source: 'MAGIC_FILL' } })
      }
    }
    return tags
  })
}
