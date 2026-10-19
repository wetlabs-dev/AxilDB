import { Prisma } from '@prisma/client'
import { addCalendarDays, startOfDayInTimeZone } from '@/lib/time'

// Explicit domain identifiers shared by queue completion and bulk care.
export const bulkCareEvents = {
  WATERING: 'WATERED', FERTILIZING: 'FERTILIZED', REPOTTING: 'REPOTTED',
  PRUNING: 'PRUNED', PEST_CHECK: 'PEST_CHECK', HEALTH_CHECK: 'HEALTH_CHECK',
  PROPAGATION_CHECK: 'PROPAGATION_CHECK', BLOOM_CHECK: 'BLOOM_CHECK', OTHER: 'OTHER',
} as const
export type BulkCareType = keyof typeof bulkCareEvents
export function requireBulkCareType(value: string): BulkCareType {
  if (!Object.hasOwn(bulkCareEvents, value)) throw new Error('Choose a supported bulk care activity.')
  return value as BulkCareType
}
export function careDayBounds(referenceDate: Date, timezone: string) {
  const start = startOfDayInTimeZone(referenceDate, timezone)
  return { gte: start, lt: addCalendarDays(start, 1, timezone) }
}

/** Lock in stable order before reading history; held until the enclosing transaction commits. */
export async function lockCarePlants(tx: Prisma.TransactionClient, collectionId: string, ids: string[]) {
  if (!ids.length) return
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "PlantInstance" WHERE "collectionId" = ${collectionId} AND id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id FOR UPDATE`)
}

export async function findSameDayCareRecords(db: Pick<Prisma.TransactionClient, '$queryRaw'>, input: {
  collectionId: string; plantInstanceIds: string[]; careType: BulkCareType;
  referenceDate: Date; timezone: string; fertilizerRecipeId?: string | null;
}) {
  if (!input.plantInstanceIds.length || input.careType === 'OTHER') return []
  // OTHER is free-form and cannot safely establish equivalence. Rows in this model
  // are completed occurrences; deletion physically removes them (no void/status field).
  const bounds = careDayBounds(input.referenceDate, input.timezone)
  // PostgreSQL DISTINCT ON bounds the returned rows to one per selected plant,
  // even when intentional repeated events exist. Never load full care histories.
  return db.$queryRaw<{ plantInstanceId: string; performedAt: Date; metadata: Prisma.JsonValue }[]>(Prisma.sql`
    SELECT DISTINCT ON (e."plantInstanceId") e."plantInstanceId", e."performedAt", e.metadata
    FROM "PlantCareEvent" e
    JOIN "PlantInstance" p ON p.id = e."plantInstanceId"
    WHERE p."collectionId" = ${input.collectionId}
      AND (e."collectionId" = ${input.collectionId} OR e."collectionId" IS NULL)
      AND e."plantInstanceId" IN (${Prisma.join([...new Set(input.plantInstanceIds)])})
      AND e."eventType" = ${bulkCareEvents[input.careType]}
      AND e."performedAt" >= ${bounds.gte} AND e."performedAt" < ${bounds.lt}
      ${input.careType === 'FERTILIZING'
        ? input.fertilizerRecipeId
          ? Prisma.sql`AND e."fertilizerRecipeId" = ${input.fertilizerRecipeId}`
          : Prisma.sql`AND e."fertilizerRecipeId" IS NULL`
        : Prisma.empty}
    ORDER BY e."plantInstanceId", e."performedAt" DESC, e.id DESC
  `)
}
