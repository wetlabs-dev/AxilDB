import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { CareQueueAction } from '@/lib/care-queue-optimistic'

const retentionMs = 7 * 24 * 60 * 60 * 1000
export type CareOperationIdentity = { operationId: string; issuedAt: number }
export class CareOperationConflict extends Error {}
export async function executeCareOperation<T extends object>(db: PrismaClient, input: { collectionId: string; userId: string; action: CareQueueAction; fd: FormData; identity?: CareOperationIdentity }, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const identity = input.identity || { operationId: randomUUID(), issuedAt: Date.now() }
  if (!/^[0-9a-f-]{36}$/i.test(identity.operationId) || !Number.isFinite(identity.issuedAt) || Date.now() - identity.issuedAt > retentionMs || identity.issuedAt > Date.now() + 60000) throw new CareOperationConflict('This action has expired. Refresh the queue before trying again.')
  const fields = Array.from(input.fd.entries()).filter(([key]) => key !== 'back').map(([key, value]) => [key, String(value)]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  const payloadHash = createHash('sha256').update(JSON.stringify({ action: input.action, fields })).digest('hex')
  const scope = { collectionId: input.collectionId, userId: input.userId, operationId: identity.operationId }
  // Expired original requests are rejected above, so pruning cannot make an old retry run again.
  await db.careQueueOperation.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  return db.$transaction(async tx => {
    const inserted = await tx.careQueueOperation.createMany({ data: { ...scope, action: input.action, payloadHash, expiresAt: new Date(identity.issuedAt + retentionMs), result: Prisma.JsonNull }, skipDuplicates: true })
    if (!inserted.count) {
      const previous = await tx.careQueueOperation.findUniqueOrThrow({ where: { collectionId_userId_operationId: scope } })
      if (previous.payloadHash !== payloadHash || previous.action !== input.action) throw new CareOperationConflict('This action identifier was already used for different care details.')
      return previous.result as T
    }
    const result = await run(tx)
    await tx.careQueueOperation.update({ where: { collectionId_userId_operationId: scope }, data: { result: JSON.parse(JSON.stringify(result)) } })
    return result
  }, { maxWait: 15000, timeout: 30000 })
}
