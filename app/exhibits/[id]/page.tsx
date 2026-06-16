import Link from 'next/link'
import { CollectionExhibitAccessMode, CollectionExhibitStatus } from '@prisma/client'
import {
  publishCollectionExhibit,
  sendCollectionExhibitUpdate,
  unpublishCollectionExhibit,
  updateCollectionExhibit,
} from '@/app/exhibit-actions'
import { CollectionExhibitBuilder, type ExhibitBuilderPlant } from '@/components/exhibits/CollectionExhibitBuilder'
import { Button, Card, Field, Select, TextArea } from '@/components/ui'
import { canManageCollection, collectionPath, requireCollectionGardener } from '@/lib/collections'
import { collectExhibitDigestChanges } from '@/lib/exhibit-digests'
import {
  exhibitPlantCandidates,
  exhibitSettingLabels,
  normalizeExhibitSettings,
  normalizeExhibitUpdateSettings,
  publicExhibitPath,
  updateChangeLabels,
} from '@/lib/exhibits'
import { locationPathWithCodes } from '@/lib/locations'
import { prisma } from '@/lib/prisma'
import { sunshineCounts, sunshineKey } from '@/lib/sunshine'
import { dateInput, plantName } from '@/lib/utils'
import { formatDateTime } from '@/lib/time'

function Checkbox({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string
  label: string
  description?: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex gap-3 rounded-md border border-stone-200 bg-white/50 p-3 text-sm">
      <input className="mt-1 h-4 w-4" type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span>
        <span className="block font-semibold text-stone-900">{label}</span>
        {description && <span className="mt-1 block text-xs leading-5 text-stone-600">{description}</span>}
      </span>
    </label>
  )
}

export default async function EditCollectionExhibitPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCollectionGardener()
  const canManage = canManageCollection(context.user, context)
  const { id } = await params
  const [exhibit, candidates] = await Promise.all([
    prisma.collectionExhibit.findFirstOrThrow({
      where: { id, collectionId: context.collection.id },
      include: {
        coverPhoto: true,
        plants: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        subscribers: { orderBy: { createdAt: 'desc' } },
        updates: { include: { deliveries: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
    }),
    exhibitPlantCandidates(prisma, context.collection.id),
  ])
  const settings = normalizeExhibitSettings(exhibit.settingsJson)
  const updateSettings = normalizeExhibitUpdateSettings(exhibit.updateSettingsJson)
  const selectedPlantIds = exhibit.plants.map((plant) => plant.plantInstanceId)
  const locations = await prisma.location.findMany({
    where: { collectionId: context.collection.id },
    include: { locationType: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  const [coverPhotos, candidatePhotos, candidateSunshineCounts] = await Promise.all([
    prisma.photo.findMany({
      where: {
        collectionId: context.collection.id,
        nsfwFlagged: false,
        moderationStatus: { notIn: ['CENSORED', 'REMOVED'] },
        OR: [
          { entityType: 'COLLECTION', entityId: context.collection.id },
          ...(selectedPlantIds.length ? [{ entityType: 'PLANT_INSTANCE', entityId: { in: selectedPlantIds } }] : []),
          ...(candidates.length ? [{ entityType: 'PLANT_DEFINITION', entityId: { in: Array.from(new Set(candidates.map((plant) => plant.plantDefinitionId))) } }] : []),
        ],
      },
      orderBy: [{ isCover: 'desc' }, { isType: 'desc' }, { createdAt: 'desc' }],
      take: 80,
    }),
    candidates.length ? prisma.photo.findMany({
      where: {
        collectionId: context.collection.id,
        entityType: 'PLANT_INSTANCE',
        entityId: { in: candidates.map((plant) => plant.id) },
        nsfwFlagged: false,
        moderationStatus: { notIn: ['CENSORED', 'REMOVED'] },
        OR: [{ plantDetected: null }, { plantDetected: true }],
      },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      select: {
        entityId: true,
        path: true,
        moderationStatus: true,
        nsfwFlagged: true,
        cropX: true,
        cropY: true,
        cropWidth: true,
        cropHeight: true,
        focalX: true,
        focalY: true,
      },
    }) : [],
    sunshineCounts(prisma, context.collection.id, candidates.map((plant) => ({ targetType: 'PLANT_INSTANCE' as const, targetId: plant.id }))),
  ])
  const photoByPlant = new Map<string, typeof candidatePhotos[number]>()
  for (const photo of candidatePhotos) {
    if (!photoByPlant.has(photo.entityId)) photoByPlant.set(photo.entityId, photo)
  }
  const builderPlants: ExhibitBuilderPlant[] = candidates.map((plant) => {
    const acquisitionLabel = [plant.source, plant.distributor, plant.stockNumber].filter(Boolean).join(' · ') || null
    return {
      id: plant.id,
      plantId: plant.plantId,
      scientificName: plantName(plant.plantDefinition),
      cultivarName: plant.plantDefinition.cultivarName,
      acquisitionLabel,
      locationPath: plant.currentLocationId ? locationPathWithCodes(plant.currentLocationId, locations) : plant.legacyLocationText || plant.location || null,
      status: plant.status,
      createdAt: plant.createdAt.toISOString(),
      updatedAt: plant.updatedAt.toISOString(),
      acquisitionDate: plant.acquisitionDate?.toISOString() || plant.propagationDate?.toISOString() || null,
      plantDefinitionId: plant.plantDefinitionId,
      plantDefinitionLabel: plantName(plant.plantDefinition),
      sunshineCount: candidateSunshineCounts.get(sunshineKey('PLANT_INSTANCE', plant.id)) || 0,
      coverPhoto: photoByPlant.get(plant.id) || null,
    }
  })
  const exhibitSelections = exhibit.plants.map((plant) => ({
    plantInstanceId: plant.plantInstanceId,
    sortOrder: plant.sortOrder,
    featured: plant.featured,
    customCaption: plant.customCaption,
  }))
  const activeSubscribers = exhibit.subscribers.filter((subscriber) => subscriber.status === 'ACTIVE')
  const publicPath = publicExhibitPath(exhibit)
  const lastSentUpdate = exhibit.updates.find((update) => update.sentAt)
  const detectedChanges = canManage
    ? await collectExhibitDigestChanges(prisma, exhibit.id, lastSentUpdate?.sentAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date())
    : []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#2f6b45]">Collection exhibit</p>
          <h2 className="text-3xl font-bold">{exhibit.title}</h2>
          <p className="text-sm text-stone-600">
            {exhibit.status.toLowerCase()} · {exhibit.accessMode.toLowerCase()} · updated {formatDateTime(exhibit.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold" href={collectionPath(context.collection.slug, '/exhibits')}>
            All exhibits
          </Link>
          {exhibit.status === CollectionExhibitStatus.PUBLISHED && (
            <Link className="rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white" href={publicPath}>
              Public view
            </Link>
          )}
          {exhibit.status === CollectionExhibitStatus.PUBLISHED && (
            <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold" href={`/api/exhibits/${exhibit.slug}/pdf${exhibit.accessMode === CollectionExhibitAccessMode.UNLISTED && exhibit.token ? `?token=${encodeURIComponent(exhibit.token)}` : ''}`}>
              Download PDF
            </Link>
          )}
        </div>
      </div>

      <form action={updateCollectionExhibit} className="space-y-5">
        <input type="hidden" name="collectionSlug" value={context.collection.slug} />
        <input type="hidden" name="id" value={exhibit.id} />

        <Card className="space-y-4">
          <h3 className="font-serif text-2xl font-bold">Basics</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" name="title" required defaultValue={exhibit.title} wrapperClassName="md:col-span-2" />
            <TextArea label="Short description" name="description" defaultValue={exhibit.description || ''} wrapperClassName="md:col-span-2" />
            <Select label="Access mode" name="accessMode" defaultValue={exhibit.accessMode}>
              <option value={CollectionExhibitAccessMode.UNLISTED}>Unlisted link</option>
              <option value={CollectionExhibitAccessMode.PUBLIC}>Public</option>
            </Select>
            <Field label="Expires after" name="expiresAt" type="date" defaultValue={dateInput(exhibit.expiresAt)} />
            <Select label="Cover photo" name="coverPhotoId" defaultValue={exhibit.coverPhotoId || ''} wrapperClassName="md:col-span-2">
              <option value="">No cover photo</option>
              {coverPhotos.map((photo) => (
                <option key={photo.id} value={photo.id}>
                  {photo.caption || photo.filename || photo.id} · {photo.entityType.toLowerCase()}
                </option>
              ))}
            </Select>
            <TextArea label="Intro text" name="introMarkdown" defaultValue={exhibit.introMarkdown || ''} wrapperClassName="md:col-span-2" help="Plain text or light Markdown shown above the curated groups." />
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <h3 className="font-serif text-2xl font-bold">Visibility toggles</h3>
            <p className="text-sm text-stone-600">Sensitive notes, care notes, and condition details are off by default and only appear when enabled here.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {exhibitSettingLabels.map(([key, label, description]) => (
              <Checkbox key={key} name={key} label={label} description={description} defaultChecked={Boolean(settings[key])} />
            ))}
          </div>
          <Select label="Specimen image mode" name="imageMode" defaultValue={settings.imageMode}>
            <option value="cover">Cover photo only</option>
            <option value="recent">Recent photos</option>
            <option value="all">All public-safe photos</option>
            <option value="selected">Selected/cover photos</option>
          </Select>
        </Card>

        <Card>
          <CollectionExhibitBuilder
            collectionSlug={context.collection.slug}
            exhibitId={exhibit.id}
            plants={builderPlants}
            selections={exhibitSelections}
          />
        </Card>

        <Card className="space-y-4">
          <div>
            <h3 className="font-serif text-2xl font-bold">Update digest settings</h3>
            <p className="text-sm text-stone-600">Manual sends are available now. Daily and weekly digests are sent by the scheduled reminder worker when public-safe selected changes are detected.</p>
          </div>
          <Select label="Cadence" name="updateCadence" defaultValue={updateSettings.cadence}>
            <option value="manual">Manual only</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
            <option value="disabled">Disabled</option>
          </Select>
          <div className="grid gap-3 md:grid-cols-2">
            {updateChangeLabels.map(([key, label]) => (
              <Checkbox key={key} name={`update:${key}`} label={label} defaultChecked={Boolean(updateSettings.changes[key])} />
            ))}
          </div>
        </Card>

        <Button>Save exhibit</Button>
      </form>

      {canManage && (
        <Card className="space-y-4">
          <div>
            <h3 className="font-serif text-2xl font-bold">Publishing</h3>
            <p className="text-sm text-stone-600">Only collection managers and server admins can publish, unpublish, or send guest updates.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {exhibit.status !== CollectionExhibitStatus.PUBLISHED ? (
              <form action={publishCollectionExhibit}>
                <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                <input type="hidden" name="id" value={exhibit.id} />
                <Button>Publish exhibit</Button>
              </form>
            ) : (
              <form action={unpublishCollectionExhibit}>
                <input type="hidden" name="collectionSlug" value={context.collection.slug} />
                <input type="hidden" name="id" value={exhibit.id} />
                <Button className="bg-[#9a3f35] hover:bg-[#7d3028]">Unpublish exhibit</Button>
              </form>
            )}
            {exhibit.status === CollectionExhibitStatus.PUBLISHED && (
              <Link className="rounded-md border border-stone-300 bg-white/70 px-4 py-2 text-sm font-semibold" href={publicPath}>
                Open share link
              </Link>
            )}
          </div>
        </Card>
      )}

      {canManage && (
        <Card className="space-y-4">
          <div>
            <h3 className="font-serif text-2xl font-bold">Subscriber updates</h3>
            <p className="text-sm text-stone-600">{activeSubscribers.length} active subscribers · {exhibit.subscribers.length} total subscription records.</p>
          </div>
          {detectedChanges.length > 0 && (
            <div className="rounded-md border border-[#8fa58f]/35 bg-[#e8efdf]/60 p-3 text-sm">
              <p className="font-semibold text-[#2f6b45]">Detected changes since the last sent update</p>
              <div className="mt-2 grid gap-1 text-stone-700">
                {detectedChanges.slice(0, 8).map((change) => (
                  <p key={change.key}>{change.label}: {change.summary}</p>
                ))}
              </div>
            </div>
          )}
          <form action={sendCollectionExhibitUpdate} className="grid gap-3">
            <input type="hidden" name="collectionSlug" value={context.collection.slug} />
            <input type="hidden" name="id" value={exhibit.id} />
            <Field label="Update title" name="updateTitle" defaultValue={`Update from ${exhibit.title}`} />
            <TextArea label="Update summary" name="updateSummary" required />
            <label className="flex gap-3 rounded-md border border-stone-200 bg-white/50 p-3 text-sm">
              <input className="mt-1 h-4 w-4" type="checkbox" name="includeDetectedChanges" defaultChecked={detectedChanges.length > 0} />
              <span>
                <span className="block font-semibold text-stone-900">Include detected changes</span>
                <span className="mt-1 block text-xs leading-5 text-stone-600">Adds the public-safe detected change summary above to this manual update email.</span>
              </span>
            </label>
            <Button>Send manual update</Button>
          </form>
          {exhibit.subscribers.length > 0 && (
            <div className="overflow-auto rounded-md border border-stone-200">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[#f5f0e2] text-xs uppercase tracking-[0.14em] text-stone-500">
                  <tr>
                    <th className="p-3">Email</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Confirmed</th>
                    <th className="p-3">Unsubscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {exhibit.subscribers.map((subscriber) => (
                    <tr key={subscriber.id} className="border-t border-stone-200">
                      <td className="p-3 font-mono text-xs">{subscriber.email}</td>
                      <td className="p-3">{subscriber.status.toLowerCase()}</td>
                      <td className="p-3">{subscriber.confirmedAt ? formatDateTime(subscriber.confirmedAt) : '—'}</td>
                      <td className="p-3">{subscriber.unsubscribedAt ? formatDateTime(subscriber.unsubscribedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {exhibit.updates.length > 0 && (
            <div className="grid gap-2 border-t border-stone-200 pt-3 text-sm">
              {exhibit.updates.map((update) => (
                <p key={update.id} className="text-stone-700">
                  <span className="font-semibold">{update.title}</span> · {formatDateTime(update.createdAt)} · {update.deliveries.length} deliveries
                </p>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
