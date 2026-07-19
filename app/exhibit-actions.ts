'use server'

import { CollectionExhibitAccessMode, CollectionExhibitStatus, CollectionExhibitSubscriberStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionManager } from '@/lib/collections'
import { appUrl, sendEmail } from '@/lib/email'
import { renderBrandedEmail } from '@/lib/email-templates'
import { collectExhibitDigestChanges, exhibitDigestSummary, sendExhibitUpdateToSubscribers } from '@/lib/exhibit-digests'
import {
  defaultExhibitSettings,
  defaultExhibitUpdateSettings,
  exhibitSettingLabels,
  hashExhibitToken,
  isPublishedExhibitVisible,
  nextExhibitSlug,
  publicExhibitUrl,
  secureToken,
  updateChangeLabels,
} from '@/lib/exhibits'
import { prisma } from '@/lib/prisma'
import { emitDomainEvent } from '@/lib/events/emit'

function value(fd: FormData, key: string) {
  return String(fd.get(key) || '').trim()
}

function checkbox(fd: FormData, key: string) {
  return fd.get(key) === 'on'
}

function nullableDate(value: string) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function exhibitSubscribePath(slug: string, token: string, status: 'failed' | 'invalid' | 'sent') {
  const params = new URLSearchParams({ subscribe: status })
  if (token) params.set('token', token)
  return `/exhibit/${encodeURIComponent(slug)}?${params.toString()}`
}

function selectedPlantRows(fd: FormData) {
  const ids = fd.getAll('plantInstanceId').map((item) => String(item)).filter(Boolean)
  return ids.map((id, index) => ({
    plantInstanceId: id,
    sortOrder: Number(value(fd, `sortOrder:${id}`)) || index,
    featured: checkbox(fd, `featured:${id}`),
    customCaption: value(fd, `caption:${id}`) || null,
  }))
}

function settingsFromForm(fd: FormData) {
  const settings = { ...defaultExhibitSettings }
  for (const [key] of exhibitSettingLabels) {
    ;(settings as any)[key] = checkbox(fd, key)
  }
  const imageMode = value(fd, 'imageMode')
  settings.imageMode = ['cover', 'recent', 'all', 'selected'].includes(imageMode) ? imageMode as typeof settings.imageMode : 'cover'
  settings.wishlistHeading = value(fd, 'wishlistHeading') || defaultExhibitSettings.wishlistHeading
  return settings
}

function selectedWishlistRows(fd: FormData) {
  return fd.getAll('wishlistDefinitionId').map(String).filter(Boolean).map((plantDefinitionId, index) => ({
    plantDefinitionId,
    sortOrder: Number(value(fd, `wishlistSortOrder:${plantDefinitionId}`)) || index,
    featured: checkbox(fd, `wishlistFeatured:${plantDefinitionId}`),
    customCaption: value(fd, `wishlistCaption:${plantDefinitionId}`) || null,
  }))
}

function updateSettingsFromForm(fd: FormData) {
  const cadence = value(fd, 'updateCadence')
  return {
    ...defaultExhibitUpdateSettings,
    cadence: ['manual', 'daily', 'weekly', 'disabled'].includes(cadence) ? cadence as typeof defaultExhibitUpdateSettings.cadence : 'manual',
    changes: Object.fromEntries(updateChangeLabels.map(([key]) => [key, checkbox(fd, `update:${key}`)])),
  }
}

async function assertExhibitInCollection(id: string, collectionId: string) {
  return prisma.collectionExhibit.findFirstOrThrow({
    where: { id, collectionId },
    include: { collection: true },
  })
}

export async function createCollectionExhibit(fd: FormData) {
  const context = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const title = value(fd, 'title')
  if (!title) throw new Error('Exhibit title is required.')
  const slug = await nextExhibitSlug(prisma, title)
  const accessMode = value(fd, 'accessMode') === 'PUBLIC' ? CollectionExhibitAccessMode.PUBLIC : CollectionExhibitAccessMode.UNLISTED
  const token = secureToken()
  const exhibit = await prisma.$transaction(async (tx) => {
    const created = await tx.collectionExhibit.create({ data: {
      collectionId: context.collection.id,
      title,
      slug,
      token,
      accessMode,
      description: value(fd, 'description') || null,
      introMarkdown: value(fd, 'introMarkdown') || null,
      expiresAt: nullableDate(value(fd, 'expiresAt')),
      createdByUserId: context.user.id,
      settingsJson: defaultExhibitSettings,
      updateSettingsJson: defaultExhibitUpdateSettings,
    } })
    await emitDomainEvent(tx, {
      eventType: 'exhibit.created', collectionId: context.collection.id, aggregateId: created.id, occurredAt: created.createdAt,
      actor: { id: context.user.id, role: context.user.role }, idempotencyKey: `exhibit:${created.id}:created`,
      payload: { subjectId: created.id, recordId: created.id, recordType: 'CollectionExhibit', displayName: created.title, slug: created.slug, accessMode: created.accessMode, summary: created.description || undefined },
    })
    return created
  })
  await audit(context.user, 'CREATE', 'COLLECTION_EXHIBIT', exhibit.id, `Created exhibit ${title}`, { slug, accessMode }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${exhibit.id}`))
}

export async function updateCollectionExhibit(fd: FormData) {
  const context = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const existing = await assertExhibitInCollection(id, context.collection.id)
  const shouldReplacePlants = fd.has('plantInstanceId')
  const rows = shouldReplacePlants ? selectedPlantRows(fd) : []
  const validPlants = rows.length
    ? await prisma.plantInstance.findMany({
        where: { collectionId: context.collection.id, id: { in: rows.map((row) => row.plantInstanceId) } },
        select: { id: true },
      })
    : []
  const validPlantIds = new Set(validPlants.map((plant) => plant.id))
  const filteredRows = rows.filter((row) => validPlantIds.has(row.plantInstanceId))
  const shouldReplaceWishlist = fd.has('wishlistSelectionPresent')
  const wishlistRows = shouldReplaceWishlist ? selectedWishlistRows(fd) : []
  const previousWishlistRows = shouldReplaceWishlist ? await prisma.collectionExhibitWishlistItem.findMany({ where: { exhibitId: id }, select: { plantDefinitionId: true } }) : []
  const validWishlistDefinitions = wishlistRows.length ? await prisma.plantDefinition.findMany({
    where: { collectionId: context.collection.id, id: { in: wishlistRows.map((row) => row.plantDefinitionId) }, acquisitionStatus: { not: null } },
    select: { id: true },
  }) : []
  const validWishlistIds = new Set(validWishlistDefinitions.map((definition) => definition.id))
  const filteredWishlistRows = wishlistRows.filter((row) => validWishlistIds.has(row.plantDefinitionId))
  const accessMode = value(fd, 'accessMode') === 'PUBLIC' ? CollectionExhibitAccessMode.PUBLIC : CollectionExhibitAccessMode.UNLISTED
  const requestedCoverPhotoId = value(fd, 'coverPhotoId')
  const coverPhoto = requestedCoverPhotoId
    ? await prisma.photo.findFirst({
        where: {
          id: requestedCoverPhotoId,
          collectionId: context.collection.id,
          nsfwFlagged: false,
          moderationStatus: { notIn: ['CENSORED', 'REMOVED'] },
        },
        select: { id: true },
      })
    : null
  const updates = [
    prisma.collectionExhibit.update({
      where: { id },
      data: {
        title: value(fd, 'title') || existing.title,
        description: value(fd, 'description') || null,
        introMarkdown: value(fd, 'introMarkdown') || null,
        accessMode,
        token: existing.token || secureToken(),
        expiresAt: nullableDate(value(fd, 'expiresAt')),
        coverPhotoId: coverPhoto?.id || null,
        settingsJson: settingsFromForm(fd),
        updateSettingsJson: updateSettingsFromForm(fd),
      },
    }),
    ...(shouldReplacePlants
      ? [
          prisma.collectionExhibitPlant.deleteMany({ where: { exhibitId: id } }),
          ...filteredRows.map((row) => prisma.collectionExhibitPlant.create({
            data: { exhibitId: id, ...row },
          })),
        ]
      : []),
    ...(shouldReplaceWishlist
      ? [
          prisma.collectionExhibitWishlistItem.deleteMany({ where: { exhibitId: id } }),
          ...filteredWishlistRows.map((row) => prisma.collectionExhibitWishlistItem.create({
            data: { exhibitId: id, collectionId: context.collection.id, ...row },
          })),
        ]
      : []),
  ]
  await prisma.$transaction(updates)
  if (shouldReplaceWishlist) {
    const previousIds = new Set(previousWishlistRows.map((row) => row.plantDefinitionId))
    const nextIds = new Set(filteredWishlistRows.map((row) => row.plantDefinitionId))
    const changedAt = new Date()
    await prisma.$transaction(async (tx) => {
      for (const plantDefinitionId of nextIds) if (!previousIds.has(plantDefinitionId)) await emitDomainEvent(tx, {
        eventType: 'exhibit.wishlist_item_added', collectionId: context.collection.id, aggregateId: id,
        actor: { id: context.user.id, role: context.user.role }, idempotencyKey: `exhibit:${id}:wishlist:${plantDefinitionId}:added:${changedAt.toISOString()}`,
        payload: { subjectId: id, recordId: plantDefinitionId, recordType: 'PlantDefinition', title: 'Wishlist definition added to exhibit' },
      })
      for (const plantDefinitionId of previousIds) if (!nextIds.has(plantDefinitionId)) await emitDomainEvent(tx, {
        eventType: 'exhibit.wishlist_item_removed', collectionId: context.collection.id, aggregateId: id,
        actor: { id: context.user.id, role: context.user.role }, idempotencyKey: `exhibit:${id}:wishlist:${plantDefinitionId}:removed:${changedAt.toISOString()}`,
        payload: { subjectId: id, recordId: plantDefinitionId, recordType: 'PlantDefinition', title: 'Wishlist definition removed from exhibit' },
      })
    })
  }
  await audit(context.user, 'UPDATE', 'COLLECTION_EXHIBIT', id, `Updated exhibit ${existing.title}`, {
    accessMode,
    selectedPlants: shouldReplacePlants ? filteredRows.length : undefined,
    selectedWishlistDefinitions: shouldReplaceWishlist ? filteredWishlistRows.length : undefined,
    settings: settingsFromForm(fd),
  }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?saved=1`))
}

async function assertEditableExhibit(collectionSlug: string, exhibitId: string) {
  const context = await requireCollectionGardener(collectionSlug)
  const exhibit = await prisma.collectionExhibit.findFirstOrThrow({
    where: { id: exhibitId, collectionId: context.collection.id },
    select: { id: true, title: true, collectionId: true },
  })
  return { context, exhibit }
}

function exhibitEditorPath(collectionSlug: string, exhibitId: string) {
  return collectionPath(collectionSlug, `/exhibits/${exhibitId}`)
}

async function normalizeExhibitPlantOrder(exhibitId: string, orderedPlantIds?: string[]) {
  const rows = await prisma.collectionExhibitPlant.findMany({
    where: { exhibitId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, plantInstanceId: true },
  })
  const requested = orderedPlantIds?.filter(Boolean) || rows.map((row) => row.plantInstanceId)
  const requestedSet = new Set(requested)
  const normalizedPlantIds = [
    ...requested.filter((plantId, index) => requested.indexOf(plantId) === index && rows.some((row) => row.plantInstanceId === plantId)),
    ...rows.map((row) => row.plantInstanceId).filter((plantId) => !requestedSet.has(plantId)),
  ]
  await prisma.$transaction(normalizedPlantIds.map((plantInstanceId, index) => prisma.collectionExhibitPlant.update({
    where: { exhibitId_plantInstanceId: { exhibitId, plantInstanceId } },
    data: { sortOrder: index },
  })))
}

export async function addPlantToCollectionExhibit(input: { collectionSlug: string; exhibitId: string; plantInstanceId: string; beforePlantInstanceId?: string | null }) {
  const { context, exhibit } = await assertEditableExhibit(input.collectionSlug, input.exhibitId)
  const plant = await prisma.plantInstance.findFirstOrThrow({
    where: { id: input.plantInstanceId, collectionId: context.collection.id },
    select: { id: true, plantId: true },
  })
  const currentRows = await prisma.collectionExhibitPlant.findMany({
    where: { exhibitId: exhibit.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { plantInstanceId: true },
  })
  const currentIds = currentRows.map((row) => row.plantInstanceId).filter((id) => id !== plant.id)
  const insertAt = input.beforePlantInstanceId ? currentIds.indexOf(input.beforePlantInstanceId) : -1
  const orderedIds = [...currentIds]
  orderedIds.splice(insertAt >= 0 ? insertAt : orderedIds.length, 0, plant.id)
  await prisma.collectionExhibitPlant.upsert({
    where: { exhibitId_plantInstanceId: { exhibitId: exhibit.id, plantInstanceId: plant.id } },
    update: {},
    create: {
      exhibitId: exhibit.id,
      plantInstanceId: plant.id,
      sortOrder: orderedIds.indexOf(plant.id),
    },
  })
  await normalizeExhibitPlantOrder(exhibit.id, orderedIds)
  await audit(context.user, 'UPDATE', 'COLLECTION_EXHIBIT', exhibit.id, `Added ${plant.plantId} to exhibit ${exhibit.title}`, { plantInstanceId: plant.id }, context.collection.id)
  revalidatePath(exhibitEditorPath(context.collection.slug, exhibit.id))
}

export async function removePlantFromCollectionExhibit(input: { collectionSlug: string; exhibitId: string; plantInstanceId: string }) {
  const { context, exhibit } = await assertEditableExhibit(input.collectionSlug, input.exhibitId)
  await prisma.collectionExhibitPlant.deleteMany({
    where: { exhibitId: exhibit.id, plantInstanceId: input.plantInstanceId },
  })
  await normalizeExhibitPlantOrder(exhibit.id)
  await audit(context.user, 'UPDATE', 'COLLECTION_EXHIBIT', exhibit.id, `Removed plant from exhibit ${exhibit.title}`, { plantInstanceId: input.plantInstanceId }, context.collection.id)
  revalidatePath(exhibitEditorPath(context.collection.slug, exhibit.id))
}

export async function reorderCollectionExhibitPlants(input: { collectionSlug: string; exhibitId: string; orderedPlantInstanceIds: string[] }) {
  const { context, exhibit } = await assertEditableExhibit(input.collectionSlug, input.exhibitId)
  await normalizeExhibitPlantOrder(exhibit.id, input.orderedPlantInstanceIds)
  await audit(context.user, 'UPDATE', 'COLLECTION_EXHIBIT', exhibit.id, `Reordered exhibit ${exhibit.title}`, { selectedPlants: input.orderedPlantInstanceIds.length }, context.collection.id)
  revalidatePath(exhibitEditorPath(context.collection.slug, exhibit.id))
}

export async function updateCollectionExhibitPlantMetadata(input: { collectionSlug: string; exhibitId: string; plantInstanceId: string; featured?: boolean; customCaption?: string | null }) {
  const { context, exhibit } = await assertEditableExhibit(input.collectionSlug, input.exhibitId)
  await prisma.collectionExhibitPlant.update({
    where: { exhibitId_plantInstanceId: { exhibitId: exhibit.id, plantInstanceId: input.plantInstanceId } },
    data: {
      ...(typeof input.featured === 'boolean' ? { featured: input.featured } : {}),
      ...(input.customCaption !== undefined ? { customCaption: input.customCaption?.trim() || null } : {}),
    },
  })
  await audit(context.user, 'UPDATE', 'COLLECTION_EXHIBIT', exhibit.id, `Updated exhibit plant metadata for ${exhibit.title}`, { plantInstanceId: input.plantInstanceId }, context.collection.id)
  revalidatePath(exhibitEditorPath(context.collection.slug, exhibit.id))
}

export async function publishCollectionExhibit(fd: FormData) {
  const context = await requireCollectionManager(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const exhibit = await assertExhibitInCollection(id, context.collection.id)
  const publishedAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.collectionExhibit.update({ where: { id }, data: {
      status: CollectionExhibitStatus.PUBLISHED,
      publishedAt,
      publishedByUserId: context.user.id,
      revokedAt: null,
      token: exhibit.token || secureToken(),
    } })
    await emitDomainEvent(tx, {
      eventType: 'exhibit.published', collectionId: context.collection.id, aggregateId: id, occurredAt: publishedAt,
      actor: { id: context.user.id, role: context.user.role }, visibility: 'PUBLIC', idempotencyKey: `exhibit:${id}:published:${publishedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'CollectionExhibit', displayName: exhibit.title, slug: exhibit.slug, accessMode: exhibit.accessMode, summary: exhibit.description || undefined },
    })
  })
  await audit(context.user, 'PUBLISH', 'COLLECTION_EXHIBIT', id, `Published exhibit ${exhibit.title}`, undefined, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?published=1`))
}

export async function unpublishCollectionExhibit(fd: FormData) {
  const context = await requireCollectionManager(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const exhibit = await assertExhibitInCollection(id, context.collection.id)
  const unpublishedAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.collectionExhibit.update({ where: { id }, data: {
      status: CollectionExhibitStatus.UNPUBLISHED,
      revokedAt: unpublishedAt,
    } })
    await emitDomainEvent(tx, {
      eventType: 'exhibit.unpublished', collectionId: context.collection.id, aggregateId: id, occurredAt: unpublishedAt,
      actor: { id: context.user.id, role: context.user.role }, idempotencyKey: `exhibit:${id}:unpublished:${unpublishedAt.toISOString()}`,
      payload: { subjectId: id, recordId: id, recordType: 'CollectionExhibit', displayName: exhibit.title, slug: exhibit.slug },
    })
  })
  await audit(context.user, 'UNPUBLISH', 'COLLECTION_EXHIBIT', id, `Unpublished exhibit ${exhibit.title}`, undefined, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?unpublished=1`))
}

export async function subscribeToCollectionExhibit(fd: FormData) {
  const slug = value(fd, 'slug')
  const token = value(fd, 'token')
  const email = value(fd, 'email').toLowerCase()
  if (!email || !email.includes('@')) redirect(exhibitSubscribePath(slug, token, 'invalid'))
  const exhibit = await prisma.collectionExhibit.findUnique({
    where: { slug },
    include: { collection: true },
  })
  if (!exhibit || !isPublishedExhibitVisible(exhibit, token || null)) {
    redirect('/collections')
  }
  const confirmToken = secureToken()
  const unsubscribeToken = secureToken()
  const subscriber = await prisma.collectionExhibitSubscriber.upsert({
    where: { exhibitId_email: { exhibitId: exhibit.id, email } },
    update: {
      status: CollectionExhibitSubscriberStatus.PENDING,
      confirmTokenHash: hashExhibitToken(confirmToken),
      unsubscribeTokenHash: hashExhibitToken(unsubscribeToken),
      unsubscribedAt: null,
    },
    create: {
      exhibitId: exhibit.id,
      email,
      status: CollectionExhibitSubscriberStatus.PENDING,
      confirmTokenHash: hashExhibitToken(confirmToken),
      unsubscribeTokenHash: hashExhibitToken(unsubscribeToken),
    },
  })
  const confirmUrl = appUrl(`/exhibit-subscription/confirm?token=${encodeURIComponent(confirmToken)}`)
  const template = renderBrandedEmail({
    title: `Confirm updates for ${exhibit.title}`,
    preview: 'Confirm your exhibit update subscription.',
    body: [
      `You asked to receive updates for ${exhibit.title} from ${exhibit.collection.name}.`,
      'Please confirm this email address. You can unsubscribe any time from future messages.',
    ],
    actionLabel: 'Confirm subscription',
    actionUrl: confirmUrl,
  })
  try {
    await sendEmail({ to: email, subject: `Confirm AxilDB exhibit updates: ${exhibit.title}`, ...template })
  } catch (error) {
    console.error('Failed to send exhibit subscription confirmation', error)
    await audit(null, 'REQUEST_FAILED', 'COLLECTION_EXHIBIT_SUBSCRIBER', subscriber.id, `Failed exhibit subscription confirmation for ${exhibit.title}`, { email }, exhibit.collectionId)
    redirect(exhibitSubscribePath(slug, token, 'failed'))
  }
  await audit(null, 'REQUEST', 'COLLECTION_EXHIBIT_SUBSCRIBER', subscriber.id, `Requested exhibit subscription for ${exhibit.title}`, { email }, exhibit.collectionId)
  redirect(exhibitSubscribePath(slug, token, 'sent'))
}

export async function sendCollectionExhibitUpdate(fd: FormData) {
  const context = await requireCollectionManager(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const exhibit = await assertExhibitInCollection(id, context.collection.id)
  const title = value(fd, 'updateTitle') || `Update from ${exhibit.title}`
  const summary = value(fd, 'updateSummary')
  const previousUpdate = await prisma.collectionExhibitUpdate.findFirst({
    where: { exhibitId: id, sentAt: { not: null } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  })
  const includeDetectedChanges = checkbox(fd, 'includeDetectedChanges')
  const detectedChanges = includeDetectedChanges
    ? await collectExhibitDigestChanges(prisma, id, previousUpdate?.sentAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date())
    : []
  const combinedSummary = [summary, includeDetectedChanges && detectedChanges.length ? exhibitDigestSummary(detectedChanges) : ''].filter(Boolean).join('\n\n')
  const update = await prisma.collectionExhibitUpdate.create({
    data: {
      exhibitId: id,
      title,
      summary: combinedSummary,
      changeSummaryJson: { manual: true, detectedChangesIncluded: includeDetectedChanges, changes: detectedChanges },
      createdByUserId: context.user.id,
    },
  })
  const { sent, failed, skipped } = await sendExhibitUpdateToSubscribers(prisma, exhibit, update.id, { title, summary: combinedSummary || summary, changes: detectedChanges })
  await prisma.collectionExhibitUpdate.update({ where: { id: update.id }, data: { sentAt: new Date() } })
  await audit(context.user, 'SEND', 'COLLECTION_EXHIBIT_UPDATE', update.id, `Sent exhibit update ${title}`, { sent, failed, skipped, detectedChanges: detectedChanges.length }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?update=sent&sent=${sent}&failed=${failed}&skipped=${skipped}`))
}
