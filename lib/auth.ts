import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'

export const SESSION_COOKIE = 'axildb_session'
export const TWO_FACTOR_COOKIE = 'axildb_2fa'
const SESSION_DAYS = 30
const TWO_FACTOR_MINUTES = 10

export type AuthUser = {
  id: string
  email: string
  role: string
  twoFactorVerifiedAt?: Date | null
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(':')
  if (!salt || !storedHash) return false
  const hash = scryptSync(password, salt, 64)
  const stored = Buffer.from(storedHash, 'hex')
  return stored.length === hash.length && timingSafeEqual(stored, hash)
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string, options: { twoFactorVerifiedAt?: Date | null } = {}) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, twoFactorVerifiedAt: options.twoFactorVerifiedAt },
  })

  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function markCurrentSessionTwoFactorVerified() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { twoFactorVerifiedAt: new Date() },
  })
}

export async function clearSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  jar.delete(SESSION_COOKIE)
  jar.delete(TWO_FACTOR_COOKIE)
}

export async function createTwoFactorChallenge(userId: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TWO_FACTOR_MINUTES * 60 * 1000)

  await prisma.twoFactorChallenge.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  })

  ;(await cookies()).set(TWO_FACTOR_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function getTwoFactorChallenge() {
  const token = (await cookies()).get(TWO_FACTOR_COOKIE)?.value
  if (!token) return null

  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { twoFactor: true } } },
  })

  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) return null
  return challenge
}

export async function consumeTwoFactorChallenge(challengeId: string) {
  await prisma.twoFactorChallenge.update({
    where: { id: challengeId },
    data: { consumedAt: new Date() },
  })
  ;(await cookies()).delete(TWO_FACTOR_COOKIE)
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } })
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    twoFactorVerifiedAt: session.twoFactorVerifiedAt,
  }
}

export function isAdmin(user: AuthUser | null) {
  return isServerAdminRole(user?.role)
}

export function canCreate(user: AuthUser | null) {
  return isServerAdminRole(user?.role)
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireCreateUser() {
  const user = await requireUser()
  await assertAdminTwoFactorReady(user)
  if (!canCreate(user)) throw new Error('You do not have permission to add records.')
  return user
}

export async function requireAdminUser() {
  return requireServerAdmin()
}

export async function requireServerAdmin() {
  const user = await requireUser()
  if (!isAdmin(user)) throw new Error('Server admin access is required.')
  await assertAdminTwoFactorReady(user)
  return user
}

async function assertAdminTwoFactorReady(user: AuthUser) {
  if (!isAdmin(user)) return
  const twoFactor = await prisma.userTwoFactor.findUnique({ where: { userId: user.id } })
  if (!twoFactor?.enabledAt) redirect('/account/security?setup=required')
  if (!user.twoFactorVerifiedAt) redirect('/login?twoFactor=expired')
}

export async function audit(
  user: AuthUser | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  summary?: string,
  metadata?: unknown,
  collectionId?: string | null,
) {
  await prisma.auditLog.create({
    data: {
      collectionId,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      action,
      entityType,
      entityId,
      summary,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    },
  })
}
