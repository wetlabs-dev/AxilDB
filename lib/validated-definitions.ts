import type { Prisma, PrismaClient } from '@prisma/client'
import { environmentalHusbandryFields, husbandryFieldNames } from '@/lib/husbandry'

type DefinitionIdentity = {
  genus?: string | null
  species?: string | null
  hybridNotation?: string | null
  cultivarName?: string | null
  provisionalTaxon?: string | null
  identificationStatus?: string | null
}

function normalizedText(value?: string | null) {
  return String(value || '').trim()
}

export function validatedIdentityWhere(input: DefinitionIdentity): Prisma.PlantDefinitionWhereInput {
  const genus = normalizedText(input.genus)
  const species = normalizedText(input.species).toLowerCase()
  const hybridNotation = normalizedText(input.hybridNotation)
  const cultivarName = normalizedText(input.cultivarName)
  const optionalIdentity: Prisma.PlantDefinitionWhereInput[] = [
    hybridNotation
      ? { hybridNotation: { equals: hybridNotation, mode: 'insensitive' } }
      : { OR: [{ hybridNotation: null }, { hybridNotation: '' }] },
    cultivarName
      ? { cultivarName: { equals: cultivarName, mode: 'insensitive' } }
      : { OR: [{ cultivarName: null }, { cultivarName: '' }] },
  ]

  return {
    isValidated: true,
    identificationStatus: 'IDENTIFIED',
    collectionId: null,
    genus: { equals: genus, mode: 'insensitive' },
    species: { equals: species, mode: 'insensitive' },
    AND: optionalIdentity,
  }
}

export async function findMatchingValidatedDefinition(client: PrismaClient | Prisma.TransactionClient, input: DefinitionIdentity) {
  if (input.identificationStatus === 'PROVISIONAL' || normalizedText(input.provisionalTaxon)) return null
  if (!normalizedText(input.genus) || !normalizedText(input.species)) return null
  return client.plantDefinition.findFirst({
    where: validatedIdentityWhere(input),
    orderBy: { validatedAt: 'desc' },
  })
}

export async function globalTaxonomicAuthorityId(client: PrismaClient | Prisma.TransactionClient, taxonomicAuthorityId?: string | null) {
  if (!taxonomicAuthorityId) return null
  const body = await client.taxonomicAuthority.findUnique({ where: { id: taxonomicAuthorityId }, include: { scopeRules: true, publications: true } })
  if (!body) return null
  const existing = await client.taxonomicAuthority.findFirst({
    where: {
      collectionId: null,
      name: { equals: body.name, mode: 'insensitive' },
      abbreviation: body.abbreviation ? { equals: body.abbreviation, mode: 'insensitive' } : null,
    },
  })
  if (existing) return existing.id
  const created = await client.taxonomicAuthority.create({
    data: {
      collectionId: null,
      name: body.name,
      abbreviation: body.abbreviation,
      authorityType: body.authorityType,
      description: body.description,
      website: body.website,
      registrationUrl: body.registrationUrl,
      cultivarSearchUrl: body.cultivarSearchUrl,
      membershipUrl: body.membershipUrl,
      externalAuthorityUrl: body.externalAuthorityUrl,
      notes: body.notes,
      scopeRules: { create: body.scopeRules.map(({ rank, taxonName, qualifier, priority, notes }) => ({ rank, taxonName, qualifier, priority, notes })) },
      publications: { create: body.publications.map(({ name, url, purpose, notes }) => ({ name, url, purpose, notes })) },
    },
  })
  return created.id
}

export function definitionData(source: any, overrides: Record<string, unknown> = {}) {
  return {
    genus: source.genus,
    species: source.species,
    hybridNotation: source.hybridNotation,
    cultivarName: source.cultivarName,
    authority: source.authority,
    cultivarRegistrationNumber: source.cultivarRegistrationNumber,
    taxonomicAuthorityId: source.taxonomicAuthorityId,
    automaticTaxonomicAuthorityId: source.automaticTaxonomicAuthorityId,
    taxonomicAuthoritySource: source.taxonomicAuthoritySource,
    taxonomicAuthorityMatchReason: source.taxonomicAuthorityMatchReason,
    taxonomicAuthorityMatchPriority: source.taxonomicAuthorityMatchPriority,
    taxonomicPlacementJson: source.taxonomicPlacementJson,
    registrationRequired: source.registrationRequired,
    registrationStatus: source.registrationStatus,
    registrationDate: source.registrationDate,
    registrationApplicationDate: source.registrationApplicationDate,
    cultivarAccepted: source.cultivarAccepted,
    officialCultivarName: source.officialCultivarName,
    registrationPublicationReference: source.registrationPublicationReference,
    confidence: source.confidence,
    provisionalTaxon: source.provisionalTaxon,
    identificationStatus: source.identificationStatus,
    wikipediaUrl: source.wikipediaUrl,
    inaturalistUrl: source.inaturalistUrl,
    powoUrl: source.powoUrl,
    gbifUrl: source.gbifUrl,
    description: source.description,
    notes: source.notes,
    ...overrides,
  }
}

export function husbandryData(source: any, overrides: Record<string, unknown> = {}) {
  return {
    ...Object.fromEntries(husbandryFieldNames.map((field) => [field, source?.[field] ?? null])),
    ...Object.fromEntries(environmentalHusbandryFields.map((field) => [field, source?.[field] ?? null])),
    aiGeneratedAt: source?.aiGeneratedAt || null,
    aiModel: source?.aiModel || null,
    reviewStatus: source?.reviewStatus || 'DRAFT',
    reviewNotes: source?.reviewNotes || null,
    ...overrides,
  }
}
