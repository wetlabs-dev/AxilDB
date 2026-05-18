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

  const existingDefault = await prisma.collection.findFirst({
    where: { isDefault: true },
    orderBy: { createdAt: 'asc' },
  })
  const oldestOwnedCollection = existingDefault
    ? null
    : await prisma.collection.findFirst({
        where: { memberships: { some: { role: 'OWNER', status: 'ACTIVE' } } },
        orderBy: { createdAt: 'asc' },
      })
  const collection = existingDefault
    || oldestOwnedCollection
    || await prisma.collection.findUnique({ where: { slug: 'axildb' } })
    || await prisma.collection.create({
      data: {
        name: 'AxilDB',
        slug: 'axildb',
        visibility: 'PRIVATE',
        description: 'Default AxilDB collection.',
        isDefault: true,
      },
    })

  await prisma.collection.update({
    where: { id: collection.id },
    data: {
      isDefault: true,
      ...(!collection.description ? { description: 'Default AxilDB collection.' } : {}),
    },
  })
  await prisma.collection.updateMany({
    where: { isDefault: true, NOT: { id: collection.id } },
    data: { isDefault: false },
  })
  const defaultCollection = await prisma.collection.findUniqueOrThrow({
    where: { id: collection.id },
  })

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  for (const user of admins) {
    await prisma.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: defaultCollection.id, userId: user.id } },
      update: { role: 'OWNER', status: 'ACTIVE' },
      create: { collectionId: defaultCollection.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' },
    })
  }

  await prisma.$transaction([
    prisma.governingBody.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.plantDefinition.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.plantAlias.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.plantInstance.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.propagationEvent.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.note.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.photo.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.bloomEvent.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.reminder.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.reminderDelivery.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.follow.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.followNotification.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.auditLog.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
  ])
}

main().finally(() => prisma.$disconnect())
