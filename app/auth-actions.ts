'use server'

import { redirect } from 'next/navigation'
import { audit, clearSession, consumeTwoFactorChallenge, createSession, createTwoFactorChallenge, getCurrentUser, getTwoFactorChallenge, hashPassword, hashToken, markCurrentSessionTwoFactorVerified, requireServerAdmin, requireUser, verifyPassword } from '@/lib/auth'
import { sendEmail, appUrl } from '@/lib/email'
import { consumeEmailToken, createEmailToken, emailTokenPurposes, expireOutstandingEmailTokens, type EmailTokenPurpose } from '@/lib/email-tokens'
import { magicLoginEmail, passwordResetEmail, welcomeEmail } from '@/lib/email-templates'
import { prisma } from '@/lib/prisma'
import { pathWithNext, safeNextPath } from '@/lib/redirects'
import { collectionRoles, normalizeCollectionRole } from '@/lib/roles'
import { defaultTimeZone, normalizeTimeZone } from '@/lib/time'
import { decryptTotpSecret, encryptRecoveryCodes, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from '@/lib/totp'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()
const roles = new Set(['USER', 'SERVER_ADMIN'])
const collectionRoleValues = new Set<string>(collectionRoles)
const membershipStatusValues = new Set(['PENDING', 'ACTIVE', 'REJECTED'])

function checkbox(fd: FormData, key: string) {
  return fd.get(key) === 'on'
}

function timeOfDayFromForm(fd: FormData, key: string, fallback: string) {
  const value = val(fd, key)
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
}

function roleFromForm(fd: FormData) {
  const role = val(fd, 'role').toUpperCase()
  return roles.has(role) ? role : 'USER'
}

function collectionRoleFromForm(fd: FormData) {
  const role = val(fd, 'role').toUpperCase()
  return collectionRoleValues.has(role) ? role : 'VIEWER'
}

function membershipStatusFromForm(fd: FormData) {
  const status = val(fd, 'status').toUpperCase()
  return membershipStatusValues.has(status) ? status : 'ACTIVE'
}

function authEmailStatusUrl(path: string, status: 'sent' | 'limited' | 'error') {
  const params = new URLSearchParams({ emailStatus: status })
  return `${path}?${params.toString()}`
}

async function assertActiveCollectionKeepsManager(collectionId: string, excludingMembershipId?: string) {
  const collection = await prisma.collection.findUniqueOrThrow({
    where: { id: collectionId },
    select: { status: true },
  })
  if (collection.status !== 'ACTIVE') return

  const memberships = await prisma.collectionMembership.findMany({
    where: {
      collectionId,
      status: 'ACTIVE',
      ...(excludingMembershipId ? { id: { not: excludingMembershipId } } : {}),
    },
    select: { role: true },
  })
  const hasManager = memberships.some((membership) => normalizeCollectionRole(membership.role) === 'MANAGER')
  if (!hasManager) throw new Error('Active collections must keep at least one active collection manager.')
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
  const next = safeNextPath(val(fd, 'next'))
  const user = await prisma.user.findUnique({ where: { email }, include: { twoFactor: true } })

  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect(pathWithNext('/login?error=1', next))
  }

  if (user.twoFactor?.enabledAt) {
    await createTwoFactorChallenge(user.id)
    await audit({ id: user.id, email: user.email, role: user.role }, '2FA_CHALLENGE', 'USER', user.id, `${user.email} started two-factor sign in`)
    redirect(pathWithNext('/two-factor', next))
  }

  await createSession(user.id)
  await audit({ id: user.id, email: user.email, role: user.role }, 'LOGIN', 'USER', user.id, `${user.email} signed in`)
  redirect(user.role === 'SERVER_ADMIN' && !user.twoFactor?.enabledAt ? '/account/security?setup=required' : next)
}

export async function verifyTwoFactorLogin(fd: FormData) {
  const code = val(fd, 'code')
  const next = safeNextPath(val(fd, 'next'))
  const challenge = await getTwoFactorChallenge()

  if (!challenge?.user.twoFactor?.enabledAt) redirect(pathWithNext('/login?twoFactor=expired', next))

  const secret = decryptTotpSecret(challenge.user.twoFactor.secretCiphertext)
  let method: 'totp' | 'recovery_code' = 'totp'
  if (!verifyTotp(secret, code)) {
    const recoveryCode = await prisma.twoFactorRecoveryCode.findFirst({
      where: {
        userTwoFactorId: challenge.user.twoFactor.id,
        codeHash: hashRecoveryCode(code),
        usedAt: null,
      },
    })

    if (!recoveryCode) redirect(pathWithNext('/two-factor?error=1', next))

    await prisma.twoFactorRecoveryCode.update({
      where: { id: recoveryCode.id },
      data: { usedAt: new Date() },
    })
    method = 'recovery_code'
  }

  await consumeTwoFactorChallenge(challenge.id)
  await createSession(challenge.user.id, { twoFactorVerifiedAt: new Date() })
  await audit(
    { id: challenge.user.id, email: challenge.user.email, role: challenge.user.role },
    'LOGIN',
    'USER',
    challenge.user.id,
    `${challenge.user.email} signed in with two-factor authentication`,
    { method },
  )
  redirect(next)
}

export async function confirmTwoFactorSetup(fd: FormData) {
  const user = await requireUser()
  const code = val(fd, 'code')
  const setup = await prisma.userTwoFactor.findUnique({ where: { userId: user.id } })

  if (!setup) redirect('/account/security?twoFactor=missing')

  const secret = decryptTotpSecret(setup.secretCiphertext)
  if (!verifyTotp(secret, code)) redirect('/account/security?twoFactor=invalid')

  const recoveryCodes = generateRecoveryCodes()
  await prisma.$transaction(async (tx) => {
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userTwoFactorId: setup.id } })
    await tx.userTwoFactor.update({
      where: { userId: user.id },
      data: {
        enabledAt: new Date(),
        recoveryCodesCiphertext: encryptRecoveryCodes(recoveryCodes),
        recoveryCodesGeneratedAt: new Date(),
        recoveryCodesViewedAt: null,
      },
    })
    await tx.twoFactorRecoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({
        userTwoFactorId: setup.id,
        codeHash: hashRecoveryCode(recoveryCode),
      })),
    })
  })
  await markCurrentSessionTwoFactorVerified()
  await audit(user, 'ENABLE_2FA', 'USER', user.id, `${user.email} enabled two-factor authentication`)
  redirect('/account/security?twoFactor=enabled')
}

export async function resetTwoFactorSetup() {
  const user = await requireUser()
  const existing = await prisma.userTwoFactor.findUnique({ where: { userId: user.id } })
  if (existing?.enabledAt && !user.twoFactorVerifiedAt) redirect('/login?twoFactor=expired')

  const secret = generateTotpSecret()
  await prisma.userTwoFactor.upsert({
    where: { userId: user.id },
    create: { userId: user.id, secretCiphertext: encryptTotpSecret(secret) },
    update: {
      secretCiphertext: encryptTotpSecret(secret),
      enabledAt: null,
      recoveryCodesCiphertext: null,
      recoveryCodesGeneratedAt: null,
      recoveryCodesViewedAt: null,
      recoveryCodes: { deleteMany: {} },
    },
  })
  await audit(user, 'RESET_2FA_SETUP', 'USER', user.id, `${user.email} reset two-factor setup`)
  redirect('/account/security?twoFactor=reset')
}

export async function regenerateRecoveryCodes() {
  const user = await requireUser()
  const setup = await prisma.userTwoFactor.findUnique({ where: { userId: user.id } })
  if (!setup?.enabledAt) redirect('/account/security?twoFactor=missing')
  if (user.role === 'SERVER_ADMIN' && !user.twoFactorVerifiedAt) redirect('/login?twoFactor=expired')

  const recoveryCodes = generateRecoveryCodes()
  await prisma.$transaction(async (tx) => {
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userTwoFactorId: setup.id } })
    await tx.userTwoFactor.update({
      where: { userId: user.id },
      data: {
        recoveryCodesCiphertext: encryptRecoveryCodes(recoveryCodes),
        recoveryCodesGeneratedAt: new Date(),
        recoveryCodesViewedAt: null,
      },
    })
    await tx.twoFactorRecoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({
        userTwoFactorId: setup.id,
        codeHash: hashRecoveryCode(recoveryCode),
      })),
    })
  })

  await audit(user, 'REGENERATE_2FA_RECOVERY_CODES', 'USER', user.id, `${user.email} regenerated two-factor recovery codes`)
  redirect('/account/security?recoveryCodes=generated')
}

export async function dismissRecoveryCodes() {
  const user = await requireUser()
  await prisma.userTwoFactor.updateMany({
    where: { userId: user.id },
    data: { recoveryCodesCiphertext: null, recoveryCodesViewedAt: new Date() },
  })
  await audit(user, 'DISMISS_2FA_RECOVERY_CODES', 'USER', user.id, `${user.email} confirmed two-factor recovery codes were saved`)
  redirect('/account/security')
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

export async function registerViewer(fd: FormData) {
  const email = val(fd, 'email').toLowerCase()
  const password = val(fd, 'password')
  const inviteToken = val(fd, 'invite')
  const next = safeNextPath(val(fd, 'next'))

  if (!email || password.length < 8) redirect(pathWithNext('/register?error=invalid', next))

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) redirect(pathWithNext('/register?error=exists', next))

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      role: 'USER',
      emailPreference: { create: {} },
    },
  })
  await audit({ id: user.id, email: user.email, role: user.role }, 'REGISTER', 'USER', user.id, `Registered viewer account ${email}`, { email, role: 'USER' })

  if (inviteToken) {
    const invitation = await prisma.collectionInvitation.findUnique({
      where: { tokenHash: hashToken(inviteToken) },
      include: { collection: true },
    })
    if (invitation && invitation.email === email && invitation.status === 'PENDING' && invitation.expiresAt > new Date()) {
      await prisma.$transaction([
        prisma.collectionMembership.upsert({
          where: { collectionId_userId: { collectionId: invitation.collectionId, userId: user.id } },
          update: { role: invitation.role, status: 'ACTIVE' },
          create: { collectionId: invitation.collectionId, userId: user.id, role: invitation.role, status: 'ACTIVE' },
        }),
        prisma.collectionInvitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED', acceptedUserId: user.id, acceptedAt: new Date() },
        }),
      ])
      await audit({ id: user.id, email: user.email, role: user.role }, 'ACCEPT', 'COLLECTION_INVITATION', invitation.id, `${email} accepted invitation to ${invitation.collection.name}`, { role: invitation.role }, invitation.collectionId)
    }
  }

  try {
    await sendWelcomeVerificationEmail(user)
    await audit({ id: user.id, email: user.email, role: user.role }, 'SEND', 'EMAIL', user.id, `Sent welcome email to ${email}`, { email, template: 'welcome' })
  } catch (error) {
    console.error('Welcome email failed after viewer registration', { email, error })
    await audit({ id: user.id, email: user.email, role: user.role }, 'ERROR', 'EMAIL', user.id, `Failed to send welcome email to ${email}`, { email, error: String(error) })
  }

  await createSession(user.id)
  redirect(next === '/' ? '/following?registered=1' : next)
}

export async function createUser(fd: FormData) {
  const actor = await requireServerAdmin()
  const email = val(fd, 'email').toLowerCase()
  const password = val(fd, 'password')
  const role = roleFromForm(fd)
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

  redirect('/server/users')
}

export async function updateUser(fd: FormData) {
  const actor = await requireServerAdmin()
  const id = val(fd, 'id')
  const email = val(fd, 'email').toLowerCase()
  const role = roleFromForm(fd)
  const password = val(fd, 'password')
  const data: { email: string; role: string; passwordHash?: string } = { email, role }
  if (password) data.passwordHash = hashPassword(password)
  const user = await prisma.user.update({ where: { id }, data })
  await audit(actor, 'UPDATE', 'USER', id, `Updated user ${user.email}`, { email, role, passwordChanged: !!password })
  redirect('/server/users')
}

export async function resendVerificationEmail(fd: FormData) {
  const actor = await requireServerAdmin()
  const id = val(fd, 'id')
  const user = await prisma.user.findUniqueOrThrow({ where: { id } })
  if (!(await isEmailRequestAllowed(user.email, emailTokenPurposes.emailVerification))) redirect(authEmailStatusUrl('/server/users', 'limited'))
  await sendVerificationAndAudit(actor, user, '/server/users')
}

export async function serverAddUserMembership(fd: FormData) {
  const actor = await requireServerAdmin()
  const userId = val(fd, 'userId')
  const collectionId = val(fd, 'collectionId')
  const role = collectionRoleFromForm(fd)
  const status = membershipStatusFromForm(fd)

  const [user, collection] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.collection.findUniqueOrThrow({ where: { id: collectionId } }),
  ])
  const existing = await prisma.collectionMembership.findUnique({
    where: { collectionId_userId: { collectionId, userId } },
  })

  if (existing) {
    await audit(
      actor,
      'SKIP',
      'COLLECTION_MEMBERSHIP',
      existing.id,
      `${user.email} already has a membership in ${collection.name}`,
      { email: user.email, role: existing.role, status: existing.status, collection: collection.slug },
      collectionId,
    )
    redirect('/server/users')
  }

  const membership = await prisma.collectionMembership.create({
    data: { collectionId, userId, role, status },
  })

  await assertActiveCollectionKeepsManager(collectionId)
  await audit(
    actor,
    'UPSERT',
    'COLLECTION_MEMBERSHIP',
    membership.id,
    `Set ${user.email} as ${role.toLowerCase()} in ${collection.name}`,
    { email: user.email, role, status, collection: collection.slug },
    collectionId,
  )
  redirect('/server/users')
}

export async function serverUpdateMembership(fd: FormData) {
  const actor = await requireServerAdmin()
  const id = val(fd, 'membershipId')
  const role = collectionRoleFromForm(fd)
  const status = membershipStatusFromForm(fd)
  const existing = await prisma.collectionMembership.findUniqueOrThrow({
    where: { id },
    include: {
      collection: { select: { id: true, name: true, slug: true, status: true } },
      user: { select: { email: true } },
    },
  })

  const existingRole = normalizeCollectionRole(existing.role)
  if (existing.collection.status === 'ACTIVE' && existing.status === 'ACTIVE' && existingRole === 'MANAGER' && (role !== 'MANAGER' || status !== 'ACTIVE')) {
    await assertActiveCollectionKeepsManager(existing.collectionId, existing.id)
  }

  const membership = await prisma.collectionMembership.update({
    where: { id },
    data: { role, status },
  })

  await audit(
    actor,
    'UPDATE',
    'COLLECTION_MEMBERSHIP',
    membership.id,
    `Updated ${existing.user.email} membership in ${existing.collection.name}`,
    { email: existing.user.email, role, status, collection: existing.collection.slug },
    existing.collectionId,
  )
  redirect('/server/users')
}

export async function serverRemoveMembership(fd: FormData) {
  const actor = await requireServerAdmin()
  const id = val(fd, 'membershipId')
  const membership = await prisma.collectionMembership.findUniqueOrThrow({
    where: { id },
    include: {
      collection: { select: { id: true, name: true, slug: true, status: true } },
      user: { select: { email: true } },
    },
  })

  if (membership.collection.status === 'ACTIVE' && membership.status === 'ACTIVE' && normalizeCollectionRole(membership.role) === 'MANAGER') {
    await assertActiveCollectionKeepsManager(membership.collectionId, membership.id)
  }

  await prisma.collectionMembership.delete({ where: { id } })
  await audit(
    actor,
    'DELETE',
    'COLLECTION_MEMBERSHIP',
    id,
    `Removed ${membership.user.email} from ${membership.collection.name}`,
    { email: membership.user.email, role: membership.role, collection: membership.collection.slug },
    membership.collectionId,
  )
  redirect('/server/users')
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
  const next = safeNextPath(val(fd, 'next'))
  if (!email) redirect(pathWithNext('/login?magic=sent', next))
  if (!(await isEmailRequestAllowed(email, emailTokenPurposes.magicLogin))) redirect(pathWithNext('/login?magic=sent', next))

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) redirect(pathWithNext('/login?magic=sent', next))

  await expireOutstandingEmailTokens(prisma, {
    email,
    purpose: emailTokenPurposes.magicLogin,
  })

  const { token } = await createEmailToken(prisma, {
    email,
    userId: user.id,
    purpose: emailTokenPurposes.magicLogin,
  })
  const loginUrl = appUrl(pathWithNext(`/magic-login?token=${encodeURIComponent(token)}`, next))
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

  redirect(pathWithNext('/login?magic=sent', next))
}

export async function updateEmailPreferences(fd: FormData) {
  const user = await requireUser()
  const timezone = normalizeTimeZone(val(fd, 'timezone') || defaultTimeZone())
  const careQueueDigestSendTime = timeOfDayFromForm(fd, 'careQueueDigestSendTime', '08:00')

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
      followNotifications: checkbox(fd, 'followNotifications'),
      transferNotifications: checkbox(fd, 'transferNotifications'),
      careQueueDigestEmailEnabled: checkbox(fd, 'careQueueDigestEmailEnabled'),
      serverHealthEmailEnabled: checkbox(fd, 'serverHealthEmailEnabled'),
      generalRemindersPushEnabled: checkbox(fd, 'generalRemindersPushEnabled'),
      plantCheckInRemindersPushEnabled: checkbox(fd, 'plantCheckInRemindersPushEnabled'),
      bloomCycleRemindersPushEnabled: checkbox(fd, 'bloomCycleRemindersPushEnabled'),
      propagationFollowUpsPushEnabled: checkbox(fd, 'propagationFollowUpsPushEnabled'),
      followNotificationsPushEnabled: checkbox(fd, 'followNotificationsPushEnabled'),
      careQueueDigestPushEnabled: checkbox(fd, 'careQueueDigestPushEnabled'),
      serverHealthPushEnabled: checkbox(fd, 'serverHealthPushEnabled'),
      careQueueDigestSendTime,
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
      followNotifications: checkbox(fd, 'followNotifications'),
      transferNotifications: checkbox(fd, 'transferNotifications'),
      careQueueDigestEmailEnabled: checkbox(fd, 'careQueueDigestEmailEnabled'),
      serverHealthEmailEnabled: checkbox(fd, 'serverHealthEmailEnabled'),
      generalRemindersPushEnabled: checkbox(fd, 'generalRemindersPushEnabled'),
      plantCheckInRemindersPushEnabled: checkbox(fd, 'plantCheckInRemindersPushEnabled'),
      bloomCycleRemindersPushEnabled: checkbox(fd, 'bloomCycleRemindersPushEnabled'),
      propagationFollowUpsPushEnabled: checkbox(fd, 'propagationFollowUpsPushEnabled'),
      followNotificationsPushEnabled: checkbox(fd, 'followNotificationsPushEnabled'),
      careQueueDigestPushEnabled: checkbox(fd, 'careQueueDigestPushEnabled'),
      serverHealthPushEnabled: checkbox(fd, 'serverHealthPushEnabled'),
      careQueueDigestSendTime,
      quietHoursStart: val(fd, 'quietHoursStart') || undefined,
      quietHoursEnd: val(fd, 'quietHoursEnd') || undefined,
    },
  })

  await audit(user, 'UPDATE', 'EMAIL_PREFERENCES', user.id, `${user.email} updated notification preferences`)
  redirect('/account')
}

export async function deleteUser(fd: FormData) {
  const actor = await requireServerAdmin()
  const id = val(fd, 'id')
  if (id === actor.id) throw new Error('You cannot delete your own account.')
  const user = await prisma.user.delete({ where: { id } })
  await audit(actor, 'DELETE', 'USER', id, `Deleted user ${user.email}`, { email: user.email, role: user.role })
  redirect('/server/users')
}
