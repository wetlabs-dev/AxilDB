'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { audit, requireUser } from '@/lib/auth'
import { collectionPath, requireCollectionOwner, userOwnsAnyCollection } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const roleRank: Record<string, number> = { VIEWER: 1, LOGGER: 2, ADMIN: 3, OWNER: 4 }

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base: string) {
  let slug = slugify(base) || `collection-${Date.now()}`
  let suffix = 2
  while (await prisma.collection.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${slugify(base)}-${suffix}`
    suffix += 1
  }
  return slug
}

async function assertHasOtherOwner(collectionId: string, userId: string) {
  const ownerCount = await prisma.collectionMembership.count({
    where: { collectionId, status: 'ACTIVE', role: 'OWNER', NOT: { userId } },
  })
  if (ownerCount === 0) throw new Error('A collection must keep at least one owner.')
}

export async function createCollection(fd: FormData) {
  const user = await requireUser()
  if (!(await userOwnsAnyCollection(user.id))) {
    throw new Error('Only collection owners can create new collections.')
  }

  const name = val(fd, 'name')
  if (!name) throw new Error('Collection name is required.')
  const slug = await uniqueSlug(val(fd, 'slug') || name)

  const collection = await prisma.collection.create({
    data: {
      name,
      slug,
      visibility: val(fd, 'visibility') === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
      description: val(fd, 'description'),
      memberships: { create: { userId: user.id, role: 'OWNER', status: 'ACTIVE' } },
    },
  })

  await audit(user, 'CREATE', 'COLLECTION', collection.id, `Created collection ${collection.name}`, collection, collection.id)
  redirect(collectionPath(collection.slug))
}

export async function updateCollection(fd: FormData) {
  const slug = val(fd, 'collectionSlug')
  const { user, collection } = await requireCollectionOwner(slug)
  const requestedSlug = slugify(val(fd, 'slug') || collection.slug)
  const duplicate = await prisma.collection.findFirst({
    where: { slug: requestedSlug, NOT: { id: collection.id } },
    select: { id: true },
  })
  if (duplicate) throw new Error('That collection slug is already in use.')

  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: {
      name: val(fd, 'name') || collection.name,
      slug: requestedSlug,
      visibility: val(fd, 'visibility') === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
      description: val(fd, 'description'),
    },
  })
  await audit(user, 'UPDATE', 'COLLECTION', collection.id, `Updated collection ${updated.name}`, updated, collection.id)
  revalidatePath('/collections')
  revalidatePath(collectionPath(collection.slug))
  revalidatePath(collectionPath(collection.slug, '/collection-settings'))
  revalidatePath(collectionPath(updated.slug))
  revalidatePath(collectionPath(updated.slug, '/collection-settings'))
  redirect(collectionPath(updated.slug, '/collection-settings'))
}

export async function requestMembership(fd: FormData) {
  const user = await requireUser()
  const slug = val(fd, 'collectionSlug')
  const collection = await prisma.collection.findUniqueOrThrow({ where: { slug } })
  await prisma.collectionMembership.upsert({
    where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
    update: { status: 'PENDING' },
    create: { collectionId: collection.id, userId: user.id, role: 'VIEWER', status: 'PENDING' },
  })
  await audit(user, 'REQUEST', 'COLLECTION_MEMBERSHIP', collection.id, `Requested membership in ${collection.name}`, undefined, collection.id)
  redirect('/collections')
}

export async function approveMembership(fd: FormData) {
  const { user, collection } = await requireCollectionOwner(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  await prisma.collectionMembership.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } })
  await audit(user, 'APPROVE', 'COLLECTION_MEMBERSHIP', membership.id, `Approved collection membership`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function rejectMembership(fd: FormData) {
  const { user, collection } = await requireCollectionOwner(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  await prisma.collectionMembership.update({ where: { id: membership.id }, data: { status: 'REJECTED' } })
  await audit(user, 'REJECT', 'COLLECTION_MEMBERSHIP', membership.id, `Rejected collection membership`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function updateMembershipRole(fd: FormData) {
  const { user, collection } = await requireCollectionOwner(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const role = val(fd, 'role')
  if (!roleRank[role]) throw new Error('Invalid role.')
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  if (membership.role === 'OWNER' && role !== 'OWNER') await assertHasOtherOwner(collection.id, membership.userId)
  await prisma.collectionMembership.update({ where: { id: membership.id }, data: { role } })
  await audit(user, 'UPDATE', 'COLLECTION_MEMBERSHIP', membership.id, `Changed collection role to ${role}`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}

export async function removeMembership(fd: FormData) {
  const { user, collection } = await requireCollectionOwner(val(fd, 'collectionSlug'))
  const membershipId = val(fd, 'membershipId')
  const membership = await prisma.collectionMembership.findFirstOrThrow({ where: { id: membershipId, collectionId: collection.id } })
  if (membership.role === 'OWNER') await assertHasOtherOwner(collection.id, membership.userId)
  await prisma.collectionMembership.delete({ where: { id: membership.id } })
  await audit(user, 'DELETE', 'COLLECTION_MEMBERSHIP', membership.id, `Removed collection member`, membership, collection.id)
  redirect(collectionPath(collection.slug, '/members'))
}
