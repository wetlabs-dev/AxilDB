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
  'MARKETPLACE', 'BIG_BOX_STORE', 'INDEPENDENT_NURSERY', 'ONLINE_NURSERY',
  'AUCTION_PLATFORM', 'PLANT_SHOW', 'BOTANICAL_GARDEN_SALE', 'PLANT_SOCIETY_SALE',
  'PRIVATE_SALE_CHANNEL', 'TRADE_SWAP', 'GIFT', 'WHOLESALER', 'FARM_STAND', 'OTHER',
] as const
export const DISTRIBUTOR_OUTLET_TYPES = [
  'PHYSICAL_BRANCH', 'ONLINE_STOREFRONT', 'SHOW_EVENT_BOOTH', 'MAIL_ORDER', 'POP_UP', 'OTHER',
] as const
export const SELLER_STOREFRONT_TYPES = [
  'MARKETPLACE_SELLER', 'DIRECT_ONLINE_STORE', 'SOCIAL_MEDIA_STORE', 'AUCTION_PROFILE', 'SHOW_VENDOR', 'OTHER',
] as const
export const DEFAULT_SALES_CHANNEL_TYPES = [
  'Website', 'Palmstreet', 'Etsy', 'Retail Store', 'Nursery', 'Plant Show',
  'Facebook Marketplace', 'Instagram', 'Auction', 'Other',
] as const

type Db = PrismaClient | Prisma.TransactionClient

export function normalizeProvenanceName(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'").toLocaleLowerCase('en-US')
}

export async function ensureDefaultSalesChannelTypes(db: Db, collectionId: string) {
  for (const [sortOrder, name] of DEFAULT_SALES_CHANNEL_TYPES.entries()) {
    await db.salesChannelType.upsert({
      where: { collectionId_normalizedName: { collectionId, normalizedName: normalizeProvenanceName(name) } },
      update: { isBuiltIn: true, sortOrder },
      create: { collectionId, name, normalizedName: normalizeProvenanceName(name), isBuiltIn: true, sortOrder },
    })
  }
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

export async function validateDistributorSelection(db: Db, collectionId: string, distributorId?: string | null, outletId?: string | null) {
  if (!distributorId) {
    if (outletId) throw new Error('Choose a distributor before choosing a distributor outlet.')
    return { distributor: null, outlet: null }
  }
  const distributor = await db.distributor.findFirstOrThrow({ where: { id: distributorId, collectionId } })
  const outlet = outletId
    ? await db.distributorOutlet.findFirstOrThrow({ where: { id: outletId, distributorId, collectionId } })
    : null
  return { distributor, outlet }
}

export async function validateCommerceSelection(db: Db, collectionId: string, input: {
  sellerId?: string | null
  sellerStorefrontId?: string | null
  distributorId?: string | null
  distributorOutletId?: string | null
}) {
  const seller = input.sellerId
    ? await db.seller.findFirstOrThrow({ where: { id: input.sellerId, collectionId } })
    : null
  const storefront = input.sellerStorefrontId
    ? await db.sellerStorefront.findFirstOrThrow({ where: { id: input.sellerStorefrontId, collectionId } })
    : null
  if (storefront && !seller) throw new Error('Choose the seller that owns this sales channel.')
  if (storefront && storefront.sellerId !== seller?.id) throw new Error('The selected sales channel does not belong to this seller.')
  const inferredDistributorId = input.distributorId || storefront?.distributorId || null
  const { distributor, outlet } = await validateDistributorSelection(db, collectionId, inferredDistributorId, input.distributorOutletId)
  if (storefront?.distributorId && storefront.distributorId !== distributor?.id) {
    throw new Error('The selected channel belongs to a different legacy platform.')
  }
  return { seller, storefront, distributor, outlet }
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

export function distributorDisplay(distributor?: { name: string } | null, outlet?: { name: string } | null, legacy?: string | null) {
  if (!distributor) return legacy || 'Distributor unknown'
  return outlet ? `${distributor.name} — ${outlet.name}` : distributor.name
}

export function acquisitionProvenanceDisplay(input: {
  seller?: { name: string; kind?: string | null } | null
  storefront?: { handleOrName: string } | null
  distributor?: { name: string } | null
  outlet?: { name: string } | null
  legacy?: string | null
}, compact = true) {
  const { seller, storefront, distributor, outlet, legacy } = input
  if (seller && distributor) {
    return compact
      ? `Purchased from ${seller.name} via ${distributor.name}`
      : `Purchased from: ${seller.name}\nVia: ${distributor.name}${storefront ? ` · ${storefront.handleOrName}` : ''}`
  }
  if (seller) return `${seller.kind === 'PERSON' ? 'Received' : 'Purchased'} from ${seller.name}`
  if (distributor) return `Purchased ${outlet ? 'from' : 'via'} ${outlet ? `${distributor.name} — ${outlet.name}` : distributor.name}`
  return legacy ? `Acquired from ${legacy}` : 'Seller or sales channel unknown'
}

export function sourceChainDisplay(sources: Array<{ role: string; source: { name: string } }>, legacy?: string | null) {
  if (!sources.length) return legacy || 'Source unknown'
  return sources.map((item) => `${item.source.name} (${provenanceLabel(item.role)})`).join(' → ')
}
