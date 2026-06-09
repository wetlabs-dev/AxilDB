import { logout } from '@/app/auth-actions'
import { getCurrentUser } from '@/lib/auth'
import { getCollectionContext, publicCollectionsForUser } from '@/lib/collections'
import { careQueueSummary, getCareQueue } from '@/lib/care-queue'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'
import { SidebarClient, type SidebarBadges, type SidebarCollection } from './SidebarClient'

async function buildSidebarBadges(collection: { id: string; slug: string }, user: { id: string; role: string } | null): Promise<SidebarBadges> {
  const collectionId = collection.id
  const [
    careItems,
    plantDefinitions,
    activeInstances,
    acquiredPropagations,
    propagationEvents,
    bloomEvents,
    photos,
    reminders,
    follows,
    sportReview,
    archivedPlants,
    careSheets,
    governingBodies,
    pendingMembers,
    pendingConnections,
    pendingPlantTransfers,
    pendingDefinitionShares,
    accountReviews,
  ] = await Promise.all([
    getCareQueue(prisma, { collectionId, collectionSlug: collection.slug, userId: user?.id }),
    prisma.plantDefinition.count({ where: { collectionId } }),
    prisma.plantInstance.count({ where: { collectionId, status: { not: 'ARCHIVED' } } }),
    prisma.plantInstance.count({ where: { collectionId, status: { not: 'ARCHIVED' }, instanceType: 'ACQUIRED_PROPAGATION' } }),
    prisma.propagationEvent.count({ where: { collectionId } }),
    prisma.bloomEvent.count({ where: { collectionId } }),
    prisma.photo.count({ where: { collectionId } }),
    user
      ? prisma.reminder.count({ where: { collectionId, userId: user.id, completedAt: null, pausedAt: null } })
      : Promise.resolve(0),
    user ? prisma.follow.count({ where: { collectionId, userId: user.id } }) : Promise.resolve(0),
    prisma.plantInstance.count({
      where: {
        collectionId,
        status: { not: 'ARCHIVED' },
        OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }],
      },
    }),
    prisma.plantInstance.count({ where: { collectionId, status: 'ARCHIVED' } }),
    prisma.careSheet.count({ where: { collectionId, status: { not: 'REVOKED' } } }),
    prisma.governingBody.count({ where: { collectionId } }),
    prisma.collectionMembership.count({ where: { collectionId, status: 'PENDING' } }),
    prisma.collectionTransferConnection.count({
      where: {
        status: 'PENDING',
        OR: [{ sourceCollectionId: collectionId }, { targetCollectionId: collectionId }],
      },
    }),
    prisma.plantTransferRequest.count({
      where: {
        status: 'PENDING',
        OR: [{ sourceCollectionId: collectionId }, { targetCollectionId: collectionId }],
      },
    }),
    prisma.plantDefinitionShareRequest.count({
      where: {
        status: 'PENDING',
        OR: [{ sourceCollectionId: collectionId }, { targetCollectionId: collectionId }],
      },
    }),
    user
      ? prisma.imageModerationReview.count({
          where: { uploaderUserId: user.id, reviewType: 'NO_PLANT_DETECTED', status: 'PENDING' },
        })
      : Promise.resolve(0),
  ])

  const serverBadge = user && isServerAdminRole(user.role)
    ? await buildServerBadge()
    : 0

  return {
    '/care': careQueueSummary(careItems).today,
    '/care-sheets': careSheets,
    '/plants': plantDefinitions,
    '/instances': activeInstances,
    '/propagations': propagationEvents + acquiredPropagations,
    '/blooms': bloomEvents,
    '/gallery': photos,
    '/reminders': reminders,
    '/following': follows,
    '/sports': sportReview,
    '/settings': governingBodies,
    '/members': pendingMembers,
    '/transfers': pendingConnections + pendingPlantTransfers + pendingDefinitionShares,
    '/archived': archivedPlants,
    account: accountReviews,
    server: serverBadge,
  }
}

async function buildServerBadge() {
  const [pendingCollectionRequests, pendingAiRequests, latestBackup] = await Promise.all([
    prisma.collectionRequest.count({ where: { status: 'PENDING' } }),
    prisma.aiAccessRequest.count({ where: { status: 'PENDING' } }),
    prisma.backupRun.findFirst({ orderBy: { requestedAt: 'desc' }, select: { status: true } }),
  ])

  return pendingCollectionRequests + pendingAiRequests + (latestBackup?.status === 'FAILED' ? 1 : 0)
}

export async function Sidebar() {
  const user = await getCurrentUser()
  const context = await getCollectionContext()
  const collections = await publicCollectionsForUser(user)
  const badges = await buildSidebarBadges(context.collection, user)

  const sidebarCollections: SidebarCollection[] = collections.map((collection: any) => ({
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    visibility: collection.visibility,
    membership: collection.memberships?.[0]
      ? {
          role: collection.memberships[0].role,
          status: collection.memberships[0].status,
        }
      : null,
  }))

  return (
    <SidebarClient
      user={user ? { email: user.email, role: user.role } : null}
      initialCollection={{ name: context.collection.name, slug: context.collection.slug }}
      collections={sidebarCollections}
      badges={badges}
      logoutAction={logout}
    />
  )
}
