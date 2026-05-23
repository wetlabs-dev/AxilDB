import type { PlantDefinition, PrismaClient } from '@prisma/client'

type PlantIdClient = Pick<PrismaClient, 'plantDefinition' | 'plantInstance'>

const methodCodes: Record<string, string> = {
  LEAF: 'LF',
  CUTTING: 'CT',
  RHIZOME_SPLIT: 'RS',
  DIVISION: 'DV',
  SEED: 'SD',
  TISSUE_CULTURE: 'TC',
  RUNNER: 'RN',
  OTHER: 'OT',
}

function normalize(value?: string | null) {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function segment(value?: string | null, fallback = 'XXX') {
  return normalize(value).slice(0, 3).padEnd(3, fallback[0])
}

function cultivarSegment(value?: string | null) {
  const normalized = normalize(value)
  return normalized ? `-${normalized.slice(0, 3).padEnd(3, 'X')}` : ''
}

function dateSegment(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return dateSegment(new Date())

  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

export function plantDefinitionCode(definition: Pick<PlantDefinition, 'genus' | 'species' | 'cultivarName'>) {
  return `${segment(definition.genus)}${segment(definition.species)}${cultivarSegment(definition.cultivarName)}`
}

export function plantIdContextCode(instanceType?: string | null, method?: string | null) {
  if (method) return methodCodes[method] || segment(method, 'OT').slice(0, 2)
  if (instanceType === 'ACQUIRED_PROPAGATION') return 'AP'
  if (instanceType === 'PROPAGATION') return 'PR'
  return 'AC'
}

export async function generatePlantId(
  client: PlantIdClient,
  options: {
    collectionId: string
    plantDefinitionId: string
    date?: Date | string | null
    instanceType?: string | null
    method?: string | null
  },
) {
  const definition = await client.plantDefinition.findUniqueOrThrow({
    where: { id: options.plantDefinitionId },
    select: { genus: true, species: true, cultivarName: true },
  })

  const prefix = [
    plantDefinitionCode(definition),
    dateSegment(options.date),
    plantIdContextCode(options.instanceType, options.method),
  ].join('-')

  const existing = await client.plantInstance.findMany({
    where: { collectionId: options.collectionId, plantId: { startsWith: `${prefix}-` } },
    select: { plantId: true },
  })

  const next = existing.reduce((max, item) => {
    const suffix = Number(item.plantId.slice(prefix.length + 1))
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max
  }, 0) + 1

  return `${prefix}-${String(next).padStart(3, '0')}`
}
