import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

export const SESSION_COOKIE = 'axildb_session'
const SESSION_DAYS = 30

export type AuthUser = {
  id: string
  email: string
  role: string
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

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  })

  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  jar.delete(SESSION_COOKIE)
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
  }
}

export function isAdmin(user: AuthUser | null) {
  return user?.role === 'ADMIN'
}

export function canCreate(user: AuthUser | null) {
  return user?.role === 'ADMIN' || user?.role === 'LOGGER'
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireCreateUser() {
  const user = await requireUser()
  if (!canCreate(user)) throw new Error('You do not have permission to add records.')
  return user
}

export async function requireAdminUser() {
  const user = await requireUser()
  if (!isAdmin(user)) throw new Error('Admin access is required.')
  return user
}

export async function audit(user: AuthUser | null, action: string, entityType: string, entityId?: string | null, summary?: string, metadata?: unknown) {
  await prisma.auditLog.create({
    data: {
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
