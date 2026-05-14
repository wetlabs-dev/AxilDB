import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const prisma = new PrismaClient()

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@axildb.com' },
    update: {},
    create: {
      email: 'admin@axildb.com',
      passwordHash: hashPassword('password'),
      role: 'ADMIN',
    },
  })
}

main().finally(() => prisma.$disconnect())
