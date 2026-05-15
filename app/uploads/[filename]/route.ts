import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

const contentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
}

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  const safeName = path.basename(filename)
  if (!safeName || safeName !== filename) return new NextResponse('Not found', { status: 404 })

  try {
    const filePath = path.join(process.cwd(), 'public', 'uploads', safeName)
    const bytes = await readFile(filePath)
    const extension = path.extname(safeName).toLowerCase()

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentTypes[extension] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
