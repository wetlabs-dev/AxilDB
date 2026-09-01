import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { canViewCollection, collectionPath } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { acceptedPlantName } from '@/lib/utils'

function text(value: string | null) {
  return String(value || '').trim()
}

function nullableExact(field: 'species' | 'hybridNotation' | 'cultivarName', value: string) {
  return value
    ? { [field]: { equals: value } }
    : { OR: [{ [field]: null }, { [field]: '' }] }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const collectionSlug = text(searchParams.get('collectionSlug'))
  const genus = text(searchParams.get('genus'))
  const species = text(searchParams.get('species')).toLowerCase()
  const hybridNotation = text(searchParams.get('hybridNotation'))
  const cultivarName = text(searchParams.get('cultivarName'))

  if (!collectionSlug) return NextResponse.json({ error: 'Missing collection.' }, { status: 400 })
  if (!genus) return NextResponse.json({ match: null })

  const user = await getCurrentUser()
  const collection = await prisma.collection.findUnique({
    where: { slug: collectionSlug },
    select: { id: true, name: true, slug: true, visibility: true, status: true, aiFeaturesEnabled: true, aiBriefingEnabled: true, aiCuratorEnabled: true, acquisitionVisibility: true, wishlistIntro: true, wishlistPublicSettingsJson: true, showSourceProvenance: true, showDistributorIdentity: true, showDistributorOutlet: true, showSellerIdentity: true, showSellerStorefront: true, description: true },
  })
  if (!collection) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const membership = user
    ? await prisma.collectionMembership.findUnique({
        where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
        select: { id: true, role: true, status: true },
      })
    : null
  if (!canViewCollection(user, { collection, user, membership })) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const definition = await prisma.plantDefinition.findFirst({
    where: {
      collectionId: collection.id,
      genus: { equals: genus },
      AND: [
        nullableExact('species', species),
        nullableExact('hybridNotation', hybridNotation),
        nullableExact('cultivarName', cultivarName),
      ],
    },
    select: { id: true, genus: true, species: true, hybridNotation: true, cultivarName: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    match: definition
      ? {
          id: definition.id,
          name: acceptedPlantName(definition),
          href: collectionPath(collection.slug, `/plants/${definition.id}/edit`),
        }
      : null,
  })
}
