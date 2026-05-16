import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { PrismaClient } from '@prisma/client'

type EmailTokenClient = Pick<PrismaClient, 'emailToken'>

export const emailTokenPurposes = {
  emailVerification: 'EMAIL_VERIFICATION',
  passwordReset: 'PASSWORD_RESET',
  magicLogin: 'MAGIC_LOGIN',
} as const

export type EmailTokenPurpose = typeof emailTokenPurposes[keyof typeof emailTokenPurposes]

const defaultTtlMinutes: Record<EmailTokenPurpose, number> = {
  EMAIL_VERIFICATION: 24 * 60,
  PASSWORD_RESET: 30,
  MAGIC_LOGIN: 15,
}

export function hashEmailToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function safeTokenEquals(token: string, tokenHash: string) {
  const candidate = Buffer.from(hashEmailToken(token), 'hex')
  const stored = Buffer.from(tokenHash, 'hex')
  return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}

export async function createEmailToken(
  client: EmailTokenClient,
  options: {
    email: string
    purpose: EmailTokenPurpose
    userId?: string | null
    ttlMinutes?: number
  },
) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + (options.ttlMinutes || defaultTtlMinutes[options.purpose]) * 60 * 1000)

  const record = await client.emailToken.create({
    data: {
      email: options.email.toLowerCase(),
      userId: options.userId || undefined,
      purpose: options.purpose,
      tokenHash: hashEmailToken(token),
      expiresAt,
    },
  })

  return { token, record }
}

export async function consumeEmailToken(
  client: EmailTokenClient,
  options: {
    token: string
    purpose: EmailTokenPurpose
    consumedByIp?: string | null
  },
) {
  const tokenHash = hashEmailToken(options.token)
  const record = await client.emailToken.findUnique({ where: { tokenHash } })

  if (!record) return null
  if (record.purpose !== options.purpose) return null
  if (record.usedAt) return null
  if (record.expiresAt < new Date()) return null
  if (!safeTokenEquals(options.token, record.tokenHash)) return null

  return client.emailToken.update({
    where: { id: record.id },
    data: {
      usedAt: new Date(),
      consumedByIp: options.consumedByIp || undefined,
    },
  })
}

export async function expireOutstandingEmailTokens(
  client: EmailTokenClient,
  options: {
    email: string
    purpose: EmailTokenPurpose
  },
) {
  await client.emailToken.updateMany({
    where: {
      email: options.email.toLowerCase(),
      purpose: options.purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  })
}
