export const plantInstanceTypes = [
  'MOTHER',
  'ACQUIRED_PROPAGATION',
  'PROPAGATION',
  'SEED',
  'CORM',
  'TISSUE_CULTURE',
] as const

export type PlantInstanceType = (typeof plantInstanceTypes)[number]

export const transitionalPlantInstanceTypes = ['SEED', 'CORM', 'TISSUE_CULTURE'] as const
export const establishedPlantInstanceTypes = ['MOTHER', 'PROPAGATION'] as const

const typeLabels: Record<PlantInstanceType, string> = {
  MOTHER: 'Mother / established plant',
  ACQUIRED_PROPAGATION: 'Acquired propagation',
  PROPAGATION: 'Propagation',
  SEED: 'Seed',
  CORM: 'Corm',
  TISSUE_CULTURE: 'Tissue culture',
}

const typeHelp: Record<PlantInstanceType, string> = {
  MOTHER: 'Use Mother for an established source plant or normal growing specimen.',
  ACQUIRED_PROPAGATION: 'Use Acquired propagation for a starter plant, cutting, or leaf prop from outside this collection.',
  PROPAGATION: 'Use Propagation for a plant created from tracked parents inside this collection.',
  SEED: 'Use Seed for an accession currently being grown from seed. Parentage, when known, remains tracked through the Propagation record.',
  CORM: 'Use Corm for a corm being grown as its own accession. If it was produced by another plant in AxilDB, create or link it through Propagation.',
  TISSUE_CULTURE: 'Use Tissue culture for an individual accession in vitro or undergoing deflasking/acclimation.',
}

export const lifecycleTypeCodes: Record<PlantInstanceType, string> = {
  MOTHER: 'AC',
  ACQUIRED_PROPAGATION: 'AP',
  PROPAGATION: 'PR',
  SEED: 'SD',
  CORM: 'CO',
  TISSUE_CULTURE: 'TC',
}

export const lifecycleDateFields = [
  { name: 'acquisitionDate', label: 'Acquisition date', help: 'When this physical plant entered your collection.', types: plantInstanceTypes },
  { name: 'propagationDate', label: 'Propagation date', help: 'When this plant was propagated, if it was created from another plant.', types: ['PROPAGATION', 'ACQUIRED_PROPAGATION'] },
  { name: 'sownAt', label: 'Sowing date', help: 'When the seed was sown. This may differ from the acquisition date.', types: ['SEED'] },
  { name: 'germinatedAt', label: 'Germination date', help: 'Optional date when germination was first observed.', types: ['SEED'] },
  { name: 'cormStartedAt', label: 'Corm start / planting date', help: 'When this corm was started or planted as its own accession.', types: ['CORM'] },
  { name: 'deflaskedAt', label: 'Deflask / acclimation date', help: 'When this tissue culture accession was deflasked or began acclimation. Leave blank if still in vitro.', types: ['TISSUE_CULTURE'] },
] as const

export function isPlantInstanceType(value?: string | null): value is PlantInstanceType {
  return plantInstanceTypes.includes(value as PlantInstanceType)
}

export function plantInstanceTypeValue(value?: string | null, fallback: PlantInstanceType = 'MOTHER'): PlantInstanceType {
  return isPlantInstanceType(value) ? value : fallback
}

export function plantInstanceTypeLabel(value?: string | null) {
  return isPlantInstanceType(value) ? typeLabels[value] : String(value || 'Unknown').toLowerCase().replaceAll('_', ' ')
}

export function plantInstanceTypeHelp(value?: string | null) {
  return isPlantInstanceType(value) ? typeHelp[value] : undefined
}

export function isTransitionalPlantInstanceType(value?: string | null) {
  return transitionalPlantInstanceTypes.includes(value as typeof transitionalPlantInstanceTypes[number])
}

export function defaultLifecycleDateForType(input: {
  instanceType?: string | null
  acquisitionDate?: Date | string | null
  propagationDate?: Date | string | null
  sownAt?: Date | string | null
  cormStartedAt?: Date | string | null
  deflaskedAt?: Date | string | null
  createdAt?: Date | string | null
}) {
  if (input.instanceType === 'SEED') return input.sownAt || input.propagationDate || input.acquisitionDate || input.createdAt
  if (input.instanceType === 'CORM') return input.cormStartedAt || input.propagationDate || input.acquisitionDate || input.createdAt
  if (input.instanceType === 'TISSUE_CULTURE') return input.deflaskedAt || input.propagationDate || input.acquisitionDate || input.createdAt
  return input.propagationDate || input.acquisitionDate || input.createdAt
}

export function childTypeForPropagationMethod(method?: string | null): PlantInstanceType {
  if (method === 'SEED') return 'SEED'
  if (method === 'TISSUE_CULTURE') return 'TISSUE_CULTURE'
  if (method === 'CORM') return 'CORM'
  return 'PROPAGATION'
}
