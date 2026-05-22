import type { User } from '@prisma/client'
import type { AuthUser } from '@/lib/auth'
import { audit } from '@/lib/auth'
import { appUrl, sendEmail } from '@/lib/email'
import { transferWorkflowEmail } from '@/lib/email-templates'
import { prisma } from '@/lib/prisma'

type TransferRecipient = Pick<User, 'id' | 'email' | 'emailVerifiedAt'> & {
  emailPreference?: { transferNotifications: boolean } | null
}

type TransferEmailInput = {
  actor?: AuthUser | null
  collectionId?: string | null
  entityType: string
  entityId?: string | null
  subject: string
  actionPath: string
  lines: string[]
  users?: TransferRecipient[]
  collectionIdForRoles?: string
  roles?: string[]
  excludeUserIds?: string[]
}

export async function collectionTransferRecipients(collectionId: string, roles: string[], excludeUserIds: string[] = []) {
  const memberships = await prisma.collectionMembership.findMany({
    where: {
      collectionId,
      status: 'ACTIVE',
      role: { in: roles },
      ...(excludeUserIds.length > 0 ? { userId: { notIn: excludeUserIds } } : {}),
    },
    include: {
      user: {
        include: { emailPreference: { select: { transferNotifications: true } } },
      },
    },
  })

  return memberships.map((membership) => membership.user)
}

export async function userTransferRecipient(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { emailPreference: { select: { transferNotifications: true } } },
  })
}

export async function sendTransferWorkflowEmail(input: TransferEmailInput) {
  const roleUsers = input.collectionIdForRoles && input.roles
    ? await collectionTransferRecipients(input.collectionIdForRoles, input.roles, input.excludeUserIds)
    : []
  const users = [...(input.users || []), ...roleUsers]
  const seen = new Set<string>()
  const actionUrl = appUrl(input.actionPath)
  const template = transferWorkflowEmail(input.subject, actionUrl, input.lines)

  for (const user of users) {
    if (!user || seen.has(user.id)) continue
    seen.add(user.id)

    if (!user.emailVerifiedAt || user.emailPreference?.transferNotifications === false) {
      continue
    }

    try {
      await sendEmail({
        to: user.email,
        subject: input.subject,
        ...template,
      })
      await audit(input.actor || null, 'SEND', 'EMAIL', input.entityId, `Sent transfer workflow email to ${user.email}`, {
        subject: input.subject,
        recipient: user.email,
        entityType: input.entityType,
        actionUrl,
      }, input.collectionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Transfer workflow email failed', { subject: input.subject, recipient: user.email, error: message })
      await audit(input.actor || null, 'ERROR', 'EMAIL', input.entityId, `Failed to send transfer workflow email to ${user.email}`, {
        subject: input.subject,
        recipient: user.email,
        entityType: input.entityType,
        error: message,
      }, input.collectionId)
    }
  }
}
