'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { audit, requireServerAdmin } from '@/lib/auth'
import { enqueueCadenceResearch } from '@/lib/ai-curator'
import {
  approveCadenceBatch,
  approveCadenceProposal,
  eligibleCadenceProposals,
  recoverLegacyCadences,
} from '@/lib/cadence-research'

export async function researchMissingCadences(fd: FormData) {
  const user = await requireServerAdmin()
  const created = await enqueueCadenceResearch(prisma, {
    definitionId: String(fd.get('definitionId') || '') || undefined,
    explicit: fd.get('explicit') === 'yes',
  })
  await audit(
    user,
    'GENERATE',
    'CARE_CADENCE_RESEARCH',
    null,
    `Queued ${created} definitions for cadence research`
  )
  revalidatePath('/server/care-cadence-research')
  return { created }
}
export async function recoverCadenceData() {
  const user = await requireServerAdmin()
  const created = await recoverLegacyCadences(prisma)
  await audit(
    user,
    'GENERATE',
    'CARE_CADENCE_RESEARCH',
    null,
    `Recovered ${created} historical cadence proposals`
  )
  revalidatePath('/', 'layout')
  return { created }
}
export async function reviewCadence(fd: FormData) {
  const user = await requireServerAdmin()
  const id = String(fd.get('id') || '')
  if (!['approve', 'reject'].includes(String(fd.get('decision'))))
    throw new Error('Choose Approve or Reject.')
  let result: string
  if (fd.get('decision') === 'reject') {
    const changed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
      return tx.careCadenceProposal.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedByUserId: user.id,
        },
      })
    })
    result = changed.count ? 'REJECTED' : 'No longer pending'
  } else
    result = await approveCadenceProposal(
      prisma,
      id,
      user.id,
      fd.has('interval')
        ? { interval: Number(fd.get('interval')), unit: String(fd.get('unit')) }
        : undefined
    )
  await audit(user, 'UPDATE', 'CARE_CADENCE_PROPOSAL', id, result)
  revalidatePath('/', 'layout')
  return { result }
}
export async function cadenceApprovalPreview(collectionId?: string) {
  await requireServerAdmin()
  if (
    collectionId !== undefined &&
    (typeof collectionId !== 'string' ||
      !collectionId ||
      collectionId.length > 200)
  )
    throw new Error('Invalid collection.')
  const rows = await eligibleCadenceProposals(prisma, collectionId)
  return {
    ids: rows.map((p) => p.id),
    count: rows.length,
    definitions: new Set(rows.map((p) => p.plantDefinitionId)).size,
  }
}
export async function approveAllCadences(ids: string[]) {
  const user = await requireServerAdmin()
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
    throw new Error('Invalid proposal selection.')
  const results = await approveCadenceBatch(prisma, ids, user.id)
  await audit(
    user,
    'UPDATE',
    'CARE_CADENCE_RESEARCH',
    null,
    'Bulk cadence approval',
    results
  )
  revalidatePath('/', 'layout')
  return results
}
export async function manageCadenceJob(fd: FormData) {
  const user = await requireServerAdmin()
  const id = String(fd.get('id') || '')
  if (!['retry', 'cancel'].includes(String(fd.get('decision'))))
    throw new Error('Choose Retry or Cancel.')
  const retry = fd.get('decision') === 'retry'
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
    const job = await tx.aiCuratorJob.findFirst({
      where: { id, targetField: 'careCadences' },
    })
    if (!job) return
    if (
      retry &&
      (await tx.aiCuratorJob.findFirst({
        where: {
          id: { not: id },
          plantDefinitionId: job.plantDefinitionId,
          targetField: 'careCadences',
          status: {
            in: ['QUEUED', 'RUNNING', 'DEFERRED', 'WAITING_FOR_HUMAN'],
          },
        },
      }))
    )
      return
    await tx.aiCuratorJob.updateMany({
      where: {
        id,
        targetField: 'careCadences',
        status: {
          in: retry
            ? ['WAITING_FOR_HUMAN', 'CANCELLED', 'EXPIRED']
            : ['QUEUED', 'DEFERRED', 'RUNNING', 'WAITING_FOR_HUMAN'],
        },
      },
      data: retry
        ? {
            status: 'QUEUED',
            attempts: 0,
            claimedBy: null,
            claimedAt: null,
            nextRetryAt: null,
            completedAt: null,
            blockingReason: null,
          }
        : { status: 'CANCELLED', completedAt: new Date() },
    })
  })
  await audit(
    user,
    'UPDATE',
    'CARE_CADENCE_RESEARCH',
    id,
    retry ? 'Research retried' : 'Research cancelled'
  )
  revalidatePath('/server/care-cadence-research')
}
