import { lockPhotoTarget, photoPreviewSelect, selectSpecimenCover } from '@/lib/specimen-photos'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { readPhotoForm } from '@/lib/photo-form'
import { randomUUID } from 'node:crypto'
import { validRequestOrigin } from '@/lib/request-origin'
import { MAX_PHOTO_BYTES, SUPPORTED_PHOTO_TYPES, photoUploadErrors } from '@/lib/photo-upload'
import { imageProcessingSlots } from '@/lib/image-processing'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/auth'
import { collectionPath, getCurrentCollectionSlug, requireCollectionLogger, requireCollectionViewer, canEditInCollection } from '@/lib/collections'
import { notifyFollowers } from '@/lib/follows'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { emitDomainEvent } from '@/lib/events/emit'

const MAX_PHOTO_DIMENSION = 2000


function redirectBack(req: Request, back: string, uploadError?: string) {
  if (req.headers.get('accept')?.includes('application/json')) return NextResponse.json({ error: photoUploadErrors[uploadError || 'upload_failed'] || 'The photo could not be saved.', code: uploadError }, { status: 400 })
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const host = forwardedHost || req.headers.get('host') || new URL(req.url).host
  const proto = forwardedProto || new URL(req.url).protocol.replace(':', '')
  const base = `${proto}://${host}`
  const target = new URL(back.startsWith('/') && !back.startsWith('//') && !back.includes('\\') ? back : '/', base)
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

async function photoResult(req: Request, back: string, collectionId: string, entityType: string, entityId: string, photoId: string) {
  if (!req.headers.get('accept')?.includes('application/json')) return redirectBack(req, back)
  const photos = await prisma.photo.findMany({ where: { collectionId, entityType, entityId }, orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 1, select: photoPreviewSelect })
  return NextResponse.json({ photoId, image: photos[0] || null }, { headers: { 'Cache-Control': 'private, no-store' } })
}

async function handlePost(req: Request) {
  let form: FormData
  try {
    form = await readPhotoForm(req)
  } catch (error) {
    console.error('Photo form parsing failed', { error })
    return redirectBack(req, '/', 'upload_failed')
  }
  const choice = form.get('photoChoice') === 'photoCapture' ? 'photoCapture' : 'photo'
  const file = form.get(choice) as File | null
  const target = String(form.get('target') || '')
  const [targetType, targetId] = target.includes(':') ? target.split(':', 2) : ['', '']
  const entityType = targetType || String(form.get('entityType') || '')
  const entityId = targetId || String(form.get('entityId') || '')
  const rawCaption = String(form.get('caption') || '').slice(0, 4000)
  const caption = rawCaption.trim() ? rawCaption : undefined
  const source = String(form.get('source') || '').slice(0, 500) || undefined
  const sourceUrl = String(form.get('sourceUrl') || '').slice(0, 2000) || undefined
  const workflowRunStepId = String(form.get('workflowRunStepId') || '').trim()
  const workflowRunId = String(form.get('workflowRunId') || '').trim()
  const back = String(form.get('back') || '/')
  const context = await requireCollectionLogger(String(form.get('collectionSlug') || '') || await getCurrentCollectionSlug())
  const { user, collection } = context
  if (!(file instanceof File) || !file.size || !entityType || !entityId) return redirectBack(req, back, 'missing_photo')
  if (file.type && !SUPPORTED_PHOTO_TYPES.has(file.type)) return redirectBack(req, back, 'unsupported_format')
  if (file.size > MAX_PHOTO_BYTES) return redirectBack(req, back, 'too_large')
  // Authorize the polymorphic target before decoding or writing any bytes.
  const validTarget = entityType === 'PLANT_INSTANCE'
    ? await prisma.plantInstance.findFirst({ where: { id: entityId, collectionId: collection.id, status: 'ACTIVE' }, select: { id: true } })
    : entityType === 'PLANT_DEFINITION'
      ? await prisma.plantDefinition.findFirst({ where: { id: entityId, collectionId: collection.id }, select: { id: true } })
      : entityType === 'BLOOM_EVENT'
        ? await prisma.bloomEvent.findFirst({ where: { id: entityId, collectionId: collection.id, plantInstance: { status: 'ACTIVE' } }, select: { id: true } }) : null
  if (!validTarget) return redirectBack(req, back, 'historical_record_read_only')
  const requestedId = String(form.get('clientUploadId') || '')
  if (requestedId && !/^[0-9a-f-]{36}$/i.test(requestedId)) return redirectBack(req, back, 'upload_failed')
  const photoId = requestedId || randomUUID()
  const previous = await prisma.photo.findUnique({ where: { id: photoId } })
  if (previous) {
    if (previous.collectionId !== collection.id || previous.entityId !== entityId || previous.entityType !== entityType || previous.uploadedByUserId !== user.id) return redirectBack(req, back, 'upload_failed')
    return photoResult(req, back, collection.id, entityType, entityId, previous.id)
  }
  const setRepresentative = form.get('setRepresentative') === 'on'
  if (setRepresentative && !canEditInCollection(user, context)) return NextResponse.json({ error: 'Collection administrator permission is required to select a representative photo.' }, { status: 403 })
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
  let writtenPath: string | undefined
  let persisted = false
  try {
    await mkdir(path.join(process.cwd(), 'public', 'uploads'), { recursive: true })
    const parsed = path.parse(file.name.replace(/[^a-zA-Z0-9._-]/g, '-'))
    const filename = `${randomUUID()}-${(parsed.name || 'photo').slice(0, 60)}.jpg`
    writtenPath = path.join(process.cwd(), 'public', 'uploads', filename)
    await writeFile(writtenPath, bytes)
    const data = {
      id: photoId,
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
      await lockPhotoTarget(tx, collection.id, entityType, entityId)
      const duplicate = await tx.photo.findUnique({ where: { id: photoId } })
      if (duplicate) {
        if (duplicate.collectionId !== collection.id || duplicate.entityId !== entityId || duplicate.entityType !== entityType || duplicate.uploadedByUserId !== user.id) throw new Error('Upload identity conflict')
        return duplicate
      }
      if (entityType === 'PLANT_INSTANCE') {
        const existing = await tx.photo.findFirst({ where: { collectionId: collection.id, entityType, entityId }, orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] })
        // Pin the previously displayed fallback before adding a progress photo.
        if (setRepresentative) await tx.photo.updateMany({ where: { collectionId: collection.id, entityType, entityId }, data: { isCover: false } })
        else if (existing && !existing.isCover) await tx.photo.update({ where: { id: existing.id }, data: { isCover: true } })
        Object.assign(data, { isCover: setRepresentative || !existing })
      }
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
    persisted = photo.filename === filename
    if (!persisted) { await unlink(writtenPath).catch(() => undefined); return photoResult(req, back, collection.id, entityType, entityId, photo.id) }
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

    return photoResult(req, back, collection.id, entityType, entityId, photo.id)
  } catch (error) {
    if (writtenPath && !persisted) await unlink(writtenPath).catch(() => undefined)
    console.error('Photo upload failed', { entityType, entityId, filename: file.name, type: file.type, error })
    if (workflowRunStepId) await prisma.workflowRunStep.updateMany({ where: { id: workflowRunStepId, collectionId: collection.id, status: 'COMPLETING' }, data: { status: 'PENDING' } })
    return redirectBack(req, back, 'upload_failed')
  }
}

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > MAX_PHOTO_BYTES + 1024 * 1024) return NextResponse.json({ error: photoUploadErrors.too_large }, { status: 413 })
  if (!validRequestOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  const release = imageProcessingSlots.acquire()
  if (!release) return NextResponse.json({ error: 'Image processing is busy. Please try again shortly.' }, { status: 429, headers: { 'Retry-After': '5' } })
  try { return await handlePost(req) }
  catch (error) {
    if (isRedirectError(error) && !req.headers.get('accept')?.includes('application/json')) throw error
    const denied = isRedirectError(error) || error instanceof Error && /permission/i.test(error.message)
    console.warn('Photo request failed', { category: denied ? 'authorization' : 'server' })
    return NextResponse.json({ error: denied ? 'Verify your account and collection access before uploading.' : 'Photo upload is unavailable. Please try again.' }, { status: denied ? 403 : 500 })
  } finally { release() }
}

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams
    const context = await requireCollectionViewer(params.get('collectionSlug') || '')
    const instance = await prisma.plantInstance.findFirstOrThrow({ where: { id: params.get('plantInstanceId') || '', collectionId: context.collection.id, status: 'ACTIVE' }, select: { id: true } })
    const photos = await prisma.photo.findMany({ where: { collectionId: context.collection.id, entityType: 'PLANT_INSTANCE', entityId: instance.id }, orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 100, select: photoPreviewSelect })
    const uploadId = params.get('uploadId')
    const committed = uploadId && context.user ? await prisma.photo.findFirst({ where: { id: uploadId, collectionId: context.collection.id, entityType: 'PLANT_INSTANCE', entityId: instance.id, uploadedByUserId: context.user?.id }, select: { id: true } }) : null
    return NextResponse.json({ photos, image: photos[0] || null, committed: Boolean(committed), canSetRepresentative: canEditInCollection(context.user, context) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Plant photos are unavailable. Check collection access.' }, { status: 403 }) }
}

export async function PATCH(req: Request) {
  if (!validRequestOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  try {
    const input = await req.json()
    const { requireCollectionAdmin } = await import('@/lib/collections')
    const { user, collection } = await requireCollectionAdmin(input.collectionSlug)
    const photo = await selectSpecimenCover(prisma, collection.id, input.photoId)
    await audit(user, 'UPDATE', 'PHOTO', photo.id, 'Selected representative specimen photo', undefined, collection.id)
    return NextResponse.json({ image: { ...photo, isCover: true } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Could not select this photo. Collection administrator permission is required.' }, { status: 403 }) }
}
