import type { Prisma, PrismaClient } from '@prisma/client'

export type TaxonomicAuthorityImportRecord = {
  externalId: string
  name: string
  abbreviation?: string | null
  authorityType?: string
  description?: string | null
  website?: string | null
  registrationUrl?: string | null
  cultivarSearchUrl?: string | null
  membershipUrl?: string | null
  externalAuthorityUrl?: string | null
  otherResources?: Array<{ label: string; url: string }>
  scopeRules?: Array<{ rank: string; taxonName: string; qualifier?: string | null; priority?: number; notes?: string | null }>
  publications?: Array<{ name: string; url?: string | null; purpose?: string | null; notes?: string | null }>
}

export interface TaxonomicAuthorityImporter {
  provider: string
  load(): Promise<TaxonomicAuthorityImportRecord[]>
}

type DbClient = PrismaClient | Prisma.TransactionClient

export async function importTaxonomicAuthorities(client: DbClient, importer: TaxonomicAuthorityImporter) {
  const records = await importer.load()
  for (const record of records) {
    const existing = await client.taxonomicAuthority.findFirst({
      where: { collectionId: null, importProvider: importer.provider, externalId: record.externalId },
      select: { id: true },
    })
    const shared = {
        name: record.name,
        abbreviation: record.abbreviation,
        authorityType: record.authorityType || 'OTHER',
        description: record.description,
        website: record.website,
        registrationUrl: record.registrationUrl,
        cultivarSearchUrl: record.cultivarSearchUrl,
        membershipUrl: record.membershipUrl,
        externalAuthorityUrl: record.externalAuthorityUrl,
        otherResourcesJson: record.otherResources || [],
        importedAt: new Date(),
    }
    if (existing) {
      await client.taxonomicAuthority.update({
        where: { id: existing.id },
        data: {
          ...shared,
          scopeRules: { deleteMany: {}, create: record.scopeRules || [] },
          publications: { deleteMany: {}, create: record.publications || [] },
        },
      })
    } else {
      await client.taxonomicAuthority.create({ data: {
        collectionId: null,
        importProvider: importer.provider,
        externalId: record.externalId,
        ...shared,
        scopeRules: { create: record.scopeRules || [] },
        publications: { create: record.publications || [] },
      } })
    }
  }
  return records.length
}
