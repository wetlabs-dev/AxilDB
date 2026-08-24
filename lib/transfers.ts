import { copyFile, mkdir, stat } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { audit, type AuthUser } from '@/lib/auth'
import { environmentalHusbandryFields, husbandryFieldNames } from '@/lib/husbandry'
import { generatePlantId } from '@/lib/plant-id'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'

type TransferClient = PrismaClient | Prisma.TransactionClient

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function text(value?: string | null) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function sameOrNull(value?: string | null) {
  return value || null
}

function isUploadPath(photoPath: string) {
  return photoPath.startsWith('/uploads/') && !photoPath.includes('..')
}

async function copyPhotoAsset(photo: { path: string; filename: string }) {
  if (!isUploadPath(photo.path)) return null
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  const sourcePath = path.join(process.cwd(), 'public', photo.path)
  try {
    await stat(sourcePath)
  } catch {
    return null
  }

  await mkdir(uploadsDir, { recursive: true })
  const extension = path.extname(photo.filename || photo.path) || '.jpg'
  const filename = `${Date.now()}-${randomUUID()}${extension}`
  const targetPath = path.join(uploadsDir, filename)
  await copyFile(sourcePath, targetPath)
  return { filename, path: `/uploads/${filename}` }
}

function husbandryData(source: Record<string, unknown> | null | undefined) {
  if (!source) return {}
  const data: Record<string, unknown> = {}
  for (const field of [...husbandryFieldNames, ...environmentalHusbandryFields]) {
    data[field] = source[field] ?? null
  }
  data.reviewStatus = (source.reviewStatus as string | null | undefined) || 'DRAFT'
  data.reviewNotes = (source.reviewNotes as string | null | undefined) || null
  return data
}

async function resolvedHusbandryGuide(client: TransferClient, plantDefinitionId: string, collectionId: string) {
  const guide = await client.plantHusbandryGuide.findFirst({
    where: { collectionId, plantDefinitionId },
  })
  if (!guide?.sourcePlantDefinitionId) return guide
  return client.plantHusbandryGuide.findFirst({
    where: { collectionId, plantDefinitionId: guide.sourcePlantDefinitionId },
  })
}

async function matchingTaxonomicAuthority(
  client: TransferClient,
  targetCollectionId: string,
  source: {
    name: string
    abbreviation: string | null
    authorityType: string
    description: string | null
    website: string | null
    registrationUrl: string | null
    cultivarSearchUrl: string | null
    membershipUrl: string | null
    externalAuthorityUrl: string | null
    otherResourcesJson: Prisma.JsonValue | null
    notes: string | null
  } | null,
) {
  if (!source) return null
  const existing = await client.taxonomicAuthority.findFirst({
    where: {
      collectionId: targetCollectionId,
      OR: [
        { name: source.name },
        ...(source.abbreviation ? [{ abbreviation: source.abbreviation }] : []),
      ],
    },
  })
  if (existing) return existing
  return client.taxonomicAuthority.create({
    data: {
      collectionId: targetCollectionId,
      name: source.name,
      abbreviation: source.abbreviation,
      authorityType: source.authorityType,
      description: source.description,
      website: source.website,
      registrationUrl: source.registrationUrl,
      cultivarSearchUrl: source.cultivarSearchUrl,
      membershipUrl: source.membershipUrl,
      externalAuthorityUrl: source.externalAuthorityUrl,
      otherResourcesJson: source.otherResourcesJson ?? undefined,
      notes: source.notes,
    },
  })
}

export async function ensureTargetDefinition(
  client: TransferClient,
  sourceDefinition: Prisma.PlantDefinitionGetPayload<{ include: { aliases: true; taxonomicAuthority: true } }>,
  sourceCollectionId: string,
  targetCollectionId: string,
) {
  const taxonomicAuthority = await matchingTaxonomicAuthority(client, targetCollectionId, sourceDefinition.taxonomicAuthority)
  const existing = await client.plantDefinition.findFirst({
    where: {
      collectionId: targetCollectionId,
      genus: sourceDefinition.genus,
      species: sourceDefinition.species,
      cultivarName: sameOrNull(sourceDefinition.cultivarName),
      provisionalTaxon: sameOrNull(sourceDefinition.provisionalTaxon),
      identificationStatus: sourceDefinition.identificationStatus,
    },
    include: { aliases: true },
  })

  const definitionData = {
    collectionId: targetCollectionId,
    genus: sourceDefinition.genus,
    species: sourceDefinition.species,
    hybridNotation: sourceDefinition.hybridNotation,
    cultivarName: sourceDefinition.cultivarName,
    authority: sourceDefinition.authority,
    cultivarRegistrationNumber: sourceDefinition.cultivarRegistrationNumber,
    taxonomicAuthorityId: taxonomicAuthority?.id,
    taxonomicAuthoritySource: taxonomicAuthority ? 'MANUAL' : sourceDefinition.taxonomicAuthoritySource === 'NONE' ? 'NONE' : 'AUTO',
    taxonomicAuthorityMatchReason: taxonomicAuthority ? 'Preserved during collection transfer' : null,
    taxonomicPlacementJson: sourceDefinition.taxonomicPlacementJson ?? undefined,
    confidence: sourceDefinition.confidence,
    provisionalTaxon: sourceDefinition.provisionalTaxon,
    identificationStatus: sourceDefinition.identificationStatus,
    wikipediaUrl: sourceDefinition.wikipediaUrl,
    inaturalistUrl: sourceDefinition.inaturalistUrl,
    powoUrl: sourceDefinition.powoUrl,
    gbifUrl: sourceDefinition.gbifUrl,
    description: sourceDefinition.description,
    notes: sourceDefinition.notes,
  }

  const definition = existing || await client.plantDefinition.create({ data: definitionData })

  const existingAliasKeys = new Set(existing?.aliases.map((alias) => `${alias.name}::${alias.aliasType}`) || [])
  for (const alias of sourceDefinition.aliases) {
    const key = `${alias.name}::${alias.aliasType}`
    if (existingAliasKeys.has(key)) continue
    await client.plantAlias.create({
      data: {
        collectionId: targetCollectionId,
        plantDefinitionId: definition.id,
        name: alias.name,
        aliasType: alias.aliasType,
        source: alias.source,
        confidence: alias.confidence,
        notes: alias.notes,
      },
    })
  }

  const targetGuide = await client.plantHusbandryGuide.findFirst({
    where: { collectionId: targetCollectionId, plantDefinitionId: definition.id },
  })
  if (!targetGuide) {
    const sourceGuide = await resolvedHusbandryGuide(client, sourceDefinition.id, sourceCollectionId)
    if (sourceGuide) {
      await client.plantHusbandryGuide.create({
        data: {
          collectionId: targetCollectionId,
          plantDefinitionId: definition.id,
          sourcePlantDefinitionId: null,
          ...husbandryData(sourceGuide as unknown as Record<string, unknown>),
        },
      })
    }
  }

  return { definition, createdDefinition: !existing }
}

function buildDefinitionPreview(
  definition: Prisma.PlantDefinitionGetPayload<{ include: { aliases: true; taxonomicAuthority: true; _count: { select: { instances: true } } } }>,
  counts: { typePhotoCount: number; husbandryGuideCount: number },
  senderNote?: string | null,
) {
  return {
    plantName: plantName(definition),
    definition: {
      genus: definition.genus,
      species: definition.species,
      cultivarName: definition.cultivarName,
      provisionalTaxon: definition.provisionalTaxon,
      identificationStatus: definition.identificationStatus,
      confidence: definition.confidence,
      taxonomicAuthority: definition.taxonomicAuthority?.name || null,
    },
    counts: {
      aliases: definition.aliases.length,
      instances: definition._count.instances,
      typePhotos: counts.typePhotoCount,
      husbandryGuides: counts.husbandryGuideCount,
    },
    senderNote: senderNote || null,
    generatedAt: new Date().toISOString(),
  }
}

export async function buildPlantDefinitionSharePreview(sourceCollectionId: string, sourcePlantDefinitionId: string, senderNote?: string | null) {
  const definition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id: sourcePlantDefinitionId, collectionId: sourceCollectionId },
    include: {
      aliases: { orderBy: { name: 'asc' } },
      taxonomicAuthority: true,
      _count: { select: { instances: true } },
    },
  })
  const [typePhotoCount, guide] = await Promise.all([
    prisma.photo.count({ where: { collectionId: sourceCollectionId, entityType: 'PLANT_DEFINITION', entityId: definition.id, isType: true } }),
    resolvedHusbandryGuide(prisma, definition.id, sourceCollectionId),
  ])
  return buildDefinitionPreview(definition, { typePhotoCount, husbandryGuideCount: guide ? 1 : 0 }, senderNote)
}

async function copyDefinitionPhotos(
  client: TransferClient,
  sourceCollectionId: string,
  targetCollectionId: string,
  sourceDefinitionId: string,
  targetDefinitionId: string,
) {
  const sourcePhotos = await prisma.photo.findMany({
    where: { collectionId: sourceCollectionId, entityType: 'PLANT_DEFINITION', entityId: sourceDefinitionId },
    orderBy: { createdAt: 'asc' },
  })
  const existingTargetPhotos = await client.photo.count({
    where: { collectionId: targetCollectionId, entityType: 'PLANT_DEFINITION', entityId: targetDefinitionId },
  })
  if (existingTargetPhotos > 0) {
    return { copiedPhotoIds: [] as string[], skippedPhotoIds: sourcePhotos.map((photo) => photo.id) }
  }

  const copiedPhotoIds: string[] = []
  const skippedPhotoIds: string[] = []
  for (const photo of sourcePhotos) {
    const copied = await copyPhotoAsset(photo)
    if (!copied) {
      skippedPhotoIds.push(photo.id)
      continue
    }
    await client.photo.create({
      data: {
        collectionId: targetCollectionId,
        entityType: 'PLANT_DEFINITION',
        entityId: targetDefinitionId,
        filename: copied.filename,
        path: copied.path,
        caption: photo.caption,
        source: photo.source,
        sourceUrl: photo.sourceUrl,
        isCover: photo.isCover,
        isType: photo.isType,
        cropX: photo.cropX,
        cropY: photo.cropY,
        cropWidth: photo.cropWidth,
        cropHeight: photo.cropHeight,
        focalX: photo.focalX,
        focalY: photo.focalY,
        createdAt: photo.createdAt,
      },
    })
    copiedPhotoIds.push(photo.id)
  }
  return { copiedPhotoIds, skippedPhotoIds }
}

export async function copyPlantDefinitionPackage(options: {
  sourceCollectionId: string
  targetCollectionId: string
  sourcePlantDefinitionId: string
}) {
  const sourceDefinition = await prisma.plantDefinition.findFirstOrThrow({
    where: { id: options.sourcePlantDefinitionId, collectionId: options.sourceCollectionId },
    include: { aliases: { orderBy: { name: 'asc' } }, taxonomicAuthority: true },
  })

  return prisma.$transaction(async (tx) => {
    const ensured = await ensureTargetDefinition(
      tx,
      sourceDefinition,
      options.sourceCollectionId,
      options.targetCollectionId,
    )
    const photoManifest = await copyDefinitionPhotos(
      tx,
      options.sourceCollectionId,
      options.targetCollectionId,
      sourceDefinition.id,
      ensured.definition.id,
    )
    return {
      sourceDefinition,
      targetDefinition: ensured.definition,
      createdDefinition: ensured.createdDefinition,
      manifest: {
        sourceCollectionId: options.sourceCollectionId,
        targetCollectionId: options.targetCollectionId,
        sourcePlantDefinitionId: sourceDefinition.id,
        targetPlantDefinitionId: ensured.definition.id,
        createdDefinition: ensured.createdDefinition,
        copiedPhotoIds: photoManifest.copiedPhotoIds,
        skippedPhotoIds: photoManifest.skippedPhotoIds,
      },
    }
  })
}

export async function acceptPlantDefinitionSharePackage(options: {
  requestId: string
  reviewedBy: AuthUser
  receiverNote?: string | null
}) {
  const request = await prisma.plantDefinitionShareRequest.findUniqueOrThrow({
    where: { id: options.requestId },
    include: {
      sourceCollection: true,
      targetCollection: true,
      sourcePlantDefinition: true,
    },
  })
  if (request.status !== 'PENDING') throw new Error('This definition share has already been reviewed.')

  const copied = await copyPlantDefinitionPackage({
    sourceCollectionId: request.sourceCollectionId,
    targetCollectionId: request.targetCollectionId,
    sourcePlantDefinitionId: request.sourcePlantDefinitionId,
  })

  const updatedRequest = await prisma.plantDefinitionShareRequest.update({
    where: { id: request.id },
    data: {
      status: 'ACCEPTED',
      reviewedById: options.reviewedBy.id,
      reviewedAt: new Date(),
      receiverNote: text(options.receiverNote),
      targetPlantDefinitionId: copied.targetDefinition.id,
      transferManifest: copied.manifest as Prisma.InputJsonObject,
    },
  })

  await audit(options.reviewedBy, 'ACCEPT', 'PLANT_DEFINITION_SHARE_REQUEST', request.id, `Accepted shared definition ${plantName(copied.sourceDefinition)} from ${request.sourceCollection.name}`, {
    sourceCollection: request.sourceCollection.name,
    targetCollection: request.targetCollection.name,
    targetPlantDefinitionId: copied.targetDefinition.id,
    createdDefinition: copied.createdDefinition,
  }, request.targetCollectionId)

  return { ...copied, updatedRequest }
}

function buildPreview(instance: Prisma.PlantInstanceGetPayload<{ include: { plantDefinition: true } }>, counts: {
  photoCount: number
  bloomCount: number
  noteCount: number
  bloomPhotoCount: number
  propagationContextCount: number
  sportRecordCount: number
}, senderNote?: string | null) {
  return {
    plantName: plantName(instance.plantDefinition),
    sourcePlantId: instance.plantId,
    definition: {
      genus: instance.plantDefinition.genus,
      species: instance.plantDefinition.species,
      cultivarName: instance.plantDefinition.cultivarName,
      provisionalTaxon: instance.plantDefinition.provisionalTaxon,
      identificationStatus: instance.plantDefinition.identificationStatus,
      confidence: instance.plantDefinition.confidence,
    },
    instance: {
      instanceType: instance.instanceType,
      status: instance.status,
      sportStatus: instance.sportStatus,
      acquisitionLabel: instance.acquisitionLabel,
    },
    counts,
    senderNote: senderNote || null,
    generatedAt: new Date().toISOString(),
  }
}

export async function buildPlantTransferPreview(sourceCollectionId: string, sourcePlantInstanceId: string, senderNote?: string | null) {
  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id: sourcePlantInstanceId, collectionId: sourceCollectionId },
    include: { plantDefinition: true },
  })
  const blooms = await prisma.bloomEvent.findMany({ where: { collectionId: sourceCollectionId, plantInstanceId: instance.id }, select: { id: true } })
  const bloomIds = blooms.map((bloom) => bloom.id)
  const [photoCount, bloomPhotoCount, noteCount, propagationAsParent, propagationAsChild, sportRecordCount] = await Promise.all([
    prisma.photo.count({ where: { collectionId: sourceCollectionId, entityType: 'PLANT_INSTANCE', entityId: instance.id } }),
    bloomIds.length ? prisma.photo.count({ where: { collectionId: sourceCollectionId, entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } } }) : Promise.resolve(0),
    prisma.note.count({ where: { collectionId: sourceCollectionId, entityType: 'PLANT_INSTANCE', entityId: instance.id } }),
    prisma.parentageLink.count({ where: { parentPlantInstanceId: instance.id } }),
    prisma.propagationChild.count({ where: { childPlantInstanceId: instance.id } }),
    prisma.sportStabilityRecord.count({ where: { plantInstanceId: instance.id } }),
  ])
  return buildPreview(instance, {
    photoCount,
    bloomCount: blooms.length,
    noteCount,
    bloomPhotoCount,
    propagationContextCount: propagationAsParent + propagationAsChild,
    sportRecordCount,
  }, senderNote)
}

export async function acceptPlantTransferPackage(options: {
  requestId: string
  reviewedBy: AuthUser
  receiverNote?: string | null
}) {
  const request = await prisma.plantTransferRequest.findUniqueOrThrow({
    where: { id: options.requestId },
    include: {
      sourceCollection: true,
      targetCollection: true,
      sourcePlantInstance: {
        include: {
          plantDefinition: { include: { aliases: true, taxonomicAuthority: true } },
          husbandryOverride: true,
          blooms: { orderBy: { bloomStartDate: 'asc' } },
          sportRecords: { include: { propagationEvent: true } },
        },
      },
    },
  })
  if (request.status !== 'PENDING') throw new Error('This transfer request has already been reviewed.')

  const sourceInstance = request.sourcePlantInstance
  const sourceCollectionId = request.sourceCollectionId
  const targetCollectionId = request.targetCollectionId
  const propagationEvents = await prisma.propagationEvent.findMany({
    where: {
      collectionId: sourceCollectionId,
      OR: [
        { parents: { some: { parentPlantInstanceId: sourceInstance.id } } },
        { children: { some: { childPlantInstanceId: sourceInstance.id } } },
      ],
    },
    include: {
      parents: { include: { parentPlantInstance: { select: { plantId: true } } } },
      children: { include: { childPlantInstance: { select: { plantId: true } } } },
    },
  })
  const plantPhotos = await prisma.photo.findMany({
    where: { collectionId: sourceCollectionId, entityType: 'PLANT_INSTANCE', entityId: sourceInstance.id },
    orderBy: { createdAt: 'asc' },
  })
  const bloomPhotos = await prisma.photo.findMany({
    where: { collectionId: sourceCollectionId, entityType: 'BLOOM_EVENT', entityId: { in: request.sourcePlantInstance.blooms.map((bloom) => bloom.id) } },
    orderBy: { createdAt: 'asc' },
  })
  const instanceNotes = await prisma.note.findMany({
    where: { collectionId: sourceCollectionId, entityType: 'PLANT_INSTANCE', entityId: sourceInstance.id },
    orderBy: { createdAt: 'asc' },
  })
  const bloomNotes = await prisma.note.findMany({
    where: { collectionId: sourceCollectionId, entityType: 'BLOOM_EVENT', entityId: { in: request.sourcePlantInstance.blooms.map((bloom) => bloom.id) } },
    orderBy: { createdAt: 'asc' },
  })

  const copiedPhotos = new Map<string, { filename: string; path: string }>()
  for (const photo of [...plantPhotos, ...bloomPhotos]) {
    const copy = await copyPhotoAsset(photo)
    if (copy) copiedPhotos.set(photo.id, copy)
  }

  const manifest: Record<string, unknown> = {
    sourceCollectionId,
    targetCollectionId,
    sourcePlantInstanceId: sourceInstance.id,
    sourcePlantId: sourceInstance.plantId,
    originCollectionSlug: sourceInstance.originCollectionSlug || request.sourceCollection.slug,
    originPlantId: sourceInstance.originPlantId || sourceInstance.plantId,
    transferredFromCollectionSlug: request.sourceCollection.slug,
    transferredFromPlantId: sourceInstance.plantId,
    copiedPhotoIds: Array.from(copiedPhotos.keys()),
    skippedPhotoIds: [...plantPhotos, ...bloomPhotos].filter((photo) => !copiedPhotos.has(photo.id)).map((photo) => photo.id),
  }

  const result = await prisma.$transaction(async (tx) => {
    const originCollectionSlug = sourceInstance.originCollectionSlug || request.sourceCollection.slug
    const originPlantId = sourceInstance.originPlantId || sourceInstance.plantId
    const returnedOriginal = originCollectionSlug === request.targetCollection.slug
      ? await tx.plantInstance.findFirst({
          where: {
            collectionId: targetCollectionId,
            plantId: originPlantId,
            status: 'ARCHIVED',
          },
        })
      : null

    let targetDefinition: Prisma.PlantDefinitionGetPayload<{}>
    let createdDefinition = false
    let reactivatedOriginal = false
    let targetInstance: Prisma.PlantInstanceGetPayload<{}>

    if (returnedOriginal) {
      reactivatedOriginal = true
      targetDefinition = await tx.plantDefinition.findFirstOrThrow({
        where: { id: returnedOriginal.plantDefinitionId, collectionId: targetCollectionId },
      })
      targetInstance = await tx.plantInstance.update({
        where: { id: returnedOriginal.id },
        data: {
          status: 'ACTIVE',
          archiveDate: null,
          archiveReason: null,
          archiveNotes: null,
          transferredFromCollectionSlug: request.sourceCollection.slug,
          transferredFromPlantId: sourceInstance.plantId,
          originCollectionSlug,
          originPlantId,
        },
      })
    } else {
      const ensured = await ensureTargetDefinition(
        tx,
        sourceInstance.plantDefinition,
        sourceCollectionId,
        targetCollectionId,
      )
      targetDefinition = ensured.definition
      createdDefinition = ensured.createdDefinition

      const plantId = await generatePlantId(tx as unknown as PrismaClient, {
        collectionId: targetCollectionId,
        plantDefinitionId: targetDefinition.id,
        date: sourceInstance.acquisitionDate || sourceInstance.propagationDate || new Date(),
        instanceType: sourceInstance.instanceType,
      })

      targetInstance = await tx.plantInstance.create({
        data: {
          collectionId: targetCollectionId,
          plantDefinitionId: targetDefinition.id,
          plantId,
          instanceType: sourceInstance.instanceType,
          status: 'ACTIVE',
          acquisitionDate: sourceInstance.acquisitionDate,
          acquisitionLabel: sourceInstance.acquisitionLabel,
          propagationDate: sourceInstance.propagationDate,
          source: sourceInstance.source,
          distributor: sourceInstance.distributor,
          stockNumber: sourceInstance.stockNumber,
          purchasePrice: sourceInstance.purchasePrice,
          originCollectionSlug,
          originPlantId,
          transferredFromCollectionSlug: request.sourceCollection.slug,
          transferredFromPlantId: sourceInstance.plantId,
          isSportCandidate: sourceInstance.isSportCandidate,
          sportStatus: sourceInstance.sportStatus,
          sportDescription: sourceInstance.sportDescription,
        },
      })
    }

    if (sourceInstance.husbandryOverride) {
      await tx.plantHusbandryOverride.upsert({
        where: { plantInstanceId: targetInstance.id },
        update: {
          ...husbandryData(sourceInstance.husbandryOverride as unknown as Record<string, unknown>),
          overrideNotes: sourceInstance.husbandryOverride.overrideNotes,
        },
        create: {
          collectionId: targetCollectionId,
          plantInstanceId: targetInstance.id,
          ...husbandryData(sourceInstance.husbandryOverride as unknown as Record<string, unknown>),
          overrideNotes: sourceInstance.husbandryOverride.overrideNotes,
        },
      })
    }

    for (const note of instanceNotes) {
      await tx.note.create({
        data: {
          collectionId: targetCollectionId,
          entityType: 'PLANT_INSTANCE',
          entityId: targetInstance.id,
          note: note.note,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
      })
    }

    await tx.note.create({
      data: {
        collectionId: targetCollectionId,
        entityType: 'PLANT_INSTANCE',
        entityId: targetInstance.id,
        note: reactivatedOriginal
          ? `Returned from ${request.sourceCollection.name} as ${sourceInstance.plantId}; archived original record reactivated.`
          : `Transferred from ${request.sourceCollection.name} as ${sourceInstance.plantId}.`,
      },
    })

    for (const photo of plantPhotos) {
      const copied = copiedPhotos.get(photo.id)
      if (!copied) continue
      await tx.photo.create({
        data: {
          collectionId: targetCollectionId,
          entityType: 'PLANT_INSTANCE',
          entityId: targetInstance.id,
          filename: copied.filename,
          path: copied.path,
          caption: photo.caption,
          source: photo.source,
          sourceUrl: photo.sourceUrl,
          isCover: photo.isCover,
          isType: photo.isType,
          cropX: photo.cropX,
          cropY: photo.cropY,
          cropWidth: photo.cropWidth,
          cropHeight: photo.cropHeight,
          focalX: photo.focalX,
          focalY: photo.focalY,
        },
      })
    }

    const bloomIdMap = new Map<string, string>()
    for (const bloom of sourceInstance.blooms) {
      const targetBloom = await tx.bloomEvent.create({
        data: {
          collectionId: targetCollectionId,
          plantInstanceId: targetInstance.id,
          bloomStartDate: bloom.bloomStartDate,
          peakBloomDate: bloom.peakBloomDate,
          bloomEndDate: bloom.bloomEndDate,
          flowerCount: bloom.flowerCount,
          firstBloom: bloom.firstBloom,
          notes: bloom.notes,
          createdAt: bloom.createdAt,
          updatedAt: bloom.updatedAt,
        },
      })
      bloomIdMap.set(bloom.id, targetBloom.id)
    }

    for (const note of bloomNotes) {
      const targetBloomId = bloomIdMap.get(note.entityId)
      if (!targetBloomId) continue
      await tx.note.create({
        data: {
          collectionId: targetCollectionId,
          entityType: 'BLOOM_EVENT',
          entityId: targetBloomId,
          note: note.note,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
      })
    }

    for (const photo of bloomPhotos) {
      const targetBloomId = bloomIdMap.get(photo.entityId)
      const copied = copiedPhotos.get(photo.id)
      if (!targetBloomId || !copied) continue
      await tx.photo.create({
        data: {
          collectionId: targetCollectionId,
          entityType: 'BLOOM_EVENT',
          entityId: targetBloomId,
          filename: copied.filename,
          path: copied.path,
          caption: photo.caption,
          source: photo.source,
          sourceUrl: photo.sourceUrl,
          isCover: photo.isCover,
          isType: photo.isType,
          cropX: photo.cropX,
          cropY: photo.cropY,
          cropWidth: photo.cropWidth,
          cropHeight: photo.cropHeight,
          focalX: photo.focalX,
          focalY: photo.focalY,
        },
      })
    }

    const propagationIdMap = new Map<string, string>()
    for (const event of propagationEvents) {
      const targetEvent = await tx.propagationEvent.create({
        data: {
          collectionId: targetCollectionId,
          method: event.method,
          date: event.date,
          successStatus: event.successStatus,
          notes: [
            event.notes,
            `Transferred context only. Source parents: ${event.parents.map((parent) => parent.parentPlantInstance.plantId).join(', ') || 'none'}. Source children: ${event.children.map((child) => child.childPlantInstance.plantId).join(', ') || 'none'}.`,
          ].filter(Boolean).join('\n\n'),
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        },
      })
      propagationIdMap.set(event.id, targetEvent.id)
      for (const parent of event.parents.filter((parent) => parent.parentPlantInstanceId === sourceInstance.id)) {
        await tx.parentageLink.create({
          data: {
            propagationEventId: targetEvent.id,
            parentPlantInstanceId: targetInstance.id,
            parentRole: parent.parentRole,
          },
        })
      }
      for (const child of event.children.filter((child) => child.childPlantInstanceId === sourceInstance.id)) {
        await tx.propagationChild.create({
          data: {
            propagationEventId: targetEvent.id,
            childPlantInstanceId: targetInstance.id,
          },
        })
      }
    }

    for (const record of sourceInstance.sportRecords) {
      let targetEventId = propagationIdMap.get(record.propagationEventId)
      if (!targetEventId) {
        const event = record.propagationEvent
        const targetEvent = await tx.propagationEvent.create({
          data: {
            collectionId: targetCollectionId,
            method: event.method,
            date: event.date,
            successStatus: event.successStatus,
            notes: [event.notes, 'Transferred sport stability context. Original propagation links were not cloned.'].filter(Boolean).join('\n\n'),
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          },
        })
        targetEventId = targetEvent.id
        propagationIdMap.set(record.propagationEventId, targetEventId)
      }
      await tx.sportStabilityRecord.create({
        data: {
          plantInstanceId: targetInstance.id,
          propagationEventId: targetEventId,
          propagatedTrue: record.propagatedTrue,
          generationNumber: record.generationNumber,
          notes: record.notes,
          createdAt: record.createdAt,
        },
      })
    }

    const archiveNotes = [
      sourceInstance.archiveNotes,
      `Transferred to ${request.targetCollection.name} as ${targetInstance.plantId}. Transfer request ${request.id}.`,
    ].filter(Boolean).join('\n\n')
    await tx.plantInstance.update({
      where: { id: sourceInstance.id },
      data: {
        status: 'ARCHIVED',
        archiveDate: new Date(),
        archiveReason: `Transferred to ${request.targetCollection.name}`,
        archiveNotes,
      },
    })
    await tx.note.create({
      data: {
        collectionId: sourceCollectionId,
        entityType: 'PLANT_INSTANCE',
        entityId: sourceInstance.id,
        note: `Transferred to ${request.targetCollection.name} as ${targetInstance.plantId}.`,
      },
    })

    const updatedRequest = await tx.plantTransferRequest.update({
      where: { id: request.id },
      data: {
        status: 'ACCEPTED',
        reviewedById: options.reviewedBy.id,
        reviewedAt: new Date(),
        receiverNote: text(options.receiverNote),
        targetPlantInstanceId: targetInstance.id,
        transferManifest: compact({
          ...manifest,
          targetPlantDefinitionId: targetDefinition.id,
          targetPlantInstanceId: targetInstance.id,
          targetPlantId: targetInstance.plantId,
          createdDefinition,
          reactivatedOriginal,
          bloomIdMap: Object.fromEntries(bloomIdMap),
          propagationIdMap: Object.fromEntries(propagationIdMap),
        }) as Prisma.InputJsonObject,
      },
    })

    return { targetInstance, targetDefinition, updatedRequest }
  })

  await audit(options.reviewedBy, 'ACCEPT', 'PLANT_TRANSFER_REQUEST', request.id, `Accepted transfer of ${sourceInstance.plantId} into ${request.targetCollection.name}`, {
    sourceCollection: request.sourceCollection.name,
    targetCollection: request.targetCollection.name,
    sourcePlantId: sourceInstance.plantId,
    targetPlantId: result.targetInstance.plantId,
  }, targetCollectionId)
  await audit(options.reviewedBy, 'TRANSFER_OUT', 'PLANT_INSTANCE', sourceInstance.id, `Transferred ${sourceInstance.plantId} to ${request.targetCollection.name}`, {
    requestId: request.id,
    targetCollection: request.targetCollection.name,
    targetPlantId: result.targetInstance.plantId,
  }, sourceCollectionId)

  return result
}
