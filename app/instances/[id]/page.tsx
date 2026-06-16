import {
  archivePlantInstance,
  addNote,
  openBloomEvent,
  updateBloomPeak,
  closeBloomEvent,
  setCoverPhoto,
  setTypePhoto,
  deletePhoto,
  updatePhotoCaption,
  updatePhotoFraming,
  markSportCandidate,
  markSportReverted,
  createReminder,
  completeCareTask,
  completeReminder,
  createPlantCondition,
  deleteGreenThumbCareNote,
  pauseReminder,
  deleteReminder,
  followEntity,
  regeneratePlantInstanceId,
  savePlantHusbandryOverrideField,
  startPlantQuarantine,
  updatePlantQuarantine,
  releasePlantQuarantine,
  cancelPlantQuarantine,
  updatePlantCondition,
  unfollowEntity,
} from '@/app/actions'
import { createPlantTransferRequest } from '@/app/transfer-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { GreenThumbAssist } from '@/components/GreenThumbAssist'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { PlantImage } from '@/components/PlantImage'
import { PlantHealthTimeline } from '@/components/PlantHealthTimeline'
import { PhotoFramingEditor } from '@/components/PhotoFramingEditor'
import { SunshineButton } from '@/components/SunshineButton'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { HusbandryBadges, HusbandryGuideView } from '@/components/Husbandry'
import { waterCadenceDays } from '@/lib/care-queue'
import { getCurrentUser } from '@/lib/auth'
import { canCreateInCollection, canEditInCollection, canManageCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { isQuarantineLocation, quarantineChecklistItems } from '@/lib/locations'
import { expectedPlantIdForInstance } from '@/lib/plant-id'
import { prisma } from '@/lib/prisma'
import { recurrenceLabel, reminderCategories, reminderCategoryLabel, reminderRecurrences } from '@/lib/reminders'
import { hasHusbandryData, mergeHusbandryValues } from '@/lib/husbandry'
import { isServerAdminRole } from '@/lib/roles'
import { sunshineCounts, sunshineKey, sunshineStateForUser } from '@/lib/sunshine'
import { addCalendarDays, formatDateTime, startOfDayInTimeZone } from '@/lib/time'
import { collectPlantTimelineEvents, getPlantTimelineMetrics } from '@/lib/timeline/plantTimeline'
import { dateInput, fmtDate, plantName, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'
import QRCode from 'qrcode'
import { RefreshCw } from 'lucide-react'

const conditionCategories = [
  ['WILTING', 'Wilting'],
  ['YELLOWING_LEAVES', 'Yellowing leaves'],
  ['CRISPY_LEAVES', 'Crispy leaves'],
  ['PESTS', 'Pests'],
  ['DISEASE', 'Disease'],
  ['ROOT_ISSUE', 'Root issue'],
  ['SUNBURN', 'Sunburn'],
  ['NUTRIENT_ISSUE', 'Nutrient issue'],
  ['MECHANICAL_DAMAGE', 'Mechanical damage'],
  ['OTHER', 'Other'],
] as const

const conditionSeverities = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const
const conditionStatuses = ['OPEN', 'IMPROVING', 'RESOLVED'] as const

function careEventMetadata(metadata: unknown) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

function careEventLabel(eventType: string) {
  if (eventType === 'GREEN_THUMB_NOTE') return 'Green Thumb care note'
  return eventType.replaceAll('_', ' ').toLowerCase()
}

export default async function InstanceDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }
  const canCreateRecords = canCreateInCollection(user, context)
  const canEditRecords = canEditInCollection(user, context)
  const canManageRecords = canManageCollection(user, context)
  const preferences = user
    ? await prisma.emailPreference.findUnique({ where: { userId: user.id } })
    : null
  const timezone = preferences?.timezone

  const i = await prisma.plantInstance.findFirstOrThrow({
    where: { id, ...collectionWhere },
    include: {
      plantDefinition: { include: { aliases: { orderBy: { name: 'asc' } }, husbandryGuide: true } },
      blooms: {
        orderBy: { bloomStartDate: 'desc' },
      },
      parentLinks: {
        include: {
          propagationEvent: {
            include: {
              children: {
                include: {
                  childPlantInstance: {
                    include: {
                      plantDefinition: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      childLinks: {
        include: {
          propagationEvent: {
            include: {
              parents: {
                include: {
                  parentPlantInstance: {
                    include: {
                      plantDefinition: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      sportRecords: { include: { propagationEvent: true }, orderBy: { generationNumber: 'desc' } },
      husbandryOverride: true,
      currentLocation: { include: { locationType: true } },
    },
  })
  const [activeQuarantine, quarantineHistory] = await Promise.all([
    prisma.plantQuarantine.findFirst({
      where: { collectionId: collection.id, plantInstanceId: id, status: 'ACTIVE' },
      include: { quarantineLocation: { include: { locationType: true } } },
      orderBy: { startDate: 'desc' },
    }),
    prisma.plantQuarantine.findMany({
      where: { collectionId: collection.id, plantInstanceId: id, status: { not: 'ACTIVE' } },
      include: { quarantineLocation: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
    }),
  ])
  const isInQuarantineLocation = isQuarantineLocation(i.currentLocation)
  const quarantineChecklist = Array.isArray(activeQuarantine?.checklistJson)
    ? activeQuarantine.checklistJson.filter((item): item is { label: string; done?: boolean } => Boolean(item && typeof item === 'object' && 'label' in item))
    : quarantineChecklistItems.map((label) => ({ label, done: false }))
  const quarantineDayDelta = activeQuarantine
    ? Math.ceil((activeQuarantine.targetReleaseDate.getTime() - new Date().getTime()) / 86_400_000)
    : null
  const sourceHusbandryGuide = i.plantDefinition.husbandryGuide?.sourcePlantDefinitionId
    ? await prisma.plantHusbandryGuide.findFirst({
        where: { collectionId: collection.id, plantDefinitionId: i.plantDefinition.husbandryGuide.sourcePlantDefinitionId },
        include: { plantDefinition: true },
      })
    : null
  const expectedPlantId = canEditRecords
    ? await expectedPlantIdForInstance(prisma, { collectionId: collection.id, plantInstanceId: i.id })
    : i.plantId
  const canRegeneratePlantId = canEditRecords && expectedPlantId !== i.plantId
  const baseHusbandryGuide = sourceHusbandryGuide || i.plantDefinition.husbandryGuide
  const effectiveHusbandry = mergeHusbandryValues(baseHusbandryGuide as any, i.husbandryOverride as any)

  const notes = await prisma.note.findMany({
    where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: id },
    orderBy: { createdAt: 'desc' },
  })

  const photos = await prisma.photo.findMany({
    where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: id },
    orderBy: [{ isCover: 'desc' }, { isType: 'desc' }, { createdAt: 'desc' }],
  })

  const bloomPhotos = await prisma.photo.findMany({
    where: {
      entityType: 'BLOOM_EVENT',
      collectionId: collection.id,
      entityId: {
        in: i.blooms.map((b) => b.id),
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const photosByBloomId = bloomPhotos.reduce<Record<string, typeof bloomPhotos>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = []
    acc[photo.entityId].push(photo)
    return acc
  }, {})
  const sunshineTargets = [{ targetType: 'PLANT_INSTANCE' as const, targetId: id }]
  const [detailSunshineCounts, currentUserSunshine] = await Promise.all([
    sunshineCounts(prisma, collection.id, sunshineTargets),
    sunshineStateForUser(prisma, collection.id, user?.id, sunshineTargets),
  ])
  const detailSunshineCount = detailSunshineCounts.get(sunshineKey('PLANT_INSTANCE', id)) || 0

  const reminders = user
    ? await prisma.reminder.findMany({
        where: {
          userId: user.id,
          collectionId: collection.id,
          OR: [
            { entityType: 'PLANT_INSTANCE', entityId: id },
            { entityType: 'BLOOM_EVENT', entityId: { in: i.blooms.map((b) => b.id) } },
          ],
        },
        orderBy: [{ completedAt: 'asc' }, { pausedAt: 'asc' }, { nextSendAt: 'asc' }, { dueAt: 'desc' }],
      })
    : []

  const today = startOfDayInTimeZone(new Date(), timezone)

  const [careEvents, careConditions, greenThumbToday] = await Promise.all([
    prisma.plantCareEvent.findMany({
      where: { collectionId: collection.id, plantInstanceId: id },
      orderBy: { performedAt: 'desc' },
      take: 8,
    }),
    prisma.plantCondition.findMany({
      where: { collectionId: collection.id, plantInstanceId: id },
      orderBy: [{ status: 'asc' }, { observedAt: 'desc' }],
    }),
    prisma.plantCareEvent.findFirst({
      where: {
        collectionId: collection.id,
        plantInstanceId: id,
        eventType: 'GREEN_THUMB_NOTE',
        performedAt: { gte: today },
      },
      select: { id: true },
    }),
  ])
  const lastWatered = careEvents.find((event) => event.eventType === 'WATERED')?.performedAt
  const openConditions = careConditions.filter((condition) => condition.status !== 'RESOLVED')
  const waterCadence = waterCadenceDays(effectiveHusbandry.summaryWater || effectiveHusbandry.wateringCadence)
  const nextWatering = addCalendarDays(lastWatered || i.acquisitionDate || i.propagationDate || i.createdAt, waterCadence, timezone || undefined)
  const greenThumbUsedToday = !!greenThumbToday
  const canUseGreenThumb = canCreateRecords && !!user && (collection.aiFeaturesEnabled || isServerAdminRole(user.role))
  const timelineEvents = await collectPlantTimelineEvents(prisma, {
    collectionId: collection.id,
    collectionSlug: collection.slug,
    plantInstanceId: id,
  })
  const timelineMetrics = getPlantTimelineMetrics(timelineEvents, i)

  const follows = user
    ? await prisma.follow.findMany({
        where: {
          userId: user.id,
          collectionId: collection.id,
          OR: [
            { scope: 'SPECIMEN', entityType: 'PLANT_INSTANCE', entityId: id },
            { scope: 'LINEAGE', entityType: 'PLANT_INSTANCE', entityId: id },
            { scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: i.plantDefinitionId },
          ],
        },
      })
    : []
  const followByScope = new Map(follows.map((follow) => [follow.scope, follow]))
  const followCounts = await prisma.follow.groupBy({
    by: ['scope', 'entityType', 'entityId'],
    where: {
      OR: [
        { scope: 'SPECIMEN', entityType: 'PLANT_INSTANCE', entityId: id },
        { scope: 'LINEAGE', entityType: 'PLANT_INSTANCE', entityId: id },
        { scope: 'TYPE', entityType: 'PLANT_DEFINITION', entityId: i.plantDefinitionId },
      ],
      collectionId: collection.id,
    },
    _count: { _all: true },
  })
  const followerCount = (scope: string, entityType: string, entityId: string) =>
    followCounts.find((follow) => follow.scope === scope && follow.entityType === entityType && follow.entityId === entityId)?._count._all || 0

  const activeTransferConnections = canEditRecords && i.status !== 'ARCHIVED'
    ? await prisma.collectionTransferConnection.findMany({
        where: { sourceCollectionId: collection.id, status: 'ACTIVE' },
        include: { targetCollection: true },
        orderBy: { targetCollection: { name: 'asc' } },
      })
    : []

  const instanceReminders = reminders.filter((reminder) => reminder.entityType === 'PLANT_INSTANCE')
  const remindersByBloomId = reminders
    .filter((reminder) => reminder.entityType === 'BLOOM_EVENT')
    .reduce<Record<string, typeof reminders>>((acc, reminder) => {
      if (!reminder.entityId) return acc
      if (!acc[reminder.entityId]) acc[reminder.entityId] = []
      acc[reminder.entityId].push(reminder)
      return acc
    }, {})
  const parentRelationships = Array.from(
    new Map(
      i.childLinks
        .flatMap((link) => link.propagationEvent.parents.map((parent) => ({
          key: `${link.propagationEventId}:${parent.parentPlantInstanceId}:${parent.parentRole}`,
          event: link.propagationEvent,
          role: parent.parentRole,
          plant: parent.parentPlantInstance,
        })))
        .filter((relationship) => relationship.plant.id !== id)
        .map((relationship) => [relationship.key, relationship] as const),
    ).values(),
  )
  const childRelationships = Array.from(
    new Map(
      i.parentLinks
        .flatMap((link) => link.propagationEvent.children.map((child) => ({
          key: `${link.propagationEventId}:${child.childPlantInstanceId}`,
          event: link.propagationEvent,
          plant: child.childPlantInstance,
        })))
        .filter((relationship) => relationship.plant.id !== id)
        .map((relationship) => [relationship.key, relationship] as const),
    ).values(),
  )

  const qr = await QRCode.toDataURL(
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collection.slug, `/instances/${id}`)}`
  )

  const followCard = user ? (
    <Card className="text-sm xl:order-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">Follow updates</h3>
          <p className="text-xs text-stone-600">Email updates for this record and related changes.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ['SPECIMEN', 'PLANT_INSTANCE', id, 'Specimen', 'Specimen'],
          ['LINEAGE', 'PLANT_INSTANCE', id, 'Lineage', 'Lineage'],
          ['TYPE', 'PLANT_DEFINITION', i.plantDefinitionId, 'Plant type', 'Plant type'],
        ].map(([scope, entityType, entityId, followLabel, followedLabel]) => {
          const existing = followByScope.get(scope)
          const count = followerCount(scope, entityType, entityId)
          return existing ? (
            <form key={scope} action={unfollowEntity}>
              <input type="hidden" name="id" value={existing.id} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
              <Button className="border border-stone-300 bg-white/70 px-3 py-1.5 text-xs text-stone-800 hover:bg-white">
                Following {followedLabel} · {count}
              </Button>
            </form>
          ) : (
            <form key={scope} action={followEntity}>
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="entityType" value={entityType} />
              <input type="hidden" name="entityId" value={entityId} />
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
              <Button className="px-3 py-1.5 text-xs">Follow {followLabel} · {count}</Button>
            </form>
          )
        })}
      </div>
    </Card>
  ) : null

  const photosCard = (
    <Card id="photos">
      <h3 className="font-bold">Specimen photos</h3>
      <p className="mt-1 text-sm text-stone-600">
        Choose one cover photo for this specimen card. Admins can also mark one specimen photo as the type photo for the plant definition.
      </p>
      {canCreateRecords && (
        <details className="group mt-3 rounded-lg border border-stone-200 bg-white/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
            <span>Upload specimen photo</span>
            <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Open</span>
            <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Hide</span>
          </summary>
          <form
            action="/api/photos"
            method="post"
            encType="multipart/form-data"
            className="grid gap-2 border-t border-stone-200 p-3"
          >
            <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
            <input type="hidden" name="entityId" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
            <PhotoFramingEditor fileInputName="photo" />
            <Field label="Caption" name="caption" />
            <Button>Upload photo</Button>
          </form>
        </details>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {photos.length === 0 && <p className="text-sm text-stone-600">No specimen photos yet.</p>}
        {photos.map((p) => (
          <figure key={p.id} id={`photo-${p.id}`} className="scroll-mt-24 overflow-hidden rounded-lg border border-stone-200 bg-white/70">
            <div className="aspect-[4/3] overflow-hidden">
              <PlantImage src={p} alt={p.caption || 'Plant photo'} />
            </div>
            <figcaption className="space-y-3 p-3 text-xs">
              <div>
                <p className="font-medium">{p.caption || 'Untitled photo'}</p>
                <p className="text-stone-600">
                  {p.isCover ? 'Cover photo' : 'Not cover'} · {p.isType ? 'Type photo' : 'Not type'}
                </p>
              </div>
              {canEditRecords && (
                <div className="flex flex-wrap gap-2">
                  <form action={setCoverPhoto}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#photo-${p.id}`)} />
                    <Button className="px-3 py-1.5 text-xs" disabled={p.isCover}>Set cover</Button>
                  </form>
                  <form action={setTypePhoto}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#photo-${p.id}`)} />
                    <Button className="px-3 py-1.5 text-xs" disabled={p.isType}>Set type</Button>
                  </form>
                  {canManageRecords && (
                    <form action={deletePhoto}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="collectionSlug" value={collection.slug} />
                      <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#photos`)} />
                      <ConfirmDeleteButton
                        className="bg-[#9a3f35] px-3 py-1.5 text-xs hover:bg-[#7d3028]"
                        title="Delete specimen photo?"
                        message="This will permanently delete this specimen photo and any related sunshine or moderation review records."
                        confirmLabel="Delete photo"
                      >
                        Delete
                      </ConfirmDeleteButton>
                    </form>
                  )}
                </div>
              )}
              {canEditRecords && (
                <details className="group rounded-lg border border-stone-200 bg-white/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 font-medium">
                    <span>Edit caption</span>
                    <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:hidden">Open</span>
                    <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:inline-block">Hide</span>
                  </summary>
                  <form action={updatePhotoCaption} className="grid gap-2 border-t border-stone-200 p-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#photo-${p.id}`)} />
                    <input className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1.5 text-xs shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30" name="caption" defaultValue={p.caption || ''} placeholder="Photo caption" />
                    <Button className="px-3 py-1.5 text-xs">Save caption</Button>
                  </form>
                </details>
              )}
              {canEditRecords && (
                <details className="group rounded-lg border border-stone-200 bg-white/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 font-medium">
                    <span>Edit framing</span>
                    <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:hidden">Open</span>
                    <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:inline-block">Hide</span>
                  </summary>
                  <form action={updatePhotoFraming} className="grid gap-2 border-t border-stone-200 p-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                    <PhotoFramingEditor src={p.path} initial={p} />
                    <Button className="px-3 py-1.5 text-xs">Save framing</Button>
                  </form>
                </details>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  )

  const careCard = (
    <Card id="care-history">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">Care</h3>
          <p className="text-sm text-stone-600">Last watering, open conditions, and recent care history.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-medium">
          <Link className="text-[#2f6b45] underline" href={collectionPath(collection.slug, '/care')}>Care queue</Link>
          <Link className="text-[#2f6b45] underline" href={collectionPath(collection.slug, `/care-sheets/new?plantInstanceId=${id}`)}>Add to care sheet</Link>
          {canEditRecords && (
            <Link className="text-[#2f6b45] underline" href={collectionPath(collection.slug, `/care-sheets/new?mode=sitter&plantInstanceId=${id}`)}>Create sitter plan</Link>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-stone-200 bg-white/60 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Last watered</p>
          <p className="mt-1 font-medium">{fmtDate(lastWatered, timezone)}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white/60 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Next estimate</p>
          <p className="mt-1 font-medium">{fmtDate(nextWatering, timezone)}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white/60 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Open conditions</p>
          <p className="mt-1 font-medium">{openConditions.length}</p>
        </div>
      </div>

      {canCreateRecords && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <form action={completeCareTask} className="grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
            <input type="hidden" name="plantInstanceId" value={id} />
            <input type="hidden" name="taskType" value="WATER" />
            <Field label="Watered on" name="performedAt" type="date" defaultValue={dateInput(new Date(), timezone)} />
            <TextArea label="Notes" name="notes" className="min-h-14" />
            <Button>Log watering</Button>
          </form>

          <form action={createPlantCondition} className="grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
            <input type="hidden" name="plantInstanceId" value={id} />
            <Select label="Condition" name="category" defaultValue="WILTING">
              {conditionCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Select label="Severity" name="severity" defaultValue="MODERATE">
              {conditionSeverities.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <TextArea label="Notes" name="notes" className="min-h-14" />
            <Button>Add condition</Button>
          </form>
        </div>
      )}

      {careConditions.length > 0 && (
        <div className="mt-4 grid gap-2">
          <p className="text-sm font-semibold">Conditions</p>
          {careConditions.map((condition) => (
            canCreateRecords ? (
              <form key={condition.id} action={updatePlantCondition} className="grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3 text-sm md:grid-cols-[1fr_10rem_10rem_auto]">
                <input type="hidden" name="id" value={condition.id} />
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                <div className="min-w-0">
                  <p className="font-medium">{condition.category.replaceAll('_', ' ').toLowerCase()}</p>
                  <p className="text-xs text-stone-600">Observed {fmtDate(condition.observedAt, timezone)}</p>
                  <input name="notes" defaultValue={condition.notes || ''} className="mt-2 w-full min-w-0 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" />
                </div>
                <Select label="Severity" name="severity" defaultValue={condition.severity}>
                  {conditionSeverities.map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Select label="Status" name="status" defaultValue={condition.status}>
                  {conditionStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Button className="self-end">Save</Button>
              </form>
            ) : (
              <div key={condition.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
                <p className="font-medium">{condition.category.replaceAll('_', ' ').toLowerCase()} · {condition.severity.toLowerCase()} · {condition.status.toLowerCase()}</p>
                <p className="text-xs text-stone-600">Observed {fmtDate(condition.observedAt, timezone)}</p>
                {condition.notes && <p className="mt-1 whitespace-pre-wrap text-stone-700">{condition.notes}</p>}
              </div>
            )
          ))}
        </div>
      )}

      {canUseGreenThumb && (
        <div className="mt-4">
          <GreenThumbAssist
            collectionSlug={collection.slug}
            plantInstanceId={id}
            photos={photos.map((photo) => ({ id: photo.id, caption: photo.caption }))}
            usedToday={greenThumbUsedToday}
          />
        </div>
      )}

      <div className="mt-4 space-y-2">
        <p className="text-sm font-semibold">Recent care history</p>
        {careEvents.length === 0 && <p className="text-sm text-stone-600">No care events logged yet.</p>}
        {careEvents.map((event) => {
          const isGreenThumb = event.eventType === 'GREEN_THUMB_NOTE'
          const metadata = careEventMetadata(event.metadata)
          const question = typeof metadata.question === 'string' ? metadata.question : ''
          const isBulkCare = metadata.source === 'BULK_CARE'
          return (
            <div
              key={event.id}
              className={
                isGreenThumb
                  ? 'rounded-lg border border-[#9fc29a] bg-[#eef8e9]/80 p-3 text-sm'
                  : 'rounded-lg border border-stone-200 bg-white/60 p-3 text-sm'
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={isGreenThumb ? 'font-bold text-[#255537]' : 'font-medium'}>
                    {careEventLabel(event.eventType)} · {fmtDate(event.performedAt, timezone)}
                  </p>
                  {question && <p className="mt-1 text-xs font-medium text-stone-600">Q: {question}</p>}
                  {isBulkCare && <p className="mt-1 text-xs font-medium text-stone-600">Recorded via bulk care batch.</p>}
                </div>
                {isGreenThumb && canEditRecords && (
                  <form action={deleteGreenThumbCareNote}>
                    <input type="hidden" name="id" value={event.id} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                    <ConfirmDeleteButton
                      className="border border-[#9a3f35] bg-white/70 px-2 py-1 text-xs text-[#9a3f35] hover:bg-red-50"
                      title="Delete Green Thumb care note?"
                      message="This removes the AI care response from this specimen's care history."
                      confirmLabel="Delete note"
                    >
                      Delete
                    </ConfirmDeleteButton>
                  </form>
                )}
              </div>
              {event.notes && <p className="mt-1 whitespace-pre-wrap text-stone-700">{event.notes}</p>}
            </div>
          )
        })}
      </div>
    </Card>
  )

  const transferCard = canEditRecords && i.status === 'ACTIVE' ? (
    <Card>
      <h3 className="font-bold">Transfer</h3>
      <p className="mt-1 text-sm text-stone-600">
        Queue this specimen package for another connected collection to review. The source plant is archived only after the receiver accepts it.
      </p>
      {activeTransferConnections.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">
          No active outgoing transfer connections yet. Collection managers can request one from{' '}
          <Link className="underline" href={collectionPath(collection.slug, '/transfers')}>Collection Transfers</Link>.
        </p>
      ) : (
        <form action={createPlantTransferRequest} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <input type="hidden" name="sourcePlantInstanceId" value={id} />
          <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
          <Select label="Target collection" name="connectionId" required>
            {activeTransferConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.targetCollection.name}</option>
            ))}
          </Select>
          <TextArea label="Sender note" name="senderNote" />
          <Button>Request transfer</Button>
        </form>
      )}
    </Card>
  ) : null

  const quarantineCard = (
    <Card id="quarantine">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">Quarantine</h3>
          <p className="text-sm text-stone-600">Quarantine records are manual workflow records; moving a plant does not start or release quarantine by itself.</p>
        </div>
        {activeQuarantine && (
          <span className="rounded-full border border-[#c9a15b] bg-[#fff2cf] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#6f4b12]">
            Active quarantine
          </span>
        )}
      </div>

      {activeQuarantine ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
            <p><span className="font-semibold">Reason:</span> {activeQuarantine.reason}</p>
            <p><span className="font-semibold">Risk:</span> {activeQuarantine.riskLevel}</p>
            <p><span className="font-semibold">Started:</span> {fmtDate(activeQuarantine.startDate, timezone)}</p>
            <p>
              <span className="font-semibold">Target release:</span> {fmtDate(activeQuarantine.targetReleaseDate, timezone)}
              {quarantineDayDelta != null && (
                <span className={quarantineDayDelta < 0 ? 'ml-2 font-semibold text-[#9a3f35]' : 'ml-2 text-stone-600'}>
                  {quarantineDayDelta < 0 ? `${Math.abs(quarantineDayDelta)} day${Math.abs(quarantineDayDelta) === 1 ? '' : 's'} overdue` : `${quarantineDayDelta} day${quarantineDayDelta === 1 ? '' : 's'} remaining`}
                </span>
              )}
            </p>
            <p><span className="font-semibold">Location:</span> {activeQuarantine.quarantineLocation ? `${activeQuarantine.quarantineLocation.code} · ${activeQuarantine.quarantineLocation.name}` : i.currentLocation ? `${i.currentLocation.code} · ${i.currentLocation.name}` : 'Not set'}</p>
            {activeQuarantine.notes && <p className="mt-2 whitespace-pre-wrap text-stone-700">{activeQuarantine.notes}</p>}
          </div>

          {canEditRecords && (
            <form action={updatePlantQuarantine} className="grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
              <input type="hidden" name="id" value={activeQuarantine.id} />
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#quarantine`)} />
              <Field label="Reason" name="reason" defaultValue={activeQuarantine.reason} required />
              <Select label="Risk level" name="riskLevel" defaultValue={activeQuarantine.riskLevel}>
                {['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH'].map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
              <Field label="Target release date" name="targetReleaseDate" type="date" defaultValue={dateInput(activeQuarantine.targetReleaseDate, timezone)} required />
              <TextArea label="Notes" name="notes" defaultValue={activeQuarantine.notes} className="min-h-16" />
              <div className="grid gap-1 text-sm">
                <p className="font-medium">Checklist</p>
                {quarantineChecklistItems.map((label) => (
                  <label key={label} className="flex items-center gap-2">
                    <input type="checkbox" name="checklistItem" value={label} defaultChecked={quarantineChecklist.some((item) => item.label === label && item.done)} />
                    {label}
                  </label>
                ))}
              </div>
              <Button>Save quarantine</Button>
            </form>
          )}

          {canEditRecords && (
            <div className="grid gap-3 lg:col-span-2 md:grid-cols-2">
              <form action={releasePlantQuarantine} className="grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
                <input type="hidden" name="id" value={activeQuarantine.id} />
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#quarantine`)} />
                {quarantineChecklistItems.map((label) => (
                  <input key={label} type="hidden" name="checklistItem" value={quarantineChecklist.some((item) => item.label === label && item.done) ? label : ''} />
                ))}
                <TextArea label="Release note" name="notes" className="min-h-16" />
                <Button>Mark released</Button>
              </form>
              <form action={cancelPlantQuarantine} className="grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
                <input type="hidden" name="id" value={activeQuarantine.id} />
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#quarantine`)} />
                {quarantineChecklistItems.map((label) => (
                  <input key={label} type="hidden" name="checklistItem" value={quarantineChecklist.some((item) => item.label === label && item.done) ? label : ''} />
                ))}
                <TextArea label="Cancel note" name="notes" className="min-h-16" />
                <Button className="bg-[#9a3f35] hover:bg-[#7d3028]">Cancel quarantine</Button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {isInQuarantineLocation && (
            <p className="mb-3 rounded-lg border border-[#c9a15b] bg-[#fff8e4] p-3 text-sm text-[#6f4b12]">
              This plant is in a quarantine-type location. Start a quarantine workflow record when you are ready.
            </p>
          )}
          {canEditRecords ? (
            <form action={startPlantQuarantine} className="grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3 md:grid-cols-2">
              <input type="hidden" name="plantInstanceId" value={id} />
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#quarantine`)} />
              <input type="hidden" name="quarantineLocationId" value={i.currentLocationId || ''} />
              <Field label="Reason" name="reason" required placeholder="New arrival isolation, pest concern, treatment follow-up..." />
              <Select label="Risk level" name="riskLevel" defaultValue="UNKNOWN">
                {['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH'].map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
              <Field label="Start date" name="startDate" type="date" defaultValue={dateInput(new Date(), timezone)} />
              <Field label="Target release date" name="targetReleaseDate" type="date" defaultValue={dateInput(addCalendarDays(new Date(), 14, timezone || undefined), timezone)} required />
              <TextArea label="Notes" name="notes" wrapperClassName="md:col-span-2" className="min-h-16" />
              <Button className="justify-self-start md:col-span-2">Start quarantine</Button>
            </form>
          ) : (
            <p className="text-sm text-stone-600">No active quarantine record.</p>
          )}
        </div>
      )}

      {quarantineHistory.length > 0 && (
        <div className="mt-4 border-t border-stone-200 pt-3 text-sm">
          <p className="font-semibold">Recent quarantine history</p>
          <div className="mt-2 grid gap-2">
            {quarantineHistory.map((entry) => (
              <p key={entry.id} className="rounded-md border border-stone-200 bg-white/60 p-2">
                {entry.status.toLowerCase()} · {fmtDate(entry.updatedAt, timezone)} · {entry.reason}
              </p>
            ))}
          </div>
        </div>
      )}
    </Card>
  )

  const archiveCard = (canEditRecords || i.status !== 'ACTIVE') ? (
    <Card>
      <h3 className="font-bold">Archive</h3>
      {canEditRecords && i.status === 'ACTIVE' ? (
        <form action={archivePlantInstance} className="grid max-w-2xl gap-2">
          <input type="hidden" name="id" value={id} />
          <Field label="Reason" help="Short reason this plant left active collection, such as sold, discarded, died, duplicate, or gifted." name="archiveReason" />
          <TextArea label="Notes" help="Optional archive context, including date details, condition, recipient, or follow-up notes." name="archiveNotes" />
          <Button>Archive plant</Button>
        </form>
      ) : (
        <p>
          {i.archiveReason} on {fmtDate(i.archiveDate, timezone)}
        </p>
      )}
    </Card>
  ) : null

  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-bold">{i.plantId}</h2>
            {activeQuarantine && (
              <span className="rounded-full border border-[#c9a15b] bg-[#fff2cf] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#6f4b12]">
                Quarantine
              </span>
            )}
            {canRegeneratePlantId && (
              <form action={regeneratePlantInstanceId}>
                <input type="hidden" name="collectionSlug" value={collection.slug} />
                <input type="hidden" name="id" value={i.id} />
                <input type="hidden" name="proposedPlantId" value={expectedPlantId} />
                <ConfirmDeleteButton
                  title="Regenerate plant ID?"
                  message={`Change this plant ID from ${i.plantId} to ${expectedPlantId}? Existing links will continue to point to this same record, but printed labels using the old ID should be replaced.`}
                  confirmLabel="Regenerate ID"
                  pendingLabel={<><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /><span className="sr-only">Regenerating plant ID</span></>}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#c7d8bd] bg-[#f5fbf0] p-0 text-[#2f6b45] shadow-sm hover:bg-[#e6f0db]"
                  confirmClassName="bg-[#2f6b45] hover:bg-[#245737]"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Regenerate plant ID</span>
                </ConfirmDeleteButton>
              </form>
            )}
          </div>
          <p>{plantName(i.plantDefinition)}</p>
          <div className="mt-3">
            <SunshineButton
              collectionSlug={collection.slug}
              targetId={id}
              count={detailSunshineCount}
              active={currentUserSunshine.has(sunshineKey('PLANT_INSTANCE', id))}
              canToggle={Boolean(user)}
            />
          </div>
        </div>
        <img src={qr} className="h-28 w-28" alt="QR code" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
        <Card>
          <h3 className="font-bold">Identity</h3>
          <p className="font-medium">{plantName(i.plantDefinition)}</p>
          <p>Confidence: {taxonomyLabel(i.plantDefinition.confidence)}</p>
          <p>Acquired as: {i.plantDefinition.acquisitionLabel || '—'}</p>
          <p>Provisional taxon: {i.plantDefinition.provisionalTaxon || '—'}</p>
          <p>Author citation: {i.plantDefinition.authority || '—'}</p>
          {(i.plantDefinition.wikipediaUrl || i.plantDefinition.inaturalistUrl || i.plantDefinition.powoUrl || i.plantDefinition.gbifUrl) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {i.plantDefinition.wikipediaUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.wikipediaUrl}>Wikipedia</a>}
              {i.plantDefinition.inaturalistUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.inaturalistUrl}>iNaturalist</a>}
              {i.plantDefinition.powoUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.powoUrl}>POWO</a>}
              {i.plantDefinition.gbifUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={i.plantDefinition.gbifUrl}>GBIF</a>}
            </div>
          )}
          <p>Status: {i.status}</p>
          <p>Type: {i.instanceType}</p>
          <p>Location: {i.currentLocation ? `${i.currentLocation.code} · ${i.currentLocation.name}` : i.location || '—'}</p>
          <p>Acquired: {fmtDate(i.acquisitionDate, timezone)}</p>
          <p>Propagated: {fmtDate(i.propagationDate, timezone)}</p>
          <p>Source: {i.source || '—'}</p>
          <p>Stock: {i.stockNumber || '—'}</p>
          <Link className="mt-3 inline-block underline" href={collectionPath(collection.slug, `/graphs?root=${i.id}`)}>
            View lineage graph
          </Link>
          {i.plantDefinition.aliases.length > 0 && (
            <div className="mt-3 border-t border-stone-200 pt-3 text-sm">
              <p className="font-medium">Aliases</p>
              {i.plantDefinition.aliases.map((alias) => (
                <p key={alias.id}>
                  {alias.name} · {taxonomyLabel(alias.aliasType)} · {taxonomyLabel(alias.confidence)}
                </p>
              ))}
            </div>
          )}
        </Card>

        {photosCard}

        <div className="xl:col-span-2">
          <PlantHealthTimeline events={timelineEvents} metrics={timelineMetrics} timezone={timezone} collectionSlug={collection.slug} />
        </div>

        <div className="xl:col-span-2">{quarantineCard}</div>

        <div className="xl:col-span-2">{careCard}</div>

        <Card id="husbandry" className="xl:order-4">
          <h3 className="font-bold">Husbandry</h3>
          {baseHusbandryGuide ? (
            <>
              <p className="mt-1 text-sm text-stone-600">
                {sourceHusbandryGuide ? `Inherited from ${plantName(sourceHusbandryGuide.plantDefinition)}.` : 'Inherited from this plant definition.'}
                {i.husbandryOverride && hasHusbandryData(i.husbandryOverride as any) ? ' Local adjustments are applied.' : ''}
              </p>
              <HusbandryBadges values={effectiveHusbandry} />
              {effectiveHusbandry.summaryCare && <p className="mt-2 text-sm text-stone-700">{effectiveHusbandry.summaryCare}</p>}
              <details className="group mt-4 rounded-lg border border-stone-200 bg-white/50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
                  <span>Full husbandry guide</span>
                  <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:hidden">Open</span>
                  <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs group-open:inline-block">Hide</span>
                </summary>
                <div className="border-t border-stone-200 p-3">
                  <HusbandryGuideView
                    values={effectiveHusbandry}
                    baseValues={baseHusbandryGuide as any}
                    overrideValues={i.husbandryOverride as any}
                    overrideAction={savePlantHusbandryOverrideField}
                    collectionSlug={collection.slug}
                    plantInstanceId={id}
                    canOverride={canCreateInCollection(user, context)}
                    title="Full husbandry guide"
                    sourceLabel={sourceHusbandryGuide ? `Inherited from ${plantName(sourceHusbandryGuide.plantDefinition)}` : 'Inherited from plant definition'}
                  />
                </div>
              </details>
            </>
          ) : (
            <p className="mt-1 text-sm text-stone-600">No plant husbandry guide has been added for this definition yet.</p>
          )}
        </Card>

        <Card className="xl:order-3">
          <h3 className="font-bold">Sport / mutation</h3>
          <p>Status: {i.sportStatus}</p>
          <p className="text-sm text-stone-700">{i.sportDescription || 'No sport observations yet.'}</p>
          {canCreateInCollection(user, context) && i.sportStatus === 'NONE' && (
            <form action={markSportCandidate} className="mt-4 grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
              <input type="hidden" name="id" value={id} />
              <TextArea label="Why do you suspect this is a sport?" help="Describe the visible difference you are tracking, such as flower color, leaf variegation, growth habit, or another trait that may propagate true." name="observation" />
              <Button>Mark suspected sport</Button>
            </form>
          )}
          {i.sportStatus !== 'NONE' && (
            <div className="mt-4 border-t border-stone-200 pt-3 text-sm">
              <p className="font-medium">Workflow</p>
              <p>
                {i.sportStatus === 'REVERTED'
                  ? 'This plant is marked reverted, so future propagations from it will not inherit sport candidate status.'
                  : 'Propagations from this plant will enter Sport Review as candidate sports. Add true-to-type stability records there; three confirmed generations marks the line stable.'}
              </p>
              {canCreateInCollection(user, context) && !['REVERTED', 'REGISTERED'].includes(i.sportStatus) && (
                <form action={markSportReverted} className="mt-4 grid gap-2 rounded-lg border border-stone-200 bg-white/60 p-3">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                  <TextArea label="Why is this reverted?" help="Use when this branch appears to have returned to the original cultivar or no longer shows the suspected sport trait." name="observation" />
                  <Button>Mark reverted</Button>
                </form>
              )}
              {i.sportRecords.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium">Stability records</p>
                  {i.sportRecords.map((record) => (
                    <p key={record.id}>
                      Gen {record.generationNumber}: {record.propagatedTrue ? 'true' : 'not true'} · {fmtDate(record.propagationEvent.date, timezone)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="xl:order-1">
          <h3 className="font-bold">Parents</h3>
          {parentRelationships.length === 0 && <p className="text-sm text-neutral-600">No parent propagation recorded.</p>}
          <div className="mt-2 grid gap-2 text-sm">
            {parentRelationships.map((relationship) => (
              <div key={relationship.key} className="rounded-md border border-stone-200 bg-white/60 p-2">
                <PlantIdPreviewLink collectionSlug={collection.slug} plantId={relationship.plant.plantId} href={collectionPath(collection.slug, `/instances/${relationship.plant.id}`)}>
                  {relationship.plant.plantId}
                </PlantIdPreviewLink>
                <p className="text-xs text-stone-600">
                  {relationship.role.replaceAll('_', ' ').toLowerCase()} · {relationship.event.method} · {fmtDate(relationship.event.date, timezone)}
                </p>
                <p className="text-xs text-stone-700">{plantName(relationship.plant.plantDefinition)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:order-2">
          <h3 className="font-bold">Children</h3>
          {childRelationships.length === 0 && <p className="text-sm text-neutral-600">No child propagations yet.</p>}
          <div className="mt-2 grid gap-2 text-sm">
            {childRelationships.map((relationship) => (
              <div key={relationship.key} className="rounded-md border border-stone-200 bg-white/60 p-2">
                <PlantIdPreviewLink collectionSlug={collection.slug} plantId={relationship.plant.plantId} href={collectionPath(collection.slug, `/instances/${relationship.plant.id}`)}>
                  {relationship.plant.plantId}
                </PlantIdPreviewLink>
                <p className="text-xs text-stone-600">
                  {relationship.event.method} · {fmtDate(relationship.event.date, timezone)}
                </p>
                <p className="text-xs text-stone-700">{plantName(relationship.plant.plantDefinition)}</p>
              </div>
            ))}
          </div>
        </Card>

        {followCard}

        {transferCard}

        <Card className="xl:order-4">
          <h3 className="font-bold">Add note</h3>
          {canCreateInCollection(user, context) && <form action={addNote} className="grid gap-2">
            <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
            <input type="hidden" name="entityId" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
            <TextArea label="Note" name="note" />
            <Button>Add note</Button>
          </form>}

          {notes.map((n) => (
            <p className="mt-3 border-t pt-3 text-sm" key={n.id}>
              {formatDateTime(n.createdAt, timezone)}
              <br />
              {n.note}
            </p>
          ))}
        </Card>

        <Card className="xl:order-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">Reminders</h3>
              <p className="text-sm text-stone-600">Send yourself plant check-in emails tied to this specimen.</p>
            </div>
            <Link className="text-sm font-medium underline" href={collectionPath(collection.slug, '/reminders')}>All reminders</Link>
          </div>

          {user ? (
            <form action={createReminder} className="mt-4 grid gap-2 rounded-xl border border-stone-200 bg-white/60 p-3">
              <input type="hidden" name="entityType" value="PLANT_INSTANCE" />
              <input type="hidden" name="entityId" value={id} />
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
              <Field label="Title" name="title" defaultValue={`Check ${i.plantId}`} required />
              <Field label="Send at" help="The first date and time AxilDB should email this reminder." name="dueAt" type="datetime-local" required />
              <Select label="Category" name="category" defaultValue="PLANT_CHECK_IN">
                {reminderCategories.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <Select label="Repeat" name="rrule" defaultValue="">
                {reminderRecurrences.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <TextArea label="Notes" name="body" />
              <Button>Create reminder</Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-stone-600">Sign in to schedule reminders.</p>
          )}

          <div className="mt-4 space-y-3">
            {instanceReminders.length === 0 && <p className="text-sm text-stone-600">No reminders for this plant yet.</p>}
            {instanceReminders.map((reminder) => (
              <div key={reminder.id} className="rounded-lg border border-stone-200 bg-white/60 p-3 text-sm">
                <p className="font-medium">{reminder.title}</p>
                <p className="text-stone-600">
                  {reminderCategoryLabel(reminder.category)} · Due {fmtDate(reminder.nextSendAt || reminder.dueAt, timezone)} · {recurrenceLabel(reminder.rrule)}
                </p>
                {reminder.body && <p className="mt-1 whitespace-pre-wrap text-stone-700">{reminder.body}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!reminder.completedAt && !reminder.pausedAt && (
                    <>
                      <form action={completeReminder}>
                        <input type="hidden" name="id" value={reminder.id} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                        <Button className="px-3 py-1.5 text-xs">Complete</Button>
                      </form>
                      <form action={pauseReminder}>
                        <input type="hidden" name="id" value={reminder.id} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                        <Button className="border border-stone-300 bg-white/70 px-3 py-1.5 text-xs text-stone-800 hover:bg-white">Pause</Button>
                      </form>
                    </>
                  )}
                  <form action={deleteReminder}>
                    <input type="hidden" name="id" value={reminder.id} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                    <ConfirmDeleteButton
                      className="px-3 py-1.5 text-xs"
                      title="Delete reminder?"
                      message="This deletes the reminder and its delivery history."
                      confirmLabel="Delete reminder"
                    >
                      Delete
                    </ConfirmDeleteButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:order-2 xl:col-span-2">
          <h3 className="font-bold">Bloom tracker</h3>
          <p className="mb-4 text-sm text-neutral-600">
            Open a bloom when it starts, mark peak later, then close it when finished. Photos can be added to the bloom event at any stage.
          </p>

          {canCreateInCollection(user, context) && <form action={openBloomEvent} className="grid gap-2 rounded-xl border p-4">
            <input type="hidden" name="plantInstanceId" value={id} />
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <Field label="Bloom start" help="The date the bloom event began, usually when the first flower opened or the bud clearly started opening." name="bloomStartDate" type="date" required />
            <label className="text-sm">
              <input type="checkbox" name="firstBloom" /> First bloom
            </label>
            <TextArea label="Opening notes" name="notes" />
            <Button>Open bloom event</Button>
          </form>}

          <div className="mt-6 space-y-4">
            {i.blooms.length === 0 && (
              <p className="text-sm text-neutral-600">No bloom events recorded yet.</p>
            )}

            {i.blooms.map((b) => {
              const status = b.bloomEndDate
                ? 'Closed'
                : b.peakBloomDate
                  ? 'Peaked / open'
                  : 'Open'

              return (
                <div key={b.id} id={`bloom-${b.id}`} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">Bloom started {fmtDate(b.bloomStartDate, timezone)}</p>
                      <p className="text-sm text-neutral-600">Status: {status}</p>
                    </div>
                  </div>

                  <p className="text-sm">
                    Peak: {fmtDate(b.peakBloomDate, timezone)} · End: {fmtDate(b.bloomEndDate, timezone)} · Flowers:{' '}
                    {b.flowerCount || '—'}
                  </p>

                  {b.firstBloom && <p className="mt-2 text-sm font-medium">First bloom</p>}
                  {b.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{b.notes}</p>}

                  {canEditInCollection(user, context) && !b.peakBloomDate && (
                    <form action={updateBloomPeak} className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="plantInstanceId" value={id} />
                      <Field label="Peak bloom date" help="The date the bloom looked its fullest or most representative." name="peakBloomDate" type="date" required />
                      <Field label="Flower count" help="Approximate number of open flowers at peak bloom." name="flowerCount" type="number" />
                      <TextArea label="Peak notes" name="notes" defaultValue={b.notes || ''} />
                      <Button>Mark peak bloom</Button>
                    </form>
                  )}

                  {canEditInCollection(user, context) && !b.bloomEndDate && (
                    <form action={closeBloomEvent} className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="plantInstanceId" value={id} />
                      <Field label="Bloom end date" help="The date the bloom event was finished or no longer useful to track as open." name="bloomEndDate" type="date" required />
                      <TextArea label="Closing notes" name="notes" defaultValue={b.notes || ''} />
                      <Button>Close bloom event</Button>
                    </form>
                  )}

                  {canCreateInCollection(user, context) && <form
                    action="/api/photos"
                    method="post"
                    encType="multipart/form-data"
                    className="mt-4 grid gap-2 rounded-xl bg-neutral-50 p-3"
                  >
                    <input type="hidden" name="entityType" value="BLOOM_EVENT" />
                    <input type="hidden" name="entityId" value={b.id} />
                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}`)} />
                    <PhotoFramingEditor fileInputName="photo" />
                    <Field label="Caption" name="caption" />
                    <Button>Add bloom photo</Button>
                  </form>}

                  {user && (
                    <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                      <p className="mb-2 text-sm font-medium">Bloom reminders</p>
                      <form action={createReminder} className="grid gap-2">
                        <input type="hidden" name="entityType" value="BLOOM_EVENT" />
                        <input type="hidden" name="entityId" value={b.id} />
                        <input type="hidden" name="category" value="BLOOM_CYCLE" />
                        <input type="hidden" name="collectionSlug" value={collection.slug} />
                        <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#bloom-${b.id}`)} />
                        <Field label="Title" name="title" defaultValue={`Follow up on bloom for ${i.plantId}`} required />
                        <Field label="Send at" help="Useful for checking peak bloom, closure, or photo follow-up." name="dueAt" type="datetime-local" required />
                        <Select label="Repeat" name="rrule" defaultValue="">
                          {reminderRecurrences.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </Select>
                        <TextArea label="Notes" name="body" />
                        <Button>Create bloom reminder</Button>
                      </form>

                      {(remindersByBloomId[b.id] || []).length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
                          {(remindersByBloomId[b.id] || []).map((reminder) => (
                            <div key={reminder.id} className="text-sm">
                              <p className="font-medium">{reminder.title}</p>
                              <p className="text-stone-600">
                                Due {fmtDate(reminder.nextSendAt || reminder.dueAt, timezone)} · {recurrenceLabel(reminder.rrule)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {(photosByBloomId[b.id] || []).length > 0 && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {(photosByBloomId[b.id] || []).map((p) => (
                        <figure key={p.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white/70">
                          <div className="aspect-[4/3] overflow-hidden">
                            <PlantImage src={p} alt={p.caption || 'Bloom photo'} />
                          </div>
                          <figcaption className="space-y-2 p-2 text-xs">
                            <p>{p.caption || 'Untitled bloom photo'}</p>
                            {canEditInCollection(user, context) && (
                              <>
                                <details className="group rounded-lg border border-stone-200 bg-white/60">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 font-medium">
                                    <span>Edit caption</span>
                                    <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:hidden">Open</span>
                                    <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:inline-block">Hide</span>
                                  </summary>
                                  <form action={updatePhotoCaption} className="grid gap-2 border-t border-stone-200 p-2">
                                    <input type="hidden" name="id" value={p.id} />
                                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#bloom-${b.id}`)} />
                                    <input className="rounded-md border border-stone-300 bg-[#fffdf7] px-2 py-1.5 text-xs shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30" name="caption" defaultValue={p.caption || ''} placeholder="Photo caption" />
                                    <Button className="px-2 py-1 text-xs">Save caption</Button>
                                  </form>
                                </details>
                                <details className="group rounded-lg border border-stone-200 bg-white/60">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 font-medium">
                                    <span>Edit framing</span>
                                    <span className="rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:hidden">Open</span>
                                    <span className="hidden rounded-md border border-stone-300 bg-white/70 px-2 py-0.5 text-[0.68rem] group-open:inline-block">Hide</span>
                                  </summary>
                                  <form action={updatePhotoFraming} className="grid gap-2 border-t border-stone-200 p-2">
                                    <input type="hidden" name="id" value={p.id} />
                                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#bloom-${b.id}`)} />
                                    <PhotoFramingEditor src={p.path} initial={p} />
                                    <Button className="px-2 py-1 text-xs">Save framing</Button>
                                  </form>
                                </details>
                                {canManageRecords && (
                                  <form action={deletePhoto}>
                                    <input type="hidden" name="id" value={p.id} />
                                    <input type="hidden" name="collectionSlug" value={collection.slug} />
                                    <input type="hidden" name="back" value={collectionPath(collection.slug, `/instances/${id}#bloom-${b.id}`)} />
                                    <ConfirmDeleteButton
                                      className="bg-[#9a3f35] px-2 py-1 text-xs hover:bg-[#7d3028]"
                                      title="Delete bloom photo?"
                                      message="This will permanently delete this bloom photo and any related sunshine or moderation review records."
                                      confirmLabel="Delete photo"
                                    >
                                      Delete photo
                                    </ConfirmDeleteButton>
                                  </form>
                                )}
                              </>
                            )}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {archiveCard}
    </div>
  )
}
