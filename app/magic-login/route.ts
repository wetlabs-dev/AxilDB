import { NextRequest, NextResponse } from 'next/server'
import { audit, createSession, createTwoFactorChallenge } from '@/lib/auth'
import { appUrl } from '@/lib/email'
import { consumeEmailToken, emailTokenPurposes } from '@/lib/email-tokens'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.redirect(appUrl('/login?magic=expired'))

  const record = await consumeEmailToken(prisma, {
    token,
    purpose: emailTokenPurposes.magicLogin,
    consumedByIp: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
  })

  if (!record) return NextResponse.redirect(appUrl('/login?magic=expired'))

  const user = record.userId
    ? await prisma.user.findUnique({ where: { id: record.userId }, include: { twoFactor: true } })
    : await prisma.user.findUnique({ where: { email: record.email }, include: { twoFactor: true } })

  if (!user) return NextResponse.redirect(appUrl('/login?magic=expired'))

  if (user.role === 'ADMIN' && user.twoFactor?.enabledAt) {
    await createTwoFactorChallenge(user.id)
    await audit({ id: user.id, email: user.email, role: user.role }, '2FA_CHALLENGE', 'USER', user.id, `${user.email} started two-factor sign in by magic link`)
    return NextResponse.redirect(appUrl('/two-factor'))
  }

  await createSession(user.id)
  await audit({ id: user.id, email: user.email, role: user.role }, 'LOGIN', 'USER', user.id, `${user.email} signed in by magic link`)
  return NextResponse.redirect(appUrl(user.role === 'ADMIN' && !user.twoFactor?.enabledAt ? '/account/security?setup=required' : '/'))
}
