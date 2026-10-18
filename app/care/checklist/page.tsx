import { CareQueueProvider } from '@/components/CareQueueOptimistic'
import { CareQueueChecklist } from '@/components/CareQueueChecklist'
import { canCreateInCollection, requireCollectionViewer } from '@/lib/collections'
import { getCareQueue } from '@/lib/care-queue'
import { prisma } from '@/lib/prisma'
import { addCalendarDays, endOfDayInTimeZone } from '@/lib/time'

function endOfChecklistRange(timezone?: string | null) {
  return endOfDayInTimeZone(addCalendarDays(new Date(), 7, timezone || undefined), timezone || undefined)
}

export default async function WeeklyChecklistPage() {
  const context = await requireCollectionViewer()
  const canAct = canCreateInCollection(context.user, context)
  const preferences = context.user
    ? await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
    : null
  const timezone = preferences?.timezone
  const rangeEnd = endOfChecklistRange(timezone)
  const snapshotAt = Date.now()
  const queue = await getCareQueue(prisma, {
    collectionId: context.collection.id,
    collectionSlug: context.collection.slug,
    userId: context.user?.id,
    timezone,
  })
  return <CareQueueProvider collectionSlug={context.collection.slug} userId={context.user?.id || 'public'} initialItems={queue} snapshotAt={snapshotAt} timezone={timezone}>
    <CareQueueChecklist collectionSlug={context.collection.slug} canAct={canAct} timezone={timezone} rangeEnd={rangeEnd} />
  </CareQueueProvider>
}
