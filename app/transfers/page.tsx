import Link from 'next/link'
import {
  acceptPlantDefinitionShareRequest,
  acceptPlantTransferRequest,
  cancelPlantDefinitionShareRequest,
  cancelPlantTransferRequest,
  copyConnectedPlantDefinition,
  declinePlantDefinitionShareRequest,
  declinePlantTransferRequest,
  requestTransferConnection,
  respondTransferConnection,
  unblockTransferConnection,
} from '@/app/transfer-actions'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionGardener } from '@/lib/collections'
import { collectionRoleAtLeast } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'

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

type DefinitionPreview = {
  plantName?: string
  definition?: {
    genus?: string
    species?: string
    cultivarName?: string | null
    acquisitionLabel?: string | null
    provisionalTaxon?: string | null
    confidence?: string | null
    governingBody?: string | null
  }
  counts?: {
    aliases?: number
    instances?: number
    typePhotos?: number
    husbandryGuides?: number
  }
  senderNote?: string | null
}

function previewOf(value: unknown): Preview {
  return (value && typeof value === 'object') ? value as Preview : {}
}

function definitionPreviewOf(value: unknown): DefinitionPreview {
  return (value && typeof value === 'object') ? value as DefinitionPreview : {}
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

const transferStatusMessages: Record<string, { tone: 'success' | 'error'; message: string }> = {
  'target-required': { tone: 'error', message: 'Enter the target collection slug before sending a transfer connection request.' },
  'target-not-found': { tone: 'error', message: 'No active collection was found with that slug. Check the spelling and try again.' },
  'target-self': { tone: 'error', message: 'Choose a different collection. A collection cannot request a transfer connection with itself.' },
  'target-blocked': { tone: 'error', message: 'That collection has blocked transfer requests from this collection.' },
  'connection-requested': { tone: 'success', message: 'Transfer connection request sent. The target collection manager can allow, ignore, or block it.' },
}

export default async function CollectionTransfersPage({ searchParams }: { searchParams: Promise<{ transferStatus?: string }> }) {
  const sp = await searchParams
  const context = await requireCollectionGardener()
  const { collection, role } = context as typeof context & { role: string }
  const canManageTransfers = collectionRoleAtLeast(role, 'MANAGER')
  const transferStatus = sp.transferStatus ? transferStatusMessages[sp.transferStatus] : undefined

  const [
    outboundConnections,
    inboundConnections,
    incomingRequests,
    outgoingRequests,
    incomingDefinitionShares,
    outgoingDefinitionShares,
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
    prisma.plantDefinitionShareRequest.findMany({
      where: { targetCollectionId: collection.id },
      include: { sourceCollection: true, requestedBy: true, sourcePlantDefinition: true, targetPlantDefinition: true },
      orderBy: { requestedAt: 'desc' },
      take: 30,
    }),
    prisma.plantDefinitionShareRequest.findMany({
      where: { sourceCollectionId: collection.id },
      include: { targetCollection: true, requestedBy: true, sourcePlantDefinition: true, targetPlantDefinition: true },
      orderBy: { requestedAt: 'desc' },
      take: 30,
    }),
  ])
  const activeIncomingSourceIds = new Set(inboundConnections.filter((connection) => connection.status === 'ACTIVE').map((connection) => connection.sourceCollectionId))
  const reciprocalConnections = outboundConnections.filter((connection) => connection.status === 'ACTIVE' && activeIncomingSourceIds.has(connection.targetCollectionId))
  const reciprocalCollectionIds = reciprocalConnections.map((connection) => connection.targetCollectionId)
  const connectedDefinitions = reciprocalCollectionIds.length
    ? await prisma.plantDefinition.findMany({
        where: { collectionId: { in: reciprocalCollectionIds } },
        include: {
          collection: true,
          governingBody: true,
          aliases: { orderBy: { name: 'asc' } },
          _count: { select: { instances: true } },
        },
        orderBy: [{ genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
        take: 100,
      })
    : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Collection Transfers</h2>
        <p className="mt-1 text-stone-700">Connect with another collection, queue specimen transfers, and review incoming transfer packages.</p>
      </div>

      {transferStatus && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            transferStatus.tone === 'success'
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
        >
          {transferStatus.message}
        </div>
      )}

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
        <h3 className="font-bold">Incoming definition share queue</h3>
        <p className="mt-1 text-sm text-stone-600">Review shared plant definitions from connected collections before copying them into this collection.</p>
        <div className="mt-4 grid gap-4">
          {incomingDefinitionShares.length === 0 && <p className="text-sm text-stone-600">No incoming definition shares.</p>}
          {incomingDefinitionShares.map((request) => {
            const preview = definitionPreviewOf(request.previewSnapshot)
            return (
              <div key={request.id} className="rounded-lg border border-stone-200 bg-white/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{preview.plantName || plantName(request.sourcePlantDefinition)}</p>
                    <p className="text-sm text-stone-600">From {request.sourceCollection.name} · requested {fmtDate(request.requestedAt)} by {request.requestedBy.email}</p>
                    {preview.definition?.governingBody && <p className="text-sm text-stone-600">Governing body: {preview.definition.governingBody}</p>}
                  </div>
                  <span className={statusBadge(request.status)}>{request.status.toLowerCase()}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
                  <p>Aliases: {preview.counts?.aliases || 0}</p>
                  <p>Existing instances: {preview.counts?.instances || 0}</p>
                  <p>Type photos: {preview.counts?.typePhotos || 0}</p>
                  <p>Husbandry: {preview.counts?.husbandryGuides ? 'included' : 'none'}</p>
                </div>
                {preview.senderNote && <p className="mt-3 rounded-md bg-[#f5f0e2] p-3 text-sm">{preview.senderNote}</p>}
                {request.status === 'PENDING' && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <form action={acceptPlantDefinitionShareRequest} className="grid gap-2 rounded-lg border border-green-200 bg-green-50/60 p-3">
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="id" value={request.id} />
                      <TextArea label="Receiver note" name="receiverNote" />
                      <Button>Accept definition</Button>
                    </form>
                    <form action={declinePlantDefinitionShareRequest} className="grid gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="id" value={request.id} />
                      <TextArea label="Decline note" name="receiverNote" />
                      <Button className="bg-[#9a3f35] hover:bg-[#7d3028]">Decline definition</Button>
                    </form>
                  </div>
                )}
                {request.targetPlantDefinition && (
                  <Link className="mt-3 inline-block text-sm font-medium underline" href={collectionPath(collection.slug, `/plants/${request.targetPlantDefinition.id}/edit`)}>
                    View accepted definition
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Browse connected definitions</h3>
        <p className="mt-1 text-sm text-stone-600">Bidirectional active connections allow both collections to preview and copy plant definitions directly.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {connectedDefinitions.length === 0 && <p className="text-sm text-stone-600">No bidirectional definition browsing connections yet.</p>}
          {connectedDefinitions.map((definition) => (
            <div key={definition.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
              <p className="font-semibold">{plantName(definition)}</p>
              <p className="text-stone-600">{definition.collection?.name} · {definition.governingBody?.abbreviation || definition.governingBody?.name || 'No governing body'}</p>
              <p className="mt-2 text-stone-600">Aliases: {definition.aliases.length} · Instances: {definition._count.instances}</p>
              {definition.description && <p className="mt-2 line-clamp-2 text-stone-700">{definition.description}</p>}
              <form action={copyConnectedPlantDefinition} className="mt-3">
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="sourceCollectionId" value={definition.collectionId || ''} />
                <input type="hidden" name="sourcePlantDefinitionId" value={definition.id} />
                <Button className="w-full px-3 py-1.5 text-xs">Copy into this collection</Button>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Outgoing definition shares</h3>
        <div className="mt-4 space-y-3">
          {outgoingDefinitionShares.length === 0 && <p className="text-sm text-stone-600">No outgoing definition shares.</p>}
          {outgoingDefinitionShares.map((request) => (
            <div key={request.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{plantName(request.sourcePlantDefinition)} to {request.targetCollection.name}</p>
                  <p className="text-stone-600">Requested {fmtDate(request.requestedAt)}</p>
                </div>
                <span className={statusBadge(request.status)}>{request.status.toLowerCase()}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-xs font-medium underline" href={collectionPath(collection.slug, `/plants/${request.sourcePlantDefinition.id}/edit`)}>
                  Source definition
                </Link>
                {request.status === 'PENDING' && (
                  <form action={cancelPlantDefinitionShareRequest}>
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
