import type { PrismaClient, Prisma } from '@prisma/client'

export const photoPreviewSelect = { id: true, path: true, caption: true, createdAt: true, isCover: true, cropX: true, cropY: true, cropWidth: true, cropHeight: true, focalX: true, focalY: true, nsfwFlagged: true, moderationStatus: true } as const

export async function lockPhotoTarget(tx: Prisma.TransactionClient, collectionId: string, entityType: string, entityId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`photo:${collectionId}:${entityType}:${entityId}`}, 0))`
}

/** Shared by the existing detail-page action and the in-place photo chooser. */
export async function selectSpecimenCover(db: PrismaClient, collectionId: string, photoId: string) {
  return db.$transaction(async tx => {
    const photo = await tx.photo.findFirstOrThrow({ where: { id: photoId, collectionId, entityType: 'PLANT_INSTANCE' }, select: { ...photoPreviewSelect, entityId: true } })
    await lockPhotoTarget(tx, collectionId, 'PLANT_INSTANCE', photo.entityId)
    await tx.plantInstance.findFirstOrThrow({ where: { id: photo.entityId, collectionId, status: 'ACTIVE' }, select: { id: true } })
    await tx.photo.updateMany({ where: { collectionId, entityType: 'PLANT_INSTANCE', entityId: photo.entityId }, data: { isCover: false } })
    return tx.photo.update({ where: { id: photo.id }, data: { isCover: true }, select: { ...photoPreviewSelect, entityId: true } })
  })
}
