import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentUser, type AuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { collectionRoleAtLeast, collectionRoleRank, isServerAdminRole, normalizeCollectionRole, type CollectionRole } from '@/lib/roles'

export const DEFAULT_COLLECTION_SLUG = 'axildb'
export const COLLECTION_HEADER = 'x-axildb-collection'

export type CollectionVisibility = 'PUBLIC' | 'PRIVATE'
export type CollectionStatus = 'ACTIVE' | 'ARCHIVED'

export type CollectionContext = {
  collection: {
    id: string
    name: string
    slug: string
    visibility: string
    status: string
    aiFeaturesEnabled: boolean
    description: string | null
  }
  user: AuthUser | null
  membership: {
    id: string
    role: string
    status: string
  } | null
}

export function collectionPath(slug: string, path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized === '/') return `/c/${slug}`
  return `/c/${slug}${normalized}`
}

export function legacyPathFromCollectionPath(pathname: string) {
  const match = pathname.match(/^\/c\/([^/]+)(\/.*)?$/)
  if (!match) return null
  return {
    slug: decodeURIComponent(match[1]),
    path: match[2] || '/',
  }
}

export async function getCurrentCollectionSlug() {
  const requestHeaders = await headers()
  return requestHeaders.get(COLLECTION_HEADER) || DEFAULT_COLLECTION_SLUG
}

export async function ensureDefaultCollection() {
  const existingDefault = await prisma.collection.findFirst({
    where: { isDefault: true },
    orderBy: { createdAt: 'asc' },
  })

  const oldestOwnedCollection = existingDefault
    ? null
    : await prisma.collection.findFirst({
        where: { memberships: { some: { role: { in: ['OWNER', 'MANAGER'] }, status: 'ACTIVE' } } },
        orderBy: { createdAt: 'asc' },
      })

  const collection = existingDefault
    || oldestOwnedCollection
    || await prisma.collection.findUnique({ where: { slug: DEFAULT_COLLECTION_SLUG } })
    || await prisma.collection.create({
      data: {
        name: 'AxilDB',
        slug: DEFAULT_COLLECTION_SLUG,
        visibility: 'PRIVATE',
        status: 'ACTIVE',
        description: 'Default AxilDB collection.',
        isDefault: true,
      },
    })

  await prisma.collection.update({
    where: { id: collection.id },
    data: {
      isDefault: true,
      ...(!collection.description ? { description: 'Default AxilDB collection.' } : {}),
    },
  })
  await prisma.collection.updateMany({
    where: { isDefault: true, NOT: { id: collection.id } },
    data: { isDefault: false },
  })

  const defaultCollection = await prisma.collection.findUniqueOrThrow({
    where: { id: collection.id },
  })

  await prisma.collection.updateMany({ where: { status: { not: 'ARCHIVED' } }, data: { status: 'ACTIVE' } })
  await prisma.user.updateMany({ where: { email: 'admin@axildb.com' }, data: { role: 'SERVER_ADMIN' } })
  await prisma.user.updateMany({ where: { NOT: { email: 'admin@axildb.com' }, role: { in: ['ADMIN', 'LOGGER', 'VIEWER'] } }, data: { role: 'USER' } })
  await prisma.collectionMembership.updateMany({ where: { role: 'OWNER' }, data: { role: 'MANAGER' } })
  await prisma.collectionMembership.updateMany({ where: { role: 'ADMIN' }, data: { role: 'GARDENER' } })

  const admins = await prisma.user.findMany({ where: { role: 'SERVER_ADMIN' }, select: { id: true } })
  for (const admin of admins) {
    await prisma.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: defaultCollection.id, userId: admin.id } },
      update: { role: 'MANAGER', status: 'ACTIVE' },
      create: { collectionId: defaultCollection.id, userId: admin.id, role: 'MANAGER', status: 'ACTIVE' },
    })
  }

  return defaultCollection
}

export async function backfillDefaultCollection(collectionId?: string) {
  const collection = collectionId ? await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } }) : await ensureDefaultCollection()
  const id = collection.id

  await prisma.$transaction([
    prisma.governingBody.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.plantDefinition.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.plantHusbandryGuide.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.plantAlias.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.plantInstance.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.plantHusbandryOverride.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.propagationEvent.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.note.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.photo.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.bloomEvent.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.reminder.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.reminderDelivery.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.follow.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.followNotification.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.auditLog.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
  ])

  return collection
}

export async function getCollectionContext(slug?: string): Promise<CollectionContext> {
  const user = await getCurrentUser()
  const resolvedSlug = slug || (await getCurrentCollectionSlug())
  const collection = await prisma.collection.findUnique({
    where: { slug: resolvedSlug },
    select: { id: true, name: true, slug: true, visibility: true, status: true, aiFeaturesEnabled: true, description: true },
  })

  if (!collection) {
    if (resolvedSlug === DEFAULT_COLLECTION_SLUG) {
      const created = await ensureDefaultCollection()
      return getCollectionContext(created.slug)
    }
    redirect('/collections')
  }

  const membership = user
    ? await prisma.collectionMembership.findUnique({
        where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
        select: { id: true, role: true, status: true },
      })
    : null

  return { collection, user, membership }
}

export function isActiveMember(context: CollectionContext) {
  return context.membership?.status === 'ACTIVE'
}

export function membershipRole(context: CollectionContext): CollectionRole | null {
  if (!isActiveMember(context)) return null
  return normalizeCollectionRole(context.membership?.role)
}

export function canViewCollection(user: AuthUser | null, context: CollectionContext) {
  if (context.collection.status === 'ARCHIVED') return false
  if (isServerAdminRole(user?.role)) return true
  if (context.collection.visibility === 'PUBLIC') return true
  if (!user) return false
  return Boolean(membershipRole(context))
}

export function canCreateInCollection(user: AuthUser | null, context: CollectionContext) {
  if (context.collection.status === 'ARCHIVED') return false
  if (isServerAdminRole(user?.role)) return true
  const role = membershipRole(context)
  return Boolean(user && role && collectionRoleRank[role] >= collectionRoleRank.LOGGER)
}

export function canEditInCollection(user: AuthUser | null, context: CollectionContext) {
  if (context.collection.status === 'ARCHIVED') return false
  if (isServerAdminRole(user?.role)) return true
  const role = membershipRole(context)
  return Boolean(user && role && collectionRoleRank[role] >= collectionRoleRank.GARDENER)
}

export function canManageCollection(user: AuthUser | null, context: CollectionContext) {
  if (context.collection.status === 'ARCHIVED') return false
  if (isServerAdminRole(user?.role)) return true
  const role = membershipRole(context)
  return Boolean(user && role && collectionRoleRank[role] >= collectionRoleRank.MANAGER)
}

async function assertCollectionTwoFactorReady(user: AuthUser, role: CollectionRole | null) {
  if (!role || collectionRoleRank[role] < collectionRoleRank.GARDENER) return
  const twoFactor = await prisma.userTwoFactor.findUnique({ where: { userId: user.id } })
  if (!twoFactor?.enabledAt) redirect('/account/security?setup=required')
  if (!user.twoFactorVerifiedAt) redirect('/login?twoFactor=expired')
}

async function requireCollectionRole(slug: string | undefined, minimumRole: CollectionRole) {
  const context = await getCollectionContext(slug)
  const user = context.user
  if (!canViewCollection(user, context)) {
    if (!user) redirect('/login')
    redirect(`/collection-access?slug=${encodeURIComponent(context.collection.slug)}`)
  }

  const role = membershipRole(context)
  if (user && isServerAdminRole(user.role) && context.collection.status !== 'ARCHIVED') {
    await assertCollectionTwoFactorReady(user, 'MANAGER')
    return { ...context, user, role: 'MANAGER' as CollectionRole }
  }

  if (context.collection.status === 'ARCHIVED' || !user || !role || !collectionRoleAtLeast(role, minimumRole)) {
    throw new Error('You do not have permission for this collection.')
  }

  await assertCollectionTwoFactorReady(user, role)
  return { ...context, user, role }
}

export async function requireCollectionViewer(slug?: string) {
  const context = await getCollectionContext(slug)
  if (!canViewCollection(context.user, context)) {
    if (!context.user) redirect('/login')
    redirect(`/collection-access?slug=${encodeURIComponent(context.collection.slug)}`)
  }
  if (context.user && isServerAdminRole(context.user.role)) {
    await assertCollectionTwoFactorReady(context.user, 'MANAGER')
  }
  return context
}

export async function requireCollectionLogger(slug?: string) {
  return requireCollectionRole(slug, 'LOGGER')
}

export async function requireCollectionGardener(slug?: string) {
  return requireCollectionRole(slug, 'GARDENER')
}

export async function requireCollectionManager(slug?: string) {
  return requireCollectionRole(slug, 'MANAGER')
}

export async function requireCollectionAdmin(slug?: string) {
  return requireCollectionGardener(slug)
}

export async function requireCollectionOwner(slug?: string) {
  return requireCollectionManager(slug)
}

export async function publicCollectionsForUser(user: AuthUser | null) {
  if (isServerAdminRole(user?.role)) {
    return prisma.collection.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      include: { memberships: { where: { userId: user!.id }, take: 1 } },
    })
  }

  return prisma.collection.findMany({
    where: user
      ? {
          OR: [
            { visibility: 'PUBLIC', status: 'ACTIVE' },
            { status: 'ACTIVE', memberships: { some: { userId: user.id, status: 'ACTIVE' } } },
          ],
        }
      : { visibility: 'PUBLIC', status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    include: user ? { memberships: { where: { userId: user.id }, take: 1 } } : undefined,
  })
}

export async function userOwnsAnyCollection(userId: string) {
  const count = await prisma.collectionMembership.count({
    where: { userId, role: 'MANAGER', status: 'ACTIVE' },
  })
  return count > 0
}
