import type { PrismaClient } from '@prisma/client'
import { CollectionExhibitStatus, CollectionExhibitSubscriberStatus, CollectionExhibitUpdateDeliveryStatus } from '@prisma/client'
import { appUrl, sendEmail } from '@/lib/email'
import { renderBrandedEmail } from '@/lib/email-templates'
import {
  hashExhibitToken,
  isPublishedExhibitVisible,
  normalizeExhibitSettings,
  normalizeExhibitUpdateSettings,
  publicExhibitUrl,
  secureToken,
} from '@/lib/exhibits'
import { addCalendarDays, defaultTimeZone, formatDate, startOfDayInTimeZone } from '@/lib/time'
import { plantName } from '@/lib/utils'

export type ExhibitDigestChange = {
  key: string
  label: string
  at: Date
  summary: string
}

type ExhibitForDelivery = {
  id: string
  title: string
  slug: string
  accessMode: string
  token?: string | null
}

function bool(value: unknown) {
  return value === true
}

function localDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function weekdayKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
}

function conciseList(values: string[], max = 4) {
  const unique = Array.from(new Set(values.filter(Boolean)))
  if (unique.length <= max) return unique.join(', ')
  return `${unique.slice(0, max).join(', ')} and ${unique.length - max} more`
}

function photoWhere(collectionId: string, entityType: string, entityIds: string[], since: Date, until: Date) {
  return {
    collectionId,
    entityType,
    entityId: { in: entityIds },
    createdAt: { gt: since, lte: until },
    nsfwFlagged: false,
    moderationStatus: { notIn: ['CENSORED', 'REMOVED'] },
    OR: [{ plantDetected: null }, { plantDetected: true }],
  }
}

function summarizeRows(label: string, at: Date, values: string[], unit: string): ExhibitDigestChange | null {
  if (!values.length) return null
  return {
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    at,
    summary: `${values.length} ${unit}${values.length === 1 ? '' : 's'}: ${conciseList(values)}`,
  }
}

export async function collectExhibitDigestChanges(prisma: PrismaClient, exhibitId: string, since: Date, until = new Date()) {
  const exhibit = await prisma.collectionExhibit.findUnique({
    where: { id: exhibitId },
    include: {
      collection: true,
      plants: {
        include: {
          plantInstance: {
            select: {
              id: true,
              plantId: true,
              plantDefinitionId: true,
              plantDefinition: true,
            },
          },
        },
      },
    },
  })
  if (!exhibit) return []
  const settings = normalizeExhibitSettings(exhibit.settingsJson)
  const updateSettings = normalizeExhibitUpdateSettings(exhibit.updateSettingsJson)
  const changesEnabled = updateSettings.changes || {}
  const plants = exhibit.plants.map((row) => row.plantInstance)
  const plantIds = plants.map((plant) => plant.id)
  const definitionIds = Array.from(new Set(plants.map((plant) => plant.plantDefinitionId)))
  const plantById = new Map(plants.map((plant) => [plant.id, plant]))
  const definitionById = new Map(plants.map((plant) => [plant.plantDefinitionId, plant.plantDefinition]))
  const changes: ExhibitDigestChange[] = []

  if (bool(changesEnabled.plants)) {
    const addedRows = exhibit.plants.filter((row) => row.createdAt > since && row.createdAt <= until)
    const added = addedRows.map((row) => row.plantInstance.plantId)
    const change = summarizeRows('Selected plants', addedRows[0]?.createdAt || until, added, 'new exhibit plant')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.photos) && (settings.specimenPhotos || settings.typeImages)) {
    const [plantPhotos, definitionPhotos] = await Promise.all([
      settings.specimenPhotos && plantIds.length
        ? prisma.photo.findMany({ where: photoWhere(exhibit.collectionId, 'PLANT_INSTANCE', plantIds, since, until), select: { entityId: true, createdAt: true } })
        : Promise.resolve([]),
      settings.typeImages && definitionIds.length
        ? prisma.photo.findMany({ where: photoWhere(exhibit.collectionId, 'PLANT_DEFINITION', definitionIds, since, until), select: { entityId: true, createdAt: true } })
        : Promise.resolve([]),
    ])
    const labels = [
      ...plantPhotos.map((photo) => plantById.get(photo.entityId)?.plantId || 'specimen'),
      ...definitionPhotos.map((photo) => plantName(definitionById.get(photo.entityId) as any)),
    ]
    const latest = [...plantPhotos, ...definitionPhotos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt || until
    const change = summarizeRows('New photos', latest, labels, 'public-safe photo update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.blooms) && settings.bloomHistory && plantIds.length) {
    const rows = await prisma.bloomEvent.findMany({
      where: { collectionId: exhibit.collectionId, plantInstanceId: { in: plantIds }, createdAt: { gt: since, lte: until } },
      include: { plantInstance: { select: { plantId: true } } },
    })
    const change = summarizeRows('New blooms', rows[0]?.createdAt || until, rows.map((row) => row.plantInstance.plantId), 'bloom update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.notes) && settings.notes && plantIds.length) {
    const rows = await prisma.note.findMany({
      where: { collectionId: exhibit.collectionId, entityType: 'PLANT_INSTANCE', entityId: { in: plantIds }, createdAt: { gt: since, lte: until } },
      select: { entityId: true, createdAt: true },
    })
    const change = summarizeRows('New notes', rows[0]?.createdAt || until, rows.map((row) => plantById.get(row.entityId)?.plantId || 'specimen'), 'visible note update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.care) && settings.careNotes && plantIds.length) {
    const rows = await prisma.plantCareEvent.findMany({
      where: { collectionId: exhibit.collectionId, plantInstanceId: { in: plantIds }, createdAt: { gt: since, lte: until } },
      include: { plantInstance: { select: { plantId: true } } },
    })
    const change = summarizeRows('Care updates', rows[0]?.createdAt || until, rows.map((row) => row.plantInstance.plantId), 'care update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.conditions) && settings.conditions && plantIds.length) {
    const rows = await prisma.plantCondition.findMany({
      where: { collectionId: exhibit.collectionId, plantInstanceId: { in: plantIds }, updatedAt: { gt: since, lte: until } },
      include: { plantInstance: { select: { plantId: true } } },
    })
    const change = summarizeRows('Condition changes', rows[0]?.updatedAt || until, rows.map((row) => row.plantInstance.plantId), 'condition update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.locations) && settings.location && plantIds.length) {
    const rows = await prisma.plantLocationMove.findMany({
      where: { collectionId: exhibit.collectionId, plantInstanceId: { in: plantIds }, movedAt: { gt: since, lte: until } },
      include: { plantInstance: { select: { plantId: true } } },
    })
    const change = summarizeRows('Location changes', rows[0]?.movedAt || until, rows.map((row) => row.plantInstance.plantId), 'location update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.lineage) && (settings.lineage || settings.propagationHistory) && plantIds.length) {
    const events = await prisma.propagationEvent.findMany({
      where: {
        collectionId: exhibit.collectionId,
        updatedAt: { gt: since, lte: until },
        OR: [
          { parents: { some: { parentPlantInstanceId: { in: plantIds } } } },
          { children: { some: { childPlantInstanceId: { in: plantIds } } } },
        ],
      },
      include: {
        parents: { include: { parentPlantInstance: { select: { plantId: true } } } },
        children: { include: { childPlantInstance: { select: { plantId: true } } } },
      },
    })
    const labels = events.flatMap((event) => [
      ...event.parents.map((row) => row.parentPlantInstance.plantId),
      ...event.children.map((row) => row.childPlantInstance.plantId),
    ])
    const change = summarizeRows('Lineage updates', events[0]?.updatedAt || until, labels, 'propagation/lineage update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.definitions) && definitionIds.length) {
    const [localDefinitions, validatedChanges] = await Promise.all([
      prisma.plantDefinition.findMany({
        where: { collectionId: exhibit.collectionId, id: { in: definitionIds }, updatedAt: { gt: since, lte: until } },
      }),
      prisma.validatedDefinitionChange.findMany({
        where: { validatedDefinitionId: { in: definitionIds }, changedAt: { gt: since, lte: until } },
        include: { validatedDefinition: true },
      }),
    ])
    const labels = [
      ...localDefinitions.map((definition) => plantName(definition)),
      ...validatedChanges.map((change) => plantName(change.validatedDefinition)),
    ]
    const latest = [
      ...localDefinitions.map((definition) => definition.updatedAt),
      ...validatedChanges.map((change) => change.changedAt),
    ].sort((a, b) => b.getTime() - a.getTime())[0] || until
    const change = summarizeRows('Definition updates', latest, labels, 'definition/husbandry update')
    if (change) changes.push(change)
  }

  if (bool(changesEnabled.sunshine) && settings.sunshine && plantIds.length) {
    const rows = await prisma.sunshine.findMany({
      where: { collectionId: exhibit.collectionId, targetType: 'PLANT_INSTANCE', targetId: { in: plantIds }, createdAt: { gt: since, lte: until } },
      select: { targetId: true, createdAt: true },
    })
    const change = summarizeRows('Sunshine milestones', rows[0]?.createdAt || until, rows.map((row) => plantById.get(row.targetId)?.plantId || 'specimen'), 'sunshine update')
    if (change) changes.push(change)
  }

  return changes.sort((a, b) => b.at.getTime() - a.at.getTime())
}

export function exhibitDigestSummary(changes: ExhibitDigestChange[]) {
  if (!changes.length) return 'No selected exhibit changes were detected for this window.'
  return changes.map((change) => `${change.label}: ${change.summary}`).join('\n')
}

export async function sendExhibitUpdateToSubscribers(
  prisma: PrismaClient,
  exhibit: ExhibitForDelivery,
  updateId: string,
  input: { title: string; summary?: string | null; changes?: ExhibitDigestChange[] },
) {
  const subscribers = await prisma.collectionExhibitSubscriber.findMany({
    where: { exhibitId: exhibit.id, status: CollectionExhibitSubscriberStatus.ACTIVE },
  })
  let sent = 0
  let failed = 0
  let skipped = 0
  for (const subscriber of subscribers) {
    const unsubscribeToken = secureToken()
    await prisma.collectionExhibitSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribeTokenHash: hashExhibitToken(unsubscribeToken) },
    })
    const unsubscribeUrl = appUrl(`/exhibit-subscription/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`)
    const changeLines = input.changes?.slice(0, 8).map((change) => `${change.label}: ${change.summary}`) || []
    const template = renderBrandedEmail({
      title: input.title,
      preview: input.summary || `A calm update from ${exhibit.title}.`,
      body: [
        input.summary || 'A new exhibit update is available.',
        ...changeLines,
        `Open the exhibit to review ${exhibit.title}.`,
        `Unsubscribe: ${unsubscribeUrl}`,
      ],
      actionLabel: 'Open exhibit',
      actionUrl: publicExhibitUrl(exhibit),
      footer: 'Sent by AxilDB Collection Exhibits. Use the unsubscribe link above to stop these messages.',
    })
    try {
      await sendEmail({ to: subscriber.email, subject: input.title, ...template })
      await prisma.collectionExhibitDelivery.create({
        data: { exhibitUpdateId: updateId, subscriberId: subscriber.id, status: CollectionExhibitUpdateDeliveryStatus.SENT, sentAt: new Date() },
      })
      sent += 1
    } catch (error) {
      await prisma.collectionExhibitDelivery.create({
        data: { exhibitUpdateId: updateId, subscriberId: subscriber.id, status: CollectionExhibitUpdateDeliveryStatus.FAILED, error: error instanceof Error ? error.message : String(error) },
      })
      failed += 1
    }
  }
  if (!subscribers.length) skipped += 1
  return { sent, failed, skipped }
}

function scheduledWindow(cadence: 'daily' | 'weekly', now: Date, timezone: string) {
  const todayStart = startOfDayInTimeZone(now, timezone)
  if (cadence === 'weekly') {
    if (weekdayKey(now, timezone) !== 'Mon') return null
    const start = addCalendarDays(todayStart, -7, timezone)
    return { start, end: todayStart, key: `weekly-${localDateKey(start, timezone)}` }
  }
  const start = addCalendarDays(todayStart, -1, timezone)
  return { start, end: todayStart, key: `daily-${localDateKey(start, timezone)}` }
}

export async function sendScheduledCollectionExhibitDigests(prisma: PrismaClient, now = new Date()) {
  const exhibits = await prisma.collectionExhibit.findMany({
    where: {
      status: CollectionExhibitStatus.PUBLISHED,
      subscribers: { some: { status: CollectionExhibitSubscriberStatus.ACTIVE } },
    },
    include: { updates: { where: { sentAt: { not: null } }, orderBy: { sentAt: 'desc' }, take: 1 } },
  })
  const timezone = defaultTimeZone()
  let considered = 0
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const exhibit of exhibits) {
    if (!isPublishedExhibitVisible(exhibit, exhibit.accessMode === 'UNLISTED' ? exhibit.token || null : null)) continue
    const settings = normalizeExhibitUpdateSettings(exhibit.updateSettingsJson)
    if (settings.cadence !== 'daily' && settings.cadence !== 'weekly') continue
    const window = scheduledWindow(settings.cadence, now, timezone)
    if (!window) continue
    considered += 1
    const title = `${settings.cadence === 'weekly' ? 'Weekly' : 'Daily'} exhibit digest: ${exhibit.title} (${window.key.replace(/^(daily|weekly)-/, '')})`
    const alreadySent = await prisma.collectionExhibitUpdate.findFirst({
      where: { exhibitId: exhibit.id, title },
      select: { id: true },
    })
    if (alreadySent) {
      skipped += 1
      continue
    }
    const changes = await collectExhibitDigestChanges(prisma, exhibit.id, window.start, window.end)
    if (!changes.length) {
      skipped += 1
      continue
    }
    const summary = `A quiet ${settings.cadence} digest found ${changes.length} exhibit update${changes.length === 1 ? '' : 's'} from ${formatDate(window.start, timezone)} to ${formatDate(window.end, timezone)}.`
    const update = await prisma.collectionExhibitUpdate.create({
      data: {
        exhibitId: exhibit.id,
        title,
        summary,
        changeSummaryJson: { automatic: true, cadence: settings.cadence, windowStart: window.start.toISOString(), windowEnd: window.end.toISOString(), changes },
      },
    })
    const result = await sendExhibitUpdateToSubscribers(prisma, exhibit, update.id, { title, summary, changes })
    await prisma.collectionExhibitUpdate.update({ where: { id: update.id }, data: { sentAt: new Date() } })
    sent += result.sent
    failed += result.failed
    skipped += result.skipped
  }

  return { considered, sent, failed, skipped }
}
