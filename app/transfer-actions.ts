'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/auth'
import {
  collectionPath,
  getCurrentCollectionSlug,
  requireCollectionGardener,
  requireCollectionManager,
} from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import {
  acceptPlantDefinitionSharePackage,
  acceptPlantTransferPackage,
  buildPlantDefinitionSharePreview,
  buildPlantTransferPreview,
  copyPlantDefinitionPackage,
} from '@/lib/transfers'
import { sendTransferWorkflowEmail } from '@/lib/transfer-emails'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim() || undefined
const collectionSlug = async (fd: FormData) => val(fd, 'collectionSlug') || await getCurrentCollectionSlug()
const transfersPath = (slug: string) => collectionPath(slug, '/transfers')
const transfersStatusPath = (slug: string, status: string) => `${transfersPath(slug)}?transferStatus=${encodeURIComponent(status)}`
const managerRoles = ['MANAGER']
const transferReviewRoles = ['GARDENER', 'MANAGER']

function definitionName(definition: { genus: string; species: string; cultivarName?: string | null }) {
  return `${definition.genus} ${definition.species}${definition.cultivarName ? ` '${definition.cultivarName}'` : ''}`
}

function connectionResponseLabel(status: string) {
  if (status === 'ACTIVE') return 'approved'
  if (status === 'BLOCKED') return 'blocked'
  return 'ignored'
}

export async function requestTransferConnection(fd: FormData) {
  const context = await requireCollectionManager(await collectionSlug(fd))
  const { user, collection } = context
  const targetSlug = val(fd, 'targetSlug')?.toLowerCase()
  const requestNote = val(fd, 'requestNote')
  if (!targetSlug) redirect(transfersStatusPath(collection.slug, 'target-required'))

  const target = await prisma.collection.findUnique({
    where: { slug: targetSlug },
    select: { id: true, name: true, slug: true, status: true },
  })
  if (!target || target.status !== 'ACTIVE') redirect(transfersStatusPath(collection.slug, 'target-not-found'))
  if (target.id === collection.id) redirect(transfersStatusPath(collection.slug, 'target-self'))

  const existing = await prisma.collectionTransferConnection.findUnique({
    where: { sourceCollectionId_targetCollectionId: { sourceCollectionId: collection.id, targetCollectionId: target.id } },
  })
  if (existing?.status === 'BLOCKED') redirect(transfersStatusPath(collection.slug, 'target-blocked'))
  if (existing?.status === 'ACTIVE') redirect(transfersStatusPath(collection.slug, 'connection-already-active'))
  if (existing?.status === 'PENDING') redirect(transfersStatusPath(collection.slug, 'connection-already-pending'))

  const connection = await prisma.collectionTransferConnection.upsert({
    where: { sourceCollectionId_targetCollectionId: { sourceCollectionId: collection.id, targetCollectionId: target.id } },
    update: {
      status: 'PENDING',
      requestedById: user.id,
      requestedAt: new Date(),
      respondedById: null,
      respondedAt: null,
      requestNote,
      responseNote: null,
    },
    create: {
      sourceCollectionId: collection.id,
      targetCollectionId: target.id,
      requestedById: user.id,
      requestNote,
    },
  })

  await audit(user, 'REQUEST', 'TRANSFER_CONNECTION', connection.id, `Requested transfer connection to ${target.name}`, { targetSlug }, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: target.id,
    collectionIdForRoles: target.id,
    roles: managerRoles,
    entityType: 'TRANSFER_CONNECTION',
    entityId: connection.id,
    subject: `Transfer connection requested from ${collection.name}`,
    actionPath: transfersPath(target.slug),
    lines: [
      `${collection.name} requested a collection transfer connection with ${target.name}.`,
      `${user.email} initiated the request.`,
      requestNote ? `Note: ${requestNote}` : 'Review the request to allow, ignore, or block it.',
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersStatusPath(collection.slug, 'connection-requested'))
}

export async function respondTransferConnection(fd: FormData) {
  const context = await requireCollectionManager(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  const response = val(fd, 'response')
  const responseNote = val(fd, 'responseNote')
  if (!id || !response || !['ACTIVE', 'IGNORED', 'BLOCKED'].includes(response)) throw new Error('Invalid transfer connection response.')

  const connection = await prisma.collectionTransferConnection.findFirstOrThrow({
    where: { id, targetCollectionId: collection.id },
    include: {
      sourceCollection: true,
      targetCollection: true,
      requestedBy: { include: { emailPreference: { select: { transferNotifications: true } } } },
    },
  })
  const redirectSlug = connection.targetCollection.slug

  await prisma.collectionTransferConnection.update({
    where: { id: connection.id },
    data: {
      status: response,
      respondedById: user.id,
      respondedAt: new Date(),
      responseNote,
    },
  })

  await audit(user, response === 'ACTIVE' ? 'APPROVE' : response, 'TRANSFER_CONNECTION', connection.id, `${response.toLowerCase()} transfer connection from ${connection.sourceCollection.name}`, undefined, collection.id)
  const responseLabel = connectionResponseLabel(response)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: connection.sourceCollectionId,
    users: [connection.requestedBy],
    entityType: 'TRANSFER_CONNECTION',
    entityId: connection.id,
    subject: `${collection.name} ${responseLabel} your transfer connection request`,
    actionPath: transfersPath(connection.sourceCollection.slug),
    lines: [
      `${collection.name} ${responseLabel} the transfer connection request from ${connection.sourceCollection.name}.`,
      responseNote ? `Response note: ${responseNote}` : 'Open Collection Transfers to review the connection status.',
    ],
  })
  revalidatePath(transfersPath(redirectSlug))
  redirect(transfersPath(redirectSlug))
}

export async function unblockTransferConnection(fd: FormData) {
  const context = await requireCollectionManager(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  if (!id) throw new Error('Connection is required.')
  const connection = await prisma.collectionTransferConnection.findFirstOrThrow({
    where: { id, targetCollectionId: collection.id, status: 'BLOCKED' },
    include: { sourceCollection: true },
  })
  await prisma.collectionTransferConnection.update({
    where: { id: connection.id },
    data: { status: 'IGNORED', respondedById: user.id, respondedAt: new Date(), responseNote: 'Unblocked.' },
  })
  await audit(user, 'UNBLOCK', 'TRANSFER_CONNECTION', connection.id, `Unblocked transfer requests from ${connection.sourceCollection.name}`, undefined, collection.id)
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersPath(collection.slug))
}

export async function removeTransferConnection(fd: FormData) {
  const context = await requireCollectionManager(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  if (!id) throw new Error('Connection is required.')

  const connection = await prisma.collectionTransferConnection.findFirstOrThrow({
    where: {
      id,
      OR: [
        { sourceCollectionId: collection.id },
        { targetCollectionId: collection.id },
      ],
    },
    include: { sourceCollection: true, targetCollection: true },
  })
  const otherCollection = connection.sourceCollectionId === collection.id ? connection.targetCollection : connection.sourceCollection

  await prisma.collectionTransferConnection.delete({ where: { id: connection.id } })
  await audit(user, 'DELETE', 'TRANSFER_CONNECTION', connection.id, `Removed transfer connection with ${otherCollection.name}`, {
    sourceCollectionId: connection.sourceCollectionId,
    targetCollectionId: connection.targetCollectionId,
    removedStatus: connection.status,
  }, collection.id)

  revalidatePath(transfersPath(collection.slug))
  redirect(transfersStatusPath(collection.slug, 'connection-removed'))
}

export async function createPlantTransferRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const connectionId = val(fd, 'connectionId')
  const sourcePlantInstanceId = val(fd, 'sourcePlantInstanceId')
  const senderNote = val(fd, 'senderNote')
  const back = val(fd, 'back')
  if (!connectionId || !sourcePlantInstanceId) throw new Error('Connection and plant are required.')

  const connection = await prisma.collectionTransferConnection.findFirstOrThrow({
    where: { id: connectionId, sourceCollectionId: collection.id, status: 'ACTIVE' },
    include: { targetCollection: true },
  })
  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id: sourcePlantInstanceId, collectionId: collection.id },
    select: { id: true, plantId: true, status: true },
  })
  if (instance.status === 'ARCHIVED') throw new Error('Archived plants cannot be transferred.')

  const existing = await prisma.plantTransferRequest.findFirst({
    where: {
      sourceCollectionId: collection.id,
      targetCollectionId: connection.targetCollectionId,
      sourcePlantInstanceId,
      status: 'PENDING',
    },
  })
  if (existing) throw new Error('There is already a pending transfer request for this plant and target collection.')

  const previewSnapshot = await buildPlantTransferPreview(collection.id, sourcePlantInstanceId, senderNote)
  const request = await prisma.plantTransferRequest.create({
    data: {
      connectionId: connection.id,
      sourceCollectionId: collection.id,
      targetCollectionId: connection.targetCollectionId,
      sourcePlantInstanceId,
      requestedById: user.id,
      senderNote,
      previewSnapshot,
    },
  })

  await audit(user, 'REQUEST', 'PLANT_TRANSFER_REQUEST', request.id, `Requested transfer of ${instance.plantId} to ${connection.targetCollection.name}`, { targetCollectionSlug: connection.targetCollection.slug }, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: connection.targetCollectionId,
    collectionIdForRoles: connection.targetCollectionId,
    roles: transferReviewRoles,
    entityType: 'PLANT_TRANSFER_REQUEST',
    entityId: request.id,
    subject: `Plant transfer requested: ${instance.plantId}`,
    actionPath: transfersPath(connection.targetCollection.slug),
    lines: [
      `${collection.name} requested to transfer ${instance.plantId} into ${connection.targetCollection.name}.`,
      `${user.email} initiated the request.`,
      senderNote ? `Sender note: ${senderNote}` : 'Review the transfer queue to accept or decline it.',
    ],
  })
  const destination = back || transfersPath(collection.slug)
  revalidatePath(destination.split('#')[0] || transfersPath(collection.slug))
  redirect(destination)
}

export async function acceptPlantTransferRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  const receiverNote = val(fd, 'receiverNote')
  if (!id) throw new Error('Transfer request is required.')
  const request = await prisma.plantTransferRequest.findFirstOrThrow({
    where: { id, targetCollectionId: collection.id, status: 'PENDING' },
    include: {
      sourceCollection: true,
      targetCollection: true,
      sourcePlantInstance: true,
      requestedBy: { include: { emailPreference: { select: { transferNotifications: true } } } },
    },
  })
  const result = await acceptPlantTransferPackage({ requestId: id, reviewedBy: user, receiverNote })
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: request.sourceCollectionId,
    users: [request.requestedBy],
    entityType: 'PLANT_TRANSFER_REQUEST',
    entityId: request.id,
    subject: `Plant transfer accepted: ${request.sourcePlantInstance.plantId}`,
    actionPath: collectionPath(request.sourceCollection.slug, `/instances/${request.sourcePlantInstanceId}`),
    lines: [
      `${collection.name} accepted the transfer of ${request.sourcePlantInstance.plantId}.`,
      `New target plant ID: ${result.targetInstance.plantId}.`,
      receiverNote ? `Receiver note: ${receiverNote}` : 'The source specimen has been archived with transfer notes.',
    ],
  })
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: collection.id,
    collectionIdForRoles: collection.id,
    roles: transferReviewRoles,
    excludeUserIds: [user.id],
    entityType: 'PLANT_TRANSFER_REQUEST',
    entityId: request.id,
    subject: `Plant transfer completed: ${result.targetInstance.plantId}`,
    actionPath: collectionPath(collection.slug, `/instances/${result.targetInstance.id}`),
    lines: [
      `${request.sourceCollection.name} transferred ${request.sourcePlantInstance.plantId} into ${collection.name}.`,
      `The new local plant ID is ${result.targetInstance.plantId}.`,
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(collectionPath(collection.slug, `/instances/${result.targetInstance.id}`))
}

export async function declinePlantTransferRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  const receiverNote = val(fd, 'receiverNote')
  if (!id) throw new Error('Transfer request is required.')
  const request = await prisma.plantTransferRequest.findFirstOrThrow({
    where: { id, targetCollectionId: collection.id, status: 'PENDING' },
    include: {
      sourcePlantInstance: true,
      sourceCollection: true,
      requestedBy: { include: { emailPreference: { select: { transferNotifications: true } } } },
    },
  })
  await prisma.plantTransferRequest.update({
    where: { id: request.id },
    data: { status: 'DECLINED', reviewedById: user.id, reviewedAt: new Date(), receiverNote },
  })
  await audit(user, 'DECLINE', 'PLANT_TRANSFER_REQUEST', request.id, `Declined transfer of ${request.sourcePlantInstance.plantId} from ${request.sourceCollection.name}`, undefined, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: request.sourceCollectionId,
    users: [request.requestedBy],
    entityType: 'PLANT_TRANSFER_REQUEST',
    entityId: request.id,
    subject: `Plant transfer declined: ${request.sourcePlantInstance.plantId}`,
    actionPath: transfersPath(request.sourceCollection.slug),
    lines: [
      `${collection.name} declined the transfer of ${request.sourcePlantInstance.plantId}.`,
      receiverNote ? `Receiver note: ${receiverNote}` : 'The source specimen was not changed.',
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersPath(collection.slug))
}

export async function cancelPlantTransferRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  if (!id) throw new Error('Transfer request is required.')
  const request = await prisma.plantTransferRequest.findFirstOrThrow({
    where: { id, sourceCollectionId: collection.id, status: 'PENDING' },
    include: { targetCollection: true, sourcePlantInstance: true },
  })
  await prisma.plantTransferRequest.update({
    where: { id: request.id },
    data: { status: 'CANCELLED', reviewedById: user.id, reviewedAt: new Date() },
  })
  await audit(user, 'CANCEL', 'PLANT_TRANSFER_REQUEST', request.id, `Cancelled transfer of ${request.sourcePlantInstance.plantId} to ${request.targetCollection.name}`, undefined, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: request.targetCollectionId,
    collectionIdForRoles: request.targetCollectionId,
    roles: transferReviewRoles,
    entityType: 'PLANT_TRANSFER_REQUEST',
    entityId: request.id,
    subject: `Plant transfer cancelled: ${request.sourcePlantInstance.plantId}`,
    actionPath: transfersPath(request.targetCollection.slug),
    lines: [
      `${collection.name} cancelled the pending transfer of ${request.sourcePlantInstance.plantId}.`,
      'No records were changed in the target collection.',
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersPath(collection.slug))
}

export async function createPlantDefinitionShareRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const connectionId = val(fd, 'connectionId')
  const sourcePlantDefinitionId = val(fd, 'sourcePlantDefinitionId')
  const senderNote = val(fd, 'senderNote')
  const back = val(fd, 'back')
  if (!connectionId || !sourcePlantDefinitionId) throw new Error('Connection and plant definition are required.')

  const connection = await prisma.collectionTransferConnection.findFirstOrThrow({
    where: { id: connectionId, sourceCollectionId: collection.id, status: 'ACTIVE' },
    include: { targetCollection: true },
  })
  const definition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id: sourcePlantDefinitionId, collectionId: collection.id },
    select: { id: true, genus: true, species: true, cultivarName: true },
  })

  const existing = await prisma.plantDefinitionShareRequest.findFirst({
    where: {
      sourceCollectionId: collection.id,
      targetCollectionId: connection.targetCollectionId,
      sourcePlantDefinitionId,
      status: 'PENDING',
    },
  })
  if (existing) throw new Error('There is already a pending definition share for this target collection.')

  const previewSnapshot = await buildPlantDefinitionSharePreview(collection.id, sourcePlantDefinitionId, senderNote)
  const request = await prisma.plantDefinitionShareRequest.create({
    data: {
      connectionId: connection.id,
      sourceCollectionId: collection.id,
      targetCollectionId: connection.targetCollectionId,
      sourcePlantDefinitionId,
      requestedById: user.id,
      senderNote,
      previewSnapshot,
    },
  })

  await audit(user, 'REQUEST', 'PLANT_DEFINITION_SHARE_REQUEST', request.id, `Shared definition ${definition.genus} ${definition.species}${definition.cultivarName ? ` '${definition.cultivarName}'` : ''} with ${connection.targetCollection.name}`, { targetCollectionSlug: connection.targetCollection.slug }, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: connection.targetCollectionId,
    collectionIdForRoles: connection.targetCollectionId,
    roles: transferReviewRoles,
    entityType: 'PLANT_DEFINITION_SHARE_REQUEST',
    entityId: request.id,
    subject: `Plant definition shared: ${definitionName(definition)}`,
    actionPath: transfersPath(connection.targetCollection.slug),
    lines: [
      `${collection.name} shared the plant definition ${definitionName(definition)} with ${connection.targetCollection.name}.`,
      `${user.email} initiated the share.`,
      senderNote ? `Sender note: ${senderNote}` : 'Review the definition share queue to accept or decline it.',
    ],
  })
  const destination = back || transfersPath(collection.slug)
  revalidatePath(destination.split('#')[0] || transfersPath(collection.slug))
  redirect(destination)
}

export async function acceptPlantDefinitionShareRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  const receiverNote = val(fd, 'receiverNote')
  if (!id) throw new Error('Definition share request is required.')
  const request = await prisma.plantDefinitionShareRequest.findFirstOrThrow({
    where: { id, targetCollectionId: collection.id, status: 'PENDING' },
    include: {
      sourceCollection: true,
      targetCollection: true,
      sourcePlantDefinition: true,
      requestedBy: { include: { emailPreference: { select: { transferNotifications: true } } } },
    },
  })
  const result = await acceptPlantDefinitionSharePackage({ requestId: id, reviewedBy: context.user, receiverNote })
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: request.sourceCollectionId,
    users: [request.requestedBy],
    entityType: 'PLANT_DEFINITION_SHARE_REQUEST',
    entityId: request.id,
    subject: `Definition share accepted: ${definitionName(request.sourcePlantDefinition)}`,
    actionPath: transfersPath(request.sourceCollection.slug),
    lines: [
      `${collection.name} accepted the shared definition ${definitionName(request.sourcePlantDefinition)}.`,
      `Target definition: ${definitionName(result.targetDefinition)}.`,
      receiverNote ? `Receiver note: ${receiverNote}` : 'The target collection now has a local copy of the definition package.',
    ],
  })
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: collection.id,
    collectionIdForRoles: collection.id,
    roles: transferReviewRoles,
    excludeUserIds: [user.id],
    entityType: 'PLANT_DEFINITION_SHARE_REQUEST',
    entityId: request.id,
    subject: `Definition share completed: ${definitionName(result.targetDefinition)}`,
    actionPath: collectionPath(collection.slug, `/plants/${result.targetDefinition.id}/edit`),
    lines: [
      `${request.sourceCollection.name} shared ${definitionName(request.sourcePlantDefinition)} into ${collection.name}.`,
      'The definition is ready to review or edit locally.',
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(collectionPath(collection.slug, `/plants/${result.targetDefinition.id}/edit`))
}

export async function declinePlantDefinitionShareRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  const receiverNote = val(fd, 'receiverNote')
  if (!id) throw new Error('Definition share request is required.')
  const request = await prisma.plantDefinitionShareRequest.findFirstOrThrow({
    where: { id, targetCollectionId: collection.id, status: 'PENDING' },
    include: {
      sourceCollection: true,
      sourcePlantDefinition: true,
      requestedBy: { include: { emailPreference: { select: { transferNotifications: true } } } },
    },
  })
  await prisma.plantDefinitionShareRequest.update({
    where: { id: request.id },
    data: { status: 'DECLINED', reviewedById: user.id, reviewedAt: new Date(), receiverNote },
  })
  await audit(user, 'DECLINE', 'PLANT_DEFINITION_SHARE_REQUEST', request.id, `Declined shared definition from ${request.sourceCollection.name}`, undefined, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: request.sourceCollectionId,
    users: [request.requestedBy],
    entityType: 'PLANT_DEFINITION_SHARE_REQUEST',
    entityId: request.id,
    subject: `Definition share declined: ${definitionName(request.sourcePlantDefinition)}`,
    actionPath: transfersPath(request.sourceCollection.slug),
    lines: [
      `${collection.name} declined the shared definition ${definitionName(request.sourcePlantDefinition)}.`,
      receiverNote ? `Receiver note: ${receiverNote}` : 'No definition was copied into the target collection.',
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersPath(collection.slug))
}

export async function cancelPlantDefinitionShareRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const id = val(fd, 'id')
  if (!id) throw new Error('Definition share request is required.')
  const request = await prisma.plantDefinitionShareRequest.findFirstOrThrow({
    where: { id, sourceCollectionId: collection.id, status: 'PENDING' },
    include: { targetCollection: true },
  })
  await prisma.plantDefinitionShareRequest.update({
    where: { id: request.id },
    data: { status: 'CANCELLED', reviewedById: user.id, reviewedAt: new Date() },
  })
  await audit(user, 'CANCEL', 'PLANT_DEFINITION_SHARE_REQUEST', request.id, `Cancelled definition share to ${request.targetCollection.name}`, undefined, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: request.targetCollectionId,
    collectionIdForRoles: request.targetCollectionId,
    roles: transferReviewRoles,
    entityType: 'PLANT_DEFINITION_SHARE_REQUEST',
    entityId: request.id,
    subject: 'Definition share cancelled',
    actionPath: transfersPath(request.targetCollection.slug),
    lines: [
      `${collection.name} cancelled a pending definition share to ${request.targetCollection.name}.`,
      'No definition was copied into the target collection.',
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersPath(collection.slug))
}

export async function copyConnectedPlantDefinition(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { user, collection } = context
  const sourceCollectionId = val(fd, 'sourceCollectionId')
  const sourcePlantDefinitionId = val(fd, 'sourcePlantDefinitionId')
  if (!sourceCollectionId || !sourcePlantDefinitionId) throw new Error('Source collection and plant definition are required.')

  const [incoming, outgoing] = await Promise.all([
    prisma.collectionTransferConnection.findFirst({
      where: { sourceCollectionId, targetCollectionId: collection.id, status: 'ACTIVE' },
      include: { sourceCollection: true },
    }),
    prisma.collectionTransferConnection.findFirst({
      where: { sourceCollectionId: collection.id, targetCollectionId: sourceCollectionId, status: 'ACTIVE' },
    }),
  ])
  if (!incoming || !outgoing) throw new Error('Definition browsing requires an active bidirectional collection connection.')

  const result = await copyPlantDefinitionPackage({
    sourceCollectionId,
    targetCollectionId: collection.id,
    sourcePlantDefinitionId,
  })
  await audit(user, 'COPY', 'PLANT_DEFINITION', result.targetDefinition.id, `Copied definition ${result.sourceDefinition.genus} ${result.sourceDefinition.species} from ${incoming.sourceCollection.name}`, {
    sourceCollection: incoming.sourceCollection.name,
    sourcePlantDefinitionId,
    createdDefinition: result.createdDefinition,
  }, collection.id)
  await sendTransferWorkflowEmail({
    actor: user,
    collectionId: sourceCollectionId,
    collectionIdForRoles: sourceCollectionId,
    roles: transferReviewRoles,
    entityType: 'PLANT_DEFINITION',
    entityId: sourcePlantDefinitionId,
    subject: `Definition copied by ${collection.name}: ${definitionName(result.sourceDefinition)}`,
    actionPath: transfersPath(incoming.sourceCollection.slug),
    lines: [
      `${collection.name} copied ${definitionName(result.sourceDefinition)} from ${incoming.sourceCollection.name} through an active bidirectional connection.`,
      `${user.email} copied the definition.`,
    ],
  })
  revalidatePath(transfersPath(collection.slug))
  redirect(collectionPath(collection.slug, `/plants/${result.targetDefinition.id}/edit`))
}
