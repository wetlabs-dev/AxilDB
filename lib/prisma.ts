import { PrismaClient } from '@prisma/client'

// All Next route bundles in this process share one pool, including production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
function datasourceUrl() {
  if (!process.env.DATABASE_URL) return undefined
  const url = new URL(process.env.DATABASE_URL)
  if (!url.searchParams.has('connection_limit')) {
    const size = Number(process.env.AXILDB_DB_POOL_SIZE || 5)
    if (!Number.isInteger(size) || size < 1 || size > 50) throw new Error('AXILDB_DB_POOL_SIZE must be between 1 and 50.')
    url.searchParams.set('connection_limit', String(size))
  }
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '10')
  return url.toString()
}
const url = datasourceUrl()
export const prisma = globalForPrisma.prisma ?? new PrismaClient(url ? { datasources: { db: { url } } } : undefined)
globalForPrisma.prisma = prisma
