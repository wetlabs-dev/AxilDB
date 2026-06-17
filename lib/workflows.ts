import type { PrismaClient } from '@prisma/client'
import { plantName } from '@/lib/utils'

export const workflowStepTypes = [
  'CHECKLIST',
  'WATER',
  'FERTILIZE',
  'PEST_CHECK',
  'HEALTH_CHECK',
  'ADD_NOTE',
  'ADD_PHOTO',
  'RELOCATE',
  'START_QUARANTINE',
  'RELEASE_QUARANTINE',
  'CREATE_REMINDER',
  'PROPAGATION_CHECK',
  'BLOOM_CHECK',
  'CREATE_CARE_EVENT',
  'DECISION_NOTE',
  'CUSTOM_TASK',
] as const

export type WorkflowStepType = (typeof workflowStepTypes)[number]

export function workflowStepLabel(type: string) {
  const labels: Record<string, string> = {
    CHECKLIST: 'Checklist / confirmation',
    WATER: 'Water selected plants',
    FERTILIZE: 'Fertilize selected plants',
    PEST_CHECK: 'Pest check',
    HEALTH_CHECK: 'Health check',
    ADD_NOTE: 'Add note',
    ADD_PHOTO: 'Add photo',
    RELOCATE: 'Relocate / move plants',
    START_QUARANTINE: 'Start quarantine',
    RELEASE_QUARANTINE: 'Release quarantine',
    CREATE_REMINDER: 'Create reminder / follow-up',
    PROPAGATION_CHECK: 'Propagation check',
    BLOOM_CHECK: 'Bloom check',
    CREATE_CARE_EVENT: 'Create care event',
    DECISION_NOTE: 'Decision / branch note',
    CUSTOM_TASK: 'Freeform custom task',
  }
  return labels[type] || type.toLowerCase().replaceAll('_', ' ')
}

export function workflowStepFamily(type: string) {
  if (['CHECKLIST', 'ADD_NOTE', 'ADD_PHOTO'].includes(type)) return 'Input'
  if (type === 'DECISION_NOTE') return 'Decision'
  if (['CREATE_REMINDER'].includes(type)) return 'Output'
  if ([
    'WATER',
    'FERTILIZE',
    'PEST_CHECK',
    'HEALTH_CHECK',
    'RELOCATE',
    'START_QUARANTINE',
    'RELEASE_QUARANTINE',
    'PROPAGATION_CHECK',
    'BLOOM_CHECK',
    'CREATE_CARE_EVENT',
  ].includes(type)) return 'Function'
  return 'Input'
}

export function queueTaskForWorkflowStep(stepType: string, fallback?: string | null) {
  if (stepType === 'WATER') return 'WATER'
  if (['PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK'].includes(stepType)) return stepType
  if (stepType === 'CREATE_CARE_EVENT') {
    if (fallback === 'WATERED') return 'WATER'
    if (['PEST_CHECK', 'HEALTH_CHECK', 'PROPAGATION_CHECK', 'BLOOM_CHECK'].includes(fallback || '')) return fallback
  }
  return null
}

export function workflowOutputBehaviorLabel(value?: string | null) {
  if (value === 'CONFIRM_ONLY') return 'Confirm only'
  if (value === 'RECORD_ONLY') return 'Create record'
  if (value === 'RECORD_OR_CONFIRM') return 'Create record or confirm'
  return 'Create record or confirm'
}

export function workflowRunStatusLabel(status: string) {
  return status.toLowerCase().replaceAll('_', ' ')
}

export function workflowScopeLabel(scopeType: string) {
  if (scopeType === 'LOCATION') return 'Location'
  if (scopeType === 'PLANTS') return 'Selected plants'
  return 'Collection'
}

export const starterWorkflowTemplates = [
  {
    name: 'New Arrival Quarantine',
    category: 'Quarantine',
    description: 'Move new arrivals through intake, inspection, quarantine setup, and release-review scheduling.',
    steps: [
      ['RELOCATE', 'Move to quarantine', 'Move selected arrivals into the quarantine location before inspection.'],
      ['ADD_PHOTO', 'Photograph plant', 'Add intake photos showing leaves, media, and overall condition.'],
      ['HEALTH_CHECK', 'Inspect leaves', 'Check leaf surfaces, stems, and new growth.'],
      ['CHECKLIST', 'Inspect media', 'Review media moisture, odor, roots if visible, and pot condition.'],
      ['PEST_CHECK', 'Pest check', 'Record pest status and any condition that needs follow-up.'],
      ['START_QUARANTINE', 'Start quarantine', 'Create the plant quarantine record with target release review.'],
      ['CREATE_REMINDER', 'Set release review reminder', 'Create a reminder for quarantine release review.'],
    ],
  },
  {
    name: 'Weekly Greenhouse Round',
    category: 'Routine',
    description: 'A location-oriented round for inspection, watering, pest checks, cleanup, photos, and notes.',
    steps: [
      ['CHECKLIST', 'Inspect location', 'Walk the scoped location and note anything unusual.'],
      ['WATER', 'Water selected plants', 'Record watering for plants that need it.'],
      ['PEST_CHECK', 'Pest check', 'Check representative plants and hotspots for pests.'],
      ['CUSTOM_TASK', 'Remove dead foliage', 'Remove spent leaves, fallen flowers, and debris.'],
      ['ADD_PHOTO', 'Photograph notable blooms', 'Capture notable blooms, issues, or progress.'],
      ['ADD_NOTE', 'Add summary note', 'Summarize the round for the location or selected plants.'],
    ],
  },
  {
    name: 'Pest Response',
    category: 'Pest response',
    description: 'Identify, isolate, document, treat, and schedule follow-up for pest issues.',
    steps: [
      ['CHECKLIST', 'Identify affected plants/location', 'Confirm the affected scope before creating records.'],
      ['RELOCATE', 'Move selected plants to quarantine', 'Move affected plants if isolation is needed.'],
      ['PEST_CHECK', 'Record pest condition', 'Create a pest condition when warranted.'],
      ['ADD_NOTE', 'Add treatment note', 'Document treatment approach, products, and observations.'],
      ['CREATE_REMINDER', 'Create follow-up reminder', 'Schedule a follow-up inspection.'],
    ],
  },
  {
    name: 'Seasonal Move',
    category: 'Seasonal',
    description: 'Move selected plants and schedule acclimation follow-up.',
    steps: [
      ['CHECKLIST', 'Select plants', 'Confirm the move list and destination.'],
      ['RELOCATE', 'Move to destination location', 'Move selected plants to the new location.'],
      ['ADD_NOTE', 'Add acclimation note', 'Record why the move happened and expected care changes.'],
      ['CREATE_REMINDER', 'Create stress follow-up', 'Schedule a sun/water stress check.'],
    ],
  },
  {
    name: 'Bloom Review Round',
    category: 'Bloom',
    description: 'Inspect blooms, record status, photograph flowers, and schedule follow-up.',
    steps: [
      ['BLOOM_CHECK', 'Inspect blooming plants', 'Record bloom observations for scoped plants.'],
      ['CREATE_CARE_EVENT', 'Update bloom status', 'Create a bloom-check care event.'],
      ['ADD_PHOTO', 'Photograph blooms', 'Add bloom photos where useful.'],
      ['CREATE_REMINDER', 'Create bloom follow-up', 'Schedule a follow-up for bloom progression.'],
    ],
  },
  {
    name: 'Propagation Check Round',
    category: 'Propagation',
    description: 'Inspect propagation plants, record progress, photograph roots/growth, and schedule the next check.',
    steps: [
      ['PROPAGATION_CHECK', 'Inspect propagation plants', 'Check rooting, moisture, and establishment.'],
      ['CREATE_CARE_EVENT', 'Record propagation check', 'Create a propagation-check care event.'],
      ['ADD_PHOTO', 'Photograph progress', 'Add progress photos where useful.'],
      ['CREATE_REMINDER', 'Create next follow-up reminder', 'Schedule the next propagation check.'],
    ],
  },
] as const

export async function ensureStarterWorkflowTemplates(prisma: PrismaClient, collectionId: string) {
  const existing = await prisma.workflowTemplate.findMany({
    where: { collectionId, isBuiltIn: true },
    select: { name: true },
  })
  const existingNames = new Set(existing.map((template) => template.name))
  for (const template of starterWorkflowTemplates) {
    if (existingNames.has(template.name)) continue
    await prisma.workflowTemplate.create({
      data: {
        collectionId,
        name: template.name,
        category: template.category,
        description: template.description,
        isBuiltIn: true,
        steps: {
          create: template.steps.map(([stepType, title, instructions], index) => ({
            stepType,
            title,
            instructions,
            required: true,
            sortOrder: (index + 1) * 10,
            outputBehavior: 'RECORD_OR_CONFIRM',
          })),
        },
      },
    })
  }
}

export function workflowProgress(run: { steps: { status: string }[] }) {
  const total = run.steps.length
  const completed = run.steps.filter((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED').length
  return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 }
}

export function displayWorkflowPlants(plants: { plantInstance: { plantId: string; plantDefinition: unknown } }[]) {
  return plants.map((entry) => `${entry.plantInstance.plantId} ${plantName(entry.plantInstance.plantDefinition as any)}`.trim())
}
