import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentUser, type AuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const DEFAULT_COLLECTION_SLUG = 'axildb'
export const COLLECTION_HEADER = 'x-axildb-collection'

export type CollectionRole = 'OWNER' | 'ADMIN' | 'LOGGER' | 'VIEWER'
export type CollectionVisibility = 'PUBLIC' | 'PRIVATE'
export type CollectionStatus = 'PENDING' | 'ACTIVE' | 'REJECTED'

export type CollectionContext = {
  collection: {
    id: string
    name: string
    slug: string
    visibility: string
    description: string | null
  }
  user: AuthUser | null
  membership: {
    id: string
    role: string
    status: string
  } | null
}

const roleRank: Record<CollectionRole, number> = {
  VIEWER: 1,
  LOGGER: 2,
  ADMIN: 3,
  OWNER: 4,
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
        where: { memberships: { some: { role: 'OWNER', status: 'ACTIVE' } } },
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

  /*
   * The default collection is identified by isDefault rather than slug so its
   * URL slug can be renamed without bootstrap recreating an empty axildb collection.
   */
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  for (const admin of admins) {
    await prisma.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: defaultCollection.id, userId: admin.id } },
      update: { role: 'OWNER', status: 'ACTIVE' },
      create: { collectionId: defaultCollection.id, userId: admin.id, role: 'OWNER', status: 'ACTIVE' },
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
    prisma.plantAlias.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
    prisma.plantInstance.updateMany({ where: { collectionId: null }, data: { collectionId: id } }),
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
    select: { id: true, name: true, slug: true, visibility: true, description: true },
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
  const role = context.membership?.role as CollectionRole | undefined
  return role && role in roleRank ? role : null
}

export function canViewCollection(user: AuthUser | null, context: CollectionContext) {
  if (context.collection.visibility === 'PUBLIC') return true
  if (!user) return false
  return Boolean(membershipRole(context))
}

export function canCreateInCollection(user: AuthUser | null, context: CollectionContext) {
  const role = membershipRole(context)
  return Boolean(user && role && roleRank[role] >= roleRank.LOGGER)
}

export function canEditInCollection(user: AuthUser | null, context: CollectionContext) {
  const role = membershipRole(context)
  return Boolean(user && role && roleRank[role] >= roleRank.ADMIN)
}

export function canManageCollection(user: AuthUser | null, context: CollectionContext) {
  const role = membershipRole(context)
  return Boolean(user && role && roleRank[role] >= roleRank.OWNER)
}

async function assertCollectionTwoFactorReady(user: AuthUser, role: CollectionRole | null) {
  if (!role || roleRank[role] < roleRank.ADMIN) return
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
  if (!user || !role || roleRank[role] < roleRank[minimumRole]) {
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
  return context
}

export async function requireCollectionLogger(slug?: string) {
  return requireCollectionRole(slug, 'LOGGER')
}

export async function requireCollectionAdmin(slug?: string) {
  return requireCollectionRole(slug, 'ADMIN')
}

export async function requireCollectionOwner(slug?: string) {
  return requireCollectionRole(slug, 'OWNER')
}

export async function publicCollectionsForUser(user: AuthUser | null) {
  return prisma.collection.findMany({
    where: user
      ? {
          OR: [
            { visibility: 'PUBLIC' },
            { memberships: { some: { userId: user.id, status: 'ACTIVE' } } },
          ],
        }
      : { visibility: 'PUBLIC' },
    orderBy: { name: 'asc' },
    include: user ? { memberships: { where: { userId: user.id }, take: 1 } } : undefined,
  })
}

export async function userOwnsAnyCollection(userId: string) {
  const count = await prisma.collectionMembership.count({
    where: { userId, role: 'OWNER', status: 'ACTIVE' },
  })
  return count > 0
}
