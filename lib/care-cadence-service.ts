import { calibrationPolicy } from '@/lib/calibration-policy'
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
  const previous = await tx.plantDefinitionCareCadence.findUnique({ where: { plantDefinitionId_activity: where } })
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
  // Existing observed-care states get a new evidence boundary after an explicit decision.
  const policy = calibrationPolicy((await tx.aiCuratorSettings.findUnique({where:{id:'global'}}))?.calibrationPolicy)
  if (!input.missingOnly) await tx.metricCalibrationState.updateMany({where:{plantDefinitionId:input.definitionId,metricKey:`care:${input.activity}`},data:{outcome:status==='SCHEDULED'?'CALIBRATING':status==='NOT_APPLICABLE'?'NOT_APPLICABLE':'NO_CADENCE',baseline:null,observationBoundary:new Date(),proposalId:null,nextEligibleAt:status==='SCHEDULED'?new Date(Date.now()+policy.manualDays*86400000):null}})
  if (status === 'NOT_SCHEDULED') return { count: 0 }
  const created = await tx.plantDefinitionCareCadence.createMany({
    data: {
      ...where,
      activatedAt: previous?.status === 'SCHEDULED' && status === 'SCHEDULED' ? previous.activatedAt : new Date(),
      status,
      interval: input.interval ?? null,
      unit: input.unit ?? null,
    },
    skipDuplicates: Boolean(input.missingOnly),
  })
  if (input.missingOnly && created.count) await tx.metricCalibrationState.updateMany({where:{plantDefinitionId:input.definitionId,metricKey:`care:${input.activity}`},data:{outcome:status==='SCHEDULED'?'LEARNING':'NOT_APPLICABLE',baseline:null,nextEligibleAt:status==='SCHEDULED'?new Date(Date.now()+policy.manualDays*86400000):null}})
  return created
}
