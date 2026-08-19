import type { Prisma, PrismaClient } from '@prisma/client'

type DbClient = PrismaClient | Prisma.TransactionClient

export const TAXONOMIC_AUTHORITY_TYPES = [
  ['ICRA', 'International Cultivar Registration Authority (ICRA)'],
  ['SCIENTIFIC_SOCIETY', 'Scientific Society'],
  ['GOVERNMENT_AGENCY', 'Government Agency'],
  ['BOTANICAL_INSTITUTION', 'Botanical Institution'],
  ['TAXONOMIC_COMMITTEE', 'Taxonomic Committee'],
  ['REGISTRY', 'Registry'],
  ['OTHER', 'Other'],
] as const

export const TAXONOMIC_SCOPE_RANKS = [
  'KINGDOM', 'DIVISION', 'CLASS', 'ORDER', 'FAMILY', 'SUBFAMILY', 'TRIBE', 'SUBTRIBE',
  'GENUS', 'SECTION', 'SUBSECTION', 'SERIES', 'SUBSERIES', 'SPECIES',
] as const

const rankSpecificity = new Map(TAXONOMIC_SCOPE_RANKS.map((rank, index) => [rank, (index + 1) * 10_000]))

function normalized(value: unknown) {
  return String(value || '').trim().toLocaleLowerCase()
}

function placementFor(definition: {
  genus: string
  species?: string | null
  taxonomicPlacementJson?: unknown
}) {
  const placement = typeof definition.taxonomicPlacementJson === 'object' && definition.taxonomicPlacementJson
    ? definition.taxonomicPlacementJson as Record<string, unknown>
    : {}
  const values = new Map<string, string>()
  for (const rank of TAXONOMIC_SCOPE_RANKS) {
    const value = placement[rank] ?? placement[rank.toLowerCase()]
    if (value) values.set(rank, normalized(value))
  }
  values.set('GENUS', normalized(definition.genus))
  if (definition.species) {
    values.set('SPECIES', normalized(`${definition.genus} ${definition.species}`))
  }
  return values
}

export type AuthorityScopeCandidate = {
  authority: { id: string; name: string }
  rule: { id: string; rank: string; taxonName: string; priority: number }
  priority: number
}

export function matchTaxonomicAuthorityScopes(
  definition: { genus: string; species?: string | null; taxonomicPlacementJson?: unknown },
  authorities: Array<{ id: string; name: string; scopeRules: Array<{ id: string; rank: string; taxonName: string; priority: number }> }>,
) {
  const placement = placementFor(definition)
  return authorities.flatMap((authority) => {
    const matches = authority.scopeRules
      .filter((rule) => placement.get(rule.rank.toUpperCase()) === normalized(rule.taxonName))
      .map((rule) => ({
        authority,
        rule,
        priority: (rankSpecificity.get(rule.rank.toUpperCase() as typeof TAXONOMIC_SCOPE_RANKS[number]) || 0) + rule.priority,
      }))
      .sort((left, right) => right.priority - left.priority)
    return matches[0] ? [matches[0]] : []
  }).sort((left, right) => right.priority - left.priority || left.authority.name.localeCompare(right.authority.name))
}

export function taxonomicAuthorityWhere(collectionId: string) {
  return { OR: [{ collectionId }, { collectionId: null }] }
}

export type AuthoritySelection =
  | { mode: 'AUTO' }
  | { mode: 'NONE' }
  | { mode: 'MANUAL'; authorityId: string }

export function authoritySelectionFromForm(fd: FormData): AuthoritySelection {
  const raw = String(fd.get('taxonomicAuthoritySelection') || 'AUTO')
  if (raw === 'NONE') return { mode: 'NONE' }
  if (raw.startsWith('MANUAL:') && raw.slice(7)) return { mode: 'MANUAL', authorityId: raw.slice(7) }
  return { mode: 'AUTO' }
}

export function taxonomicPlacementFromForm(fd: FormData) {
  const placement = Object.fromEntries(['order', 'family', 'tribe', 'section'].flatMap((rank) => {
    const value = String(fd.get(`taxonomic${rank[0].toUpperCase()}${rank.slice(1)}`) || '').trim()
    return value ? [[rank.toUpperCase(), value]] : []
  }))
  return Object.keys(placement).length ? placement : null
}

export function taxonomicPlacementValue(value: unknown, rank: string) {
  if (!value || typeof value !== 'object') return ''
  const placement = value as Record<string, unknown>
  return String(placement[rank.toUpperCase()] || placement[rank.toLowerCase()] || '')
}

export function authoritySelectionValue(definition: {
  taxonomicAuthorityId?: string | null
  taxonomicAuthoritySource?: string | null
}) {
  if (definition.taxonomicAuthoritySource === 'MANUAL' && definition.taxonomicAuthorityId) {
    return `MANUAL:${definition.taxonomicAuthorityId}`
  }
  if (definition.taxonomicAuthoritySource === 'NONE') return 'NONE'
  return 'AUTO'
}

export async function reconcileTaxonomicAuthorityMatches(
  client: DbClient,
  plantDefinitionId: string,
  collectionId: string,
  selection?: AuthoritySelection,
) {
  const definition = await client.plantDefinition.findFirstOrThrow({
    where: { id: plantDefinitionId, collectionId },
    select: { id: true, genus: true, species: true, taxonomicPlacementJson: true, taxonomicAuthorityId: true, taxonomicAuthoritySource: true },
  })
  const authorities = await client.taxonomicAuthority.findMany({
    where: taxonomicAuthorityWhere(collectionId),
    include: { scopeRules: true },
  })

  const candidates = matchTaxonomicAuthorityScopes(definition, authorities)

  const automatic = candidates[0] || null
  const requestedSelection = selection || (
    definition.taxonomicAuthoritySource === 'MANUAL' && definition.taxonomicAuthorityId
      ? { mode: 'MANUAL' as const, authorityId: definition.taxonomicAuthorityId }
      : definition.taxonomicAuthoritySource === 'NONE'
        ? { mode: 'NONE' as const }
        : { mode: 'AUTO' as const }
  )

  let selectedAuthorityId: string | null = automatic?.authority.id || null
  let source = 'AUTO'
  let reason = automatic ? `Matched by ${automatic.rule.rank}: ${automatic.rule.taxonName}` : null
  let priority = automatic?.priority || null

  if (requestedSelection.mode === 'MANUAL') {
    const allowed = authorities.find((authority) => authority.id === requestedSelection.authorityId)
    if (!allowed) throw new Error('The selected Taxonomic Authority is not available to this collection.')
    selectedAuthorityId = allowed.id
    source = 'MANUAL'
    reason = 'Manually overridden'
    priority = null
  } else if (requestedSelection.mode === 'NONE') {
    selectedAuthorityId = null
    source = 'NONE'
    reason = automatic ? `Automatic match dismissed (${automatic.rule.rank}: ${automatic.rule.taxonName})` : null
    priority = null
  }

  await client.plantDefinitionAuthorityMatch.deleteMany({ where: { plantDefinitionId } })
  if (candidates.length) {
    await client.plantDefinitionAuthorityMatch.createMany({
      data: candidates.map((candidate) => ({
        plantDefinitionId,
        taxonomicAuthorityId: candidate.authority.id,
        scopeRuleId: candidate.rule.id,
        matchReason: `Matched by ${candidate.rule.rank}: ${candidate.rule.taxonName}`,
        priority: candidate.priority,
        isSelected: candidate.authority.id === selectedAuthorityId,
      })),
    })
  }
  await client.plantDefinition.update({
    where: { id: plantDefinitionId },
    data: {
      automaticTaxonomicAuthorityId: automatic?.authority.id || null,
      taxonomicAuthorityId: selectedAuthorityId,
      taxonomicAuthoritySource: source,
      taxonomicAuthorityMatchReason: reason,
      taxonomicAuthorityMatchPriority: priority,
    },
  })

  return { selectedAuthorityId, automaticAuthorityId: automatic?.authority.id || null, source, reason, candidates }
}

export async function rematchCollectionAuthorities(client: DbClient, collectionId: string) {
  const definitions = await client.plantDefinition.findMany({ where: { collectionId }, select: { id: true } })
  for (const definition of definitions) {
    await reconcileTaxonomicAuthorityMatches(client, definition.id, collectionId)
  }
  return definitions.length
}
