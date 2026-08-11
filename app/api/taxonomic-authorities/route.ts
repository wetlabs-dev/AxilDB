import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { canViewCollection } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { taxonomicAuthorityWhere } from '@/lib/taxonomic-authorities'

export async function GET(request: NextRequest) {
  const collectionSlug = request.nextUrl.searchParams.get('collection') || ''
  const plantDefinitionId = request.nextUrl.searchParams.get('plantDefinition') || ''
  const q = request.nextUrl.searchParams.get('q')?.trim() || ''
  const collection = await prisma.collection.findUnique({
    where: { slug: collectionSlug },
    select: { id: true, name: true, slug: true, visibility: true, status: true, aiFeaturesEnabled: true, aiBriefingEnabled: true, acquisitionVisibility: true, wishlistIntro: true, wishlistPublicSettingsJson: true, showSourceProvenance: true, showDistributorIdentity: true, showDistributorOutlet: true, showSellerIdentity: true, showSellerStorefront: true, description: true },
  })
  if (!collection) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const user = await getCurrentUser()
  const membership = user ? await prisma.collectionMembership.findUnique({ where: { collectionId_userId: { collectionId: collection.id, userId: user.id } }, select: { id: true, role: true, status: true } }) : null
  if (!canViewCollection(user, { collection, user, membership })) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const definition = plantDefinitionId ? await prisma.plantDefinition.findFirst({
    where: { id: plantDefinitionId, collectionId: collection.id },
    select: { taxonomicAuthorityId: true, taxonomicAuthorityMatchReason: true },
  }) : null
  if (plantDefinitionId && !definition) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const authorities = await prisma.taxonomicAuthority.findMany({
    where: {
      AND: [taxonomicAuthorityWhere(collection.id), q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { abbreviation: { contains: q, mode: 'insensitive' } },
        { authorityType: { contains: q, mode: 'insensitive' } },
        { scopeRules: { some: { taxonName: { contains: q, mode: 'insensitive' } } } },
        { publications: { some: { name: { contains: q, mode: 'insensitive' } } } },
      ] } : {}],
    },
    include: { scopeRules: { orderBy: [{ priority: 'desc' }, { rank: 'asc' }] }, publications: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({
    authorities: authorities.map((authority) => ({
      id: authority.id,
      name: authority.name,
      abbreviation: authority.abbreviation,
      authorityType: authority.authorityType,
      description: authority.description,
      website: authority.website,
      registrationUrl: authority.registrationUrl,
      cultivarSearchUrl: authority.cultivarSearchUrl,
      membershipUrl: authority.membershipUrl,
      externalAuthorityUrl: authority.externalAuthorityUrl,
      scope: authority.scopeRules.map((rule) => ({ rank: rule.rank, taxonName: rule.taxonName, qualifier: rule.qualifier, priority: rule.priority })),
      publications: authority.publications.map((publication) => ({ name: publication.name, url: publication.url, purpose: publication.purpose })),
      selected: definition?.taxonomicAuthorityId === authority.id,
      matchReason: definition?.taxonomicAuthorityId === authority.id ? definition.taxonomicAuthorityMatchReason : null,
    })),
  })
}
