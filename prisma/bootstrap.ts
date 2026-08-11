import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import { ensureStarterSubstrates } from '../lib/substrates'
import { ensureDefaultSalesChannelTypes } from '../lib/provenance'

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
      role: 'SERVER_ADMIN',
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
        where: { memberships: { some: { role: { in: ['OWNER', 'MANAGER'] }, status: 'ACTIVE' } } },
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
        status: 'ACTIVE',
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
  await ensureStarterSubstrates(prisma, defaultCollection.id, admin.id)
  await ensureDefaultSalesChannelTypes(prisma, defaultCollection.id)

  await prisma.collection.updateMany({ where: { status: { not: 'ARCHIVED' } }, data: { status: 'ACTIVE' } })
  await prisma.user.updateMany({ where: { email: 'admin@axildb.com' }, data: { role: 'SERVER_ADMIN' } })
  await prisma.user.updateMany({ where: { NOT: { email: 'admin@axildb.com' }, role: { in: ['ADMIN', 'LOGGER', 'VIEWER'] } }, data: { role: 'USER' } })
  await prisma.collectionMembership.updateMany({ where: { role: 'OWNER' }, data: { role: 'MANAGER' } })
  await prisma.collectionMembership.updateMany({ where: { role: 'ADMIN' }, data: { role: 'GARDENER' } })

  const admins = await prisma.user.findMany({ where: { role: 'SERVER_ADMIN' }, select: { id: true } })
  for (const user of admins) {
    await prisma.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: defaultCollection.id, userId: user.id } },
      update: { role: 'MANAGER', status: 'ACTIVE' },
      create: { collectionId: defaultCollection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' },
    })
  }

  await prisma.$transaction([
    prisma.plantDefinition.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.plantHusbandryGuide.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.plantAlias.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.plantInstance.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
    prisma.plantHusbandryOverride.updateMany({ where: { collectionId: null }, data: { collectionId: defaultCollection.id } }),
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
