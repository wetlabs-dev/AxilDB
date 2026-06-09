import { PlantIdentificationHistoryList } from '@/components/PlantIdentificationHistoryList'
import { Card, LinkButton } from '@/components/ui'
import { collectionPath, requireCollectionManager } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/time'

export default async function PlantIdentificationHistoryPage() {
  const { user, collection } = await requireCollectionManager()
  const [preferences, logs] = await Promise.all([
    prisma.emailPreference.findUnique({ where: { userId: user.id } }),
    prisma.plantIdentificationLog.findMany({
      where: { collectionId: collection.id },
      include: {
        user: { select: { email: true } },
        uploadedPhoto: true,
        matchedPlantDefinition: true,
        createdPlantDefinition: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  const todayCount = logs.filter((log) => formatDate(log.createdAt, preferences?.timezone) === formatDate(new Date(), preferences?.timezone)).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">ID My Plant History</h2>
          <p className="mt-1 text-sm text-stone-600">Review AI-assisted plant identification attempts for this collection. These are drafts, not authoritative determinations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={collectionPath(collection.slug, '/plants')}>Plant Definitions</LinkButton>
          <LinkButton href={collectionPath(collection.slug, '/account')}>My Account</LinkButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-stone-600">History entries</p>
          <p className="mt-2 text-3xl font-bold">{logs.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-600">Created definitions</p>
          <p className="mt-2 text-3xl font-bold">{logs.filter((log) => log.status === 'CREATED_DEFINITION').length}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-600">Submitted today</p>
          <p className="mt-2 text-3xl font-bold">{todayCount}</p>
        </Card>
      </div>

      <Card>
        <PlantIdentificationHistoryList
          logs={logs}
          collectionSlug={collection.slug}
          timezone={preferences?.timezone}
          showUser
          canCreateDefinitions
        />
      </Card>
    </div>
  )
}
