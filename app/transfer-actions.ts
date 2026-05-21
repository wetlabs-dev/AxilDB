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

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim() || undefined
const collectionSlug = async (fd: FormData) => val(fd, 'collectionSlug') || await getCurrentCollectionSlug()
const transfersPath = (slug: string) => collectionPath(slug, '/transfers')

export async function requestTransferConnection(fd: FormData) {
  const context = await requireCollectionManager(await collectionSlug(fd))
  const { user, collection } = context
  const targetSlug = val(fd, 'targetSlug')?.toLowerCase()
  const requestNote = val(fd, 'requestNote')
  if (!targetSlug) throw new Error('Target collection slug is required.')

  const target = await prisma.collection.findUnique({
    where: { slug: targetSlug },
    select: { id: true, name: true, slug: true, status: true },
  })
  if (!target || target.status !== 'ACTIVE') throw new Error('No active collection found with that slug.')
  if (target.id === collection.id) throw new Error('Choose a different collection.')

  const existing = await prisma.collectionTransferConnection.findUnique({
    where: { sourceCollectionId_targetCollectionId: { sourceCollectionId: collection.id, targetCollectionId: target.id } },
  })
  if (existing?.status === 'BLOCKED') throw new Error('That collection has blocked transfer requests from this collection.')

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
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersPath(collection.slug))
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
    include: { sourceCollection: true },
  })

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
  revalidatePath(transfersPath(collection.slug))
  redirect(transfersPath(collection.slug))
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
  await prisma.plantTransferRequest.findFirstOrThrow({ where: { id, targetCollectionId: collection.id, status: 'PENDING' } })
  const result = await acceptPlantTransferPackage({ requestId: id, reviewedBy: user, receiverNote })
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
    include: { sourcePlantInstance: true, sourceCollection: true },
  })
  await prisma.plantTransferRequest.update({
    where: { id: request.id },
    data: { status: 'DECLINED', reviewedById: user.id, reviewedAt: new Date(), receiverNote },
  })
  await audit(user, 'DECLINE', 'PLANT_TRANSFER_REQUEST', request.id, `Declined transfer of ${request.sourcePlantInstance.plantId} from ${request.sourceCollection.name}`, undefined, collection.id)
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
  const destination = back || transfersPath(collection.slug)
  revalidatePath(destination.split('#')[0] || transfersPath(collection.slug))
  redirect(destination)
}

export async function acceptPlantDefinitionShareRequest(fd: FormData) {
  const context = await requireCollectionGardener(await collectionSlug(fd))
  const { collection } = context
  const id = val(fd, 'id')
  const receiverNote = val(fd, 'receiverNote')
  if (!id) throw new Error('Definition share request is required.')
  await prisma.plantDefinitionShareRequest.findFirstOrThrow({ where: { id, targetCollectionId: collection.id, status: 'PENDING' } })
  const result = await acceptPlantDefinitionSharePackage({ requestId: id, reviewedBy: context.user, receiverNote })
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
    include: { sourceCollection: true, sourcePlantDefinition: true },
  })
  await prisma.plantDefinitionShareRequest.update({
    where: { id: request.id },
    data: { status: 'DECLINED', reviewedById: user.id, reviewedAt: new Date(), receiverNote },
  })
  await audit(user, 'DECLINE', 'PLANT_DEFINITION_SHARE_REQUEST', request.id, `Declined shared definition from ${request.sourceCollection.name}`, undefined, collection.id)
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
  revalidatePath(transfersPath(collection.slug))
  redirect(collectionPath(collection.slug, `/plants/${result.targetDefinition.id}/edit`))
}
