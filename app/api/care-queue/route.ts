import { validRequestOrigin } from '@/lib/request-origin'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, requireCollectionLogger, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { getCareQueue } from '@/lib/care-queue'
import { runCareQueueMutation } from '@/lib/care-queue-mutations'
import { CareOperationConflict } from '@/lib/care-queue-operations'
import { careQueueActions, type CareQueueAction } from '@/lib/care-queue-optimistic'

export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
function failure(error: unknown) {
  if (isRedirectError(error) || error instanceof Error && error.message.includes('permission')) return json({ error: 'Sign in and check your permission to manage this collection.', category: 'authorization' }, 403)
  if (error instanceof CareOperationConflict) return json({ error: error.message, category: 'conflict' }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return json({ error: 'This care item has changed or is no longer available. Refresh the queue.', category: 'stale' }, 409)
    return json({ error: 'Could not confirm the care action. Please check again.', category: 'server' }, 500)
  }
  if (error instanceof Error && error.name.startsWith('Prisma')) return json({ error: 'Could not confirm the care action. Please check again.', category: 'server' }, 500)
  if (error instanceof Error) return json({ error: error.message, category: 'validation' }, 400)
  return json({ error: 'Could not confirm the care action.', category: 'server' }, 500)
}
export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('collectionSlug') || ''
    if (!slug) return json({ error: 'Choose a collection.' }, 400)
    const context = await requireCollectionViewer(slug)
    const operationId = request.nextUrl.searchParams.get('operationId')
    if (operationId) {
      const actor = await requireCollectionLogger(slug)
      const operation = await prisma.careQueueOperation.findUnique({ where: { collectionId_userId_operationId: { collectionId: actor.collection.id, userId: actor.user.id, operationId } } })
      return json({ committed: Boolean(operation), result: operation?.result })
    }
    const preference = context.user ? await prisma.emailPreference.findUnique({ where: { userId: context.user.id } }) : null
    const snapshotAt = Date.now()
    const items = await getCareQueue(prisma, { collectionId: context.collection.id, collectionSlug: slug, userId: context.user?.id, timezone: preference?.timezone, includeCompleted: true })
    return json({ items, snapshotAt })
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let operationId: unknown
  let action: unknown
  try {
    // Share the deployment API's proxy-aware, exact-origin CSRF validation.
    if (!validRequestOrigin(request)) return json({ error: 'Invalid request origin.' }, 403)
    if (!(await getCurrentUser())) return json({ error: 'Sign in before recording care.', category: 'authorization' }, 401)
    if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Expected care action details.' }, 400)
    const input = await request.json()
    operationId = input.operationId
    action = input.action
    if (!careQueueActions.includes(input.action) || !Array.isArray(input.fields) || !input.fields.every((field: unknown) => Array.isArray(field) && field.length === 2 && field.every(value => typeof value === 'string'))) return json({ error: 'Invalid care action.' }, 400)
    const fd = new FormData()
    for (const [key, value] of input.fields) fd.append(key, value)
    if (!fd.get('collectionSlug')) return json({ error: 'Choose a collection.' }, 400)
    const result = await runCareQueueMutation(input.action as CareQueueAction, fd, { operationId: input.operationId, issuedAt: input.issuedAt })
    // Invalidate relevant server views without redirecting or sending an RSC refresh per tap.
    const slug = String(fd.get('collectionSlug') || '')
    for (const path of ['/', '/care', '/care/checklist', '/care/bulk', '/instances']) revalidatePath(collectionPath(slug, path))
    for (const id of fd.getAll('plantInstanceId')) revalidatePath(collectionPath(slug, `/instances/${id}`))
    const locationId = fd.get('locationId')
    if (locationId) revalidatePath(collectionPath(slug, `/locations/${locationId}`))
    return json({ ok: true, result })
  } catch (error) {
    const response = failure(error)
    console.warn('care_queue_mutation_failed', { operationId: typeof operationId === 'string' ? operationId : undefined, action: typeof action === 'string' ? action : undefined, category: response.status, durationMs: Date.now() - startedAt })
    return response
  }
}
