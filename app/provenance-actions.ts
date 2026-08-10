'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionManager } from '@/lib/collections'
import {
  DISTRIBUTOR_OUTLET_TYPES,
  DISTRIBUTOR_TYPES,
  PARTY_KINDS,
  SELLER_STOREFRONT_TYPES,
  SOURCE_TYPES,
  ensureDefaultSalesChannelTypes,
  normalizeProvenanceName,
  validateCommerceSelection,
  validateDistributorSelection,
} from '@/lib/provenance'
import { prisma } from '@/lib/prisma'
import { emitDomainEvent } from '@/lib/events/emit'

const value = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const optional = (fd: FormData, key: string) => value(fd, key) || null
const allowed = <T extends readonly string[]>(input: string, values: T, fallback: T[number]) => values.includes(input as T[number]) ? input as T[number] : fallback
const page = (slug: string, suffix = '') => collectionPath(slug, `/provenance${suffix}`)
const aliases = (fd: FormData) => value(fd, 'aliases').split(',').map((item) => item.trim()).filter(Boolean)

function refresh(slug: string) {
  revalidatePath(page(slug))
  revalidatePath(collectionPath(slug, '/acquisitions'))
  revalidatePath(collectionPath(slug, '/instances'))
}

export async function saveSource(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const name = value(fd, 'name')
  if (!name) throw new Error('Source name is required.')
  const data = {
    name,
    normalizedName: normalizeProvenanceName(name),
    kind: allowed(value(fd, 'kind'), PARTY_KINDS, 'ORGANIZATION'),
    sourceType: allowed(value(fd, 'sourceType'), SOURCE_TYPES, 'UNKNOWN'),
    websiteUrl: optional(fd, 'websiteUrl'),
    country: optional(fd, 'country'),
    region: optional(fd, 'region'),
    locality: optional(fd, 'locality'),
    description: optional(fd, 'description'),
    notes: optional(fd, 'notes'),
    aliasesJson: aliases(fd),
  }
  const duplicate = await prisma.source.findFirst({ where: { collectionId: collection.id, normalizedName: data.normalizedName, ...(id ? { NOT: { id } } : {}) }, select: { name: true } })
  if (duplicate) throw new Error(`Source “${duplicate.name}” already exists. Use the cleanup tools to merge duplicate records.`)
  const saved = id
    ? await prisma.source.update({ where: { id, collectionId: collection.id }, data })
    : await prisma.source.create({ data: { ...data, collectionId: collection.id, createdByUserId: user.id } })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'SOURCE', saved.id, `${id ? 'Updated' : 'Created'} source ${saved.name}`, { sourceType: saved.sourceType }, collection.id)
  refresh(collection.slug)
  redirect(page(collection.slug, `?source=${saved.id}`))
}

export async function toggleSourceArchive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const source = await prisma.source.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id } })
  const active = !source.active
  await prisma.source.update({ where: { id: source.id }, data: { active, archivedAt: active ? null : new Date() } })
  await audit(user, 'UPDATE', 'SOURCE', source.id, `${active ? 'Restored' : 'Archived'} source ${source.name}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function saveDistributor(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const name = value(fd, 'name')
  if (!name) throw new Error('Distributor name is required.')
  const ratingInput = Number(value(fd, 'rating'))
  const data = {
    name,
    normalizedName: normalizeProvenanceName(name),
    kind: allowed(value(fd, 'kind'), PARTY_KINDS, 'ORGANIZATION'),
    distributorType: allowed(value(fd, 'distributorType'), DISTRIBUTOR_TYPES, 'OTHER'),
    websiteUrl: optional(fd, 'websiteUrl'),
    description: optional(fd, 'description'),
    rating: Number.isInteger(ratingInput) && ratingInput >= 1 && ratingInput <= 5 ? ratingInput : null,
    experienceNotes: optional(fd, 'experienceNotes'),
    aliasesJson: aliases(fd),
  }
  const previous = id ? await prisma.distributor.findFirstOrThrow({ where: { id, collectionId: collection.id } }) : null
  const saved = id
    ? await prisma.distributor.update({ where: { id, collectionId: collection.id }, data })
    : await prisma.distributor.create({ data: { ...data, collectionId: collection.id, createdByUserId: user.id } })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'DISTRIBUTOR', saved.id, `${id ? 'Updated' : 'Created'} distributor ${saved.name}`, { distributorType: saved.distributorType, ratingChanged: previous?.rating !== saved.rating }, collection.id)
  refresh(collection.slug)
  redirect(page(collection.slug, `?distributor=${saved.id}`))
}

export async function toggleDistributorArchive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const distributor = await prisma.distributor.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id } })
  const active = !distributor.active
  await prisma.distributor.update({ where: { id: distributor.id }, data: { active, archivedAt: active ? null : new Date() } })
  await audit(user, 'UPDATE', 'DISTRIBUTOR', distributor.id, `${active ? 'Restored' : 'Archived'} distributor ${distributor.name}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function saveSeller(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const name = value(fd, 'name')
  if (!name) throw new Error('Seller name is required.')
  const ratingInput = Number(value(fd, 'rating'))
  const data = {
    name,
    normalizedName: normalizeProvenanceName(name),
    kind: allowed(value(fd, 'kind'), PARTY_KINDS, 'ORGANIZATION'),
    websiteUrl: optional(fd, 'websiteUrl'),
    region: optional(fd, 'region'),
    country: optional(fd, 'country'),
    description: optional(fd, 'description'),
    rating: Number.isInteger(ratingInput) && ratingInput >= 1 && ratingInput <= 5 ? ratingInput : null,
    experienceNotes: optional(fd, 'experienceNotes'),
    aliasesJson: aliases(fd),
  }
  const duplicate = await prisma.seller.findFirst({
    where: { collectionId: collection.id, normalizedName: data.normalizedName, ...(id ? { NOT: { id } } : {}) },
    select: { id: true, name: true },
  })
  if (duplicate) throw new Error(`Seller “${duplicate.name}” already exists. Use the cleanup tools to merge duplicate records.`)
  const previous = id ? await prisma.seller.findFirstOrThrow({ where: { id, collectionId: collection.id } }) : null
  const saved = await prisma.$transaction(async (tx) => {
    const seller = id
      ? await tx.seller.update({ where: { id, collectionId: collection.id }, data })
      : await tx.seller.create({ data: { ...data, collectionId: collection.id, createdByUserId: user.id } })
    await emitDomainEvent(tx, { eventType: id ? 'seller.updated' : 'seller.created', collectionId: collection.id, aggregateId: seller.id, actor: { id: user.id, role: user.role }, idempotencyKey: `seller:${seller.id}:${seller.updatedAt.toISOString()}`, payload: { subjectId: seller.id, displayName: seller.name, kind: seller.kind } })
    return seller
  })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'SELLER', saved.id, `${id ? 'Updated' : 'Created'} seller ${saved.name}`, { kind: saved.kind, ratingChanged: previous?.rating !== saved.rating }, collection.id)
  refresh(collection.slug)
  redirect(page(collection.slug, `?seller=${saved.id}`))
}

export async function toggleSellerArchive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const seller = await prisma.seller.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id } })
  const active = !seller.active
  await prisma.$transaction(async (tx) => {
    const updated = await tx.seller.update({ where: { id: seller.id }, data: { active, archivedAt: active ? null : new Date() } })
    await emitDomainEvent(tx, { eventType: active ? 'seller.restored' : 'seller.archived', collectionId: collection.id, aggregateId: seller.id, actor: { id: user.id, role: user.role }, idempotencyKey: `seller:${seller.id}:${active ? 'restored' : 'archived'}:${updated.updatedAt.toISOString()}`, payload: { subjectId: seller.id, displayName: seller.name } })
  })
  await audit(user, 'UPDATE', 'SELLER', seller.id, `${active ? 'Restored' : 'Archived'} seller ${seller.name}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function saveSellerStorefront(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const sellerId = value(fd, 'sellerId')
  const distributorId = optional(fd, 'distributorId')
  const handleOrName = value(fd, 'handleOrName')
  if (!handleOrName) throw new Error('Sales channel name is required.')
  await validateCommerceSelection(prisma, collection.id, { sellerId, distributorId })
  await ensureDefaultSalesChannelTypes(prisma, collection.id)
  const salesChannelTypeId = value(fd, 'salesChannelTypeId')
  if (salesChannelTypeId) await prisma.salesChannelType.findFirstOrThrow({ where: { id: salesChannelTypeId, collectionId: collection.id, active: true } })
  const normalizedName = normalizeProvenanceName(handleOrName)
  const duplicate = await prisma.sellerStorefront.findFirst({
    where: {
      collectionId: collection.id,
      sellerId,
      distributorId,
      normalizedName,
      ...(id ? { NOT: { id } } : {}),
    },
    select: { id: true },
  })
  if (duplicate) throw new Error('That sales channel already exists for this seller. Use the cleanup tools to merge duplicates.')
  const data = {
    sellerId,
    distributorId,
    handleOrName,
    normalizedName,
    storefrontType: allowed(value(fd, 'storefrontType'), SELLER_STOREFRONT_TYPES, 'OTHER'),
    salesChannelTypeId: salesChannelTypeId || null,
    profileUrl: optional(fd, 'profileUrl'),
    addressLine1: optional(fd, 'addressLine1'),
    addressLine2: optional(fd, 'addressLine2'),
    city: optional(fd, 'city'),
    region: optional(fd, 'region'),
    postalCode: optional(fd, 'postalCode'),
    country: optional(fd, 'country'),
    phone: optional(fd, 'phone'),
    notes: optional(fd, 'notes'),
  }
  const saved = await prisma.$transaction(async (tx) => {
    const storefront = id
      ? await tx.sellerStorefront.update({ where: { id, collectionId: collection.id }, data })
      : await tx.sellerStorefront.create({ data: { ...data, collectionId: collection.id } })
    await emitDomainEvent(tx, { eventType: id ? 'seller.storefront_updated' : 'seller.storefront_created', collectionId: collection.id, aggregateId: storefront.id, actor: { id: user.id, role: user.role }, idempotencyKey: `seller-storefront:${storefront.id}:${storefront.updatedAt.toISOString()}`, payload: { subjectId: storefront.id, displayName: storefront.handleOrName, sellerId: storefront.sellerId, distributorId: storefront.distributorId } })
    return storefront
  })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'SALES_CHANNEL', saved.id, `${id ? 'Updated' : 'Created'} sales channel ${saved.handleOrName}`, { sellerId, salesChannelTypeId }, collection.id)
  refresh(collection.slug)
  redirect(page(collection.slug, `?seller=${sellerId}`))
}

export async function toggleSellerStorefrontArchive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const storefront = await prisma.sellerStorefront.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id } })
  const active = !storefront.active
  await prisma.$transaction(async (tx) => {
    const updated = await tx.sellerStorefront.update({ where: { id: storefront.id }, data: { active, archivedAt: active ? null : new Date() } })
    await emitDomainEvent(tx, { eventType: active ? 'seller.storefront_restored' : 'seller.storefront_archived', collectionId: collection.id, aggregateId: storefront.id, actor: { id: user.id, role: user.role }, idempotencyKey: `seller-storefront:${storefront.id}:${active ? 'restored' : 'archived'}:${updated.updatedAt.toISOString()}`, payload: { subjectId: storefront.id, displayName: storefront.handleOrName, sellerId: storefront.sellerId } })
  })
  await audit(user, 'UPDATE', 'SALES_CHANNEL', storefront.id, `${active ? 'Restored' : 'Archived'} sales channel ${storefront.handleOrName}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function saveSalesChannelType(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const name = value(fd, 'name')
  if (!name) throw new Error('Channel type name is required.')
  const normalizedName = normalizeProvenanceName(name)
  const duplicate = await prisma.salesChannelType.findFirst({ where: { collectionId: collection.id, normalizedName, ...(id ? { NOT: { id } } : {}) } })
  if (duplicate) throw new Error(`Channel type “${duplicate.name}” already exists.`)
  const saved = id
    ? await prisma.salesChannelType.update({ where: { id, collectionId: collection.id }, data: { name, normalizedName } })
    : await prisma.salesChannelType.create({ data: { collectionId: collection.id, name, normalizedName, sortOrder: 100 } })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'SALES_CHANNEL_TYPE', saved.id, `${id ? 'Updated' : 'Created'} sales channel type ${saved.name}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function toggleSalesChannelTypeArchive(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const channelType = await prisma.salesChannelType.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id } })
  if (channelType.isBuiltIn && channelType.active) throw new Error('Built-in channel types cannot be archived.')
  const active = !channelType.active
  await prisma.salesChannelType.update({ where: { id: channelType.id }, data: { active, archivedAt: active ? null : new Date() } })
  await audit(user, 'UPDATE', 'SALES_CHANNEL_TYPE', channelType.id, `${active ? 'Restored' : 'Archived'} sales channel type ${channelType.name}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function saveDistributorOutlet(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const distributorId = value(fd, 'distributorId')
  const name = value(fd, 'name')
  if (!name) throw new Error('Outlet name is required.')
  await validateDistributorSelection(prisma, collection.id, distributorId, null)
  const coordinate = (key: string) => {
    const parsed = Number(value(fd, key))
    return Number.isFinite(parsed) ? parsed : null
  }
  const data = {
    distributorId,
    name,
    normalizedName: normalizeProvenanceName(name),
    outletType: allowed(value(fd, 'outletType'), DISTRIBUTOR_OUTLET_TYPES, 'OTHER'),
    addressLine1: optional(fd, 'addressLine1'),
    addressLine2: optional(fd, 'addressLine2'),
    city: optional(fd, 'city'),
    region: optional(fd, 'region'),
    postalCode: optional(fd, 'postalCode'),
    country: optional(fd, 'country'),
    phone: optional(fd, 'phone'),
    url: optional(fd, 'url'),
    latitude: coordinate('latitude'),
    longitude: coordinate('longitude'),
    notes: optional(fd, 'notes'),
  }
  const saved = await prisma.$transaction(async (tx) => {
    const outlet = id
      ? await tx.distributorOutlet.update({ where: { id, collectionId: collection.id }, data })
      : await tx.distributorOutlet.create({ data: { ...data, collectionId: collection.id } })
    await emitDomainEvent(tx, { eventType: id ? 'distributor.outlet_updated' : 'distributor.outlet_created', collectionId: collection.id, aggregateId: outlet.id, actor: { id: user.id, role: user.role }, idempotencyKey: `distributor-outlet:${outlet.id}:${outlet.updatedAt.toISOString()}`, payload: { subjectId: outlet.id, displayName: outlet.name, distributorId: outlet.distributorId, outletType: outlet.outletType } })
    return outlet
  })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'DISTRIBUTOR_OUTLET', saved.id, `${id ? 'Updated' : 'Created'} distributor outlet ${saved.name}`, { distributorId, outletType: saved.outletType }, collection.id)
  refresh(collection.slug)
}

export async function toggleDistributorOutletArchive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const outlet = await prisma.distributorOutlet.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id } })
  const active = !outlet.active
  await prisma.$transaction(async (tx) => {
    const updated = await tx.distributorOutlet.update({ where: { id: outlet.id }, data: { active, archivedAt: active ? null : new Date() } })
    await emitDomainEvent(tx, { eventType: active ? 'distributor.outlet_restored' : 'distributor.outlet_archived', collectionId: collection.id, aggregateId: outlet.id, actor: { id: user.id, role: user.role }, idempotencyKey: `distributor-outlet:${outlet.id}:${active ? 'restored' : 'archived'}:${updated.updatedAt.toISOString()}`, payload: { subjectId: outlet.id, displayName: outlet.name, distributorId: outlet.distributorId } })
  })
  await audit(user, 'UPDATE', 'DISTRIBUTOR_OUTLET', outlet.id, `${active ? 'Restored' : 'Archived'} distributor outlet ${outlet.name}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function mergeSources(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const canonicalId = value(fd, 'canonicalId')
  const duplicateId = value(fd, 'duplicateId')
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) throw new Error('Choose two different sources.')
  const [canonical, duplicate] = await Promise.all([
    prisma.source.findFirstOrThrow({ where: { id: canonicalId, collectionId: collection.id } }),
    prisma.source.findFirstOrThrow({ where: { id: duplicateId, collectionId: collection.id } }),
  ])
  await prisma.$transaction(async (tx) => {
    const links = await tx.acquisitionSource.findMany({ where: { sourceId: duplicate.id }, orderBy: { sortOrder: 'asc' } })
    for (const link of links) {
      const conflict = await tx.acquisitionSource.findFirst({ where: { acquisitionRecordId: link.acquisitionRecordId, sourceId: canonical.id, role: link.role } })
      if (conflict) await tx.acquisitionSource.delete({ where: { id: link.id } })
      else await tx.acquisitionSource.update({ where: { id: link.id }, data: { sourceId: canonical.id } })
    }
    await tx.source.delete({ where: { id: duplicate.id } })
  })
  await audit(user, 'MERGE', 'SOURCE', canonical.id, `Merged source ${duplicate.name} into ${canonical.name}`, { duplicateId }, collection.id)
  refresh(collection.slug)
}

export async function mergeDistributors(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const canonicalId = value(fd, 'canonicalId')
  const duplicateId = value(fd, 'duplicateId')
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) throw new Error('Choose two different distributors.')
  const [canonical, duplicate] = await Promise.all([
    prisma.distributor.findFirstOrThrow({ where: { id: canonicalId, collectionId: collection.id } }),
    prisma.distributor.findFirstOrThrow({ where: { id: duplicateId, collectionId: collection.id } }),
  ])
  await prisma.$transaction(async (tx) => {
    const outlets = await tx.distributorOutlet.findMany({ where: { distributorId: duplicate.id } })
    for (const outlet of outlets) {
      const existing = await tx.distributorOutlet.findFirst({ where: { distributorId: canonical.id, normalizedName: outlet.normalizedName } })
      const targetId = existing?.id || outlet.id
      await tx.plantObservation.updateMany({ where: { distributorOutletId: outlet.id }, data: { distributorOutletId: targetId, distributorId: canonical.id } })
      await tx.plantAcquisitionRecord.updateMany({ where: { distributorOutletId: outlet.id }, data: { distributorOutletId: targetId, distributorId: canonical.id } })
      await tx.acquisitionBatch.updateMany({ where: { distributorOutletId: outlet.id }, data: { distributorOutletId: targetId, distributorId: canonical.id } })
      if (existing) await tx.distributorOutlet.delete({ where: { id: outlet.id } })
      else await tx.distributorOutlet.update({ where: { id: outlet.id }, data: { distributorId: canonical.id } })
    }
    const storefronts = await tx.sellerStorefront.findMany({ where: { distributorId: duplicate.id } })
    for (const storefront of storefronts) {
      const existing = await tx.sellerStorefront.findFirst({ where: { sellerId: storefront.sellerId, normalizedName: storefront.normalizedName, distributorId: canonical.id } })
      if (existing) {
        await tx.plantObservation.updateMany({ where: { sellerStorefrontId: storefront.id }, data: { sellerStorefrontId: existing.id, distributorId: canonical.id } })
        await tx.plantAcquisitionRecord.updateMany({ where: { sellerStorefrontId: storefront.id }, data: { sellerStorefrontId: existing.id, distributorId: canonical.id } })
        await tx.acquisitionBatch.updateMany({ where: { sellerStorefrontId: storefront.id }, data: { sellerStorefrontId: existing.id, distributorId: canonical.id } })
        await tx.plantDefinitionPreferredSeller.updateMany({ where: { sellerStorefrontId: storefront.id }, data: { sellerStorefrontId: existing.id } })
        await tx.sellerStorefront.delete({ where: { id: storefront.id } })
      } else {
        await tx.sellerStorefront.update({ where: { id: storefront.id }, data: { distributorId: canonical.id } })
      }
    }
    const preferences = await tx.plantDefinitionPreferredDistributor.findMany({ where: { distributorId: duplicate.id } })
    for (const preference of preferences) {
      const existing = await tx.plantDefinitionPreferredDistributor.findUnique({ where: { plantDefinitionId_distributorId: { plantDefinitionId: preference.plantDefinitionId, distributorId: canonical.id } } })
      if (existing) await tx.plantDefinitionPreferredDistributor.delete({ where: { id: preference.id } })
      else await tx.plantDefinitionPreferredDistributor.update({ where: { id: preference.id }, data: { distributorId: canonical.id } })
    }
    await tx.plantObservation.updateMany({ where: { distributorId: duplicate.id }, data: { distributorId: canonical.id } })
    await tx.plantAcquisitionRecord.updateMany({ where: { distributorId: duplicate.id }, data: { distributorId: canonical.id } })
    await tx.acquisitionBatch.updateMany({ where: { distributorId: duplicate.id }, data: { distributorId: canonical.id } })
    await tx.distributor.delete({ where: { id: duplicate.id } })
  })
  await audit(user, 'MERGE', 'DISTRIBUTOR', canonical.id, `Merged distributor ${duplicate.name} into ${canonical.name}`, { duplicateId }, collection.id)
  refresh(collection.slug)
}

export async function mergeSellers(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const canonicalId = value(fd, 'canonicalId')
  const duplicateId = value(fd, 'duplicateId')
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) throw new Error('Choose two different sellers.')
  const [canonical, duplicate] = await Promise.all([
    prisma.seller.findFirstOrThrow({ where: { id: canonicalId, collectionId: collection.id } }),
    prisma.seller.findFirstOrThrow({ where: { id: duplicateId, collectionId: collection.id } }),
  ])
  await prisma.$transaction(async (tx) => {
    const storefronts = await tx.sellerStorefront.findMany({ where: { sellerId: duplicate.id } })
    const preferences = await tx.plantDefinitionPreferredSeller.findMany({ where: { sellerId: duplicate.id } })
    const storefrontTargets = new Map<string, string>()
    for (const storefront of storefronts) {
      const existing = await tx.sellerStorefront.findFirst({ where: { sellerId: canonical.id, normalizedName: storefront.normalizedName, distributorId: storefront.distributorId } })
      const targetId = existing?.id || storefront.id
      storefrontTargets.set(storefront.id, targetId)
      await tx.plantObservation.updateMany({ where: { sellerStorefrontId: storefront.id }, data: { sellerStorefrontId: targetId, sellerId: canonical.id } })
      await tx.plantAcquisitionRecord.updateMany({ where: { sellerStorefrontId: storefront.id }, data: { sellerStorefrontId: targetId, sellerId: canonical.id } })
      await tx.acquisitionBatch.updateMany({ where: { sellerStorefrontId: storefront.id }, data: { sellerStorefrontId: targetId, sellerId: canonical.id } })
      if (existing) await tx.sellerStorefront.delete({ where: { id: storefront.id } })
      else await tx.sellerStorefront.update({ where: { id: storefront.id }, data: { sellerId: canonical.id } })
    }
    for (const preference of preferences) {
      const targetStorefrontId = preference.sellerStorefrontId ? storefrontTargets.get(preference.sellerStorefrontId) || preference.sellerStorefrontId : null
      const existing = await tx.plantDefinitionPreferredSeller.findFirst({ where: { plantDefinitionId: preference.plantDefinitionId, sellerId: canonical.id, sellerStorefrontId: targetStorefrontId } })
      if (existing) {
        await tx.plantDefinitionPreferredSeller.delete({ where: { id: preference.id } })
      } else {
        await tx.plantDefinitionPreferredSeller.update({ where: { id: preference.id }, data: { sellerId: canonical.id, sellerStorefrontId: targetStorefrontId } })
      }
    }
    await tx.plantObservation.updateMany({ where: { sellerId: duplicate.id }, data: { sellerId: canonical.id } })
    await tx.plantAcquisitionRecord.updateMany({ where: { sellerId: duplicate.id }, data: { sellerId: canonical.id } })
    await tx.acquisitionBatch.updateMany({ where: { sellerId: duplicate.id }, data: { sellerId: canonical.id } })
    const aliases = new Set<string>([
      ...(Array.isArray(canonical.aliasesJson) ? canonical.aliasesJson.map(String) : []),
      duplicate.name,
      ...(Array.isArray(duplicate.aliasesJson) ? duplicate.aliasesJson.map(String) : []),
    ].filter((name) => normalizeProvenanceName(name) !== canonical.normalizedName))
    await tx.seller.update({ where: { id: canonical.id }, data: { aliasesJson: [...aliases] } })
    await tx.seller.delete({ where: { id: duplicate.id } })
    await emitDomainEvent(tx, { eventType: 'seller.merged', collectionId: collection.id, aggregateId: canonical.id, actor: { id: user.id, role: user.role }, idempotencyKey: `seller:${canonical.id}:merged:${duplicate.id}`, correlationId: `seller-merge:${canonical.id}:${duplicate.id}`, payload: { subjectId: canonical.id, displayName: canonical.name, duplicateId: duplicate.id, duplicateName: duplicate.name } })
  })
  await audit(user, 'MERGE', 'SELLER', canonical.id, `Merged seller ${duplicate.name} into ${canonical.name}`, { duplicateId }, collection.id)
  refresh(collection.slug)
}

export async function mergeSalesChannels(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const canonicalId = value(fd, 'canonicalId')
  const duplicateId = value(fd, 'duplicateId')
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) throw new Error('Choose two different sales channels.')
  const [canonical, duplicate] = await Promise.all([
    prisma.sellerStorefront.findFirstOrThrow({ where: { id: canonicalId, collectionId: collection.id } }),
    prisma.sellerStorefront.findFirstOrThrow({ where: { id: duplicateId, collectionId: collection.id } }),
  ])
  await prisma.$transaction(async (tx) => {
    await tx.plantObservation.updateMany({ where: { sellerStorefrontId: duplicate.id }, data: { sellerStorefrontId: canonical.id, sellerId: canonical.sellerId } })
    await tx.plantAcquisitionRecord.updateMany({ where: { sellerStorefrontId: duplicate.id }, data: { sellerStorefrontId: canonical.id, sellerId: canonical.sellerId } })
    await tx.acquisitionBatch.updateMany({ where: { sellerStorefrontId: duplicate.id }, data: { sellerStorefrontId: canonical.id, sellerId: canonical.sellerId } })
    const preferences = await tx.plantDefinitionPreferredSeller.findMany({ where: { sellerStorefrontId: duplicate.id } })
    for (const preference of preferences) {
      const existing = await tx.plantDefinitionPreferredSeller.findFirst({ where: { plantDefinitionId: preference.plantDefinitionId, sellerId: canonical.sellerId, sellerStorefrontId: canonical.id } })
      if (existing) await tx.plantDefinitionPreferredSeller.delete({ where: { id: preference.id } })
      else await tx.plantDefinitionPreferredSeller.update({ where: { id: preference.id }, data: { sellerId: canonical.sellerId, sellerStorefrontId: canonical.id } })
    }
    await tx.sellerStorefront.delete({ where: { id: duplicate.id } })
  })
  await audit(user, 'MERGE', 'SALES_CHANNEL', canonical.id, `Merged sales channel ${duplicate.handleOrName} into ${canonical.handleOrName}`, { duplicateId }, collection.id)
  refresh(collection.slug)
}

export async function deleteUnusedProvenanceRecord(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const recordType = value(fd, 'recordType')
  const id = value(fd, 'id')
  if (value(fd, 'confirmation') !== 'DELETE') throw new Error('Type DELETE to confirm permanent removal.')
  let displayName = ''
  if (recordType === 'SOURCE') {
    const record = await prisma.source.findFirstOrThrow({ where: { id, collectionId: collection.id }, include: { _count: { select: { acquisitions: true } } } })
    if (record._count.acquisitions) throw new Error('This source is referenced. Merge or archive it instead.')
    displayName = record.name
    await prisma.source.delete({ where: { id } })
  } else if (recordType === 'SELLER') {
    const record = await prisma.seller.findFirstOrThrow({ where: { id, collectionId: collection.id }, include: { _count: { select: { acquisitions: true, observations: true, acquisitionBatches: true, preferredBy: true, storefronts: true } } } })
    if (Object.values(record._count).some(Boolean)) throw new Error('This seller is referenced. Merge or archive it instead.')
    displayName = record.name
    await prisma.seller.delete({ where: { id } })
  } else if (recordType === 'SALES_CHANNEL') {
    const record = await prisma.sellerStorefront.findFirstOrThrow({ where: { id, collectionId: collection.id }, include: { _count: { select: { acquisitions: true, observations: true, acquisitionBatches: true, preferredBy: true } } } })
    if (Object.values(record._count).some(Boolean)) throw new Error('This sales channel is referenced. Merge or archive it instead.')
    displayName = record.handleOrName
    await prisma.sellerStorefront.delete({ where: { id } })
  } else {
    throw new Error('Unsupported provenance record type.')
  }
  await audit(user, 'DELETE', recordType, id, `Permanently deleted unused ${recordType.toLowerCase().replaceAll('_', ' ')} ${displayName}`, undefined, collection.id)
  refresh(collection.slug)
}

export async function convertLegacyOutletToSalesChannel(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  if (value(fd, 'confirmation') !== 'CONVERT') throw new Error('Type CONVERT to confirm this conversion.')
  const outlet = await prisma.distributorOutlet.findFirstOrThrow({
    where: { id: value(fd, 'outletId'), collectionId: collection.id },
    include: { distributor: true },
  })
  const sellerId = value(fd, 'sellerId')
  const seller = await prisma.seller.findFirstOrThrow({ where: { id: sellerId, collectionId: collection.id } })
  await ensureDefaultSalesChannelTypes(prisma, collection.id)
  const normalizedName = normalizeProvenanceName(outlet.name)
  const typeName = outlet.outletType === 'PHYSICAL_BRANCH' ? 'retail store' : outlet.outletType === 'SHOW_EVENT_BOOTH' ? 'plant show' : 'website'
  const channelType = await prisma.salesChannelType.findUniqueOrThrow({ where: { collectionId_normalizedName: { collectionId: collection.id, normalizedName: typeName } } })
  const channel = await prisma.$transaction(async (tx) => {
    const existing = await tx.sellerStorefront.findFirst({ where: { sellerId, normalizedName } })
    const target = existing || await tx.sellerStorefront.create({ data: {
      collectionId: collection.id, sellerId, distributorId: outlet.distributorId, handleOrName: outlet.name,
      normalizedName, storefrontType: 'OTHER', salesChannelTypeId: channelType.id, profileUrl: outlet.url,
      addressLine1: outlet.addressLine1, addressLine2: outlet.addressLine2, city: outlet.city, region: outlet.region,
      postalCode: outlet.postalCode, country: outlet.country, phone: outlet.phone, notes: outlet.notes,
    } })
    await tx.plantObservation.updateMany({ where: { distributorOutletId: outlet.id }, data: { sellerId: seller.id, sellerStorefrontId: target.id } })
    await tx.plantAcquisitionRecord.updateMany({ where: { distributorOutletId: outlet.id }, data: { sellerId: seller.id, sellerStorefrontId: target.id } })
    await tx.acquisitionBatch.updateMany({ where: { distributorOutletId: outlet.id }, data: { sellerId: seller.id, sellerStorefrontId: target.id } })
    await tx.distributorOutlet.update({ where: { id: outlet.id }, data: { active: false, archivedAt: new Date() } })
    return target
  })
  await audit(user, 'MIGRATE', 'DISTRIBUTOR_OUTLET', outlet.id, `Converted legacy outlet ${outlet.name} to sales channel ${channel.handleOrName}`, { sellerId, salesChannelId: channel.id }, collection.id)
  refresh(collection.slug)
}

export async function resolveProvenanceItem(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const item = await prisma.provenanceReconciliationItem.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id, status: 'PENDING' } })
  const sourceId = optional(fd, 'sourceId')
  const distributorId = optional(fd, 'distributorId')
  const distributorOutletId = optional(fd, 'distributorOutletId')
  const sellerId = optional(fd, 'sellerId')
  const sellerStorefrontId = optional(fd, 'sellerStorefrontId')
  if (sourceId) await prisma.source.findFirstOrThrow({ where: { id: sourceId, collectionId: collection.id } })
  if (distributorId || distributorOutletId || sellerId || sellerStorefrontId) await validateCommerceSelection(prisma, collection.id, { distributorId, distributorOutletId, sellerId, sellerStorefrontId })
  await prisma.$transaction(async (tx) => {
    if (item.entityType === 'PlantAcquisitionRecord') {
      if (distributorId || sellerId) await tx.plantAcquisitionRecord.update({ where: { id: item.entityId }, data: { distributorId, distributorOutletId, sellerId, sellerStorefrontId } })
      if (sourceId) {
        const existing = await tx.acquisitionSource.count({ where: { acquisitionRecordId: item.entityId } })
        await tx.acquisitionSource.create({ data: { collectionId: collection.id, acquisitionRecordId: item.entityId, sourceId, role: 'UNKNOWN', sortOrder: existing, isPrimary: existing === 0 } })
      }
    } else if (item.entityType === 'PlantObservation' && (distributorId || sellerId)) {
      await tx.plantObservation.update({ where: { id: item.entityId }, data: { distributorId, distributorOutletId, sellerId, sellerStorefrontId } })
    } else if (item.entityType === 'AcquisitionBatch' && (distributorId || sellerId)) {
      await tx.acquisitionBatch.update({ where: { id: item.entityId }, data: { distributorId, distributorOutletId, sellerId, sellerStorefrontId } })
    } else if (item.entityType === 'DistributorOutlet' && sellerId) {
      await tx.plantAcquisitionRecord.updateMany({ where: { collectionId: collection.id, distributorOutletId: item.entityId }, data: { distributorId, distributorOutletId: null, sellerId, sellerStorefrontId } })
      await tx.plantObservation.updateMany({ where: { collectionId: collection.id, distributorOutletId: item.entityId }, data: { distributorId, distributorOutletId: null, sellerId, sellerStorefrontId } })
      await tx.acquisitionBatch.updateMany({ where: { collectionId: collection.id, distributorOutletId: item.entityId }, data: { distributorId, distributorOutletId: null, sellerId, sellerStorefrontId } })
      await tx.distributorOutlet.update({ where: { id: item.entityId }, data: { active: false, archivedAt: new Date() } })
    }
    await tx.provenanceReconciliationItem.update({ where: { id: item.id }, data: { status: value(fd, 'resolution') === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED', resolutionJson: { sourceId, distributorId, distributorOutletId, sellerId, sellerStorefrontId, legacyPreserved: true }, resolvedByUserId: user.id, resolvedAt: new Date() } })
    await emitDomainEvent(tx, { eventType: 'provenance.reconciliation_resolved', collectionId: collection.id, aggregateId: item.id, actor: { id: user.id, role: user.role }, idempotencyKey: `provenance-reconciliation:${item.id}:resolved`, payload: { subjectId: item.id, displayName: item.legacyValue, entityType: item.entityType, entityId: item.entityId, resolution: value(fd, 'resolution') } })
  })
  await audit(user, 'UPDATE', 'PROVENANCE_RECONCILIATION', item.id, `Resolved provenance reconciliation for ${item.entityType}`, { legacyField: item.legacyField }, collection.id)
  refresh(collection.slug)
}

export async function updateProvenanceVisibility(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const data = {
    showSourceProvenance: fd.get('showSourceProvenance') === '1',
    showDistributorIdentity: fd.get('showDistributorIdentity') === '1',
    showDistributorOutlet: fd.get('showDistributorIdentity') === '1' && fd.get('showDistributorOutlet') === '1',
    showSellerIdentity: fd.get('showSellerIdentity') === '1',
    showSellerStorefront: fd.get('showSellerStorefront') === '1',
  }
  await prisma.collection.update({ where: { id: collection.id }, data })
  await audit(user, 'UPDATE', 'COLLECTION', collection.id, 'Updated public provenance visibility', data, collection.id)
  refresh(collection.slug)
}
