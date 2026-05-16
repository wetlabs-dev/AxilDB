import { NextRequest, NextResponse } from 'next/server'
import { audit, createSession } from '@/lib/auth'
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
    ? await prisma.user.findUnique({ where: { id: record.userId } })
    : await prisma.user.findUnique({ where: { email: record.email } })

  if (!user) return NextResponse.redirect(appUrl('/login?magic=expired'))

  await createSession(user.id)
  await audit({ id: user.id, email: user.email, role: user.role }, 'LOGIN', 'USER', user.id, `${user.email} signed in by magic link`)
  return NextResponse.redirect(appUrl('/'))
}
