import { NextRequest, NextResponse } from 'next/server'
import { requireCollectionLogger } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { loadQuickCare } from '@/lib/quick-care'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const context = await requireCollectionLogger(request.nextUrl.searchParams.get('collectionSlug') || '')
    const preference = await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
    return NextResponse.json(await loadQuickCare(prisma, context.collection.id, request.nextUrl.searchParams.get('plantInstanceId') || '', preference?.timezone), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Could not check care status. Check your access and try again.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } }) }
}
