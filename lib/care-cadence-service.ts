import type { Prisma } from '@prisma/client'
import { cadenceActivities, validateCadence } from '@/lib/care-cadences'

// All definition configuration, manual or approved research, uses the same dependency-protected records.
export async function configureDefinitionCadence(
  tx: Prisma.TransactionClient,
  input: {
    definitionId: string
    activity: string
    interval?: number | null
    unit?: string | null
    missingOnly?: boolean
  }
) {
  if (!cadenceActivities.some((a) => a.activity === input.activity))
    throw new Error('Invalid care activity.')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
  const where = {
    plantDefinitionId: input.definitionId,
    activity: input.activity,
  }
  if (input.interval != null) validateCadence(input.interval, input.unit!)
  if (!input.missingOnly)
    await tx.plantDefinitionCareCadence.deleteMany({ where })
  if (input.interval == null) return { count: 0 }
  return tx.plantDefinitionCareCadence.createMany({
    data: { ...where, interval: input.interval, unit: input.unit! },
    skipDuplicates: Boolean(input.missingOnly),
  })
}
