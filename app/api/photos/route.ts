import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/auth'
import { collectionPath, getCurrentCollectionSlug, requireCollectionLogger } from '@/lib/collections'
import { notifyFollowers } from '@/lib/follows'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { emitDomainEvent } from '@/lib/events/emit'

const MAX_PHOTO_DIMENSION = 2000
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/avif'])

function redirectBack(req: Request, back: string, uploadError?: string) {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const host = forwardedHost || req.headers.get('host') || new URL(req.url).host
  const proto = forwardedProto || new URL(req.url).protocol.replace(':', '')
  const base = `${proto}://${host}`
  const target = new URL(back || '/', base)
  if (uploadError) target.searchParams.set('uploadError', uploadError)
  return NextResponse.redirect(target, { status: 303 })
}

function boundedPercent(value: FormDataEntryValue | null, fallback?: number) {
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(100, parsed))
}

function framingFromForm(form: FormData) {
  return {
    cropX: boundedPercent(form.get('cropX')),
    cropY: boundedPercent(form.get('cropY')),
    cropWidth: boundedPercent(form.get('cropWidth')),
    cropHeight: boundedPercent(form.get('cropHeight')),
    focalX: boundedPercent(form.get('focalX'), 50),
    focalY: boundedPercent(form.get('focalY'), 50),
  }
}

export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch (error) {
    console.error('Photo form parsing failed', { error })
    return redirectBack(req, '/', 'upload_failed')
  }
  const file = form.get('photo') as File | null
  const target = String(form.get('target') || '')
  const [targetType, targetId] = target.includes(':') ? target.split(':', 2) : ['', '']
  const entityType = targetType || String(form.get('entityType') || '')
  const entityId = targetId || String(form.get('entityId') || '')
  const rawCaption = String(form.get('caption') || '')
  const caption = rawCaption.trim() ? rawCaption : undefined
  const source = String(form.get('source') || '') || undefined
  const sourceUrl = String(form.get('sourceUrl') || '') || undefined
  const workflowRunStepId = String(form.get('workflowRunStepId') || '').trim()
  const workflowRunId = String(form.get('workflowRunId') || '').trim()
  const back = String(form.get('back') || '/')
  const context = await requireCollectionLogger(String(form.get('collectionSlug') || '') || await getCurrentCollectionSlug())
  const { user, collection } = context
  if (!file || !entityType || !entityId) return redirectBack(req, back, 'missing_photo')
  if (file.type && !SUPPORTED_IMAGE_TYPES.has(file.type)) return redirectBack(req, back, 'unsupported_format')
  let workflowStep: { id: string; runId: string; title: string; status: string; run: { status: string } } | null = null
  if (workflowRunStepId) {
    workflowStep = await prisma.workflowRunStep.findFirst({
      where: { id: workflowRunStepId, collectionId: collection.id, stepType: 'ADD_PHOTO' },
      include: { run: { select: { status: true } } },
    })
    if (!workflowStep || workflowStep.run.status !== 'ACTIVE') return redirectBack(req, back, 'workflow_step_unavailable')
    const claimed = await prisma.workflowRunStep.updateMany({
      where: { id: workflowRunStepId, collectionId: collection.id, status: 'PENDING', run: { status: 'ACTIVE' } },
      data: { status: 'COMPLETING' },
    })
    if (claimed.count === 0) return redirectBack(req, back)
  }
  const original = Buffer.from(await file.arrayBuffer())
  let bytes: Buffer
  try {
    bytes = await sharp(original)
      .rotate()
      .resize({
        width: MAX_PHOTO_DIMENSION,
        height: MAX_PHOTO_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer()
  } catch (error) {
    console.error('Photo processing failed', { filename: file.name, type: file.type, error })
    if (workflowRunStepId) await prisma.workflowRunStep.updateMany({ where: { id: workflowRunStepId, collectionId: collection.id, status: 'COMPLETING' }, data: { status: 'PENDING' } })
    return redirectBack(req, back, 'processing_failed')
  }
  try {
    await mkdir(path.join(process.cwd(), 'public', 'uploads'), { recursive: true })
    const parsed = path.parse(file.name.replace(/[^a-zA-Z0-9._-]/g, '-'))
    const filename = `${Date.now()}-${parsed.name || 'photo'}.jpg`
    await writeFile(path.join(process.cwd(), 'public', 'uploads', filename), bytes)
    const data = {
      collectionId: collection.id,
      uploadedByUserId: user.id,
      entityType,
      entityId,
      filename,
      path: `/uploads/${filename}`,
      caption,
      source: workflowRunStepId ? 'WORKFLOW' : source,
      sourceUrl,
      isType: entityType === 'PLANT_DEFINITION',
      ...framingFromForm(form),
    }
    const plantSnapshot = entityType === 'PLANT_INSTANCE'
      ? await prisma.plantInstance.findFirst({ where: { id: entityId, collectionId: collection.id, status: 'ACTIVE' }, select: { id: true, plantId: true } })
      : entityType === 'BLOOM_EVENT'
        ? await prisma.bloomEvent.findFirst({ where: { id: entityId, collectionId: collection.id, plantInstance: { status: 'ACTIVE' } }, select: { plantInstance: { select: { id: true, plantId: true } } } })
        : null
    if ((entityType === 'PLANT_INSTANCE' || entityType === 'BLOOM_EVENT') && !plantSnapshot) {
      await unlink(path.join(process.cwd(), 'public', 'uploads', filename)).catch(() => undefined)
      return redirectBack(req, back, 'historical_record_read_only')
    }
    const plant = plantSnapshot && 'plantInstance' in plantSnapshot ? plantSnapshot.plantInstance : plantSnapshot
    const photo = await prisma.$transaction(async (tx) => {
      if (entityType === 'PLANT_DEFINITION') await tx.photo.updateMany({ where: { collectionId: collection.id, entityType: 'PLANT_DEFINITION', entityId }, data: { isType: false } })
      const created = await tx.photo.create({ data })
      if (plant) await emitDomainEvent(tx, {
        eventType: entityType === 'BLOOM_EVENT' ? 'bloom.photo_added' : 'plant.photo_added',
        collectionId: collection.id, aggregateId: entityId, actor: { id: user.id, role: user.role }, occurredAt: created.createdAt,
        visibility: 'COLLECTION_MEMBER', idempotencyKey: `photo:${created.id}:added`,
        payload: { subjectId: created.id, recordId: created.id, recordType: 'Photo', plantInstanceId: plant.id, plantId: plant.plantId, displayName: plant.plantId, photoId: created.id, caption: created.caption || undefined },
      })
      return created
    })
    await audit(user, 'CREATE', 'PHOTO', photo.id, `Uploaded photo for ${entityType} ${entityId}`, { filename, originalBytes: original.length, storedBytes: bytes.length, maxDimension: MAX_PHOTO_DIMENSION, source, sourceUrl, framing: framingFromForm(form) }, collection.id)
    if (workflowStep) {
      await prisma.workflowRunStep.update({
        where: { id: workflowStep.id },
        data: {
          status: 'COMPLETED',
          completedByUserId: user.id,
          completedAt: new Date(),
          notes: caption || null,
          outputJson: {
            result: 'Photo uploaded',
            createdRecords: [{ type: 'PHOTO', id: photo.id }],
            entityType,
            entityId,
            workflowRunId: workflowRunId || workflowStep.runId,
          },
          createdRecordType: 'PHOTO',
          createdRecordId: photo.id,
        },
      })
      await audit(user, 'COMPLETE', 'WORKFLOW_RUN_STEP', workflowStep.id, `Completed workflow photo step ${workflowStep.title}`, { workflowRunId: workflowRunId || workflowStep.runId, photoId: photo.id }, collection.id)
    }

    if (entityType === 'PLANT_INSTANCE') {
      const instance = await prisma.plantInstance.findFirst({ where: { id: entityId, collectionId: collection.id } })
      if (instance) {
        await notifyFollowers(prisma, {
          collectionId: collection.id,
          actorUserId: user.id,
          eventType: 'PHOTO',
          subject: `New photo for ${instance.plantId}`,
          body: caption || 'A new specimen photo was added.',
          recordPath: collectionPath(collection.slug, `/instances/${entityId}`),
          plantInstanceIds: [entityId],
          plantDefinitionIds: [instance.plantDefinitionId],
        })
      }
    } else if (entityType === 'BLOOM_EVENT') {
      const bloom = await prisma.bloomEvent.findFirst({ where: { id: entityId, collectionId: collection.id }, include: { plantInstance: true } })
      if (bloom) {
        await notifyFollowers(prisma, {
          collectionId: collection.id,
          actorUserId: user.id,
          eventType: 'PHOTO',
          subject: `New bloom photo for ${bloom.plantInstance.plantId}`,
          body: caption || 'A new bloom photo was added.',
          recordPath: collectionPath(collection.slug, `/instances/${bloom.plantInstanceId}#bloom-${bloom.id}`),
          plantInstanceIds: [bloom.plantInstanceId],
          plantDefinitionIds: [bloom.plantInstance.plantDefinitionId],
        })
      }
    } else if (entityType === 'PLANT_DEFINITION') {
      await notifyFollowers(prisma, {
        collectionId: collection.id,
        actorUserId: user.id,
        eventType: 'PHOTO',
        subject: 'New plant type image',
        body: caption || 'A plant definition type image was added.',
        recordPath: collectionPath(collection.slug, `/plants/${entityId}/edit`),
        plantDefinitionIds: [entityId],
      })
    }

    return redirectBack(req, back)
  } catch (error) {
    console.error('Photo upload failed', { entityType, entityId, filename: file.name, type: file.type, error })
    if (workflowRunStepId) await prisma.workflowRunStep.updateMany({ where: { id: workflowRunStepId, collectionId: collection.id, status: 'COMPLETING' }, data: { status: 'PENDING' } })
    return redirectBack(req, back, 'upload_failed')
  }
}
