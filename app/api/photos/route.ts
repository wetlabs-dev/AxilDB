import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, requireCreateUser } from '@/lib/auth'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

const MAX_PHOTO_DIMENSION = 2000

function redirectBack(req: Request, back: string) {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const host = forwardedHost || req.headers.get('host') || new URL(req.url).host
  const proto = forwardedProto || new URL(req.url).protocol.replace(':', '')
  const base = `${proto}://${host}`
  const target = new URL(back || '/', base)
  return NextResponse.redirect(target)
}

export async function POST(req: Request) {
  const user = await requireCreateUser()
  const form = await req.formData()
  const file = form.get('photo') as File | null
  const entityType = String(form.get('entityType') || '')
  const entityId = String(form.get('entityId') || '')
  const caption = String(form.get('caption') || '') || undefined
  const source = String(form.get('source') || '') || undefined
  const sourceUrl = String(form.get('sourceUrl') || '') || undefined
  const back = String(form.get('back') || '/')
  if (!file || !entityType || !entityId) return redirectBack(req, back)
  const original = Buffer.from(await file.arrayBuffer())
  const bytes = await sharp(original)
    .rotate()
    .resize({
      width: MAX_PHOTO_DIMENSION,
      height: MAX_PHOTO_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
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
  return redirectBack(req, back)
}
