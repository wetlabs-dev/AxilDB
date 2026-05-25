import { createHash, randomBytes } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { collectionPath } from '@/lib/collections'
import { careTaskLabel, type CareQueueItem } from '@/lib/care-queue'
import { husbandrySections, type HusbandryFieldName } from '@/lib/husbandry'
import { plantName } from '@/lib/utils'

export const careSheetModes = ['CARE_SHEET', 'WEEKLY_CHECKLIST', 'SITTER_SESSION'] as const
export const careSheetStatuses = ['DRAFT', 'ACTIVE', 'EXPIRED', 'REVOKED'] as const

export type CareSheetMode = (typeof careSheetModes)[number]
export type CareSheetStatus = (typeof careSheetStatuses)[number]

export const careSheetSectionOptions = husbandrySections.map((section) => ({
  key: section.key,
  title: section.title,
  fields: section.fields,
}))

export type CareSheetSectionKey = (typeof careSheetSectionOptions)[number]['key']

export const careSheetPlantInclude = {
  plantDefinition: {
    include: {
      aliases: true,
      governingBody: true,
      husbandryGuide: true,
    },
  },
  husbandryOverride: true,
} as const

export function generateCareSheetToken() {
  return randomBytes(24).toString('base64url')
}

export function hashCareSheetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function selectedCareSheetSections(fd: FormData) {
  const selected = fd.getAll('section').map((value) => String(value))
  if (selected.length === 0) return careSheetSectionOptions.map((section) => section.key)
  return careSheetSectionOptions
    .map((section) => section.key)
    .filter((key) => selected.includes(key))
}

export function careSheetSettingsFromForm(fd: FormData) {
  const taskTypes = fd.getAll('taskType').map((value) => String(value))
  const locations = fd.getAll('location').map((value) => String(value)).filter(Boolean)
  return {
    customInstructions: String(fd.get('customInstructions') || '').trim() || null,
    emergencyContact: String(fd.get('emergencyContact') || '').trim() || null,
    allowNotes: fd.get('allowNotes') === 'on',
    allowTaskCompletion: fd.get('allowTaskCompletion') !== 'off',
    taskTypes,
    locations,
  }
}

export function dateFromForm(fd: FormData, key: string) {
  const value = String(fd.get(key) || '').trim()
  return value ? new Date(value) : null
}

export function normalizeCareSheetMode(value: string | null | undefined): CareSheetMode {
  return careSheetModes.includes(value as CareSheetMode) ? (value as CareSheetMode) : 'CARE_SHEET'
}

export function careSheetStatusLabel(status: string) {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'EXPIRED') return 'Expired'
  if (status === 'REVOKED') return 'Revoked'
  return 'Draft'
}

export function careSheetModeLabel(mode: string) {
  if (mode === 'WEEKLY_CHECKLIST') return 'Weekly checklist'
  if (mode === 'SITTER_SESSION') return 'Sitter plan'
  return 'Care sheet'
}

export function isCareSheetPubliclyUsable(sheet: { status: string; startsAt: Date | null; expiresAt: Date | null }) {
  const now = new Date()
  if (sheet.status !== 'ACTIVE') return false
  if (sheet.startsAt && sheet.startsAt > now) return false
  if (sheet.expiresAt && sheet.expiresAt < now) return false
  return true
}

export async function resolveCareSheetToken(prisma: PrismaClient, token: string) {
  const tokenHash = hashCareSheetToken(token)
  const sheet = await prisma.careSheet.findUnique({
    where: { publicTokenHash: tokenHash },
    include: {
      collection: true,
      plants: {
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        include: {
          plantInstance: {
            include: careSheetPlantInclude,
          },
        },
      },
      tasks: {
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: {
          plantInstance: {
            include: careSheetPlantInclude,
          },
        },
      },
    },
  })
  return sheet ? attachCareSheetPhotos(prisma, sheet) : null
}

export async function attachCareSheetPhotos(prisma: PrismaClient, sheet: any) {
  const instanceIds = new Set<string>()
  const sourceDefinitionIds = new Set<string>()
  for (const entry of sheet.plants || []) {
    if (entry.plantInstance?.id) instanceIds.add(entry.plantInstance.id)
    const sourceId = entry.plantInstance?.plantDefinition?.husbandryGuide?.sourcePlantDefinitionId
    if (sourceId) sourceDefinitionIds.add(sourceId)
  }
  for (const task of sheet.tasks || []) {
    if (task.plantInstance?.id) instanceIds.add(task.plantInstance.id)
    const sourceId = task.plantInstance?.plantDefinition?.husbandryGuide?.sourcePlantDefinitionId
    if (sourceId) sourceDefinitionIds.add(sourceId)
  }

  const photos = instanceIds.size
    ? await prisma.photo.findMany({
        where: {
          collectionId: sheet.collectionId,
          entityType: 'PLANT_INSTANCE',
          entityId: { in: Array.from(instanceIds) },
        },
        orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      })
    : []
  const grouped = photos.reduce<Record<string, typeof photos>>((acc, photo) => {
    acc[photo.entityId] ||= []
    acc[photo.entityId].push(photo)
    return acc
  }, {})

  const sourceGuides = sourceDefinitionIds.size
    ? await prisma.plantHusbandryGuide.findMany({
        where: {
          collectionId: sheet.collectionId,
          plantDefinitionId: { in: Array.from(sourceDefinitionIds) },
        },
      })
    : []
  const sourceGuideByDefinitionId = new Map(sourceGuides.map((guide) => [guide.plantDefinitionId, guide]))

  const hydrateInstance = (instance: any) => {
    if (!instance) return
    instance.photos = grouped[instance.id] || []
    const sourceId = instance.plantDefinition?.husbandryGuide?.sourcePlantDefinitionId
    const sourceGuide = sourceId ? sourceGuideByDefinitionId.get(sourceId) : null
    if (sourceGuide) instance.plantDefinition.resolvedHusbandryGuide = sourceGuide
  }

  for (const entry of sheet.plants || []) {
    hydrateInstance(entry.plantInstance)
  }
  for (const task of sheet.tasks || []) {
    hydrateInstance(task.plantInstance)
  }
  return sheet
}

export function publicCareSheetUrl(token: string) {
  return `/care-sheet/${encodeURIComponent(token)}`
}

export function sitterUrl(token: string) {
  return `/sitter/${encodeURIComponent(token)}`
}

export function careSheetInternalUrl(collectionSlug: string, id: string) {
  return collectionPath(collectionSlug, `/care-sheets/${id}`)
}

export function instanceDisplayName(instance: any) {
  return plantName(instance.plantDefinition)
}

export function instanceImage(instance: any) {
  const cover = instance.photos?.find((photo: any) => photo.isCover) || instance.photos?.[0]
  if (!cover?.path) return undefined
  return {
    path: cover.path,
    cropX: cover.cropX,
    cropY: cover.cropY,
    cropWidth: cover.cropWidth,
    cropHeight: cover.cropHeight,
    focalX: cover.focalX,
    focalY: cover.focalY,
  }
}

export function effectiveHusbandry(instance: any) {
  const guide = instance.plantDefinition?.resolvedHusbandryGuide || instance.plantDefinition?.husbandryGuide
  const override = instance.husbandryOverride
  const values: Record<string, string> = {}
  const overridden = new Set<string>()

  for (const section of husbandrySections) {
    for (const [name] of section.fields) {
      const overrideValue = override?.[name]
      const inheritedValue = guide?.[name]
      if (overrideValue) {
        values[name] = overrideValue
        if (inheritedValue && inheritedValue !== overrideValue) overridden.add(name)
      } else if (inheritedValue) {
        values[name] = inheritedValue
      }
    }
  }

  return { values, overridden }
}

export function sectionValuesForInstance(instance: any, selectedSections: string[]) {
  const { values, overridden } = effectiveHusbandry(instance)
  return husbandrySections
    .filter((section) => selectedSections.includes(section.key))
    .map((section) => ({
      ...section,
      fields: section.fields
        .map(([name, label, description]) => ({
          name,
          label,
          description,
          value: values[name],
          overridden: overridden.has(name),
        }))
        .filter((field) => field.value),
    }))
    .filter((section) => section.fields.length > 0)
}

export function taskSnapshotFromQueueItem(item: CareQueueItem) {
  return {
    plantInstanceId: item.plantInstanceId || null,
    taskType: item.taskType,
    title: item.plantId ? `${careTaskLabel(item.taskType)} ${item.plantId}` : item.title,
    reason: item.reason,
    dueAt: item.dueAt,
    status: item.completedAt ? 'COMPLETED' : 'PENDING',
    completedAt: item.completedAt || null,
    sourceCareQueueKey: item.key,
    sourceReminderId: item.reminderId || null,
  }
}

export function fieldsForSectionKey(key: string): HusbandryFieldName[] {
  return (careSheetSectionOptions.find((section) => section.key === key)?.fields || []).map((field) => field[0])
}
