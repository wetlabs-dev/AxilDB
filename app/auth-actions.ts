'use server'

import { redirect } from 'next/navigation'
import { audit, clearSession, createSession, getCurrentUser, hashPassword, requireAdminUser, requireUser, verifyPassword } from '@/lib/auth'
import { sendEmail, appUrl } from '@/lib/email'
import { consumeEmailToken, createEmailToken, emailTokenPurposes, expireOutstandingEmailTokens, type EmailTokenPurpose } from '@/lib/email-tokens'
import { magicLoginEmail, passwordResetEmail, welcomeEmail } from '@/lib/email-templates'
import { prisma } from '@/lib/prisma'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()

function checkbox(fd: FormData, key: string) {
  return fd.get(key) === 'on'
}

function authEmailStatusUrl(path: string, status: 'sent' | 'limited' | 'error') {
  const params = new URLSearchParams({ emailStatus: status })
  return `${path}?${params.toString()}`
}

async function isEmailRequestAllowed(email: string, purpose: EmailTokenPurpose) {
  const normalized = email.toLowerCase()
  const now = Date.now()
  const [recentMinute, recentHour] = await Promise.all([
    prisma.emailToken.count({
      where: {
        email: normalized,
        purpose,
        createdAt: { gte: new Date(now - 60 * 1000) },
      },
    }),
    prisma.emailToken.count({
      where: {
        email: normalized,
        purpose,
        createdAt: { gte: new Date(now - 60 * 60 * 1000) },
      },
    }),
  ])

  return recentMinute < 1 && recentHour < 5
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
    console.error('Verification email failed', { actor: actor.email, user: user.email, error })
    await audit(actor, 'ERROR', 'EMAIL', user.id, `Failed to send verification email to ${user.email}`, { email: user.email, error: String(error) })
    redirect(authEmailStatusUrl(destination, 'error'))
  }

  redirect(authEmailStatusUrl(destination, 'sent'))
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
      console.error('Verification email failed after account update', { user: updated.email, error })
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
    console.error('Welcome email failed', { email, error })
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
  if (!(await isEmailRequestAllowed(user.email, emailTokenPurposes.emailVerification))) redirect(authEmailStatusUrl('/users', 'limited'))
  await sendVerificationAndAudit(actor, user, '/users')
}

export async function resendOwnVerificationEmail() {
  const actor = await requireUser()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })
  if (user.emailVerifiedAt) redirect('/account')
  if (!(await isEmailRequestAllowed(user.email, emailTokenPurposes.emailVerification))) redirect(authEmailStatusUrl('/account', 'limited'))
  await sendVerificationAndAudit(actor, user, '/account')
}

export async function requestPasswordReset(fd: FormData) {
  const email = val(fd, 'email').toLowerCase()
  if (!email) redirect('/forgot-password?sent=1')
  if (!(await isEmailRequestAllowed(email, emailTokenPurposes.passwordReset))) redirect('/forgot-password?sent=1')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) redirect('/forgot-password?sent=1')

  await expireOutstandingEmailTokens(prisma, {
    email,
    purpose: emailTokenPurposes.passwordReset,
  })

  const { token } = await createEmailToken(prisma, {
    email,
    userId: user.id,
    purpose: emailTokenPurposes.passwordReset,
  })
  const resetUrl = appUrl(`/reset-password?token=${encodeURIComponent(token)}`)
  const template = passwordResetEmail(resetUrl)

  try {
    await sendEmail({
      to: email,
      subject: 'Reset your AxilDB password',
      ...template,
    })
    await audit({ id: user.id, email: user.email, role: user.role }, 'SEND', 'EMAIL', user.id, `Sent password reset email to ${email}`, { email, template: 'password-reset' })
  } catch (error) {
    console.error('Password reset email failed', { email, error })
    await audit({ id: user.id, email: user.email, role: user.role }, 'ERROR', 'EMAIL', user.id, `Failed to send password reset email to ${email}`, { email, error: String(error) })
  }

  redirect('/forgot-password?sent=1')
}

export async function resetPassword(fd: FormData) {
  const token = val(fd, 'token')
  const password = val(fd, 'password')
  if (!token || !password || password.length < 8) redirect('/reset-password?error=1')

  const record = await consumeEmailToken(prisma, {
    token,
    purpose: emailTokenPurposes.passwordReset,
  })

  if (!record) redirect('/reset-password?error=1')

  const user = record.userId
    ? await prisma.user.findUnique({ where: { id: record.userId } })
    : await prisma.user.findUnique({ where: { email: record.email } })
  if (!user) redirect('/reset-password?error=1')

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ])

  await audit({ id: user.id, email: user.email, role: user.role }, 'UPDATE', 'USER', user.id, `${user.email} reset password by email`)
  redirect('/login?reset=1')
}

export async function requestMagicLogin(fd: FormData) {
  const email = val(fd, 'email').toLowerCase()
  if (!email) redirect('/login?magic=sent')
  if (!(await isEmailRequestAllowed(email, emailTokenPurposes.magicLogin))) redirect('/login?magic=sent')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) redirect('/login?magic=sent')

  await expireOutstandingEmailTokens(prisma, {
    email,
    purpose: emailTokenPurposes.magicLogin,
  })

  const { token } = await createEmailToken(prisma, {
    email,
    userId: user.id,
    purpose: emailTokenPurposes.magicLogin,
  })
  const loginUrl = appUrl(`/magic-login?token=${encodeURIComponent(token)}`)
  const template = magicLoginEmail(loginUrl)

  try {
    await sendEmail({
      to: email,
      subject: 'Your AxilDB sign-in link',
      ...template,
    })
    await audit({ id: user.id, email: user.email, role: user.role }, 'SEND', 'EMAIL', user.id, `Sent magic login email to ${email}`, { email, template: 'magic-login' })
  } catch (error) {
    console.error('Magic login email failed', { email, error })
    await audit({ id: user.id, email: user.email, role: user.role }, 'ERROR', 'EMAIL', user.id, `Failed to send magic login email to ${email}`, { email, error: String(error) })
  }

  redirect('/login?magic=sent')
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
