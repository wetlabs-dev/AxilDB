import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const prisma = new PrismaClient()

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@axildb.com' },
    update: {},
    create: {
      email: 'admin@axildb.com',
      emailVerifiedAt: new Date(),
      passwordHash: hashPassword('password'),
      role: 'ADMIN',
    },
  })

  await prisma.emailPreference.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  })

  const collection = await prisma.collection.upsert({
    where: { slug: 'axildb' },
    update: {},
    create: {
      name: 'AxilDB',
      slug: 'axildb',
      visibility: 'PRIVATE',
      description: 'Default AxilDB collection.',
    },
  })

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  for (const user of admins) {
    await prisma.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
      update: { role: 'OWNER', status: 'ACTIVE' },
      create: { collectionId: collection.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' },
    })
  }

  await prisma.$transaction([
    prisma.governingBody.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.plantDefinition.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.plantAlias.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.plantInstance.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.propagationEvent.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.note.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.photo.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.bloomEvent.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.reminder.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.reminderDelivery.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.follow.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.followNotification.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
    prisma.auditLog.updateMany({ where: { collectionId: null }, data: { collectionId: collection.id } }),
  ])
}

main().finally(() => prisma.$disconnect())
