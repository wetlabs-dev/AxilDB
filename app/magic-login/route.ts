import { NextRequest, NextResponse } from 'next/server'
import { audit, createSession, createTwoFactorChallenge } from '@/lib/auth'
import { appUrl } from '@/lib/email'
import { consumeEmailToken, emailTokenPurposes } from '@/lib/email-tokens'
import { prisma } from '@/lib/prisma'
import { pathWithNext, safeNextPath } from '@/lib/redirects'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const next = safeNextPath(req.nextUrl.searchParams.get('next'))
  if (!token) return NextResponse.redirect(appUrl(pathWithNext('/login?magic=expired', next)))

  const record = await consumeEmailToken(prisma, {
    token,
    purpose: emailTokenPurposes.magicLogin,
    consumedByIp: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
  })

  if (!record) return NextResponse.redirect(appUrl(pathWithNext('/login?magic=expired', next)))

  const user = record.userId
    ? await prisma.user.findUnique({ where: { id: record.userId }, include: { twoFactor: true } })
    : await prisma.user.findUnique({ where: { email: record.email }, include: { twoFactor: true } })

  if (!user || user.disabledAt) return NextResponse.redirect(appUrl(pathWithNext('/login?magic=expired', next)))

  if (user.twoFactor?.enabledAt) {
    await createTwoFactorChallenge(user.id)
    await audit({ id: user.id, email: user.email, role: user.role }, '2FA_CHALLENGE', 'USER', user.id, `${user.email} started two-factor sign in by magic link`)
    return NextResponse.redirect(appUrl(pathWithNext('/two-factor', next)))
  }

  await createSession(user.id)
  await audit({ id: user.id, email: user.email, role: user.role }, 'LOGIN', 'USER', user.id, `${user.email} signed in by magic link`)
  return NextResponse.redirect(appUrl(user.role === 'SERVER_ADMIN' && !user.twoFactor?.enabledAt ? '/account/security?setup=required' : next))
}
