import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { webPushEnabled } from '@/lib/push'

type PushSubscriptionInput = {
  endpoint?: unknown
  keys?: {
    p256dh?: unknown
    auth?: unknown
  }
  deviceLabel?: unknown
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function publicConfig() {
  return {
    enabled: webPushEnabled(),
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      endpoint: true,
      deviceLabel: true,
      userAgent: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      lastSeenAt: true,
    },
  })

  return NextResponse.json({ ...publicConfig(), subscriptions })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!webPushEnabled()) return NextResponse.json({ error: 'Web Push is disabled.' }, { status: 403 })

  const input = (await request.json().catch(() => null)) as PushSubscriptionInput | null
  const endpoint = typeof input?.endpoint === 'string' ? input.endpoint : ''
  const p256dh = typeof input?.keys?.p256dh === 'string' ? input.keys.p256dh : ''
  const auth = typeof input?.keys?.auth === 'string' ? input.keys.auth : ''
  const deviceLabel = typeof input?.deviceLabel === 'string' ? input.deviceLabel.trim().slice(0, 80) : null

  if (!endpoint || !p256dh || !auth) return badRequest('A valid browser push subscription is required.')

  const requestHeaders = await headers()
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 500) || null
  const now = new Date()
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: user.id,
      p256dh,
      auth,
      userAgent,
      deviceLabel,
      enabled: true,
      revokedAt: null,
      lastSeenAt: now,
      failureCount: 0,
      lastFailureAt: null,
    },
    create: {
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      userAgent,
      deviceLabel,
      enabled: true,
      lastSeenAt: now,
    },
    select: { id: true, endpoint: true, deviceLabel: true, enabled: true, lastSeenAt: true },
  })

  return NextResponse.json({ subscription })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const input = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  const endpoint = typeof input?.endpoint === 'string' ? input.endpoint : ''
  if (!endpoint) return badRequest('A subscription endpoint is required.')

  await prisma.pushSubscription.updateMany({
    where: { userId: user.id, endpoint },
    data: { lastSeenAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const input = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  const endpoint = typeof input?.endpoint === 'string' ? input.endpoint : ''
  if (!endpoint) return badRequest('A subscription endpoint is required.')

  await prisma.pushSubscription.updateMany({
    where: { userId: user.id, endpoint },
    data: { enabled: false, revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
