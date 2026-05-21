import Link from 'next/link'
import {
  acceptPlantTransferRequest,
  cancelPlantTransferRequest,
  declinePlantTransferRequest,
  requestTransferConnection,
  respondTransferConnection,
  unblockTransferConnection,
} from '@/app/transfer-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import { collectionRoleAtLeast } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { fmtDate } from '@/lib/utils'

type Preview = {
  plantName?: string
  sourcePlantId?: string
  definition?: {
    genus?: string
    species?: string
    cultivarName?: string | null
    acquisitionLabel?: string | null
    provisionalTaxon?: string | null
    confidence?: string | null
  }
  instance?: {
    instanceType?: string
    status?: string
    sportStatus?: string
  }
  counts?: {
    photoCount?: number
    bloomCount?: number
    noteCount?: number
    bloomPhotoCount?: number
    propagationContextCount?: number
    sportRecordCount?: number
  }
  senderNote?: string | null
}

function previewOf(value: unknown): Preview {
  return (value && typeof value === 'object') ? value as Preview : {}
}

function statusBadge(status: string) {
  const classes: Record<string, string> = {
    ACTIVE: 'border-green-200 bg-green-50 text-green-800',
    PENDING: 'border-amber-200 bg-amber-50 text-amber-900',
    IGNORED: 'border-stone-200 bg-stone-50 text-stone-700',
    BLOCKED: 'border-red-200 bg-red-50 text-red-800',
    ACCEPTED: 'border-green-200 bg-green-50 text-green-800',
    DECLINED: 'border-red-200 bg-red-50 text-red-800',
    CANCELLED: 'border-stone-200 bg-stone-50 text-stone-700',
  }
  return `inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${classes[status] || classes.PENDING}`
}

export default async function CollectionTransfersPage() {
  const context = await requireCollectionGardener()
  const { collection, role } = context as typeof context & { role: string }
  const canManageTransfers = collectionRoleAtLeast(role, 'MANAGER')

  const [
    outboundConnections,
    inboundConnections,
    incomingRequests,
    outgoingRequests,
  ] = await Promise.all([
    prisma.collectionTransferConnection.findMany({
      where: { sourceCollectionId: collection.id },
      include: { targetCollection: true, requestedBy: true, respondedBy: true },
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    }),
    prisma.collectionTransferConnection.findMany({
      where: { targetCollectionId: collection.id },
      include: { sourceCollection: true, requestedBy: true, respondedBy: true },
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    }),
    prisma.plantTransferRequest.findMany({
      where: { targetCollectionId: collection.id },
      include: { sourceCollection: true, requestedBy: true, sourcePlantInstance: true, targetPlantInstance: true },
      orderBy: { requestedAt: 'desc' },
      take: 30,
    }),
    prisma.plantTransferRequest.findMany({
      where: { sourceCollectionId: collection.id },
      include: { targetCollection: true, requestedBy: true, sourcePlantInstance: true, targetPlantInstance: true },
      orderBy: { requestedAt: 'desc' },
      take: 30,
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Collection Transfers</h2>
        <p className="mt-1 text-stone-700">Connect with another collection, queue specimen transfers, and review incoming transfer packages.</p>
      </div>

      {canManageTransfers && (
        <Card>
          <h3 className="font-bold">Request transfer connection</h3>
          <p className="mt-1 text-sm text-stone-600">Ask another collection to receive transfer requests from this collection. Enter the target collection slug.</p>
          <form action={requestTransferConnection} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Field label="Target slug" name="targetSlug" placeholder="other-collection-slug" required />
            <Field label="Request note" name="requestNote" placeholder="Optional context for the target collection manager" />
            <Button>Send request</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="font-bold">Incoming connection requests</h3>
          <div className="mt-4 space-y-3">
            {inboundConnections.filter((connection) => connection.status === 'PENDING').length === 0 && (
              <p className="text-sm text-stone-600">No pending connection requests.</p>
            )}
            {inboundConnections.filter((connection) => connection.status === 'PENDING').map((connection) => (
              <div key={connection.id} className="rounded-lg border border-stone-200 bg-white/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{connection.sourceCollection.name}</p>
                    <p className="text-sm text-stone-600">/{connection.sourceCollection.slug} · requested by {connection.requestedBy.email}</p>
                    {connection.requestNote && <p className="mt-2 text-sm">{connection.requestNote}</p>}
                  </div>
                  <span className={statusBadge(connection.status)}>{connection.status.toLowerCase()}</span>
                </div>
                {canManageTransfers && (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {[
                      ['ACTIVE', 'Allow'],
                      ['IGNORED', 'Ignore'],
                      ['BLOCKED', 'Block'],
                    ].map(([response, label]) => (
                      <form key={response} action={respondTransferConnection}>
                        <input type="hidden" name="collectionSlug" value={collection.slug} />
                        <input type="hidden" name="id" value={connection.id} />
                        <input type="hidden" name="response" value={response} />
                        <Button className={response === 'BLOCKED' ? 'w-full bg-[#9a3f35] hover:bg-[#7d3028]' : 'w-full'}>
                          {label}
                        </Button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold">Active and blocked connections</h3>
          <div className="mt-4 space-y-3">
            {[...outboundConnections, ...inboundConnections].filter((connection) => ['ACTIVE', 'BLOCKED'].includes(connection.status)).length === 0 && (
              <p className="text-sm text-stone-600">No active or blocked transfer connections yet.</p>
            )}
            {outboundConnections.filter((connection) => ['ACTIVE', 'BLOCKED'].includes(connection.status)).map((connection) => (
              <div key={connection.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
                <p className="font-semibold">Outgoing to {connection.targetCollection.name}</p>
                <p className="text-stone-600">/{connection.targetCollection.slug}</p>
                <span className={statusBadge(connection.status)}>{connection.status.toLowerCase()}</span>
              </div>
            ))}
            {inboundConnections.filter((connection) => ['ACTIVE', 'BLOCKED'].includes(connection.status)).map((connection) => (
              <div key={connection.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Incoming from {connection.sourceCollection.name}</p>
                    <p className="text-stone-600">/{connection.sourceCollection.slug}</p>
                    <span className={statusBadge(connection.status)}>{connection.status.toLowerCase()}</span>
                  </div>
                  {canManageTransfers && connection.status === 'BLOCKED' && (
                    <form action={unblockTransferConnection}>
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="id" value={connection.id} />
                      <Button className="border border-stone-300 bg-white/70 text-stone-800 hover:bg-white">Unblock</Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="font-bold">Incoming plant transfer queue</h3>
        <div className="mt-4 grid gap-4">
          {incomingRequests.length === 0 && <p className="text-sm text-stone-600">No incoming plant transfer requests.</p>}
          {incomingRequests.map((request) => {
            const preview = previewOf(request.previewSnapshot)
            return (
              <div key={request.id} className="rounded-lg border border-stone-200 bg-white/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{preview.sourcePlantId || request.sourcePlantInstance.plantId}</p>
                    <p className="text-stone-700">{preview.plantName || 'Plant transfer'}</p>
                    <p className="text-sm text-stone-600">From {request.sourceCollection.name} · requested {fmtDate(request.requestedAt)} by {request.requestedBy.email}</p>
                  </div>
                  <span className={statusBadge(request.status)}>{request.status.toLowerCase()}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                  <p>Type: {preview.instance?.instanceType || '—'}</p>
                  <p>Sport: {preview.instance?.sportStatus || '—'}</p>
                  <p>Confidence: {preview.definition?.confidence || '—'}</p>
                  <p>Photos: {(preview.counts?.photoCount || 0) + (preview.counts?.bloomPhotoCount || 0)}</p>
                  <p>Blooms: {preview.counts?.bloomCount || 0}</p>
                  <p>Notes: {preview.counts?.noteCount || 0}</p>
                  <p>Propagation context: {preview.counts?.propagationContextCount || 0}</p>
                  <p>Sport records: {preview.counts?.sportRecordCount || 0}</p>
                </div>
                {preview.senderNote && <p className="mt-3 rounded-md bg-[#f5f0e2] p-3 text-sm">{preview.senderNote}</p>}
                {request.status === 'PENDING' && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <form action={acceptPlantTransferRequest} className="grid gap-2 rounded-lg border border-green-200 bg-green-50/60 p-3">
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="id" value={request.id} />
                      <TextArea label="Receiver note" name="receiverNote" />
                      <Button>Accept transfer</Button>
                    </form>
                    <form action={declinePlantTransferRequest} className="grid gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="id" value={request.id} />
                      <TextArea label="Decline note" name="receiverNote" />
                      <Button className="bg-[#9a3f35] hover:bg-[#7d3028]">Decline transfer</Button>
                    </form>
                  </div>
                )}
                {request.targetPlantInstance && (
                  <Link className="mt-3 inline-block text-sm font-medium underline" href={collectionPath(collection.slug, `/instances/${request.targetPlantInstance.id}`)}>
                    View accepted plant
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Outgoing plant transfers</h3>
        <div className="mt-4 space-y-3">
          {outgoingRequests.length === 0 && <p className="text-sm text-stone-600">No outgoing transfer requests.</p>}
          {outgoingRequests.map((request) => (
            <div key={request.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{request.sourcePlantInstance.plantId} to {request.targetCollection.name}</p>
                  <p className="text-stone-600">Requested {fmtDate(request.requestedAt)}</p>
                </div>
                <span className={statusBadge(request.status)}>{request.status.toLowerCase()}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-xs font-medium underline" href={collectionPath(collection.slug, `/instances/${request.sourcePlantInstance.id}`)}>
                  Source plant
                </Link>
                {request.status === 'PENDING' && (
                  <form action={cancelPlantTransferRequest}>
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="id" value={request.id} />
                    <Button className="border border-stone-300 bg-white/70 px-3 py-1.5 text-xs text-stone-800 hover:bg-white">Cancel request</Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

