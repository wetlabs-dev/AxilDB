import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  requireCollectionViewer,
  canCreateInCollection,
  collectionPath,
} from '@/lib/collections'
import { updateRepottingQueue } from '@/app/repotting-actions'
import {
  windowOccurrence,
  windowRange,
  selectRepottingWindow,
} from '@/lib/repotting-windows'
import { timeZoneForPreference, formatDate } from '@/lib/time'
import { plantName } from '@/lib/utils'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    window?: string
    year?: string
    location?: string
    status?: string
  }>
}) {
  const context = await requireCollectionViewer(),
    sp = await searchParams,
    canAct = canCreateInCollection(context.user, context),
    tz = timeZoneForPreference(
      context.user
        ? await prisma.emailPreference.findUnique({
            where: { userId: context.user.id },
          })
        : null
    )
  const status = ['QUEUED', 'COMPLETED', 'CANCELED'].includes(sp.status || '')
    ? sp.status
    : 'QUEUED'
  const [items, windows, locations, versions] = await Promise.all([
    prisma.repottingQueueItem.findMany({
      where: {
        status: status as any,
        ...(sp.window ? { repottingWindowId: sp.window } : {}),
        ...(sp.year && /^\d{4}$/.test(sp.year)
          ? { scheduledYear: Number(sp.year) }
          : {}),
        plantInstance: {
          collectionId: context.collection.id,
          ...(sp.location ? { currentLocationId: sp.location } : {}),
        },
      },
      include: {
        repottingWindow: true,
        plantInstance: {
          include: {
            currentLocation: true,
            plantDefinition: {
              include: {
                primaryRepottingWindow: true,
                alternateRepottingWindow: true,
              },
            },
          },
        },
      },
      orderBy: [{ scheduledYear: 'asc' }, { requestedAt: 'asc' }],
    }),
    prisma.repottingWindow.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.location.findMany({
      where: { collectionId: context.collection.id },
      orderBy: { name: 'asc' },
    }),
    prisma.substrateRecipeVersion.findMany({
      where: {
        collectionId: context.collection.id,
        status: { in: ['ACTIVE', 'HISTORICAL'] },
      },
      include: { recipe: true },
    }),
  ])
  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const key = `${item.repottingWindowId}:${item.scheduledYear}`
    groups.set(key, [...(groups.get(key) || []), item])
  }
  const sorted = [...groups.values()].sort(
    (a, b) =>
      windowOccurrence(
        a[0].repottingWindow,
        a[0].scheduledYear,
        tz
      ).startDate.getTime() -
      windowOccurrence(
        b[0].repottingWindow,
        b[0].scheduledYear,
        tz
      ).startDate.getTime()
  )
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Repotting Planner</h1>
      <p>
        Assess, plan, then repot. Queued work is not a completed care event.
        Overdue bookings stay in their assigned year.
      </p>
      <Link
        href={collectionPath(context.collection.slug, '/care')}
        className="underline"
      >
        Care Queue
      </Link>
      <form
        className="grid gap-2 sm:grid-cols-4"
        action={collectionPath(context.collection.slug, '/care/repotting')}
      >
        <Select label="Window" name="window" defaultValue={sp.window}>
          <option value="">All windows</option>
          {windows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Field label="Year" name="year" type="number" defaultValue={sp.year} />
        <Select label="Location" name="location" defaultValue={sp.location}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select label="Status" name="status" defaultValue={status}>
          {['QUEUED', 'COMPLETED', 'CANCELED'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Button>Filter planner</Button>
      </form>
      {!items.length && (
        <Card>
          No repotting work matches these filters. Add an instance from its
          detail page or a repotting assessment.
        </Card>
      )}
      {sorted.map((group) => {
        const first = group[0],
          occurrence = windowOccurrence(
            first.repottingWindow,
            first.scheduledYear,
            tz
          ),
          now = new Date(),
          state =
            status !== 'QUEUED'
              ? status
              : occurrence.endDate < now
                ? 'Past due'
                : occurrence.startDate <= now
                  ? 'Open now'
                  : 'Upcoming'
        return (
          <Card key={`${first.repottingWindowId}:${first.scheduledYear}`}>
            <details open>
              <summary className="font-serif text-xl">
                {first.repottingWindow.name} {first.scheduledYear} ·{' '}
                {group.length} {group.length === 1 ? 'plant' : 'plants'} ·{' '}
                {state}
              </summary>
              <p>
                {formatDate(occurrence.startDate, tz)} –{' '}
                {formatDate(occurrence.endDate, tz)}
              </p>
              <form action={updateRepottingQueue} className="space-y-3">
                <input
                  type="hidden"
                  name="collectionSlug"
                  value={context.collection.slug}
                />
                {group.map((item) => {
                  const d = item.plantInstance.plantDefinition,
                    snapshot = item.assignmentSnapshot as any,
                    recommendation = selectRepottingWindow({
                      primaryWindow: d.primaryRepottingWindow,
                      alternateWindow: d.alternateRepottingWindow,
                      referenceDate: now,
                      timezone: tz,
                    }),
                    changed =
                      snapshot &&
                      (snapshot.primary !== d.primaryRepottingWindowId ||
                        snapshot.alternate !== d.alternateRepottingWindowId)
                  return (
                    <article
                      id={item.id}
                      key={item.id}
                      className="rounded border p-3"
                    >
                      <label className="flex gap-2">
                        {canAct && status === 'QUEUED' && (
                          <input
                            type="checkbox"
                            name="itemId"
                            value={item.id}
                          />
                        )}
                        <Link
                          className="underline"
                          href={collectionPath(
                            context.collection.slug,
                            `/instances/${item.plantInstanceId}`
                          )}
                        >
                          {item.plantInstance.plantId} · {plantName(d)}
                        </Link>
                      </label>
                      <p>
                        {item.plantInstance.currentLocation?.name ||
                          'No location'}{' '}
                        · {item.source} · Added {formatDate(item.requestedAt, tz)}
                      </p>
                      {item.notes && <p>{item.notes}</p>}
                      {changed && (
                        <p role="status">
                          Definition windows changed; this booking has not
                          moved.
                        </p>
                      )}
                      {item.status === 'QUEUED' && recommendation && (
                        <p>
                          Recalculated recommendation:{' '}
                          {
                            windows.find(
                              (w) => w.id === recommendation.windowId
                            )?.name
                          }{' '}
                          {recommendation.year}. Select this occurrence below to
                          reschedule explicitly, or keep the current booking.
                        </p>
                      )}
                    </article>
                  )
                })}
                {canAct && status === 'QUEUED' && (
                  <details>
                    <summary>Actions for selected plants</summary>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        label="New window (for rescheduling)"
                        name="windowId"
                        defaultValue={first.repottingWindowId}
                      >
                        {windows
                          .filter((w) => w.isActive)
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} · {windowRange(w)}
                            </option>
                          ))}
                      </Select>
                      <Field
                        label="New occurrence start year"
                        name="year"
                        type="number"
                        min="2000"
                        max="2200"
                        defaultValue={first.scheduledYear}
                      />
                      <Select
                        label="New substrate (for completion)"
                        name="substrateMode"
                        defaultValue="UNKNOWN"
                      >
                        {[
                          'UNKNOWN',
                          'RECIPE',
                          'RECEIVED_SUBSTRATE',
                          'CUSTOM_UNKNOWN',
                          'NO_SUBSTRATE',
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </Select>
                      <Select
                        label="Substrate recipe"
                        name="substrateRecipeVersionId"
                      >
                        <option value="">Choose if using recipe</option>
                        {versions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.recipe.name} v{v.versionNumber}
                          </option>
                        ))}
                      </Select>
                      <Field
                        label="Substrate description"
                        name="receivedSubstrateDescription"
                      />
                      <Field
                        label="Performed on (for completion)"
                        type="date"
                        name="performedAt"
                      />
                      <TextArea label="Notes" name="notes" />
                      <label>
                        <input name="confirmed" type="checkbox" required /> I
                        confirm this operation for the selected plants (maximum
                        50). Mark Repotted records real care history; remove
                        returns the assessment to the care queue.
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button name="action" value="COMPLETE">
                          Mark selected Repotted
                        </Button>
                        <Button name="action" value="RESCHEDULE">
                          Reschedule selected
                        </Button>
                        <Button name="action" value="CANCEL">
                          Remove selected
                        </Button>
                      </div>
                    </div>
                  </details>
                )}
              </form>
            </details>
          </Card>
        )
      })}
    </div>
  )
}
