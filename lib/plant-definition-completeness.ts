import type { PrismaClient } from '@prisma/client'
import { environmentalHusbandryFields, husbandrySections } from '@/lib/husbandry'

export const PLANT_DEFINITION_COMPLETENESS_WEIGHTS = {
  taxonomy: 25,
  husbandry: 25,
  references: 10,
  images: 10,
  authority: 10,
  fertilizer: 7.5,
  substrate: 7.5,
  tags: 2.5,
  validation: 2.5,
} as const
export const UNUSABLE_REPRESENTATIVE_IMAGE_STATUSES: string[] = ['CENSORED', 'REMOVED']

export function isUsableRepresentativeImagePhoto(photo: { moderationStatus?: string | null; nsfwFlagged?: boolean | null }) {
  return !photo.nsfwFlagged && !UNUSABLE_REPRESENTATIVE_IMAGE_STATUSES.includes(photo.moderationStatus || '')
}

export type CompletenessCategoryKey = keyof typeof PLANT_DEFINITION_COMPLETENESS_WEIGHTS
export type CompletenessItemLevel = 'NEEDS_ATTENTION' | 'RECOMMENDED' | 'OPTIONAL'
export type CompletenessItemState = 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'INHERITED' | 'NOT_APPLICABLE'
export type PlantDefinitionReadinessStatus = 'COMPLETE' | 'MOSTLY_COMPLETE' | 'NEEDS_WORK' | 'SPARSE' | 'MINIMAL' | 'PROVISIONAL'

export type PlantDefinitionCompletenessItem = {
  key: string
  label: string
  state: CompletenessItemState
  level: CompletenessItemLevel
  detail?: string
  actionLabel?: string
  actionHash?: string
}

export type PlantDefinitionCompletenessCategory = {
  key: CompletenessCategoryKey
  label: string
  score: number
  weight: number
  completed: number
  applicable: number
  items: PlantDefinitionCompletenessItem[]
}

export type PlantDefinitionCompleteness = {
  plantDefinitionId: string
  overallScore: number
  status: PlantDefinitionReadinessStatus
  statusLabel: string
  provisional: boolean
  validationLabel: string
  categories: PlantDefinitionCompletenessCategory[]
  checklist: PlantDefinitionCompletenessItem[]
  criticalMissing: PlantDefinitionCompletenessItem[]
  recommendedNextActions: PlantDefinitionCompletenessItem[]
  missingCategoryKeys: CompletenessCategoryKey[]
  hasImage: boolean
  imageSource: 'DEFINITION_TYPE' | 'INSTANCE_FALLBACK' | 'NONE'
  computedAt: Date
}

type DefinitionRow = Awaited<ReturnType<typeof completenessDefinitions>>[number]
type GuideRow = Awaited<ReturnType<typeof completenessGuides>>[number]

const categoryLabels: Record<CompletenessCategoryKey, string> = {
  taxonomy: 'Taxonomy and naming',
  husbandry: 'Husbandry',
  references: 'References and description',
  images: 'Images',
  authority: 'Taxonomic Authority',
  fertilizer: 'Fertilizer',
  substrate: 'Substrate',
  tags: 'Plant Tags',
  validation: 'Review and validation',
}

function text(value: unknown) {
  return String(value || '').trim()
}

function hasValue(value: unknown) {
  return typeof value === 'number' || typeof value === 'boolean' || Boolean(text(value))
}

export function speciesReadiness(species: unknown, cultivarName: unknown, provisional: boolean) {
  if (text(species)) return { state: 'COMPLETE' as const, label: provisional ? 'Working species placement recorded' : 'Species recorded', detail: undefined }
  if (!provisional && text(cultivarName)) return {
    state: 'COMPLETE' as const,
    label: 'Species intentionally omitted for cultivar',
    detail: 'The accepted horticultural name is recorded at genus and cultivar level.',
  }
  return { state: 'MISSING' as const, label: provisional ? 'Working species placement recorded' : 'Species recorded', detail: undefined }
}

function item(
  key: string,
  label: string,
  state: CompletenessItemState,
  level: CompletenessItemLevel,
  options: Pick<PlantDefinitionCompletenessItem, 'detail' | 'actionLabel' | 'actionHash'> = {},
): PlantDefinitionCompletenessItem {
  return { key, label, state, level, ...options }
}

function category(key: CompletenessCategoryKey, score: number, items: PlantDefinitionCompletenessItem[]): PlantDefinitionCompletenessCategory {
  const applicable = items.filter((entry) => entry.state !== 'NOT_APPLICABLE').length
  const completed = items.filter((entry) => entry.state === 'COMPLETE' || entry.state === 'INHERITED').length
  return {
    key,
    label: categoryLabels[key],
    score: Math.max(0, Math.min(100, Math.round(score))),
    weight: PLANT_DEFINITION_COMPLETENESS_WEIGHTS[key],
    completed,
    applicable,
    items,
  }
}

export function readinessStatusForScore(score: number, provisional: boolean): Pick<PlantDefinitionCompleteness, 'status' | 'statusLabel'> {
  if (provisional) return { status: 'PROVISIONAL', statusLabel: 'Provisional' }
  if (score >= 90) return { status: 'COMPLETE', statusLabel: 'Complete' }
  if (score >= 75) return { status: 'MOSTLY_COMPLETE', statusLabel: 'Mostly complete' }
  if (score >= 50) return { status: 'NEEDS_WORK', statusLabel: 'Needs work' }
  if (score >= 25) return { status: 'SPARSE', statusLabel: 'Sparse' }
  return { status: 'MINIMAL', statusLabel: 'Minimal' }
}

export function weightedCompletenessScore(scores: Partial<Record<CompletenessCategoryKey, number>>) {
  return Math.max(0, Math.min(100, Math.round(
    Object.entries(PLANT_DEFINITION_COMPLETENESS_WEIGHTS).reduce((total, [key, weight]) => total + Math.max(0, Math.min(100, scores[key as CompletenessCategoryKey] ?? 0)) * weight / 100, 0),
  )))
}

function sectionValues(guide: GuideRow, sectionKey: string) {
  const section = husbandrySections.find((candidate) => candidate.key === sectionKey)
  const values: unknown[] = section?.fields.map(([field]) => guide[field as keyof GuideRow]) || []
  if (sectionKey === 'temperature') values.push(...environmentalHusbandryFields.filter((field) => field.toLowerCase().includes('temperature')).map((field) => guide[field as keyof GuideRow]))
  if (sectionKey === 'humidity') values.push(...environmentalHusbandryFields.filter((field) => field.toLowerCase().includes('humidity')).map((field) => guide[field as keyof GuideRow]))
  if (sectionKey === 'light') values.push(...environmentalHusbandryFields.filter((field) => field.toLowerCase().includes('light') || field.toLowerCase().includes('photoperiod')).map((field) => guide[field as keyof GuideRow]))
  return values
}

function effectiveGuide(definitionId: string, guides: Map<string, GuideRow>) {
  let guide = guides.get(definitionId)
  const visited = new Set<string>()
  let inherited = false
  while (guide?.sourcePlantDefinitionId && !visited.has(guide.sourcePlantDefinitionId)) {
    visited.add(guide.sourcePlantDefinitionId)
    const source = guides.get(guide.sourcePlantDefinitionId)
    if (!source) break
    guide = source
    inherited = true
  }
  return { guide, inherited }
}

function noFertilizerRecommended(guide?: GuideRow) {
  if (!guide) return false
  const guidance = [guide.fertilizationType, guide.fertilizationFrequency, guide.fertilizationSeasonalSchedule, guide.summaryCare].map(text).join(' ').toLowerCase()
  return /\b(no fertilizer|do not fertili[sz]e|unfertili[sz]ed|fertilizer not recommended|not applicable)\b/.test(guidance)
}

function completenessDefinitions(prisma: PrismaClient, where: { collectionId?: string | null; ids?: string[] }) {
  return prisma.plantDefinition.findMany({
    where: {
      ...(where.collectionId !== undefined ? { collectionId: where.collectionId } : {}),
      ...(where.ids ? { id: { in: where.ids } } : {}),
    },
    include: {
      aliases: { select: { id: true } },
      tags: { where: { plantTag: { active: true } }, select: { id: true } },
      taxonomicAuthority: { select: { id: true, name: true, website: true, registrationUrl: true, cultivarSearchUrl: true, externalAuthorityUrl: true } },
      validationCandidates: { where: { status: 'PENDING' }, select: { id: true } },
      disputes: { where: { status: 'PENDING' }, select: { id: true } },
      substrateRecommendations: {
        include: { recipeVersion: { select: { id: true, status: true, recipe: { select: { archivedAt: true } } } } },
        orderBy: { rank: 'asc' },
      },
      instances: { select: { id: true } },
    },
  })
}

function completenessGuides(prisma: PrismaClient, collectionId: string | null | undefined, definitionIds: string[]) {
  return prisma.plantHusbandryGuide.findMany({
    where: collectionId === null
      ? { OR: [{ plantDefinitionId: { in: definitionIds } }, { collectionId: null }] }
      : { OR: [{ plantDefinitionId: { in: definitionIds } }, { collectionId }] },
    include: { fertilizerRecipe: { select: { id: true, active: true, draft: true } } },
  })
}

export async function evaluatePlantDefinitionCompletenessBatch(
  prisma: PrismaClient,
  options: { collectionId?: string | null; definitionIds?: string[] },
) {
  const definitions = await completenessDefinitions(prisma, { collectionId: options.collectionId, ids: options.definitionIds })
  if (!definitions.length) return new Map<string, PlantDefinitionCompleteness>()
  const definitionIds = definitions.map((definition) => definition.id)
  const instanceIds = definitions.filter((definition) => definition.collectionId !== null).flatMap((definition) => definition.instances.map((instance) => instance.id))
  const collectionId = options.collectionId !== undefined ? options.collectionId : definitions[0].collectionId
  const [guides, definitionPhotos, instancePhotos] = await Promise.all([
    completenessGuides(prisma, collectionId, definitionIds),
    prisma.photo.findMany({
      where: { collectionId, entityType: 'PLANT_DEFINITION', entityId: { in: definitionIds }, isType: true, nsfwFlagged: false, moderationStatus: { notIn: UNUSABLE_REPRESENTATIVE_IMAGE_STATUSES } },
      select: { entityId: true },
    }),
    instanceIds.length
      ? prisma.photo.findMany({
          where: { collectionId, entityType: 'PLANT_INSTANCE', entityId: { in: instanceIds }, nsfwFlagged: false, moderationStatus: { notIn: UNUSABLE_REPRESENTATIVE_IMAGE_STATUSES }, OR: [{ isType: true }, { isCover: true }] },
          select: { entityId: true },
        })
      : [],
  ])
  const guideMap = new Map(guides.map((guide) => [guide.plantDefinitionId, guide]))
  const definitionPhotoIds = new Set(definitionPhotos.map((photo) => photo.entityId))
  const instancePhotoIds = new Set(instancePhotos.map((photo) => photo.entityId))
  const results = new Map<string, PlantDefinitionCompleteness>()

  for (const definition of definitions) {
    results.set(definition.id, evaluateDefinition(definition, guideMap, definitionPhotoIds, instancePhotoIds))
  }
  return results
}

export async function evaluatePlantDefinitionCompleteness(prisma: PrismaClient, definitionId: string, collectionId?: string | null) {
  const results = await evaluatePlantDefinitionCompletenessBatch(prisma, { definitionIds: [definitionId], collectionId })
  const result = results.get(definitionId)
  if (!result) throw new Error('Plant definition not found.')
  return result
}

function evaluateDefinition(
  definition: DefinitionRow,
  guides: Map<string, GuideRow>,
  definitionPhotoIds: Set<string>,
  instancePhotoIds: Set<string>,
): PlantDefinitionCompleteness {
  const provisional = Boolean(text(definition.provisionalTaxon)) || definition.identificationStatus !== 'IDENTIFIED'
  const isGlobal = definition.collectionId === null
  const speciesState = speciesReadiness(definition.species, definition.cultivarName, provisional)
  const taxonomyItems: PlantDefinitionCompletenessItem[] = [
    item('genus', 'Genus recorded', text(definition.genus) ? 'COMPLETE' : 'MISSING', 'NEEDS_ATTENTION', { actionLabel: 'Edit taxonomy', actionHash: 'definition-fields' }),
    item('species', speciesState.label, speciesState.state, 'NEEDS_ATTENTION', { detail: speciesState.detail, actionLabel: speciesState.state === 'MISSING' ? 'Edit taxonomy' : undefined, actionHash: 'definition-fields' }),
    item('author', 'Author citation recorded', text(definition.authority) ? 'COMPLETE' : 'MISSING', 'RECOMMENDED', { actionLabel: 'Add citation', actionHash: 'definition-fields' }),
    item('cultivar', 'Cultivar name recorded', definition.cultivarName ? 'COMPLETE' : 'NOT_APPLICABLE', 'OPTIONAL'),
    item('cultivar-registration', 'Cultivar registration documented', definition.cultivarName ? (definition.cultivarRegistrationNumber || definition.registrationStatus ? 'COMPLETE' : 'MISSING') : 'NOT_APPLICABLE', 'RECOMMENDED', { actionLabel: 'Review cultivar', actionHash: 'definition-fields' }),
    item('aliases', 'Aliases or common names recorded', definition.aliases.length ? 'COMPLETE' : 'MISSING', 'OPTIONAL', { actionLabel: 'Add alias', actionHash: 'definition-fields' }),
    item('identification', provisional ? 'Identification needs review' : 'Identification resolved', provisional ? 'PARTIAL' : 'COMPLETE', provisional ? 'NEEDS_ATTENTION' : 'RECOMMENDED', { actionLabel: 'Review identity', actionHash: 'definition-fields' }),
  ]
  const taxonomyScore = (text(definition.genus) ? 25 : 0) + (speciesState.state === 'COMPLETE' ? 25 : 0) + (text(definition.authority) ? 15 : 0) + (definition.aliases.length ? 10 : 0) + (definition.cultivarName ? (definition.cultivarRegistrationNumber || definition.registrationStatus ? 10 : 4) : 10) + (provisional ? 5 : 15)

  const resolvedGuide = effectiveGuide(definition.id, guides)
  const guide = resolvedGuide.guide
  const husbandryItems: PlantDefinitionCompletenessItem[] = []
  let husbandryPoints = 0
  const scoredSections = husbandrySections.filter((section) => section.key !== 'summary')
  for (const section of scoredSections) {
    const values = guide ? sectionValues(guide, section.key) : []
    const filled = values.filter(hasValue).length
    const ratio = values.length ? filled / values.length : 0
    const state: CompletenessItemState = !guide || filled === 0 ? 'MISSING' : ratio >= 0.4 ? (resolvedGuide.inherited ? 'INHERITED' : 'COMPLETE') : 'PARTIAL'
    husbandryPoints += state === 'COMPLETE' || state === 'INHERITED' ? 1 : state === 'PARTIAL' ? 0.5 : 0
    husbandryItems.push(item(`husbandry-${section.key}`, section.title, state, ['watering', 'light', 'temperature', 'humidity', 'medium'].includes(section.key) ? 'NEEDS_ATTENTION' : 'RECOMMENDED', {
      detail: state === 'INHERITED' ? 'Available through a linked husbandry guide.' : filled ? `${filled} structured field${filled === 1 ? '' : 's'} recorded.` : undefined,
      actionLabel: state === 'MISSING' || state === 'PARTIAL' ? 'Open husbandry' : undefined,
      actionHash: 'husbandry',
    }))
  }
  const husbandryScore = scoredSections.length ? (husbandryPoints / scoredSections.length) * 100 : 0

  const referenceCount = [definition.wikipediaUrl, definition.inaturalistUrl, definition.powoUrl, definition.gbifUrl].filter(hasValue).length
  const referencesItems = [
    item('description', 'Description recorded', definition.description ? 'COMPLETE' : 'MISSING', 'NEEDS_ATTENTION', { actionLabel: 'Add description', actionHash: 'definition-fields' }),
    item('reference', 'Reference URL recorded', referenceCount ? 'COMPLETE' : 'MISSING', 'RECOMMENDED', { actionLabel: 'Add reference', actionHash: 'definition-fields' }),
    item('authority-reference', 'Authoritative biodiversity reference recorded', definition.powoUrl || definition.gbifUrl ? 'COMPLETE' : 'MISSING', 'OPTIONAL', { actionLabel: 'Add reference', actionHash: 'definition-fields' }),
  ]
  const referencesScore = (definition.description ? 55 : 0) + (referenceCount ? 30 : 0) + (definition.powoUrl || definition.gbifUrl ? 15 : 0)

  const definitionImage = definitionPhotoIds.has(definition.id)
  const fallbackImage = !isGlobal && definition.instances.some((instance) => instancePhotoIds.has(instance.id))
  const imageSource = definitionImage ? 'DEFINITION_TYPE' : fallbackImage ? 'INSTANCE_FALLBACK' : 'NONE'
  const imagesItems = [
    item('representative-image', definitionImage ? 'Dedicated type image selected' : fallbackImage ? 'Representative specimen image available' : 'Representative image available', definitionImage ? 'COMPLETE' : fallbackImage ? 'INHERITED' : 'MISSING', definitionImage ? 'RECOMMENDED' : 'NEEDS_ATTENTION', {
      detail: fallbackImage && !definitionImage ? 'Using an approved specimen image as a fallback.' : undefined,
      actionLabel: definitionImage ? undefined : 'Choose image',
      actionHash: 'definition-photos',
    }),
  ]

  const authorityExpected = Boolean(definition.taxonomicAuthorityId || definition.automaticTaxonomicAuthorityId || definition.taxonomicAuthorityMatchReason)
  const authorityItems = [
    item('taxonomic-authority', definition.taxonomicAuthority ? `Matched to ${definition.taxonomicAuthority.name}` : authorityExpected ? 'Taxonomic Authority match reviewed' : 'No applicable Taxonomic Authority match', definition.taxonomicAuthority ? 'COMPLETE' : authorityExpected ? 'MISSING' : 'NOT_APPLICABLE', authorityExpected ? 'RECOMMENDED' : 'OPTIONAL', { actionLabel: authorityExpected && !definition.taxonomicAuthority ? 'Review authority' : undefined, actionHash: 'definition-fields' }),
  ]
  const authorityScore = definition.taxonomicAuthority ? 100 : authorityExpected ? 35 : 100

  const fertilizerNA = noFertilizerRecommended(guide)
  const fertilizerAssigned = Boolean(guide?.fertilizerRecipe?.active && !guide.fertilizerRecipe.draft)
  const fertilizerItems = [
    item('fertilizer-recipe', fertilizerNA ? 'Fertilizer explicitly not recommended' : 'Fertilizer recipe assigned', fertilizerNA ? 'NOT_APPLICABLE' : fertilizerAssigned ? (resolvedGuide.inherited ? 'INHERITED' : 'COMPLETE') : 'MISSING', 'RECOMMENDED', { actionLabel: !fertilizerNA && !fertilizerAssigned ? 'Add fertilizer' : undefined, actionHash: 'husbandry' }),
    item('fertilizer-cadence', 'Fertilizer cadence defined', fertilizerNA ? 'NOT_APPLICABLE' : guide?.fertilizationCadenceDays || guide?.fertilizationFrequency ? (resolvedGuide.inherited ? 'INHERITED' : 'COMPLETE') : 'MISSING', 'RECOMMENDED', { actionLabel: !fertilizerNA && !(guide?.fertilizationCadenceDays || guide?.fertilizationFrequency) ? 'Add cadence' : undefined, actionHash: 'husbandry' }),
  ]
  const fertilizerScore = isGlobal ? 100 : fertilizerNA ? 100 : (fertilizerAssigned ? 65 : 0) + (guide?.fertilizationCadenceDays || guide?.fertilizationFrequency ? 35 : 0)

  const suitableSubstrates = definition.substrateRecommendations.filter((recommendation) => ['PREFERRED', 'RECOMMENDED'].includes(recommendation.suitability) && !recommendation.recipeVersion.recipe.archivedAt)
  const substrateItems = [item('substrate-recommendation', 'Preferred or recommended substrate saved', isGlobal ? 'NOT_APPLICABLE' : suitableSubstrates.length ? 'COMPLETE' : 'MISSING', 'RECOMMENDED', { actionLabel: !isGlobal && !suitableSubstrates.length ? 'Add substrate' : undefined, actionHash: 'substrate-recommendations' })]
  const tagsItems = [item('plant-tags', 'Meaningful traits reviewed', isGlobal ? 'NOT_APPLICABLE' : definition.tags.length ? 'COMPLETE' : 'MISSING', 'OPTIONAL', { actionLabel: !isGlobal && !definition.tags.length ? 'Review tags' : undefined, actionHash: 'plant-tags' })]

  const pendingReview = definition.validationCandidates.length > 0 || definition.disputes.length > 0
  const validationState: CompletenessItemState = definition.isValidated && !pendingReview ? 'COMPLETE' : pendingReview ? 'PARTIAL' : provisional || definition.confidence === 'AI_DETERMINED' || definition.confidence === 'UNCERTAIN' ? 'MISSING' : 'COMPLETE'
  const validationItems = [item('review-status', definition.isValidated ? 'Site-level validation' : 'Identification review', validationState, validationState === 'MISSING' ? 'RECOMMENDED' : 'OPTIONAL', { detail: pendingReview ? 'A validation review or dispute is pending.' : undefined, actionLabel: validationState !== 'COMPLETE' ? 'Review validation' : undefined, actionHash: 'validation' })]
  const validationScore = validationState === 'COMPLETE' ? 100 : validationState === 'PARTIAL' ? 50 : 0

  const categories = [
    category('taxonomy', taxonomyScore, taxonomyItems),
    category('husbandry', husbandryScore, husbandryItems),
    category('references', referencesScore, referencesItems),
    category('images', definitionImage ? 100 : fallbackImage ? 70 : 0, imagesItems),
    category('authority', authorityScore, authorityItems),
    category('fertilizer', fertilizerScore, isGlobal ? fertilizerItems.map((entry) => ({ ...entry, state: 'NOT_APPLICABLE' as const })) : fertilizerItems),
    category('substrate', isGlobal ? 100 : suitableSubstrates.length ? 100 : 0, substrateItems),
    category('tags', isGlobal ? 100 : definition.tags.length ? 100 : 0, tagsItems),
    category('validation', validationScore, validationItems),
  ]
  const overallScore = weightedCompletenessScore(Object.fromEntries(categories.map((entry) => [entry.key, entry.score])))
  const checklist = categories.flatMap((entry) => entry.items)
  const status = readinessStatusForScore(overallScore, provisional)
  return {
    plantDefinitionId: definition.id,
    overallScore,
    ...status,
    provisional,
    validationLabel: definition.isValidated ? 'Site-level validated' : pendingReview ? 'Review pending' : provisional ? 'Identification unresolved' : 'Local definition',
    categories,
    checklist,
    criticalMissing: checklist.filter((entry) => entry.level === 'NEEDS_ATTENTION' && (entry.state === 'MISSING' || entry.state === 'PARTIAL')),
    recommendedNextActions: checklist.filter((entry) => entry.level === 'RECOMMENDED' && (entry.state === 'MISSING' || entry.state === 'PARTIAL')),
    missingCategoryKeys: categories.filter((entry) => entry.items.some((candidate) => candidate.state === 'MISSING' || candidate.state === 'PARTIAL')).map((entry) => entry.key),
    hasImage: imageSource !== 'NONE',
    imageSource,
    computedAt: new Date(),
  }
}

export function completenessMatchesReadiness(result: PlantDefinitionCompleteness, filter: string) {
  if (!filter) return true
  return result.status === filter
}

export function completenessMatchesMissing(result: PlantDefinitionCompleteness, filter: string) {
  if (!filter) return true
  return result.missingCategoryKeys.includes(filter as CompletenessCategoryKey)
}
