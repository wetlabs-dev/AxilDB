import {
  completeReminder,
  createReminder,
  deleteReminder,
  pauseReminder,
  resumeReminder,
} from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import {
  entityLabel,
  recurrenceLabel,
  reminderCategories,
  reminderCategoryLabel,
  reminderRecurrences,
} from '@/lib/reminders'
import { fmtDate } from '@/lib/utils'
import Link from 'next/link'

function reminderStatus(reminder: {
  completedAt: Date | null
  pausedAt: Date | null
  nextSendAt: Date | null
}) {
  if (reminder.completedAt) return 'Completed'
  if (reminder.pausedAt) return 'Paused'
  if (reminder.nextSendAt && reminder.nextSendAt <= new Date()) return 'Due'
  return 'Scheduled'
}

export default async function RemindersPage() {
  const user = await requireUser()
  const { collection } = await requireCollectionViewer()
  const reminders = await prisma.reminder.findMany({
    where: { userId: user.id, collectionId: collection.id },
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' },
        take: 3,
      },
    },
    orderBy: [
      { completedAt: 'asc' },
      { pausedAt: 'asc' },
      { nextSendAt: 'asc' },
      { dueAt: 'desc' },
    ],
  })

  const bloomIds = reminders
    .filter((reminder) => reminder.entityType === 'BLOOM_EVENT' && reminder.entityId)
    .map((reminder) => reminder.entityId!)

  const blooms = bloomIds.length
    ? await prisma.bloomEvent.findMany({
        where: { id: { in: bloomIds }, collectionId: collection.id },
        include: { plantInstance: true },
      })
    : []

  const bloomPathById = new Map(
    blooms.map((bloom) => [bloom.id, collectionPath(collection.slug, `/instances/${bloom.plantInstanceId}#bloom-${bloom.id}`)])
  )

  const recordPath = (entityType?: string | null, entityId?: string | null) => {
    if (entityType === 'PLANT_INSTANCE' && entityId) return collectionPath(collection.slug, `/instances/${entityId}`)
    if (entityType === 'BLOOM_EVENT' && entityId) return bloomPathById.get(entityId)
    return undefined
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Reminders</h2>
        <p className="text-stone-700">
          Schedule gentle nudges for plant check-ins, bloom follow-ups, propagation reviews, and general collection tasks.
        </p>
      </div>

      <Card>
        <h3 className="font-bold">Add reminder</h3>
        <form action={createReminder} className="mt-4 grid gap-3 md:max-w-3xl md:grid-cols-2">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <input type="hidden" name="back" value={collectionPath(collection.slug, '/reminders')} />
          <Field label="Title" name="title" required />
          <Field label="Send at" help="The first date and time this reminder should be emailed." name="dueAt" type="datetime-local" required />
          <Select label="Category" name="category" defaultValue="GENERAL">
            {reminderCategories.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Select label="Repeat" name="rrule" defaultValue="">
            {reminderRecurrences.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <TextArea label="Notes" name="body" wrapperClassName="md:col-span-2" />
          <div className="md:col-span-2">
            <Button>Create reminder</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4">
        {reminders.length === 0 && (
          <Card>
            <p className="text-sm text-stone-600">No reminders yet.</p>
          </Card>
        )}

        {reminders.map((reminder) => {
          const path = recordPath(reminder.entityType, reminder.entityId)

          return (
            <Card key={reminder.id} className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#2f6b45]">
                  <span>{reminderCategoryLabel(reminder.category)}</span>
                  <span>·</span>
                  <span>{reminderStatus(reminder)}</span>
                </div>
                <h3 className="mt-2 font-serif text-xl font-bold">{reminder.title}</h3>
                {reminder.body && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{reminder.body}</p>}
                <p className="mt-3 text-sm text-stone-600">
                  Due {fmtDate(reminder.nextSendAt || reminder.dueAt)} · {recurrenceLabel(reminder.rrule)} · {entityLabel(reminder.entityType)}
                </p>
                {path && (
                  <Link className="mt-2 inline-block text-sm font-medium underline" href={path}>
                    Open linked record
                  </Link>
                )}

                {reminder.deliveries.length > 0 && (
                  <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-600">
                    <p className="font-medium text-stone-800">Recent delivery history</p>
                    {reminder.deliveries.map((delivery) => (
                      <p key={delivery.id}>
                        {delivery.status} · {delivery.recipient} · {delivery.sentAt ? fmtDate(delivery.sentAt) : fmtDate(delivery.createdAt)}
                        {delivery.error ? ` · ${delivery.error}` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap content-start gap-2 lg:justify-end">
                {!reminder.completedAt && !reminder.pausedAt && (
                  <>
                    <form action={completeReminder}>
                      <input type="hidden" name="id" value={reminder.id} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, '/reminders')} />
                      <Button className="px-3 py-1.5 text-xs">Complete</Button>
                    </form>
                    <form action={pauseReminder}>
                      <input type="hidden" name="id" value={reminder.id} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, '/reminders')} />
                      <Button className="border border-stone-300 bg-white/70 px-3 py-1.5 text-xs text-stone-800 hover:bg-white">Pause</Button>
                    </form>
                  </>
                )}
                {reminder.pausedAt && !reminder.completedAt && (
                  <form action={resumeReminder}>
                    <input type="hidden" name="id" value={reminder.id} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, '/reminders')} />
                    <Button className="px-3 py-1.5 text-xs">Resume</Button>
                  </form>
                )}
                <form action={deleteReminder}>
                  <input type="hidden" name="id" value={reminder.id} />
                  <input type="hidden" name="back" value={collectionPath(collection.slug, '/reminders')} />
                  <ConfirmDeleteButton
                    className="px-3 py-1.5 text-xs"
                    title="Delete reminder?"
                    message="This deletes the reminder and its delivery history."
                    confirmLabel="Delete reminder"
                  >
                    Delete
                  </ConfirmDeleteButton>
                </form>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
