'use server'

import { CollectionExhibitAccessMode, CollectionExhibitStatus, CollectionExhibitSubscriberStatus, CollectionExhibitUpdateDeliveryStatus } from '@prisma/client'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/auth'
import { collectionPath, requireCollectionGardener, requireCollectionManager } from '@/lib/collections'
import { appUrl, sendEmail } from '@/lib/email'
import { renderBrandedEmail } from '@/lib/email-templates'
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
  return settings
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
  const exhibit = await prisma.collectionExhibit.create({
    data: {
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
    },
  })
  await audit(context.user, 'CREATE', 'COLLECTION_EXHIBIT', exhibit.id, `Created exhibit ${title}`, { slug, accessMode }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${exhibit.id}`))
}

export async function updateCollectionExhibit(fd: FormData) {
  const context = await requireCollectionGardener(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const existing = await assertExhibitInCollection(id, context.collection.id)
  const rows = selectedPlantRows(fd)
  const validPlants = rows.length
    ? await prisma.plantInstance.findMany({
        where: { collectionId: context.collection.id, id: { in: rows.map((row) => row.plantInstanceId) } },
        select: { id: true },
      })
    : []
  const validPlantIds = new Set(validPlants.map((plant) => plant.id))
  const filteredRows = rows.filter((row) => validPlantIds.has(row.plantInstanceId))
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
  await prisma.$transaction([
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
    prisma.collectionExhibitPlant.deleteMany({ where: { exhibitId: id } }),
    ...filteredRows.map((row) => prisma.collectionExhibitPlant.create({
      data: { exhibitId: id, ...row },
    })),
  ])
  await audit(context.user, 'UPDATE', 'COLLECTION_EXHIBIT', id, `Updated exhibit ${existing.title}`, {
    accessMode,
    selectedPlants: filteredRows.length,
    settings: settingsFromForm(fd),
  }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?saved=1`))
}

export async function publishCollectionExhibit(fd: FormData) {
  const context = await requireCollectionManager(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const exhibit = await assertExhibitInCollection(id, context.collection.id)
  await prisma.collectionExhibit.update({
    where: { id },
    data: {
      status: CollectionExhibitStatus.PUBLISHED,
      publishedAt: new Date(),
      publishedByUserId: context.user.id,
      revokedAt: null,
      token: exhibit.token || secureToken(),
    },
  })
  await audit(context.user, 'PUBLISH', 'COLLECTION_EXHIBIT', id, `Published exhibit ${exhibit.title}`, undefined, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?published=1`))
}

export async function unpublishCollectionExhibit(fd: FormData) {
  const context = await requireCollectionManager(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const exhibit = await assertExhibitInCollection(id, context.collection.id)
  await prisma.collectionExhibit.update({
    where: { id },
    data: {
      status: CollectionExhibitStatus.UNPUBLISHED,
      revokedAt: new Date(),
    },
  })
  await audit(context.user, 'UNPUBLISH', 'COLLECTION_EXHIBIT', id, `Unpublished exhibit ${exhibit.title}`, undefined, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?unpublished=1`))
}

export async function subscribeToCollectionExhibit(fd: FormData) {
  const slug = value(fd, 'slug')
  const token = value(fd, 'token')
  const email = value(fd, 'email').toLowerCase()
  if (!email || !email.includes('@')) redirect(`/exhibit/${encodeURIComponent(slug)}${token ? `?token=${encodeURIComponent(token)}&subscribe=invalid` : '?subscribe=invalid'}`)
  const exhibit = await prisma.collectionExhibit.findUniqueOrThrow({
    where: { slug },
    include: { collection: true },
  })
  if (!isPublishedExhibitVisible(exhibit, token || null)) {
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
  await sendEmail({ to: email, subject: `Confirm AxilDB exhibit updates: ${exhibit.title}`, ...template })
  await audit(null, 'REQUEST', 'COLLECTION_EXHIBIT_SUBSCRIBER', subscriber.id, `Requested exhibit subscription for ${exhibit.title}`, { email }, exhibit.collectionId)
  redirect(`/exhibit/${encodeURIComponent(slug)}${token ? `?token=${encodeURIComponent(token)}&subscribe=sent` : '?subscribe=sent'}`)
}

export async function sendCollectionExhibitUpdate(fd: FormData) {
  const context = await requireCollectionManager(value(fd, 'collectionSlug'))
  const id = value(fd, 'id')
  const exhibit = await assertExhibitInCollection(id, context.collection.id)
  const title = value(fd, 'updateTitle') || `Update from ${exhibit.title}`
  const summary = value(fd, 'updateSummary')
  const update = await prisma.collectionExhibitUpdate.create({
    data: {
      exhibitId: id,
      title,
      summary,
      changeSummaryJson: { manual: true },
      createdByUserId: context.user.id,
    },
  })
  const subscribers = await prisma.collectionExhibitSubscriber.findMany({
    where: { exhibitId: id, status: CollectionExhibitSubscriberStatus.ACTIVE },
  })
  let sent = 0
  let failed = 0
  for (const subscriber of subscribers) {
    const unsubscribeToken = secureToken()
    await prisma.collectionExhibitSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribeTokenHash: hashExhibitToken(unsubscribeToken) },
    })
    const exhibitUrl = publicExhibitUrl(exhibit)
    const unsubscribeUrl = appUrl(`/exhibit-subscription/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`)
    const template = renderBrandedEmail({
      title,
      preview: summary || `A calm update from ${exhibit.title}.`,
      body: [
        summary || 'A new exhibit update is available.',
        `Open the exhibit to review ${exhibit.title}.`,
        `Unsubscribe: ${unsubscribeUrl}`,
      ],
      actionLabel: 'Open exhibit',
      actionUrl: exhibitUrl,
      footer: 'Sent by AxilDB Collection Exhibits. Use the unsubscribe link above to stop these messages.',
    })
    try {
      await sendEmail({ to: subscriber.email, subject: title, ...template })
      await prisma.collectionExhibitDelivery.create({
        data: { exhibitUpdateId: update.id, subscriberId: subscriber.id, status: CollectionExhibitUpdateDeliveryStatus.SENT, sentAt: new Date() },
      })
      sent += 1
    } catch (error) {
      await prisma.collectionExhibitDelivery.create({
        data: { exhibitUpdateId: update.id, subscriberId: subscriber.id, status: CollectionExhibitUpdateDeliveryStatus.FAILED, error: String(error) },
      })
      failed += 1
    }
  }
  await prisma.collectionExhibitUpdate.update({ where: { id: update.id }, data: { sentAt: new Date() } })
  await audit(context.user, 'SEND', 'COLLECTION_EXHIBIT_UPDATE', update.id, `Sent exhibit update ${title}`, { sent, failed }, context.collection.id)
  redirect(collectionPath(context.collection.slug, `/exhibits/${id}?update=sent&sent=${sent}&failed=${failed}`))
}
