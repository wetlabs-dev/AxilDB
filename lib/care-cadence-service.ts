import type { Prisma } from '@prisma/client'
import { cadenceActivities, validateCadenceState } from '@/lib/care-cadences'

// All definition configuration, manual or approved research, uses the same dependency-protected records.
export async function configureDefinitionCadence(
  tx: Prisma.TransactionClient,
  input: {
    definitionId: string
    activity: string
    status?: string
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
  const status =
    input.status || (input.interval == null ? 'NOT_SCHEDULED' : 'SCHEDULED')
  validateCadenceState(input.activity, status, input.interval, input.unit)
  if (!input.missingOnly) {
    await tx.plantDefinitionCareCadence.deleteMany({ where })
    await tx.careCadenceProposal.updateMany({
      where: { ...where, status: 'PENDING' },
      data: {
        status: 'SUPERSEDED',
        reviewNote: 'A manual care decision superseded this recommendation.',
      },
    })
  }
  if (status === 'NOT_SCHEDULED') return { count: 0 }
  return tx.plantDefinitionCareCadence.createMany({
    data: {
      ...where,
      status,
      interval: input.interval ?? null,
      unit: input.unit ?? null,
    },
    skipDuplicates: Boolean(input.missingOnly),
  })
}
