import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, requireCreateUser } from '@/lib/auth'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
export async function POST(req: Request) {
  const user = await requireCreateUser()
  const form = await req.formData()
  const file = form.get('photo') as File | null
  const entityType = String(form.get('entityType') || '')
  const entityId = String(form.get('entityId') || '')
  const caption = String(form.get('caption') || '') || undefined
  const back = String(form.get('back') || '/')
  if (!file || !entityType || !entityId) return NextResponse.redirect(new URL(back, req.url))
  const bytes = Buffer.from(await file.arrayBuffer())
  await mkdir(path.join(process.cwd(), 'public', 'uploads'), { recursive: true })
  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  await writeFile(path.join(process.cwd(), 'public', 'uploads', filename), bytes)
  const photo = await prisma.photo.create({ data: { entityType, entityId, filename, path: `/uploads/${filename}`, caption } })
  await audit(user, 'CREATE', 'PHOTO', photo.id, `Uploaded photo for ${entityType} ${entityId}`, { filename })
  return NextResponse.redirect(new URL(back, req.url))
}
