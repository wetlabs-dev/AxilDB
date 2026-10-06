import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { audit, requireServerAdmin } from '@/lib/auth'
import { migrationRoot } from '@/lib/admin/instance-migration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const user = await requireServerAdmin()
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response('Invalid report ID', { status: 400 })
  const directory = new URL(request.url).searchParams.get('source') === 'imported' ? 'imported-history' : 'jobs'
  const file = path.join(migrationRoot(), directory, `${id}.json`)
  const info = await lstat(file)
  if (!info.isFile()) return new Response('Report unavailable', { status: 404 })
  await audit(user, 'INSPECT', 'INSTANCE_MIGRATION', id, 'Inspected migration report')
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
