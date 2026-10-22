import { getCurrentUser } from '@/lib/auth'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { collectionPath } from '@/lib/collections'
import {
  windowRange,
  selectRepottingWindow,
} from '@/lib/repotting-windows'
import { defaultTimeZone, timeZoneForPreference, formatDate } from '@/lib/time'
import { cadenceLabel, resolveCadence } from '@/lib/care-cadences'
import {
  saveRepottingAssignments,
  addToRepottingQueue,
} from '@/app/repotting-actions'
import { requestAiCuratorResearchNow } from '@/app/ai-curator-actions'
import { Button, Card, Select, Field, TextArea } from '@/components/ui'
export async function DefinitionRepotting({
  id,
  slug,
  canEdit,
  headingLevel = 3,
}: {
  id: string
  slug: string
  canEdit: boolean
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const [d, windows] = await Promise.all([
    prisma.plantDefinition.findUniqueOrThrow({
      where: { id },
      include: { primaryRepottingWindow: true, alternateRepottingWindow: true },
    }),
    prisma.repottingWindow.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])
  return (
    <Card>
      <Heading className="font-serif text-xl font-semibold">Repotting Windows</Heading>
      <p>
        Optional seasonal enrichment ·{' '}
        {d.primaryRepottingWindow ? 'Assigned' : 'Unresolved'}
      </p>
      <p className="mt-2 text-sm sm:mr-6 sm:inline-block">
        Primary:{' '}
        {d.primaryRepottingWindow
          ? `${d.primaryRepottingWindow.name} · ${windowRange(d.primaryRepottingWindow)}`
          : 'Not assigned'}
      </p>
      <p className="text-sm sm:inline-block">
        Alternate:{' '}
        {d.alternateRepottingWindow
          ? `${d.alternateRepottingWindow.name} · ${windowRange(d.alternateRepottingWindow)}`
          : 'Not assigned'}
      </p>
      {canEdit && (
        <>
          <details>
            <summary>Edit repotting windows</summary>
            <form action={saveRepottingAssignments} className="grid gap-2">
              <input type="hidden" name="collectionSlug" value={slug} />
              <input type="hidden" name="definitionId" value={id} />
              {(['primary', 'alternate'] as const).map((k) => (
                <Select
                  key={k}
                  label={k === 'primary' ? 'Primary' : 'Alternate'}
                  name={k}
                  defaultValue={
                    k === 'primary'
                      ? d.primaryRepottingWindowId || ''
                      : d.alternateRepottingWindowId || ''
                  }
                >
                  <option value="">Not assigned</option>
                  {windows
                    .filter(
                      (w) =>
                        w.isActive ||
                        w.id === d.primaryRepottingWindowId ||
                        w.id === d.alternateRepottingWindowId
                    )
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} · {windowRange(w)}
                        {!w.isActive ? ' (inactive)' : ''}
                      </option>
                    ))}
                </Select>
              ))}
              <Button>Save windows</Button>
              <p>Close this editor to cancel without saving.</p>
            </form>
          </details>
          <form action={requestAiCuratorResearchNow}>
            <input type="hidden" name="collectionSlug" value={slug} />
            <input type="hidden" name="plantDefinitionId" value={id} />
            <input
              type="hidden"
              name="back"
              value={collectionPath(slug, `/plants/${id}/edit`)}
            />
            <Button>Research repotting windows</Button>
          </form>
        </>
      )}
    </Card>
  )
}
export async function InstanceRepotting({
  id,
  slug,
  canAct,
}: {
  id: string
  slug: string
  canAct: boolean
}) {
  const plant = await prisma.plantInstance.findUniqueOrThrow({
    where: { id },
    include: {
      careCadenceOverrides: true,
      repottingQueueItems: { where: { status: 'QUEUED' } },
      plantDefinition: {
        include: {
          careCadences: true,
          primaryRepottingWindow: true,
          alternateRepottingWindow: true,
        },
      },
    },
  })
  const user = await getCurrentUser()
  const timezone = timeZoneForPreference(
    user
      ? await prisma.emailPreference.findUnique({ where: { userId: user.id } })
      : null
  )
  const d = plant.plantDefinition,
    windows = await prisma.repottingWindow.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    tz = timezone,
    now = new Date()
  const next = selectRepottingWindow({
      primaryWindow: d.primaryRepottingWindow,
      alternateWindow: d.alternateRepottingWindow,
      referenceDate: now,
      timezone: tz,
    }),
    c = resolveCadence('REPOTTING', d.careCadences, plant.careCadenceOverrides)
  return (
    <Card>
      <h3 className="font-serif text-xl">Repotting Planner</h3>
      <p>
        Cadence:{' '}
        {c.status === 'NOT_APPLICABLE'
          ? 'Not applicable'
          : c.cadence
            ? cadenceLabel(c.cadence)
            : 'Not scheduled'}{' '}
        · {c.source}
      </p>
      <p>
        Primary: {d.primaryRepottingWindow?.name || 'Not assigned'} · Alternate:{' '}
        {d.alternateRepottingWindow?.name || 'Not assigned'}
      </p>
      {plant.repottingQueueItems.length ? (
        <Link
          className="underline"
          href={collectionPath(
            slug,
            `/care/repotting#${plant.repottingQueueItems[0].id}`
          )}
        >
          View Scheduled Repotting / Reschedule
        </Link>
      ) : canAct && next ? (
        <details>
          <summary>Add to Repotting Queue</summary>
          <p>
            Recommended: {windows.find((w) => w.id === next.windowId)?.name}{' '}
            {next.year} · {formatDate(next.startDate, tz)} –{' '}
            {formatDate(next.endDate, tz)}
          </p>
          <p>
            {next.selectionReason === 'PRIMARY_PREFERRED_WITHIN_THRESHOLD'
              ? 'Primary starts within three calendar months of the earlier alternate.'
              : 'Next eligible preferred window.'}
          </p>
          <form action={addToRepottingQueue} className="grid gap-2">
            <input type="hidden" name="collectionSlug" value={slug} />
            <input type="hidden" name="plantInstanceId" value={id} />
            <Select
              name="windowId"
              label="Window occurrence"
              defaultValue={next.windowId}
            >
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {windowRange(w)}
                </option>
              ))}
            </Select>
            <Field
              label="Occurrence start year"
              name="year"
              type="number"
              min="2000"
              max="2200"
              defaultValue={next.year}
            />
            <TextArea label="Scheduling note / override reason" name="notes" />
            <p>
              Confirm the selected year and dates. Queueing records intent, not
              completed repotting. Close to cancel.
            </p>
            <Button>Add to Queue</Button>
          </form>
        </details>
      ) : (
        <p>No eligible windows assigned. Configure the definition first.</p>
      )}
    </Card>
  )
}
