import {
  archivePlantInstance,
  addNote,
  openBloomEvent,
  updateBloomPeak,
  closeBloomEvent,
} from '@/app/actions'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { canCreate, getCurrentUser, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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

  const i = await prisma.plantInstance.findUniqueOrThrow({
    where: { id },
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
    },
  })

  const notes = await prisma.note.findMany({
    where: { entityType: 'PLANT_INSTANCE', entityId: id },
    orderBy: { createdAt: 'desc' },
  })

  const photos = await prisma.photo.findMany({
    where: { entityType: 'PLANT_INSTANCE', entityId: id },
    orderBy: { createdAt: 'desc' },
  })

  const bloomPhotos = await prisma.photo.findMany({
    where: {
      entityType: 'BLOOM_EVENT',
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

  const qr = await QRCode.toDataURL(
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}/instances/${id}`
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
        <Card>
          <h3 className="font-bold">Identity</h3>
          <p className="font-medium">{plantName(i.plantDefinition)}</p>
          <p>Confidence: {taxonomyLabel(i.plantDefinition.confidence)}</p>
          <p>Acquired as: {i.plantDefinition.acquisitionLabel || '—'}</p>
          <p>Provisional taxon: {i.plantDefinition.provisionalTaxon || '—'}</p>
          <p>Authority: {i.plantDefinition.authority || '—'}</p>
          <p>Status: {i.status}</p>
          <p>Type: {i.instanceType}</p>
          <p>Location: {i.location || '—'}</p>
          <p>Acquired: {fmtDate(i.acquisitionDate)}</p>
          <p>Propagated: {fmtDate(i.propagationDate)}</p>
          <p>Source: {i.source || '—'}</p>
          <p>Stock: {i.stockNumber || '—'}</p>
          <Link className="mt-3 inline-block underline" href={`/graphs?root=${i.id}`}>
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
          <p>{i.sportDescription || 'No sport notes.'}</p>
        </Card>

        {(isAdmin(user) || i.status !== 'ACTIVE') && <Card>
          <h3 className="font-bold">Archive</h3>
          {isAdmin(user) && i.status === 'ACTIVE' ? (
            <form action={archivePlantInstance} className="grid gap-2">
              <input type="hidden" name="id" value={id} />
              <Field label="Reason" name="archiveReason" />
              <TextArea label="Notes" name="archiveNotes" />
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
              <Link className="underline" href={`/instances/${c.childPlantInstanceId}`}>
                {c.childPlantInstance.plantId}
              </Link>
            </p>
          ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-bold">Add note</h3>
          {canCreate(user) && <form action={addNote} className="grid gap-2">
            <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
            <input type="hidden" name="entityId" value={id} />
            <input type="hidden" name="back" value={`/instances/${id}`} />
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
          <h3 className="font-bold">Bloom tracker</h3>
          <p className="mb-4 text-sm text-neutral-600">
            Open a bloom when it starts, mark peak later, then close it when finished. Photos can be added to the bloom event at any stage.
          </p>

          {canCreate(user) && <form action={openBloomEvent} className="grid gap-2 rounded-xl border p-4">
            <input type="hidden" name="plantInstanceId" value={id} />
            <Field label="Bloom start" name="bloomStartDate" type="date" required />
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
                <div key={b.id} className="rounded-xl border p-4">
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

                  {isAdmin(user) && !b.peakBloomDate && (
                    <form action={updateBloomPeak} className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="plantInstanceId" value={id} />
                      <Field label="Peak bloom date" name="peakBloomDate" type="date" required />
                      <Field label="Flower count" name="flowerCount" type="number" />
                      <TextArea label="Peak notes" name="notes" defaultValue={b.notes || ''} />
                      <Button>Mark peak bloom</Button>
                    </form>
                  )}

                  {isAdmin(user) && !b.bloomEndDate && (
                    <form action={closeBloomEvent} className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="plantInstanceId" value={id} />
                      <Field label="Bloom end date" name="bloomEndDate" type="date" required />
                      <TextArea label="Closing notes" name="notes" defaultValue={b.notes || ''} />
                      <Button>Close bloom event</Button>
                    </form>
                  )}

                  {canCreate(user) && <form
                    action="/api/photos"
                    method="post"
                    encType="multipart/form-data"
                    className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3"
                  >
                    <input type="hidden" name="entityType" value="BLOOM_EVENT" />
                    <input type="hidden" name="entityId" value={b.id} />
                    <input type="hidden" name="back" value={`/instances/${id}`} />
                    <input name="photo" type="file" accept="image/*" className="rounded-lg border p-2" />
                    <Field label="Caption" name="caption" />
                    <Button>Add bloom photo</Button>
                  </form>}

                  {(photosByBloomId[b.id] || []).length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {(photosByBloomId[b.id] || []).map((p) => (
                        <figure key={p.id}>
                          <img src={p.path} className="rounded-xl" alt={p.caption || 'Bloom photo'} />
                          <figcaption className="text-xs">{p.caption}</figcaption>
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
        <h3 className="font-bold">Photos</h3>
        {canCreate(user) && <form
          action="/api/photos"
          method="post"
          encType="multipart/form-data"
          className="grid gap-2"
        >
          <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
          <input type="hidden" name="entityId" value={id} />
          <input type="hidden" name="back" value={`/instances/${id}`} />
          <input name="photo" type="file" accept="image/*" className="rounded-lg border p-2" />
          <Field label="Caption" name="caption" />
          <Button>Upload photo</Button>
        </form>}

        <div className="mt-4 grid grid-cols-3 gap-3">
          {photos.map((p) => (
            <figure key={p.id}>
              <img src={p.path} className="rounded-xl" alt={p.caption || 'Plant photo'} />
              <figcaption className="text-xs">{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </div>
  )
}
