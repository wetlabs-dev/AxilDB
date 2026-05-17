import { unfollowEntity } from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Card } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { followScopeLabel } from '@/lib/follows'
import { prisma } from '@/lib/prisma'
import { fmtDate } from '@/lib/utils'
import Link from 'next/link'

function followPath(slug: string, follow: { scope: string; entityType: string; entityId: string }) {
  if (follow.entityType === 'PLANT_INSTANCE') return collectionPath(slug, `/instances/${follow.entityId}`)
  if (follow.entityType === 'PLANT_DEFINITION') return collectionPath(slug, '/plants')
  return collectionPath(slug)
}

export default async function FollowingPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>
}) {
  const user = await requireUser()
  const { collection } = await requireCollectionViewer()
  const sp = await searchParams
  const follows = await prisma.follow.findMany({
    where: { userId: user.id, collectionId: collection.id },
    include: {
      notifications: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
    orderBy: [{ scope: 'asc' }, { label: 'asc' }],
  })

  const recentNotifications = await prisma.followNotification.findMany({
    where: { userId: user.id, collectionId: collection.id },
    include: { follow: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Following</h2>
        <p className="text-stone-700">
          Follow plant specimens, plant types, or lineages to get email updates when related records change.
        </p>
      </div>
      {sp.registered && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Your viewer account is ready. Check your email when you can to verify the address for follow notifications and account recovery.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="grid gap-4">
          {follows.length === 0 && (
            <Card>
              <p className="text-sm text-stone-600">You are not following anything yet. Use Follow buttons on plant definitions or specimen detail pages.</p>
            </Card>
          )}

          {follows.map((follow) => (
            <Card key={follow.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6b45]">{followScopeLabel(follow.scope)}</p>
                  <h3 className="mt-1 font-serif text-xl font-bold">{follow.label}</h3>
                  <p className="text-sm text-stone-600">Following since {fmtDate(follow.createdAt)}</p>
                  <Link className="mt-2 inline-block text-sm font-medium underline" href={followPath(collection.slug, follow)}>
                    Open record
                  </Link>
                </div>
                <form action={unfollowEntity}>
                  <input type="hidden" name="id" value={follow.id} />
                  <input type="hidden" name="back" value={collectionPath(collection.slug, '/following')} />
                  <ConfirmDeleteButton
                    className="px-3 py-1.5 text-xs"
                    title="Unfollow?"
                    message="You will stop receiving update emails for this follow."
                    confirmLabel="Unfollow"
                  >
                    Unfollow
                  </ConfirmDeleteButton>
                </form>
              </div>

              {follow.notifications.length > 0 && (
                <div className="mt-4 border-t border-stone-200 pt-3 text-sm">
                  <p className="font-medium">Recent notifications</p>
                  {follow.notifications.map((notification) => (
                    <p key={notification.id} className="mt-1 text-stone-600">
                      {notification.status} · {notification.eventType} · {fmtDate(notification.sentAt || notification.createdAt)}
                    </p>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        <Card className="self-start">
          <h3 className="font-bold">Recent follow mail</h3>
          <div className="mt-3 space-y-3">
            {recentNotifications.length === 0 && <p className="text-sm text-stone-600">No follow notifications yet.</p>}
            {recentNotifications.map((notification) => (
              <div key={notification.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
                <p className="font-medium">{notification.subject}</p>
                <p className="text-stone-600">
                  {notification.status} · {notification.eventType} · {fmtDate(notification.sentAt || notification.createdAt)}
                </p>
                {notification.error && <p className="mt-1 text-[#9a3f35]">{notification.error}</p>}
                <a className="mt-2 inline-block text-xs font-medium underline" href={notification.recordUrl}>
                  Open update
                </a>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
