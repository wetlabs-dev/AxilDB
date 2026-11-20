import type { Prisma, PrismaClient } from '@prisma/client'
import { careDayBounds } from '@/lib/bulk-care'
import { resolveCadence } from '@/lib/care-cadences'
import { dateInputValue, normalizeTimeZone } from '@/lib/time'

export type QuickCareState = { watering: string | null; fertilizing: string | null; canFertilize: boolean; day: string; timezone: string }
/** One bounded history query, using the same calendar and fertilizer equivalence as queue completion. */
export async function loadQuickCare(db: PrismaClient | Prisma.TransactionClient, collectionId: string, plantInstanceId: string, timezone?: string | null, canFertilize?: boolean): Promise<QuickCareState> {
  const zone = normalizeTimeZone(timezone), now = new Date()
  const plant = canFertilize === undefined ? await db.plantInstance.findFirstOrThrow({ where: { id: plantInstanceId, collectionId, status: 'ACTIVE' }, include: { plantDefinition: { include: { careCadences: true } }, careCadenceOverrides: true } }) : null
  const events = await db.plantCareEvent.groupBy({ by: ['eventType'], where: { plantInstanceId, OR: [{ collectionId }, { collectionId: null }], performedAt: { ...careDayBounds(now, zone), lte: now }, AND: [{ OR: [{ eventType: 'WATERED' }, { eventType: 'FERTILIZED', fertilizerRecipeId: null }] }] }, _max: { performedAt: true } })
  return { watering: events.find(e => e.eventType === 'WATERED')?._max.performedAt?.toISOString() || null, fertilizing: events.find(e => e.eventType === 'FERTILIZED')?._max.performedAt?.toISOString() || null, canFertilize: canFertilize ?? (resolveCadence('FERTILIZING', plant!.plantDefinition.careCadences, plant!.careCadenceOverrides).status !== 'NOT_APPLICABLE'), day: dateInputValue(now, zone), timezone: zone }
}
