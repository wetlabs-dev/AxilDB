import { NextResponse } from 'next/server'
import { audit } from '@/lib/auth'
import { requireCollectionLogger } from '@/lib/collections'
import { prisma } from '@/lib/prisma'

function text(value: unknown, max = 200) {
  return String(value || '').trim().slice(0, max)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const collectionSlug = text(body.collectionSlug, 80)
  const plantDefinitionId = text(body.plantDefinitionId, 80) || null
  const { user, collection } = await requireCollectionLogger(collectionSlug)

  const log = await prisma.plantIdentificationLog.findFirst({
    where: { id, collectionId: collection.id, userId: user.id },
  })
  if (!log) return NextResponse.json({ error: 'Identification history item not found.' }, { status: 404 })

  if (plantDefinitionId) {
    await prisma.plantDefinition.findFirstOrThrow({ where: { id: plantDefinitionId, collectionId: collection.id }, select: { id: true } })
  }

  await prisma.plantIdentificationLog.update({
    where: { id },
    data: {
      status: log.status === 'CREATED_DEFINITION' ? 'CREATED_DEFINITION' : 'APPLIED_TO_FORM',
      appliedPlantDefinitionId: plantDefinitionId,
    },
  })
  await audit(user, 'APPLY_TO_FORM', 'PLANT_IDENTIFICATION_LOG', id, 'Applied ID My Plant history result to a plant definition form.', { plantDefinitionId }, collection.id)

  return NextResponse.json({ ok: true })
}
