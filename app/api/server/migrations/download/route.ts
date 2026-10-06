import { Readable } from 'node:stream'
import { audit, requireServerAdmin } from '@/lib/auth'
import { openMigrationArchive } from '@/lib/admin/instance-migration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const user = await requireServerAdmin()
  const name = new URL(request.url).searchParams.get('name') || ''
  const { stream, bytes } = await openMigrationArchive(name)
  try {
    await audit(user, 'DOWNLOAD', 'INSTANCE_MIGRATION', name, 'Downloaded migration archive')
  } catch (error) { stream.destroy(); throw error }
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': 'application/gzip', 'Content-Length': String(bytes),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    },
  })
}
