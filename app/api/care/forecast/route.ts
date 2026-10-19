import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { canManageCollection, collectionPath, requireCollectionManager, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { validRequestOrigin } from '@/lib/request-origin'
import { timeZoneForPreference } from '@/lib/time'
import { forecastConfiguration, loadCareForecast, previewQuietChange } from '@/lib/care-forecast-service'
import { getCareQueue } from '@/lib/care-queue'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
async function timezone(userId?: string) { return timeZoneForPreference(userId ? await prisma.emailPreference.findUnique({ where: { userId } }) : null) }
export async function GET(req: NextRequest) {
  try {
    const context = await requireCollectionViewer(req.nextUrl.searchParams.get('collectionSlug') || '')
    return json({ ...await loadCareForecast(prisma, { collectionId: context.collection.id, collectionSlug: context.collection.slug, userId: context.user?.id, timezone: await timezone(context.user?.id) }), canManage: canManageCollection(context.user, context) })
  } catch { return json({ error: 'Care forecast is unavailable. Check collection access and try again.' }, 403) }
}
export async function POST(req: NextRequest) {
  try {
    if (!validRequestOrigin(req)) return json({ error: 'Invalid request origin.' }, 403)
    if (!(await getCurrentUser())) return json({ error: 'Sign in first.' }, 401)
    const input = await req.json()
    if (typeof input.collectionSlug !== 'string' || !['preview', 'commit'].includes(input.operation)) return json({ error: 'Invalid scheduling operation.' }, 400)
    const context = await requireCollectionManager(input.collectionSlug)
    const scope = { collectionId: context.collection.id, collectionSlug: context.collection.slug, userId: context.user.id, timezone: await timezone(context.user.id) }
    if (input.operation === 'preview') return json(await previewQuietChange(prisma, scope, input.draft))
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`care-calendar:${scope.collectionId}`}, 0))`
      const preview = await previewQuietChange(tx, scope, input.draft)
      if (preview.hash !== input.hash) return { stale: true, preview }
      const existing = await forecastConfiguration(tx, scope)
      const nextIds = preview.quietDays.map(day => day.id)
      await tx.collectionQuietDay.deleteMany({ where: { collectionId: scope.collectionId, active: true, id: { notIn: nextIds } } })
      for (const day of preview.quietDays) {
        if (existing.quietDays.some(old => old.id === day.id && JSON.stringify(old.date) === JSON.stringify(day.date))) continue
        await tx.collectionQuietDay.upsert({ where: { id: day.id }, create: { ...day, collectionId: scope.collectionId, createdByUserId: context.user.id, timezone: scope.timezone }, update: { ...day, timezone: scope.timezone } })
      }
      if (input.draft.kind === 'rule') {
        const rule = preview.rules.find(rule => rule.careType === input.draft.careType)!
        await tx.collectionQuietDayShiftRule.upsert({ where: { collectionId_careType: { collectionId: scope.collectionId, careType: rule.careType } }, create: { ...rule, collectionId: scope.collectionId }, update: rule })
      }
      await getCareQueue(tx, { ...scope, quietDayOverride: preview.quietDays, quietRuleOverride: preview.rules, reviseQuietPlan: true })
      await tx.auditLog.create({ data: { collectionId: scope.collectionId, userId: context.user.id, userEmail: context.user.email, userRole: context.user.role, action: 'UPDATE', entityType: 'CARE_CALENDAR', summary: `Quiet Day updated: ${preview.earlier} earlier, ${preview.later} later; ${preview.todayCount} requiring attention today`, metadata: JSON.stringify({ draft: input.draft, hash: input.hash, changes: preview.changes }) } })
      return { stale: false, forecast: await loadCareForecast(tx, scope), notice: `Quiet Day updated. ${preview.todayCount} task(s), including ${preview.wateringToday} watering assessment(s), moved into today's queue.` }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000, maxWait: 15000 })
    if (result.stale) return json({ error: 'The schedule changed. Review the updated preview before confirming.', ...result }, 409)
    revalidatePath(collectionPath(scope.collectionSlug), 'layout')
    return json(result)
  } catch (error) {
    if (isRedirectError(error) || error instanceof Error && /permission/i.test(error.message)) return json({ error: 'Collection manager permission is required.' }, 403)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return json({ error: 'Care changed during confirmation. Preview the change again before applying it.' }, 409)
    return json({ error: error instanceof Error && !error.name.startsWith('Prisma') ? error.message : 'Could not apply Quiet Day changes. No partial plan was saved.' }, 400)
  }
}
