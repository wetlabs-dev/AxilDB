'use server'

import { redirect } from 'next/navigation'
import { audit, clearSession, createSession, getCurrentUser, hashPassword, requireAdminUser, requireUser, verifyPassword } from '@/lib/auth'
import { sendEmail, appUrl } from '@/lib/email'
import { createEmailToken, emailTokenPurposes, expireOutstandingEmailTokens } from '@/lib/email-tokens'
import { welcomeEmail } from '@/lib/email-templates'
import { prisma } from '@/lib/prisma'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()

function checkbox(fd: FormData, key: string) {
  return fd.get(key) === 'on'
}

async function sendWelcomeVerificationEmail(user: { id: string; email: string }) {
  await expireOutstandingEmailTokens(prisma, {
    email: user.email,
    purpose: emailTokenPurposes.emailVerification,
  })

  const { token } = await createEmailToken(prisma, {
    email: user.email,
    userId: user.id,
    purpose: emailTokenPurposes.emailVerification,
  })
  const verifyUrl = appUrl(`/verify-email?token=${encodeURIComponent(token)}`)
  const template = welcomeEmail(user.email, verifyUrl)

  await sendEmail({
    to: user.email,
    subject: 'Welcome to AxilDB',
    ...template,
  })
}

async function sendVerificationAndAudit(
  actor: { id: string; email: string; role: string },
  user: { id: string; email: string },
  destination: string,
) {
  try {
    await sendWelcomeVerificationEmail(user)
    await audit(actor, 'SEND', 'EMAIL', user.id, `Sent verification email to ${user.email}`, { email: user.email, template: 'welcome' })
  } catch (error) {
    await audit(actor, 'ERROR', 'EMAIL', user.id, `Failed to send verification email to ${user.email}`, { email: user.email, error: String(error) })
  }

  redirect(destination)
}

export async function login(fd: FormData) {
  const email = val(fd, 'email').toLowerCase()
  const password = val(fd, 'password')
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect('/login?error=1')
  }

  await createSession(user.id)
  await audit({ id: user.id, email: user.email, role: user.role }, 'LOGIN', 'USER', user.id, `${user.email} signed in`)
  redirect('/')
}

export async function logout() {
  const user = await getCurrentUser()
  await audit(user, 'LOGOUT', 'USER', user?.id, user ? `${user.email} signed out` : 'Anonymous sign out')
  await clearSession()
  redirect('/')
}

export async function updateAccount(fd: FormData) {
  const user = await requireUser()
  const email = val(fd, 'email').toLowerCase()
  const password = val(fd, 'password')
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  const emailChanged = email !== existing.email

  const data: { email: string; passwordHash?: string; emailVerifiedAt?: Date | null } = { email }
  if (password) data.passwordHash = hashPassword(password)
  if (emailChanged) data.emailVerifiedAt = null

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  await audit(user, 'UPDATE_ACCOUNT', 'USER', user.id, `${user.email} updated account settings`, { email: updated.email, passwordChanged: !!password })

  if (emailChanged) {
    try {
      await sendWelcomeVerificationEmail(updated)
      await audit({ id: updated.id, email: updated.email, role: updated.role }, 'SEND', 'EMAIL', updated.id, `Sent verification email to ${updated.email}`, { email: updated.email, template: 'welcome' })
    } catch (error) {
      await audit({ id: updated.id, email: updated.email, role: updated.role }, 'ERROR', 'EMAIL', updated.id, `Failed to send verification email to ${updated.email}`, { email: updated.email, error: String(error) })
    }
  }

  redirect('/account')
}

export async function createUser(fd: FormData) {
  const actor = await requireAdminUser()
  const email = val(fd, 'email').toLowerCase()
  const password = val(fd, 'password')
  const role = val(fd, 'role') === 'ADMIN' ? 'ADMIN' : 'LOGGER'
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      role,
      emailPreference: { create: {} },
    },
  })
  await audit(actor, 'CREATE', 'USER', user.id, `Created ${role.toLowerCase()} user ${email}`, { email, role })

  try {
    await sendWelcomeVerificationEmail(user)
    await audit(actor, 'SEND', 'EMAIL', user.id, `Sent welcome email to ${email}`, { email, template: 'welcome' })
  } catch (error) {
    await audit(actor, 'ERROR', 'EMAIL', user.id, `Failed to send welcome email to ${email}`, { email, error: String(error) })
  }

  redirect('/users')
}

export async function updateUser(fd: FormData) {
  const actor = await requireAdminUser()
  const id = val(fd, 'id')
  const email = val(fd, 'email').toLowerCase()
  const role = val(fd, 'role') === 'ADMIN' ? 'ADMIN' : 'LOGGER'
  const password = val(fd, 'password')
  const data: { email: string; role: string; passwordHash?: string } = { email, role }
  if (password) data.passwordHash = hashPassword(password)
  const user = await prisma.user.update({ where: { id }, data })
  await audit(actor, 'UPDATE', 'USER', id, `Updated user ${user.email}`, { email, role, passwordChanged: !!password })
  redirect('/users')
}

export async function resendVerificationEmail(fd: FormData) {
  const actor = await requireAdminUser()
  const id = val(fd, 'id')
  const user = await prisma.user.findUniqueOrThrow({ where: { id } })
  await sendVerificationAndAudit(actor, user, '/users')
}

export async function resendOwnVerificationEmail() {
  const actor = await requireUser()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })
  if (user.emailVerifiedAt) redirect('/account')
  await sendVerificationAndAudit(actor, user, '/account')
}

export async function updateEmailPreferences(fd: FormData) {
  const user = await requireUser()
  const timezone = val(fd, 'timezone') || 'America/New_York'

  await prisma.emailPreference.upsert({
    where: { userId: user.id },
    update: {
      timezone,
      authSecurityEmails: checkbox(fd, 'authSecurityEmails'),
      welcomeEmails: checkbox(fd, 'welcomeEmails'),
      generalReminders: checkbox(fd, 'generalReminders'),
      plantCheckInReminders: checkbox(fd, 'plantCheckInReminders'),
      bloomCycleReminders: checkbox(fd, 'bloomCycleReminders'),
      propagationFollowUps: checkbox(fd, 'propagationFollowUps'),
      quietHoursStart: val(fd, 'quietHoursStart') || undefined,
      quietHoursEnd: val(fd, 'quietHoursEnd') || undefined,
    },
    create: {
      userId: user.id,
      timezone,
      authSecurityEmails: checkbox(fd, 'authSecurityEmails'),
      welcomeEmails: checkbox(fd, 'welcomeEmails'),
      generalReminders: checkbox(fd, 'generalReminders'),
      plantCheckInReminders: checkbox(fd, 'plantCheckInReminders'),
      bloomCycleReminders: checkbox(fd, 'bloomCycleReminders'),
      propagationFollowUps: checkbox(fd, 'propagationFollowUps'),
      quietHoursStart: val(fd, 'quietHoursStart') || undefined,
      quietHoursEnd: val(fd, 'quietHoursEnd') || undefined,
    },
  })

  await audit(user, 'UPDATE', 'EMAIL_PREFERENCES', user.id, `${user.email} updated email preferences`)
  redirect('/account')
}

export async function deleteUser(fd: FormData) {
  const actor = await requireAdminUser()
  const id = val(fd, 'id')
  if (id === actor.id) throw new Error('You cannot delete your own account.')
  const user = await prisma.user.delete({ where: { id } })
  await audit(actor, 'DELETE', 'USER', id, `Deleted user ${user.email}`, { email: user.email, role: user.role })
  redirect('/users')
}
