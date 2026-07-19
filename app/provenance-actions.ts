'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionManager } from '@/lib/collections'
import { DISTRIBUTOR_TYPES, PARTY_KINDS, SOURCE_TYPES, normalizeProvenanceName, validateDistributorSelection } from '@/lib/provenance'
import { prisma } from '@/lib/prisma'

const value = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const optional = (fd: FormData, key: string) => value(fd, key) || null
const allowed = <T extends readonly string[]>(input: string, values: T, fallback: T[number]) => values.includes(input as T[number]) ? input as T[number] : fallback
const page = (slug: string, suffix = '') => collectionPath(slug, `/provenance${suffix}`)

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
  }
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

export async function saveDistributorLocation(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const distributorId = value(fd, 'distributorId')
  const name = value(fd, 'name')
  if (!name) throw new Error('Location name is required.')
  await validateDistributorSelection(prisma, collection.id, distributorId, null)
  const coordinate = (key: string) => {
    const parsed = Number(value(fd, key))
    return Number.isFinite(parsed) ? parsed : null
  }
  const data = {
    distributorId,
    name,
    normalizedName: normalizeProvenanceName(name),
    locationType: optional(fd, 'locationType'),
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
  const saved = id
    ? await prisma.distributorLocation.update({ where: { id, collectionId: collection.id }, data })
    : await prisma.distributorLocation.create({ data: { ...data, collectionId: collection.id } })
  await audit(user, id ? 'UPDATE' : 'CREATE', 'DISTRIBUTOR_LOCATION', saved.id, `${id ? 'Updated' : 'Created'} distributor location ${saved.name}`, { distributorId }, collection.id)
  refresh(collection.slug)
}

export async function toggleDistributorLocationArchive(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const location = await prisma.distributorLocation.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id } })
  const active = !location.active
  await prisma.distributorLocation.update({ where: { id: location.id }, data: { active, archivedAt: active ? null : new Date() } })
  await audit(user, 'UPDATE', 'DISTRIBUTOR_LOCATION', location.id, `${active ? 'Restored' : 'Archived'} distributor location ${location.name}`, undefined, collection.id)
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
    const locations = await tx.distributorLocation.findMany({ where: { distributorId: duplicate.id } })
    for (const location of locations) {
      const existing = await tx.distributorLocation.findFirst({ where: { distributorId: canonical.id, normalizedName: location.normalizedName } })
      const targetId = existing?.id || location.id
      await tx.plantObservation.updateMany({ where: { distributorLocationId: location.id }, data: { distributorLocationId: targetId, distributorId: canonical.id } })
      await tx.plantAcquisitionRecord.updateMany({ where: { distributorLocationId: location.id }, data: { distributorLocationId: targetId, distributorId: canonical.id } })
      if (existing) await tx.distributorLocation.delete({ where: { id: location.id } })
      else await tx.distributorLocation.update({ where: { id: location.id }, data: { distributorId: canonical.id } })
    }
    await tx.plantObservation.updateMany({ where: { distributorId: duplicate.id }, data: { distributorId: canonical.id } })
    await tx.plantAcquisitionRecord.updateMany({ where: { distributorId: duplicate.id }, data: { distributorId: canonical.id } })
    await tx.distributor.delete({ where: { id: duplicate.id } })
  })
  await audit(user, 'MERGE', 'DISTRIBUTOR', canonical.id, `Merged distributor ${duplicate.name} into ${canonical.name}`, { duplicateId }, collection.id)
  refresh(collection.slug)
}

export async function resolveProvenanceItem(fd: FormData) {
  const { user, collection } = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const item = await prisma.provenanceReconciliationItem.findFirstOrThrow({ where: { id: value(fd, 'id'), collectionId: collection.id, status: 'PENDING' } })
  const sourceId = optional(fd, 'sourceId')
  const distributorId = optional(fd, 'distributorId')
  const distributorLocationId = optional(fd, 'distributorLocationId')
  if (sourceId) await prisma.source.findFirstOrThrow({ where: { id: sourceId, collectionId: collection.id } })
  if (distributorId || distributorLocationId) await validateDistributorSelection(prisma, collection.id, distributorId, distributorLocationId)
  await prisma.$transaction(async (tx) => {
    if (item.entityType === 'PlantAcquisitionRecord') {
      if (distributorId) await tx.plantAcquisitionRecord.update({ where: { id: item.entityId }, data: { distributorId, distributorLocationId } })
      if (sourceId) {
        const existing = await tx.acquisitionSource.count({ where: { acquisitionRecordId: item.entityId } })
        await tx.acquisitionSource.create({ data: { collectionId: collection.id, acquisitionRecordId: item.entityId, sourceId, role: 'UNKNOWN', sortOrder: existing, isPrimary: existing === 0 } })
      }
    } else if (item.entityType === 'PlantObservation' && distributorId) {
      await tx.plantObservation.update({ where: { id: item.entityId }, data: { distributorId, distributorLocationId } })
    }
    await tx.provenanceReconciliationItem.update({ where: { id: item.id }, data: { status: value(fd, 'resolution') === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED', resolutionJson: { sourceId, distributorId, distributorLocationId, legacyPreserved: true }, resolvedByUserId: user.id, resolvedAt: new Date() } })
  })
  await audit(user, 'UPDATE', 'PROVENANCE_RECONCILIATION', item.id, `Resolved provenance reconciliation for ${item.entityType}`, { legacyField: item.legacyField }, collection.id)
  refresh(collection.slug)
}

export async function updateProvenanceVisibility(fd: FormData) {
  const { user, collection } = await requireCollectionManager(value(fd, 'collectionSlug'))
  const data = {
    showSourceProvenance: fd.get('showSourceProvenance') === '1',
    showDistributorIdentity: fd.get('showDistributorIdentity') === '1',
    showDistributorLocation: fd.get('showDistributorIdentity') === '1' && fd.get('showDistributorLocation') === '1',
  }
  await prisma.collection.update({ where: { id: collection.id }, data })
  await audit(user, 'UPDATE', 'COLLECTION', collection.id, 'Updated public provenance visibility', data, collection.id)
  refresh(collection.slug)
}
