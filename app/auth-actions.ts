'use server'

import { redirect } from 'next/navigation'
import { audit, clearSession, createSession, getCurrentUser, hashPassword, requireAdminUser, requireUser, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const val = (fd: FormData, key: string) => String(fd.get(key) || '').trim()

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

  const data: { email: string; passwordHash?: string } = { email }
  if (password) data.passwordHash = hashPassword(password)

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  await audit(user, 'UPDATE_ACCOUNT', 'USER', user.id, `${user.email} updated account settings`, { email: updated.email, passwordChanged: !!password })
  redirect('/account')
}

export async function createUser(fd: FormData) {
  const actor = await requireAdminUser()
  const email = val(fd, 'email').toLowerCase()
  const password = val(fd, 'password')
  const role = val(fd, 'role') === 'ADMIN' ? 'ADMIN' : 'LOGGER'
  const user = await prisma.user.create({
    data: { email, passwordHash: hashPassword(password), role },
  })
  await audit(actor, 'CREATE', 'USER', user.id, `Created ${role.toLowerCase()} user ${email}`, { email, role })
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

export async function deleteUser(fd: FormData) {
  const actor = await requireAdminUser()
  const id = val(fd, 'id')
  if (id === actor.id) throw new Error('You cannot delete your own account.')
  const user = await prisma.user.delete({ where: { id } })
  await audit(actor, 'DELETE', 'USER', id, `Deleted user ${user.email}`, { email: user.email, role: user.role })
  redirect('/users')
}
