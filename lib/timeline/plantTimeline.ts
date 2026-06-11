import type { PrismaClient } from '@prisma/client'
import { collectionPath } from '@/lib/collections'

export type PlantTimelineCategory = 'accession' | 'care' | 'health' | 'growth' | 'documentation' | 'lineage' | 'archive'
export type PlantTimelineColor = 'green' | 'sage' | 'amber' | 'rust' | 'mauve' | 'gray'

export type PlantTimelineEvent = {
  id: string
  type: string
  category: PlantTimelineCategory
  date: Date
  title: string
  summary: string
  status?: string | null
  severity?: string | null
  icon: string
  colorVariant: PlantTimelineColor
  href?: string
  sourceModel: string
  sourceId: string
  thumbnailUrl?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export type PlantTimelineMetrics = {
  ageDays: number | null
  daysSinceLastObservation: number | null
  daysSinceLastCare: number | null
  daysSinceLastWatering: number | null
  daysSinceLastPhoto: number | null
  daysSinceLastBloom: number | null
  bloomCycles: number
  propagationsProduced: number
  unresolvedHealthIssues: number
  activeWatchItems: number
  longestQuietPeriodDays: number | null
  timelineStatus: 'Archived' | 'Active issue' | 'Needs attention' | 'Blooming' | 'Healthy / Quiet' | 'Recently active' | 'Unknown'
  healthTrend: 'Healthy' | 'Watch' | 'Issue' | 'Recovering' | 'Unknown'
}

type PlantTimelineInstance = {
  id: string
  collectionId: string | null
  plantId: string
  instanceType: string
  status: string
  acquisitionDate: Date | null
  propagationDate: Date | null
  source: string | null
  distributor: string | null
  location: string | null
  archiveDate: Date | null
  archiveReason: string | null
  archiveNotes: string | null
  isSportCandidate: boolean
  sportStatus: string
  sportDescription: string | null
  createdAt: Date
  updatedAt: Date
}

function compactText(value?: string | null, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000))
}

function eventHref(collectionSlug: string, plantInstanceId: string, anchor?: string) {
  return collectionPath(collectionSlug, `/instances/${plantInstanceId}${anchor ? `#${anchor}` : ''}`)
}

function careEventPresentation(eventType: string): Pick<PlantTimelineEvent, 'category' | 'icon' | 'colorVariant' | 'title'> {
  if (eventType === 'WATERED') return { category: 'care', icon: '💧', colorVariant: 'sage', title: 'Watered' }
  if (eventType.includes('FERT') || eventType.includes('TREAT')) return { category: 'care', icon: '🧪', colorVariant: 'sage', title: titleCase(eventType) }
  if (eventType.includes('REPOT')) return { category: 'care', icon: '🪴', colorVariant: 'sage', title: titleCase(eventType) }
  if (eventType.includes('PRUNE') || eventType.includes('DIVID')) return { category: 'growth', icon: '✂️', colorVariant: 'green', title: titleCase(eventType) }
  if (eventType === 'GREEN_THUMB_NOTE') return { category: 'health', icon: '🔍', colorVariant: 'amber', title: 'Green Thumb care note' }
  return { category: 'care', icon: '✅', colorVariant: 'sage', title: titleCase(eventType) }
}

function conditionPresentation(category: string, severity: string, status: string): Pick<PlantTimelineEvent, 'icon' | 'colorVariant' | 'title'> {
  const issue = titleCase(category)
  if (status === 'RESOLVED') return { icon: '✅', colorVariant: 'green', title: `${issue} resolved` }
  if (category.includes('PEST')) return { icon: '🐛', colorVariant: 'rust', title: issue }
  if (category.includes('DISEASE') || category.includes('FUNG')) return { icon: '🦠', colorVariant: 'rust', title: issue }
  return { icon: severity === 'LOW' ? '🔍' : '⚠️', colorVariant: severity === 'LOW' ? 'amber' : 'rust', title: issue }
}

function addEvent(events: PlantTimelineEvent[], event: PlantTimelineEvent) {
  if (Number.isNaN(event.date.getTime())) return
  events.push(event)
}

export async function collectPlantTimelineEvents(
  prisma: PrismaClient,
  input: {
    collectionId: string
    collectionSlug: string
    plantInstanceId: string
  },
) {
  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id: input.plantInstanceId, collectionId: input.collectionId },
    select: {
      id: true,
      collectionId: true,
      plantId: true,
      instanceType: true,
      status: true,
      acquisitionDate: true,
      propagationDate: true,
      source: true,
      distributor: true,
      location: true,
      archiveDate: true,
      archiveReason: true,
      archiveNotes: true,
      isSportCandidate: true,
      sportStatus: true,
      sportDescription: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const blooms = await prisma.bloomEvent.findMany({
    where: { collectionId: input.collectionId, plantInstanceId: input.plantInstanceId },
    orderBy: { bloomStartDate: 'asc' },
  })
  const bloomIds = blooms.map((bloom) => bloom.id)

  const [careEvents, conditions, photos, notes, propagationEvents, reminders, sportRecords, locationMoves, quarantines] = await Promise.all([
    prisma.plantCareEvent.findMany({
      where: { collectionId: input.collectionId, plantInstanceId: input.plantInstanceId },
      orderBy: { performedAt: 'asc' },
    }),
    prisma.plantCondition.findMany({
      where: { collectionId: input.collectionId, plantInstanceId: input.plantInstanceId },
      orderBy: { observedAt: 'asc' },
    }),
    prisma.photo.findMany({
      where: {
        collectionId: input.collectionId,
        OR: [
          { entityType: 'PLANT_INSTANCE', entityId: input.plantInstanceId },
          ...(bloomIds.length ? [{ entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.note.findMany({
      where: {
        collectionId: input.collectionId,
        OR: [
          { entityType: 'PLANT_INSTANCE', entityId: input.plantInstanceId },
          ...(bloomIds.length ? [{ entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.propagationEvent.findMany({
      where: {
        collectionId: input.collectionId,
        OR: [
          { parents: { some: { parentPlantInstanceId: input.plantInstanceId } } },
          { children: { some: { childPlantInstanceId: input.plantInstanceId } } },
        ],
      },
      include: {
        parents: { include: { parentPlantInstance: { select: { id: true, plantId: true } } } },
        children: { include: { childPlantInstance: { select: { id: true, plantId: true } } } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.reminder.findMany({
      where: {
        collectionId: input.collectionId,
        OR: [
          { entityType: 'PLANT_INSTANCE', entityId: input.plantInstanceId },
          ...(bloomIds.length ? [{ entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } }] : []),
        ],
      },
      orderBy: { dueAt: 'asc' },
    }),
    prisma.sportStabilityRecord.findMany({
      where: { plantInstanceId: input.plantInstanceId, propagationEvent: { collectionId: input.collectionId } },
      include: { propagationEvent: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.plantLocationMove.findMany({
      where: { collectionId: input.collectionId, plantInstanceId: input.plantInstanceId },
      include: { fromLocation: true, toLocation: true, movedByUser: { select: { email: true } } },
      orderBy: { movedAt: 'asc' },
    }),
    prisma.plantQuarantine.findMany({
      where: { collectionId: input.collectionId, plantInstanceId: input.plantInstanceId },
      include: {
        quarantineLocation: true,
        createdByUser: { select: { email: true } },
        releasedByUser: { select: { email: true } },
        cancelledByUser: { select: { email: true } },
      },
      orderBy: { startDate: 'asc' },
    }),
  ])

  const events: PlantTimelineEvent[] = []
  const baseHref = eventHref(input.collectionSlug, input.plantInstanceId)

  addEvent(events, {
    id: `accession-${instance.id}`,
    type: 'ACCESSION',
    category: 'accession',
    date: instance.acquisitionDate || instance.createdAt,
    title: instance.acquisitionDate ? 'Acquired / accessioned' : 'Record created',
    summary: compactText([instance.source, instance.distributor].filter(Boolean).join(' via '), `${instance.plantId} entered the collection.`),
    icon: '🌱',
    colorVariant: 'green',
    href: baseHref,
    sourceModel: 'PlantInstance',
    sourceId: instance.id,
    metadata: { plantId: instance.plantId, instanceType: instance.instanceType },
  })

  if (instance.propagationDate) {
    addEvent(events, {
      id: `propagation-date-${instance.id}`,
      type: 'PROPAGATION_DATE',
      category: 'lineage',
      date: instance.propagationDate,
      title: 'Propagation date recorded',
      summary: `${instance.plantId} has a recorded propagation date.`,
      icon: '🌿',
      colorVariant: 'mauve',
      href: baseHref,
      sourceModel: 'PlantInstance',
      sourceId: instance.id,
    })
  }

  if (instance.location) {
    addEvent(events, {
      id: `location-${instance.id}`,
      type: 'LOCATION',
      category: 'care',
      date: instance.createdAt,
      title: 'Location recorded',
      summary: `Location: ${instance.location}`,
      icon: '☀️',
      colorVariant: 'sage',
      href: baseHref,
      sourceModel: 'PlantInstance',
      sourceId: instance.id,
    })
  }

  for (const move of locationMoves) {
    addEvent(events, {
      id: `location-move-${move.id}`,
      type: 'LOCATION_MOVE',
      category: 'care',
      date: move.movedAt,
      title: 'Location moved',
      summary: `Moved from ${move.fromLocation?.name || 'no location'} to ${move.toLocation?.name || 'no location'}${move.notes ? `: ${move.notes}` : ''}`,
      icon: '📍',
      colorVariant: 'sage',
      href: baseHref,
      sourceModel: 'PlantLocationMove',
      sourceId: move.id,
      metadata: { fromLocationId: move.fromLocationId, toLocationId: move.toLocationId, movedBy: move.movedByUser?.email || null },
    })
  }

  for (const quarantine of quarantines) {
    addEvent(events, {
      id: `quarantine-started-${quarantine.id}`,
      type: 'QUARANTINE_STARTED',
      category: 'health',
      date: quarantine.startDate,
      title: 'Quarantine started',
      summary: compactText(
        `${quarantine.reason} · ${quarantine.riskLevel.toLowerCase()} risk${quarantine.quarantineLocation ? ` at ${quarantine.quarantineLocation.name}` : ''}`,
        'Quarantine workflow started.',
      ),
      icon: '⚠️',
      colorVariant: 'amber',
      href: eventHref(input.collectionSlug, input.plantInstanceId, 'quarantine'),
      sourceModel: 'PlantQuarantine',
      sourceId: quarantine.id,
      status: quarantine.status,
      severity: quarantine.riskLevel,
      metadata: { quarantineLocationId: quarantine.quarantineLocationId, createdBy: quarantine.createdByUser?.email || null },
    })
    if (quarantine.updatedAt > quarantine.createdAt && quarantine.status === 'ACTIVE') {
      addEvent(events, {
        id: `quarantine-updated-${quarantine.id}`,
        type: 'QUARANTINE_UPDATED',
        category: 'health',
        date: quarantine.updatedAt,
        title: 'Quarantine target updated',
        summary: `Target release review: ${quarantine.targetReleaseDate.toLocaleDateString()}${quarantine.notes ? ` · ${compactText(quarantine.notes)}` : ''}`,
        icon: '📋',
        colorVariant: 'amber',
        href: eventHref(input.collectionSlug, input.plantInstanceId, 'quarantine'),
        sourceModel: 'PlantQuarantine',
        sourceId: quarantine.id,
        status: quarantine.status,
      })
    }
    if (quarantine.releasedAt) {
      addEvent(events, {
        id: `quarantine-released-${quarantine.id}`,
        type: 'QUARANTINE_RELEASED',
        category: 'health',
        date: quarantine.releasedAt,
        title: 'Quarantine released',
        summary: compactText(quarantine.notes, 'Quarantine was manually released.'),
        icon: '✅',
        colorVariant: 'green',
        href: eventHref(input.collectionSlug, input.plantInstanceId, 'quarantine'),
        sourceModel: 'PlantQuarantine',
        sourceId: quarantine.id,
        status: quarantine.status,
        metadata: { releasedBy: quarantine.releasedByUser?.email || null },
      })
    }
    if (quarantine.cancelledAt) {
      addEvent(events, {
        id: `quarantine-cancelled-${quarantine.id}`,
        type: 'QUARANTINE_CANCELLED',
        category: 'health',
        date: quarantine.cancelledAt,
        title: 'Quarantine cancelled',
        summary: compactText(quarantine.notes, 'Quarantine was cancelled.'),
        icon: '✕',
        colorVariant: 'gray',
        href: eventHref(input.collectionSlug, input.plantInstanceId, 'quarantine'),
        sourceModel: 'PlantQuarantine',
        sourceId: quarantine.id,
        status: quarantine.status,
        metadata: { cancelledBy: quarantine.cancelledByUser?.email || null },
      })
    }
  }

  if (instance.isSportCandidate || instance.sportStatus !== 'NONE') {
    addEvent(events, {
      id: `sport-status-${instance.id}`,
      type: 'SPORT_STATUS',
      category: 'lineage',
      date: instance.updatedAt,
      title: instance.sportStatus === 'NONE' ? 'Sport candidate' : `Sport status: ${titleCase(instance.sportStatus)}`,
      summary: compactText(instance.sportDescription, 'Sport or cultivar tracking is active for this specimen.'),
      icon: '🧬',
      colorVariant: 'mauve',
      href: baseHref,
      sourceModel: 'PlantInstance',
      sourceId: instance.id,
      status: instance.sportStatus,
    })
  }

  if (instance.status === 'ARCHIVED' && instance.archiveDate) {
    addEvent(events, {
      id: `archive-${instance.id}`,
      type: 'ARCHIVE',
      category: 'archive',
      date: instance.archiveDate,
      title: 'Archived',
      summary: compactText([instance.archiveReason, instance.archiveNotes].filter(Boolean).join(': '), 'Specimen was archived.'),
      icon: '📁',
      colorVariant: 'gray',
      href: baseHref,
      sourceModel: 'PlantInstance',
      sourceId: instance.id,
      status: instance.status,
    })
  }

  for (const event of careEvents) {
    const presentation = careEventPresentation(event.eventType)
    addEvent(events, {
      id: `care-${event.id}`,
      type: event.eventType,
      ...presentation,
      date: event.performedAt,
      summary: compactText(event.notes, `${presentation.title} logged.`),
      href: eventHref(input.collectionSlug, input.plantInstanceId, 'care-history'),
      sourceModel: 'PlantCareEvent',
      sourceId: event.id,
    })
  }

  for (const condition of conditions) {
    const presentation = conditionPresentation(condition.category, condition.severity, condition.status)
    addEvent(events, {
      id: `condition-${condition.id}-observed`,
      type: 'CONDITION_OBSERVED',
      category: 'health',
      date: condition.observedAt,
      title: presentation.title,
      summary: compactText(condition.notes, `${titleCase(condition.severity)} ${titleCase(condition.status)} condition recorded.`),
      icon: presentation.icon,
      colorVariant: presentation.colorVariant,
      href: eventHref(input.collectionSlug, input.plantInstanceId, 'care-history'),
      sourceModel: 'PlantCondition',
      sourceId: condition.id,
      severity: condition.severity,
      status: condition.status,
    })
    if (condition.resolvedAt) {
      addEvent(events, {
        id: `condition-${condition.id}-resolved`,
        type: 'CONDITION_RESOLVED',
        category: 'health',
        date: condition.resolvedAt,
        title: `${titleCase(condition.category)} resolved`,
        summary: compactText(condition.notes, 'Condition was marked resolved.'),
        icon: '✅',
        colorVariant: 'green',
        href: eventHref(input.collectionSlug, input.plantInstanceId, 'care-history'),
        sourceModel: 'PlantCondition',
        sourceId: condition.id,
        severity: condition.severity,
        status: 'RESOLVED',
      })
    }
  }

  for (const bloom of blooms) {
    const bloomHref = eventHref(input.collectionSlug, input.plantInstanceId, `bloom-${bloom.id}`)
    addEvent(events, {
      id: `bloom-${bloom.id}-start`,
      type: 'BLOOM_STARTED',
      category: 'growth',
      date: bloom.bloomStartDate,
      title: bloom.firstBloom ? 'First bloom started' : 'Bloom started',
      summary: compactText(bloom.notes, bloom.flowerCount ? `${bloom.flowerCount} flowers recorded.` : 'Bloom cycle opened.'),
      icon: '🌸',
      colorVariant: 'mauve',
      href: bloomHref,
      sourceModel: 'BloomEvent',
      sourceId: bloom.id,
      metadata: { firstBloom: bloom.firstBloom, flowerCount: bloom.flowerCount },
    })
    if (bloom.peakBloomDate) {
      addEvent(events, {
        id: `bloom-${bloom.id}-peak`,
        type: 'BLOOM_PEAK',
        category: 'growth',
        date: bloom.peakBloomDate,
        title: 'Peak bloom',
        summary: bloom.flowerCount ? `${bloom.flowerCount} flowers at peak bloom.` : 'Bloom marked at peak.',
        icon: '🌺',
        colorVariant: 'mauve',
        href: bloomHref,
        sourceModel: 'BloomEvent',
        sourceId: bloom.id,
      })
    }
    if (bloom.bloomEndDate) {
      addEvent(events, {
        id: `bloom-${bloom.id}-end`,
        type: 'BLOOM_ENDED',
        category: 'growth',
        date: bloom.bloomEndDate,
        title: 'Bloom ended',
        summary: 'Bloom cycle closed.',
        icon: '🥀',
        colorVariant: 'mauve',
        href: bloomHref,
        sourceModel: 'BloomEvent',
        sourceId: bloom.id,
      })
    }
  }

  for (const photo of photos) {
    addEvent(events, {
      id: `photo-${photo.id}`,
      type: 'PHOTO_ADDED',
      category: 'documentation',
      date: photo.createdAt,
      title: photo.entityType === 'BLOOM_EVENT' ? 'Bloom photo added' : 'Photo added',
      summary: compactText(photo.caption, 'Photo documentation added.'),
      icon: '📷',
      colorVariant: 'gray',
      href: photo.entityType === 'BLOOM_EVENT'
        ? eventHref(input.collectionSlug, input.plantInstanceId, `bloom-${photo.entityId}`)
        : baseHref,
      sourceModel: 'Photo',
      sourceId: photo.id,
      thumbnailUrl: photo.path,
    })
  }

  for (const note of notes) {
    addEvent(events, {
      id: `note-${note.id}`,
      type: 'NOTE_ADDED',
      category: 'documentation',
      date: note.createdAt,
      title: note.entityType === 'BLOOM_EVENT' ? 'Bloom note added' : 'Note added',
      summary: compactText(note.note, 'Note added.'),
      icon: '📝',
      colorVariant: 'gray',
      href: note.entityType === 'BLOOM_EVENT'
        ? eventHref(input.collectionSlug, input.plantInstanceId, `bloom-${note.entityId}`)
        : baseHref,
      sourceModel: 'Note',
      sourceId: note.id,
    })
  }

  for (const event of propagationEvents) {
    const childLinks = event.children.map((child) => child.childPlantInstance)
    const parentLinks = event.parents.map((parent) => parent.parentPlantInstance)
    const isParent = parentLinks.some((parent) => parent.id === input.plantInstanceId)
    const related = isParent
      ? childLinks.filter((child) => child.id !== input.plantInstanceId)
      : parentLinks.filter((parent) => parent.id !== input.plantInstanceId)
    addEvent(events, {
      id: `propagation-${event.id}`,
      type: isParent ? 'PROPAGATION_PRODUCED' : 'PROPAGATION_CREATED',
      category: 'lineage',
      date: event.date,
      title: isParent ? 'Propagation produced' : 'Created by propagation',
      summary: compactText(
        event.notes,
        related.length
          ? `${titleCase(event.method)} with ${related.map((plant) => plant.plantId).join(', ')}.`
          : `${titleCase(event.method)} propagation recorded.`,
      ),
      icon: '🌿',
      colorVariant: 'mauve',
      href: collectionPath(input.collectionSlug, `/propagations/${event.id}/edit`),
      sourceModel: 'PropagationEvent',
      sourceId: event.id,
      status: event.successStatus,
    })
  }

  for (const reminder of reminders) {
    addEvent(events, {
      id: `reminder-${reminder.id}`,
      type: reminder.completedAt ? 'REMINDER_COMPLETED' : reminder.pausedAt ? 'REMINDER_PAUSED' : 'REMINDER_DUE',
      category: 'care',
      date: reminder.completedAt || reminder.pausedAt || reminder.nextSendAt || reminder.dueAt,
      title: reminder.completedAt ? 'Reminder completed' : reminder.pausedAt ? 'Reminder paused' : 'Reminder due',
      summary: compactText(reminder.title, reminder.body || 'Care reminder.'),
      icon: reminder.completedAt ? '✅' : '🔍',
      colorVariant: reminder.completedAt ? 'green' : 'amber',
      href: collectionPath(input.collectionSlug, '/reminders'),
      sourceModel: 'Reminder',
      sourceId: reminder.id,
      status: reminder.completedAt ? 'COMPLETED' : reminder.pausedAt ? 'PAUSED' : 'OPEN',
    })
  }

  for (const record of sportRecords) {
    addEvent(events, {
      id: `sport-record-${record.id}`,
      type: 'SPORT_STABILITY',
      category: 'lineage',
      date: record.createdAt || record.propagationEvent.date,
      title: `Sport stability gen ${record.generationNumber}`,
      summary: compactText(record.notes, record.propagatedTrue ? 'Propagation stayed true to the sport.' : 'Propagation did not stay true to the sport.'),
      icon: '🧬',
      colorVariant: 'mauve',
      href: collectionPath(input.collectionSlug, '/sports'),
      sourceModel: 'SportStabilityRecord',
      sourceId: record.id,
      status: record.propagatedTrue ? 'TRUE' : 'NOT_TRUE',
    })
  }

  return events.sort((left, right) => left.date.getTime() - right.date.getTime() || left.title.localeCompare(right.title))
}

export function getPlantTimelineMetrics(events: PlantTimelineEvent[], instance: PlantTimelineInstance, now = new Date()): PlantTimelineMetrics {
  const sorted = [...events].sort((left, right) => left.date.getTime() - right.date.getTime())
  const firstDate = instance.acquisitionDate || instance.propagationDate || sorted[0]?.date || instance.createdAt
  const latestObservation = [...sorted].reverse().find((event) => ['care', 'health', 'growth', 'documentation'].includes(event.category))
  const latestCare = [...sorted].reverse().find((event) => event.category === 'care')
  const latestWater = [...sorted].reverse().find((event) => event.type === 'WATERED')
  const latestPhoto = [...sorted].reverse().find((event) => event.type === 'PHOTO_ADDED')
  const latestBloom = [...sorted].reverse().find((event) => event.type.startsWith('BLOOM_'))
  const openIssues = sorted.filter((event) => event.sourceModel === 'PlantCondition' && event.type === 'CONDITION_OBSERVED' && event.status !== 'RESOLVED')
  const activeWatchItems = openIssues.filter((event) => event.severity === 'LOW' || event.status === 'IMPROVING').length
  const activeBlooming = sorted.some((event) => event.type === 'BLOOM_STARTED' && !sorted.some((other) => other.sourceId === event.sourceId && other.type === 'BLOOM_ENDED'))
  const gaps = sorted.slice(1).map((event, index) => daysBetween(sorted[index].date, event.date))
  const longestQuietPeriodDays = gaps.length ? Math.max(...gaps) : null
  const daysSince = (date?: Date | null) => date ? daysBetween(date, now) : null
  const unresolvedHealthIssues = openIssues.length
  const recentlyActive = latestObservation && daysBetween(latestObservation.date, now) <= 14
  const recovering = sorted.slice(-5).some((event) => event.type === 'CONDITION_RESOLVED')

  return {
    ageDays: firstDate ? daysBetween(firstDate, now) : null,
    daysSinceLastObservation: daysSince(latestObservation?.date),
    daysSinceLastCare: daysSince(latestCare?.date),
    daysSinceLastWatering: daysSince(latestWater?.date),
    daysSinceLastPhoto: daysSince(latestPhoto?.date),
    daysSinceLastBloom: daysSince(latestBloom?.date),
    bloomCycles: new Set(sorted.filter((event) => event.sourceModel === 'BloomEvent').map((event) => event.sourceId)).size,
    propagationsProduced: sorted.filter((event) => event.type === 'PROPAGATION_PRODUCED').length,
    unresolvedHealthIssues,
    activeWatchItems,
    longestQuietPeriodDays,
    timelineStatus: instance.status === 'ARCHIVED'
      ? 'Archived'
      : unresolvedHealthIssues > 0
        ? openIssues.some((event) => ['HIGH', 'CRITICAL'].includes(String(event.severity))) ? 'Active issue' : 'Needs attention'
        : activeBlooming
          ? 'Blooming'
          : recentlyActive
            ? 'Recently active'
            : sorted.length
              ? 'Healthy / Quiet'
              : 'Unknown',
    healthTrend: unresolvedHealthIssues > 0
      ? openIssues.some((event) => ['HIGH', 'CRITICAL'].includes(String(event.severity))) ? 'Issue' : 'Watch'
      : recovering
        ? 'Recovering'
        : sorted.length
          ? 'Healthy'
          : 'Unknown',
  }
}
