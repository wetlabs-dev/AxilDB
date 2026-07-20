import { NextRequest, NextResponse } from 'next/server'
import { canViewCollection } from '@/lib/collections'
import { getCurrentUser } from '@/lib/auth'
import { getPlantInstancePreview } from '@/lib/plant-preview'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const collectionSlug = searchParams.get('collection') || undefined
  const plant = searchParams.get('plant') || ''
  if (!collectionSlug || !plant) {
    return NextResponse.json({ error: 'Missing collection or plant parameter.' }, { status: 400 })
  }

  const user = await getCurrentUser()
  const collection = await prisma.collection.findUnique({
    where: { slug: collectionSlug },
    select: { id: true, name: true, slug: true, visibility: true, status: true, aiFeaturesEnabled: true, aiBriefingEnabled: true, acquisitionVisibility: true, wishlistIntro: true, wishlistPublicSettingsJson: true, showSourceProvenance: true, showDistributorIdentity: true, showDistributorLocation: true, description: true },
  })
  if (!collection) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const membership = user
    ? await prisma.collectionMembership.findUnique({
        where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
        select: { id: true, role: true, status: true },
      })
    : null
  const context = { collection, user, membership }
  if (!canViewCollection(context.user, context)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const preview = await getPlantInstancePreview(prisma, {
    collectionId: context.collection.id,
    collectionSlug: context.collection.slug,
    plantInstanceIdOrCode: plant,
    publicOnly: !isServerAdminRole(user?.role) && membership?.status !== 'ACTIVE',
  })
  if (!preview) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json(preview)
}
