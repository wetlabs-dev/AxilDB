import { NextRequest, NextResponse } from 'next/server'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { getCurrentUser } from '@/lib/auth'
import { assertCollectionTwoFactorReady } from '@/lib/collections'
import { isServerAdminRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { validRequestOrigin } from '@/lib/request-origin'
import { maxQrPayloadLength, parseQrPayload, qrOrigins } from '@/lib/qr-payload'
import { resolveQrTarget } from '@/lib/qr-resolution'
export const dynamic = 'force-dynamic'
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function POST(request: NextRequest) {
  try {
    if (!validRequestOrigin(request)) return json({ error: 'Invalid request origin.' }, 403)
    const user = await getCurrentUser()
    if (!user) return json({ error: 'Your session has expired. Sign in again to scan a label.', signIn: true }, 401)
    // Check step-up authentication before any lookup, so status differences cannot reveal private existence.
    if (isServerAdminRole(user.role)) await assertCollectionTwoFactorReady(user, 'MANAGER')
    if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Choose a label or enter an accession ID.' }, 400)
    if (Number(request.headers.get('content-length') || 0) > 8192) return json({ error: 'This label is too long.' }, 400)
    // Bound the body even when Content-Length is absent or untrusted.
    const reader = request.body?.getReader(); if (!reader) return json({ error: 'Choose a label.' }, 400)
    let bytes = 0, text = ''; const decoder = new TextDecoder()
    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 8192) { await reader.cancel(); return json({ error: 'This label is too long.' }, 400) } text += decoder.decode(value, { stream: true }) }
    text += decoder.decode()
    let input: { payload?: unknown; manual?: boolean }; try { input = JSON.parse(text) } catch { return json({ error: 'Choose a valid label.' }, 400) }
    if (!input || typeof input !== 'object' || typeof input.payload !== 'string' || input.payload.length > maxQrPayloadLength) return json({ error: 'This QR code is not a recognized AxilDB label.' }, 400)
    const env = process.env
    const target = parseQrPayload(input.payload, qrOrigins([request.headers.get('origin'), env.NEXT_PUBLIC_APP_URL, ...(env.AXILDB_QR_TRUSTED_ORIGINS || '').split(',')]), input.manual === true)
    if (!target) return json({ error: 'This QR code is not a recognized AxilDB label.' }, 400)
    const records = await resolveQrTarget(prisma, user, target)
    if (!records.length) return json({ error: 'We couldn’t find an accessible record for this label.' }, 404)
    if (records.length > 10) return json({ error: 'Several records match. Scan a collection-specific label or use the collection search.' }, 409)
    // resolveQrTarget uses the same canViewCollection policy as collection detail routes.
    return json({ records })
  } catch (error) {
    if (isRedirectError(error)) return json({ error: 'Sign in again to open this record.', signIn: true }, 401)
    return json({ error: 'We couldn’t look up this label. Check your connection and try again.' }, 503)
  }
}
