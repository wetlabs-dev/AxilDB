export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireCollectionAdmin } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'
import { getUserUnitPreferences, lightInputValue, lightSymbol, temperatureInputValue, temperatureSymbol } from '@/lib/units'

const baseHeaders = [
  'id',
  'name',
  'genus',
  'species',
  'hybridNotation',
  'cultivarName',
  'authority',
  'cultivarRegistrationNumber',
  'governingBody',
  'governingBodyAbbreviation',
  'confidence',
  'identificationStatus',
  'provisionalTaxon',
  'wikipediaUrl',
  'inaturalistUrl',
  'powoUrl',
  'gbifUrl',
  'description',
  'notes',
  'aliases',
  'instanceCount',
  'createdAt',
  'updatedAt',
]

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(',')
}

function exportFileName(slug: string) {
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'collection'
  const date = new Date().toISOString().slice(0, 10)
  return `axildb-${safeSlug}-plant-definitions-${date}.csv`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const collectionSlug = url.searchParams.get('collectionSlug') || undefined
  const { collection, user } = await requireCollectionAdmin(collectionSlug)
  const unitPreferences = await getUserUnitPreferences(prisma, user.id)
  const headers = [
    ...baseHeaders,
    `temperatureMinimum (${temperatureSymbol(unitPreferences.temperatureUnit)})`,
    `temperatureMaximum (${temperatureSymbol(unitPreferences.temperatureUnit)})`,
    `nightTemperatureMinimum (${temperatureSymbol(unitPreferences.temperatureUnit)})`,
    `nightTemperatureMaximum (${temperatureSymbol(unitPreferences.temperatureUnit)})`,
    `measuredLightMinimum (${lightSymbol(unitPreferences.lightUnit)})`,
    `measuredLightMaximum (${lightSymbol(unitPreferences.lightUnit)})`,
  ]

  const definitions = await prisma.plantDefinition.findMany({
    where: { collectionId: collection.id },
    include: {
      governingBody: true,
      husbandryGuide: true,
      aliases: { orderBy: [{ aliasType: 'asc' }, { name: 'asc' }] },
      _count: { select: { instances: true } },
    },
    orderBy: [{ genus: 'asc' }, { species: 'asc' }, { cultivarName: 'asc' }],
  })

  const rows = definitions.map((definition) => csvRow([
    definition.id,
    plantName(definition),
    definition.genus,
    definition.species,
    definition.hybridNotation,
    definition.cultivarName,
    definition.authority,
    definition.cultivarRegistrationNumber,
    definition.governingBody?.name,
    definition.governingBody?.abbreviation,
    definition.confidence,
    definition.identificationStatus,
    definition.provisionalTaxon,
    definition.wikipediaUrl,
    definition.inaturalistUrl,
    definition.powoUrl,
    definition.gbifUrl,
    definition.description,
    definition.notes,
    definition.aliases.map((alias) => `${alias.aliasType}:${alias.name}`).join('; '),
    definition._count.instances,
    definition.createdAt,
    definition.updatedAt,
    temperatureInputValue(definition.husbandryGuide?.environmentTemperatureMinC, unitPreferences.temperatureUnit),
    temperatureInputValue(definition.husbandryGuide?.environmentTemperatureMaxC, unitPreferences.temperatureUnit),
    temperatureInputValue(definition.husbandryGuide?.environmentNightTemperatureMinC, unitPreferences.temperatureUnit),
    temperatureInputValue(definition.husbandryGuide?.environmentNightTemperatureMaxC, unitPreferences.temperatureUnit),
    lightInputValue(definition.husbandryGuide?.environmentLightMinLux, unitPreferences.lightUnit),
    lightInputValue(definition.husbandryGuide?.environmentLightMaxLux, unitPreferences.lightUnit),
  ]))

  const csv = `${csvRow(headers)}\n${rows.join('\n')}${rows.length ? '\n' : ''}`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(collection.slug)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
