import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, requireCreateUser } from '@/lib/auth'
import { notifyFollowers } from '@/lib/follows'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

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

export async function POST(req: Request) {
  const user = await requireCreateUser()
  let form: FormData
  try {
    form = await req.formData()
  } catch (error) {
    console.error('Photo form parsing failed', { error })
    return redirectBack(req, '/', 'upload_failed')
  }
  const file = form.get('photo') as File | null
  const entityType = String(form.get('entityType') || '')
  const entityId = String(form.get('entityId') || '')
  const caption = String(form.get('caption') || '') || undefined
  const source = String(form.get('source') || '') || undefined
  const sourceUrl = String(form.get('sourceUrl') || '') || undefined
  const back = String(form.get('back') || '/')
  if (!file || !entityType || !entityId) return redirectBack(req, back, 'missing_photo')
  if (file.type && !SUPPORTED_IMAGE_TYPES.has(file.type)) return redirectBack(req, back, 'unsupported_format')
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
    return redirectBack(req, back, 'processing_failed')
  }
  try {
    await mkdir(path.join(process.cwd(), 'public', 'uploads'), { recursive: true })
    const parsed = path.parse(file.name.replace(/[^a-zA-Z0-9._-]/g, '-'))
    const filename = `${Date.now()}-${parsed.name || 'photo'}.jpg`
    await writeFile(path.join(process.cwd(), 'public', 'uploads', filename), bytes)
    const data = {
      entityType,
      entityId,
      filename,
      path: `/uploads/${filename}`,
      caption,
      source,
      sourceUrl,
      isType: entityType === 'PLANT_DEFINITION',
    }
    const photo = entityType === 'PLANT_DEFINITION'
      ? (await prisma.$transaction([
          prisma.photo.updateMany({ where: { entityType: 'PLANT_DEFINITION', entityId }, data: { isType: false } }),
          prisma.photo.create({ data }),
        ]))[1]
      : await prisma.photo.create({ data })
    await audit(user, 'CREATE', 'PHOTO', photo.id, `Uploaded photo for ${entityType} ${entityId}`, { filename, originalBytes: original.length, storedBytes: bytes.length, maxDimension: MAX_PHOTO_DIMENSION, source, sourceUrl })

    if (entityType === 'PLANT_INSTANCE') {
      const instance = await prisma.plantInstance.findUnique({ where: { id: entityId } })
      if (instance) {
        await notifyFollowers(prisma, {
          actorUserId: user.id,
          eventType: 'PHOTO',
          subject: `New photo for ${instance.plantId}`,
          body: caption || 'A new specimen photo was added.',
          recordPath: `/instances/${entityId}`,
          plantInstanceIds: [entityId],
          plantDefinitionIds: [instance.plantDefinitionId],
        })
      }
    } else if (entityType === 'BLOOM_EVENT') {
      const bloom = await prisma.bloomEvent.findUnique({ where: { id: entityId }, include: { plantInstance: true } })
      if (bloom) {
        await notifyFollowers(prisma, {
          actorUserId: user.id,
          eventType: 'PHOTO',
          subject: `New bloom photo for ${bloom.plantInstance.plantId}`,
          body: caption || 'A new bloom photo was added.',
          recordPath: `/instances/${bloom.plantInstanceId}#bloom-${bloom.id}`,
          plantInstanceIds: [bloom.plantInstanceId],
          plantDefinitionIds: [bloom.plantInstance.plantDefinitionId],
        })
      }
    } else if (entityType === 'PLANT_DEFINITION') {
      await notifyFollowers(prisma, {
        actorUserId: user.id,
        eventType: 'PHOTO',
        subject: 'New plant type image',
        body: caption || 'A plant definition type image was added.',
        recordPath: `/plants/${entityId}/edit`,
        plantDefinitionIds: [entityId],
      })
    }

    return redirectBack(req, back)
  } catch (error) {
    console.error('Photo upload failed', { entityType, entityId, filename: file.name, type: file.type, error })
    return redirectBack(req, back, 'upload_failed')
  }
}
