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
  const species = normalize(definition.species)
  return `${segment(definition.genus)}${species ? segment(species) : ''}${cultivarSegment(definition.cultivarName)}`
}

export function plantIdContextCode(instanceType?: string | null, method?: string | null) {
  if (method) return methodCodes[method] || segment(method, 'OT').slice(0, 2)
  if (instanceType === 'ACQUIRED_PROPAGATION') return 'AP'
  if (instanceType === 'PROPAGATION') return 'PR'
  if (instanceType === 'MOTHER') return 'AC'
  return 'AC'
}

export async function plantIdPrefix(
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

  return [
    plantDefinitionCode(definition),
    dateSegment(options.date),
    plantIdContextCode(options.instanceType, options.method),
  ].join('-')
}

export async function generatePlantId(
  client: PlantIdClient,
  options: {
    collectionId: string
    plantDefinitionId: string
    date?: Date | string | null
    instanceType?: string | null
    method?: string | null
    excludePlantInstanceId?: string | null
  },
) {
  const prefix = await plantIdPrefix(client, options)

  const existing = await client.plantInstance.findMany({
    where: {
      collectionId: options.collectionId,
      plantId: { startsWith: `${prefix}-` },
      ...(options.excludePlantInstanceId ? { id: { not: options.excludePlantInstanceId } } : {}),
    },
    select: { plantId: true },
  })

  const next = existing.reduce((max, item) => {
    const suffix = Number(item.plantId.slice(prefix.length + 1))
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max
  }, 0) + 1

  return `${prefix}-${String(next).padStart(3, '0')}`
}

export async function expectedPlantIdForInstance(
  client: PrismaClient,
  options: {
    collectionId: string
    plantInstanceId: string
  },
) {
  const instance = await client.plantInstance.findFirstOrThrow({
    where: { id: options.plantInstanceId, collectionId: options.collectionId },
    select: {
      id: true,
      plantDefinitionId: true,
      plantId: true,
      instanceType: true,
      acquisitionDate: true,
      propagationDate: true,
      createdAt: true,
      parentLinks: {
        select: {
          propagationEvent: { select: { method: true, date: true } },
        },
        orderBy: { id: 'asc' },
        take: 1,
      },
    },
  })

  const propagationEvent = instance.instanceType === 'PROPAGATION'
    ? instance.parentLinks[0]?.propagationEvent
    : null
  const prefix = await plantIdPrefix(client, {
    collectionId: options.collectionId,
    plantDefinitionId: instance.plantDefinitionId,
    date: propagationEvent?.date || instance.propagationDate || instance.acquisitionDate || instance.createdAt,
    instanceType: instance.instanceType,
    method: propagationEvent?.method,
  })

  if (instance.plantId.startsWith(`${prefix}-`)) return instance.plantId

  return generatePlantId(client, {
    collectionId: options.collectionId,
    plantDefinitionId: instance.plantDefinitionId,
    date: propagationEvent?.date || instance.propagationDate || instance.acquisitionDate || instance.createdAt,
    instanceType: instance.instanceType,
    method: propagationEvent?.method,
    excludePlantInstanceId: instance.id,
  })
}
