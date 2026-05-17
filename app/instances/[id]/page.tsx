import {
  archivePlantInstance,
  addNote,
  openBloomEvent,
  updateBloomPeak,
  closeBloomEvent,
  setCoverPhoto,
  setTypePhoto,
  deletePhoto,
  markSportCandidate,
  markSportReverted,
  createReminder,
  completeReminder,
  pauseReminder,
  deleteReminder,
  followEntity,
  unfollowEntity,
} from '@/app/actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { PlantImage } from '@/components/PlantImage'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { recurrenceLabel, reminderCategories, reminderCategoryLabel, reminderRecurrences } from '@/lib/reminders'
import { fmtDate, plantName, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'
import QRCode from 'qrcode'

export default async function InstanceDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }

  const i = await prisma.plantInstance.findFirstOrThrow({
    where: { id, ...collectionWhere },
    include: {
      plantDefinition: { include: { aliases: { orderBy: { name: 'asc' } } } },
      blooms: {
        orderBy: { bloomStartDate: 'desc' },
      },
      parentLinks: {
        include: {
          propagationEvent: true,
        },
      },
      childLinks: {
        include: {
          propagationEvent: {
            include: {
              children: {
                include: {
                  childPlantInstance: true,
                },
              },
            },
          },
        },
      },
      sportRecords: { include: { propagationEvent: true }, orderBy: { generationNumber: 'desc' } },
    },
  })

  const notes = await prisma.note.findMany({
    where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: id },
    orderBy: { createdAt: 'desc' },
  })

  const photos = await prisma.photo.findMany({
    where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: id },
    orderBy: [{ isCover: 'desc' }, { isType: 'desc' }, { createdAt: 'desc' }],
  })

  const bloomPhotos = await prisma.photo.findMany({
    where: {
      entityType: 'BLOOM_EVENT',
      collectionId: collection.id,
      entityId: {
        in: i.blooms.map((b) => b.id),
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const photosByBloomId = bloomPhotos.reduce<Record<string, typeof bloomPhotos>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = []
    acc[photo.entityId].push(photo)
    return acc
  }, {})

  const reminders = user
    ? await prisma.reminder.findMany({
        where: {
          userId: user.id,
          collectionId: collection.id,
          OR: [
            { entityType: 'PLANT_INSTANCE', entityId: id },
            { entityType: 'BLOOM_EVENT', entityId: { in: i.blooms.map((b) => b.id) } },
          ],
        },
        orderBy: [{ completedAt: 'asc' }, { pausedAt: 'asc' }, { nextSendAt: 'asc' }, { dueAt: 'desc' }],
      })
    : []

  const follows = user
    ? await prisma.follow.findMany({
        where: {
          userId: user.id,
          collectionId: collection.id,
          OR: [
            { scope: 'SPECIMEN', entityType: 'PLANT_INSTANCE', entityId: id },
            { scope: 'LINEAGE', entityType: 'PLANT_INSTANCE', entityId: id },
            { scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: i.plantDefinitionId },
          ],
        },
      })
    : []
  const followByScope = new Map(follows.map((follow) => [follow.scope, follow]))
  const followCounts = await prisma.follow.groupBy({
    by: ['scope', 'entityType', 'entityId'],
    where: {
      OR: [
        { scope: 'SPECIMEN', entityType: 'PLANT_INSTANCE', entityId: id },
        { scope: 'LINEAGE', entityType: 'PLANT_INSTANCE', entityId: id },
        { scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: i.plantDefinitionId },
      ],
      collectionId: collection.id,
    },
    _count: { _all: true },
  })
  const followerCount = (scope: string, entityType: string, entityId: string) =>
    followCounts.find((follow) => follow.scope === scope && follow.entityType === entityType && follow.entityId === entityId)?._count._all || 0

  const instanceReminders = reminders.filter((reminder) => reminder.entityType === 'PLANT_INSTANCE')
  const remindersByBloomId = reminders
    .filter((reminder) => reminder.entityType === 'BLOOM_EVENT')
    .reduce<Record<string, typeof reminders>>((acc, reminder) => {
      if (!reminder.entityId) return acc
      if (!acc[reminder.entityId]) acc[reminder.entityId] = []
      acc[reminder.entityId].push(reminder)
      return acc
    }, {})

  const qr = await QRCode.toDataURL(
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collection.slug, `/instances/${id}`)}`
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{i.plantId}</h2>
          <p>{plantName(i.plantDefinition)}</p>
        </div>
        <img src={qr} className="h-28 w-28" alt="QR code" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {user && (
          <Card>
            <h3 className="font-bold">Follow updates</h3>
            <p className="mt-1 text-sm text-stone-600">
              Get emails when this specimen, its type, or this connected lineage changes.
            </p>
            <div className="mt-4 grid gap-2">
              {[
                ['SPECIMEN', 'PLANT_INSTANCE', id, 'Follow specimen', 'Following specimen'],
                ['LINEAGE', 'PLANT_INSTANCE', id, 'Follow lineage', 'Following lineage'],
                ['TYPE', 'PLANT_DEFINITION', i.plantDefinitionId, 'Follow plant type', 'Following plant type'],
              ].map(([scope, entityType, entityId, followLabel, followedLabel]) => {
                const existing = followByScope.get(scope)
                const count = followerCount(scope, entityType, entityId)
                return existing ? (
                  <form key={scope} action={unfollowEntity}>
                    <input type="hidden" name="id" value={existing.id} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                    <Button className="w-full border border-stone-300 bg-white/70 text-stone-800 hover:bg-white">
                      {followedLabel} · {count}
                    </Button>
                  </form>
                ) : (
                  <form key={scope} action={followEntity}>
                    <input type="hidden" name="scope" value={scope} />
                    <input type="hidden" name="entityType" value={entityType} />
                    <input type="hidden" name="entityId" value={entityId} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                    <Button className="w-full">{followLabel} · {count}</Button>
                  </form>
                )
              })}
            </div>
          </Card>
        )}

        <Card>
          <h3 className="font-bold">Identity</h3>
          <p className="font-medium">{plantName(i.plantDefinition)}</p>
          <p>Confidence: {taxonomyLabel(i.plantDefinition.confidence)}</p>
          <p>Acquired as: {i.plantDefinition.acquisitionLabel || '—'}</p>
          <p>Provisional taxon: {i.plantDefinition.provisionalTaxon || '—'}</p>
          <p>Authority: {i.plantDefinition.authority || '—'}</p>
          {(i.plantDefinition.wikipediaUrl || i.plantDefinition.inaturalistUrl || i.plantDefinition.powoUrl || i.plantDefinition.gbifUrl) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {i.plantDefinition.wikipediaUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.wikipediaUrl}>Wikipedia</a>}
              {i.plantDefinition.inaturalistUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.inaturalistUrl}>iNaturalist</a>}
              {i.plantDefinition.powoUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.powoUrl}>POWO</a>}
              {i.plantDefinition.gbifUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.gbifUrl}>GBIF</a>}
            </div>
          )}
          <p>Status: {i.status}</p>
          <p>Type: {i.instanceType}</p>
          <p>Location: {i.location || '—'}</p>
          <p>Acquired: {fmtDate(i.acquisitionDate)}</p>
          <p>Propagated: {fmtDate(i.propagationDate)}</p>
          <p>Source: {i.source || '—'}</p>
          <p>Stock: {i.stockNumber || '—'}</p>
          <Link className="mt-3 inline-block underline" href={collectionPath(collection.slug, `/graphs?root=${i.id}`)}>
            View lineage graph
          </Link>
          {i.plantDefinition.aliases.length > 0 && (
            <div className="mt-3 border-t border-stone-200 pt-3 text-sm">
              <p className="font-medium">Aliases</p>
              {i.plantDefinition.aliases.map((alias) => (
                <p key={alias.id}>
                  {alias.name} · {taxonomyLabel(alias.aliasType)} · {taxonomyLabel(alias.confidence)}
                </p>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-bold">Sport / mutation</h3>
          <p>Status: {i.sportStatus}</p>
          <p className="text-sm text-stone-700">{i.sportDescription || 'No sport observations yet.'}</p>
          {canCreateInCollection(user, context) && i.sportStatus === 'NONE' && (
            <form action={markSportCandidate} className="mt-4 grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
              <input type="hidden" name="id" value={id} />
              <TextArea label="Why do you suspect this is a sport?" help="Describe the visible difference you are tracking, such as flower color, leaf variegation, growth habit, or another trait that may propagate true." name="observation" />
              <Button>Mark suspected sport</Button>
            </form>
          )}
          {i.sportStatus !== 'NONE' && (
            <div className="mt-4 border-t border-stone-200 pt-3 text-sm">
              <p className="font-medium">Workflow</p>
              <p>
                {i.sportStatus === 'REVERTED'
                  ? 'This plant is marked reverted, so future propagations from it will not inherit sport candidate status.'
                  : 'Propagations from this plant will enter Sport Review as candidate sports. Add true-to-type stability records there; three confirmed generations marks the line stable.'}
              </p>
              {canCreateInCollection(user, context) && !['REVERTED', 'REGISTERED'].includes(i.sportStatus) && (
                <form action={markSportReverted} className="mt-4 grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                  <TextArea label="Why is this reverted?" help="Use when this branch appears to have returned to the original cultivar or no longer shows the suspected sport trait." name="observation" />
                  <Button>Mark reverted</Button>
                </form>
              )}
              {i.sportRecords.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium">Stability records</p>
                  {i.sportRecords.map((record) => (
                    <p key={record.id}>
                      Gen {record.generationNumber}: {record.propagatedTrue ? 'true' : 'not true'} · {fmtDate(record.propagationEvent.date)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {(canEditInCollection(user, context) || i.status !== 'ACTIVE') && <Card>
          <h3 className="font-bold">Archive</h3>
          {canEditInCollection(user, context) && i.status === 'ACTIVE' ? (
            <form action={archivePlantInstance} className="grid gap-2">
              <input type="hidden" name="id" value={id} />
              <Field label="Reason" help="Short reason this plant left active collection, such as sold, discarded, died, duplicate, or gifted." name="archiveReason" />
              <TextArea label="Notes" help="Optional archive context, including date details, condition, recipient, or follow-up notes." name="archiveNotes" />
              <Button>Archive plant</Button>
            </form>
          ) : (
            <p>
              {i.archiveReason} on {fmtDate(i.archiveDate)}
            </p>
          )}
        </Card>}
      </div>

      <Card>
        <h3 className="font-bold">Children</h3>
        {i.childLinks.length === 0 && <p className="text-sm text-neutral-600">No child propagations yet.</p>}
        {i.childLinks
          .flatMap((l) => l.propagationEvent.children)
          .map((c) => (
            <p key={c.id}>
              <Link className="underline" href={collectionPath(collection.slug, `/instances/${c.childPlantInstanceId}`)}>
                {c.childPlantInstance.plantId}
              </Link>
            </p>
          ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-bold">Add note</h3>
          {canCreateInCollection(user, context) && <form action={addNote} className="grid gap-2">
            <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
            <input type="hidden" name="entityId" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
            <TextArea label="Note" name="note" />
            <Button>Add note</Button>
          </form>}

          {notes.map((n) => (
            <p className="mt-3 border-t pt-3 text-sm" key={n.id}>
              {n.createdAt.toLocaleString()}
              <br />
              {n.note}
            </p>
          ))}
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">Reminders</h3>
              <p className="text-sm text-stone-600">Send yourself plant check-in emails tied to this specimen.</p>
            </div>
            <Link className="text-sm font-medium underline" href={collectionPath(collection.slug, '/reminders')}>All reminders</Link>
          </div>

          {user ? (
            <form action={createReminder} className="mt-4 grid gap-2 rounded-xl border border-stone-200 bg-white/60 p-3">
              <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
              <input type="hidden" name="entityId" value={id} />
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
              <Field label="Title" name="title" defaultValue={`Check ${i.plantId}`} required />
              <Field label="Send at" help="The first date and time AxilDB should email this reminder." name="dueAt" type="datetime-local" required />
              <Select label="Category" name="category" defaultValue="PLANT_CHECK_IN">
                {reminderCategories.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <Select label="Repeat" name="rrule" defaultValue="">
                {reminderRecurrences.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <TextArea label="Notes" name="body" />
              <Button>Create reminder</Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-stone-600">Sign in to schedule reminders.</p>
          )}

          <div className="mt-4 space-y-3">
            {instanceReminders.length === 0 && <p className="text-sm text-stone-600">No reminders for this plant yet.</p>}
            {instanceReminders.map((reminder) => (
              <div key={reminder.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
                <p className="font-medium">{reminder.title}</p>
                <p className="text-stone-600">
                  {reminderCategoryLabel(reminder.category)} · Due {fmtDate(reminder.nextSendAt || reminder.dueAt)} · {recurrenceLabel(reminder.rrule)}
                </p>
                {reminder.body && <p className="mt-1 whitespace-pre-wrap text-stone-700">{reminder.body}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!reminder.completedAt && !reminder.pausedAt && (
                    <>
                      <form action={completeReminder}>
                        <input type="hidden" name="id" value={reminder.id} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                        <Button className="px-3 py-1.5 text-xs">Complete</Button>
                      </form>
                      <form action={pauseReminder}>
                        <input type="hidden" name="id" value={reminder.id} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                        <Button className="border border-stone-300 bg-white/70 px-3 py-1.5 text-xs text-stone-800 hover:bg-white">Pause</Button>
                      </form>
                    </>
                  )}
                  <form action={deleteReminder}>
                    <input type="hidden" name="id" value={reminder.id} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
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
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold">Bloom tracker</h3>
          <p className="mb-4 text-sm text-neutral-600">
            Open a bloom when it starts, mark peak later, then close it when finished. Photos can be added to the bloom event at any stage.
          </p>

          {canCreateInCollection(user, context) && <form action={openBloomEvent} className="grid gap-2 rounded-xl border p-4">
            <input type="hidden" name="plantInstanceId" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Field label="Bloom start" help="The date the bloom event began, usually when the first flower opened or the bud clearly started opening." name="bloomStartDate" type="date" required />
            <label className="text-sm">
              <input type="checkbox" name="firstBloom" /> First bloom
            </label>
            <TextArea label="Opening notes" name="notes" />
            <Button>Open bloom event</Button>
          </form>}

          <div className="mt-6 space-y-4">
            {i.blooms.length === 0 && (
              <p className="text-sm text-neutral-600">No bloom events recorded yet.</p>
            )}

            {i.blooms.map((b) => {
              const status = b.bloomEndDate
                ? 'Closed'
                : b.peakBloomDate
                  ? 'Peaked / open'
                  : 'Open'

              return (
                <div key={b.id} id={`bloom-${b.id}`} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">Bloom started {fmtDate(b.bloomStartDate)}</p>
                      <p className="text-sm text-neutral-600">Status: {status}</p>
                    </div>
                  </div>

                  <p className="text-sm">
                    Peak: {fmtDate(b.peakBloomDate)} · End: {fmtDate(b.bloomEndDate)} · Flowers:{' '}
                    {b.flowerCount || '—'}
                  </p>

                  {b.firstBloom && <p className="mt-2 text-sm font-medium">First bloom</p>}
                  {b.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{b.notes}</p>}

                  {canEditInCollection(user, context) && !b.peakBloomDate && (
                    <form action={updateBloomPeak} className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="plantInstanceId" value={id} />
                      <Field label="Peak bloom date" help="The date the bloom looked its fullest or most representative." name="peakBloomDate" type="date" required />
                      <Field label="Flower count" help="Approximate number of open flowers at peak bloom." name="flowerCount" type="number" />
                      <TextArea label="Peak notes" name="notes" defaultValue={b.notes || ''} />
                      <Button>Mark peak bloom</Button>
                    </form>
                  )}

                  {canEditInCollection(user, context) && !b.bloomEndDate && (
                    <form action={closeBloomEvent} className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="plantInstanceId" value={id} />
                      <Field label="Bloom end date" help="The date the bloom event was finished or no longer useful to track as open." name="bloomEndDate" type="date" required />
                      <TextArea label="Closing notes" name="notes" defaultValue={b.notes || ''} />
                      <Button>Close bloom event</Button>
                    </form>
                  )}

                  {canCreateInCollection(user, context) && <form
                    action="/api/photos"
                    method="post"
                    encType="multipart/form-data"
                    className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3"
                  >
                    <input type="hidden" name="entityType" value="BLOOM_EVENT" />
                    <input type="hidden" name="entityId" value={b.id} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                    <input name="photo" type="file" accept="image/*" className="rounded-lg border p-2" />
                    <Field label="Caption" name="caption" />
                    <Button>Add bloom photo</Button>
                  </form>}

                  {user && (
                    <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                      <p className="mb-2 text-sm font-medium">Bloom reminders</p>
                      <form action={createReminder} className="grid gap-2">
                        <input type="hidden" name="entityType" value="BLOOM_EVENT" />
                        <input type="hidden" name="entityId" value={b.id} />
                        <input type="hidden" name="category" value="BLOOM_CYCLE" />
                        <input type="hidden" name="collectionSlug" value={collection.slug} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#bloom-${b.id}`)} />
                        <Field label="Title" name="title" defaultValue={`Follow up on bloom for ${i.plantId}`} required />
                        <Field label="Send at" help="Useful for checking peak bloom, closure, or photo follow-up." name="dueAt" type="datetime-local" required />
                        <Select label="Repeat" name="rrule" defaultValue="">
                          {reminderRecurrences.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </Select>
                        <TextArea label="Notes" name="body" />
                        <Button>Create bloom reminder</Button>
                      </form>

                      {(remindersByBloomId[b.id] || []).length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
                          {(remindersByBloomId[b.id] || []).map((reminder) => (
                            <div key={reminder.id} className="text-sm">
                              <p className="font-medium">{reminder.title}</p>
                              <p className="text-stone-600">
                                Due {fmtDate(reminder.nextSendAt || reminder.dueAt)} · {recurrenceLabel(reminder.rrule)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {(photosByBloomId[b.id] || []).length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {(photosByBloomId[b.id] || []).map((p) => (
                        <figure key={p.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white/70">
                          <div className="aspect-[4/3]">
                            <PlantImage src={p.path} alt={p.caption || 'Bloom photo'} />
                          </div>
                          <figcaption className="space-y-2 p-2 text-xs">
                            <p>{p.caption || 'Untitled bloom photo'}</p>
                            {canEditInCollection(user, context) && (
                              <form action={deletePhoto}>
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                                <ConfirmDeleteButton
                                  className="px-2 py-1 text-xs"
                                  title="Delete bloom photo?"
                                  message="This will permanently delete this bloom photo from the bloom event."
                                  confirmLabel="Delete photo"
                                >
                                  Delete photo
                                </ConfirmDeleteButton>
                              </form>
                            )}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="font-bold">Specimen photos</h3>
        <p className="mt-1 text-sm text-stone-600">
          Choose one cover photo for this specimen card. Admins can also mark one specimen photo as the type photo for the plant definition.
        </p>
        {canCreateInCollection(user, context) && <form
          action="/api/photos"
          method="post"
          encType="multipart/form-data"
          className="grid gap-2"
        >
          <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
          <input type="hidden" name="entityId" value={id} />
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
          <input name="photo" type="file" accept="image/*" className="rounded-lg border p-2" />
          <Field label="Caption" name="caption" />
          <Button>Upload photo</Button>
        </form>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.length === 0 && <p className="text-sm text-stone-600">No specimen photos yet.</p>}
          {photos.map((p) => (
            <figure key={p.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white/70">
              <div className="aspect-[4/3]">
                <PlantImage src={p.path} alt={p.caption || 'Plant photo'} />
              </div>
              <figcaption className="space-y-3 p-3 text-xs">
                <div>
                  <p className="font-medium">{p.caption || 'Untitled photo'}</p>
                  <p className="text-stone-600">
                    {p.isCover ? 'Cover photo' : 'Not cover'} · {p.isType ? 'Type photo' : 'Not type'}
                  </p>
                </div>
                {canEditInCollection(user, context) && (
                  <div className="flex flex-wrap gap-2">
                    <form action={setCoverPhoto}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                      <Button className="px-3 py-1.5 text-xs" disabled={p.isCover}>Set cover</Button>
                    </form>
                    <form action={setTypePhoto}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                      <Button className="px-3 py-1.5 text-xs" disabled={p.isType}>Set type</Button>
                    </form>
                  </div>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </div>
  )
}
