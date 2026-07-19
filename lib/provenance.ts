import type { Prisma, PrismaClient } from '@prisma/client'

export const PARTY_KINDS = ['ORGANIZATION', 'PERSON'] as const
export const SOURCE_TYPES = [
  'COMMERCIAL_PROPAGATOR', 'BREEDER', 'HYBRIDIZER', 'FARM_GROWER', 'NURSERY',
  'BOTANICAL_GARDEN', 'PLANT_SOCIETY', 'IMPORTER', 'PRIVATE_GROWER', 'COLLECTOR',
  'WILD_ORIGIN', 'TISSUE_CULTURE_LAB', 'SEED_PRODUCER', 'UNKNOWN', 'OTHER',
] as const
export const SOURCE_ROLES = [
  'ORIGINATOR', 'BREEDER', 'HYBRIDIZER', 'PROPAGATOR', 'GROWER', 'IMPORTER',
  'TISSUE_CULTURE_PRODUCER', 'SEED_PRODUCER', 'COLLECTOR', 'UNKNOWN', 'OTHER',
] as const
export const DISTRIBUTOR_TYPES = [
  'BIG_BOX_STORE', 'INDEPENDENT_NURSERY', 'ONLINE_NURSERY', 'MARKETPLACE_SELLER',
  'PLANT_SHOW_VENDOR', 'BOTANICAL_GARDEN_SALE', 'PLANT_SOCIETY_SALE', 'PRIVATE_SELLER',
  'TRADE_SWAP', 'GIFT', 'AUCTION', 'WHOLESALER', 'FARM_STAND', 'OTHER',
] as const

type Db = PrismaClient | Prisma.TransactionClient

export function normalizeProvenanceName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

export function provenanceLabel(value: string | null | undefined) {
  if (!value) return 'Unknown'
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function isSimpleLegacyProvenance(value: string) {
  const clean = value.trim()
  if (!clean || clean.length > 120) return false
  return !/[\/|;?]|—|\s-\s|\b(via|from|originally|unknown|maybe|perhaps)\b/i.test(clean)
}

export async function validateDistributorSelection(db: Db, collectionId: string, distributorId?: string | null, locationId?: string | null) {
  if (!distributorId) {
    if (locationId) throw new Error('Choose a distributor before choosing a distributor location.')
    return { distributor: null, location: null }
  }
  const distributor = await db.distributor.findFirstOrThrow({ where: { id: distributorId, collectionId } })
  const location = locationId
    ? await db.distributorLocation.findFirstOrThrow({ where: { id: locationId, distributorId, collectionId } })
    : null
  return { distributor, location }
}

export async function validateSourceRows(db: Db, collectionId: string, rows: Array<{ sourceId: string; role: string; isPrimary: boolean; notes?: string }>) {
  const sourceIds = [...new Set(rows.map((row) => row.sourceId).filter(Boolean))]
  const sources = sourceIds.length
    ? await db.source.findMany({ where: { id: { in: sourceIds }, collectionId }, select: { id: true, name: true } })
    : []
  if (sources.length !== sourceIds.length) throw new Error('One or more sources do not belong to this collection.')
  if (rows.filter((row) => row.isPrimary).length > 1) throw new Error('Only one source may be primary.')
  const duplicateKeys = rows.map((row) => `${row.sourceId}:${row.role}`)
  if (new Set(duplicateKeys).size !== duplicateKeys.length) throw new Error('The same source and role cannot be added twice.')
  return sources
}

export function sourceRowsFromForm(fd: FormData) {
  const ids = fd.getAll('sourceId').map(String)
  const roles = fd.getAll('sourceRole').map(String)
  const notes = fd.getAll('sourceNotes').map(String)
  const primaryIndex = Number(fd.get('primarySourceIndex'))
  return ids.map((sourceId, index) => ({
    sourceId: sourceId.trim(),
    role: SOURCE_ROLES.includes(roles[index] as typeof SOURCE_ROLES[number]) ? roles[index] : 'UNKNOWN',
    notes: notes[index]?.trim() || undefined,
    isPrimary: Number.isInteger(primaryIndex) && primaryIndex === index,
  })).filter((row) => row.sourceId)
}

export function distributorDisplay(distributor?: { name: string } | null, location?: { name: string } | null, legacy?: string | null) {
  if (!distributor) return legacy || 'Distributor unknown'
  return location ? `${distributor.name} — ${location.name}` : distributor.name
}

export function sourceChainDisplay(sources: Array<{ role: string; source: { name: string } }>, legacy?: string | null) {
  if (!sources.length) return legacy || 'Source unknown'
  return sources.map((item) => `${item.source.name} (${provenanceLabel(item.role)})`).join(' → ')
}
