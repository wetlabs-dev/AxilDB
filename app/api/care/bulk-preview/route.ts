import { NextRequest, NextResponse } from 'next/server'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { getCurrentUser } from '@/lib/auth'
import { requireCollectionLogger } from '@/lib/collections'
import { findSameDayCareRecords, requireBulkCareType } from '@/lib/bulk-care'
import { prisma } from '@/lib/prisma'
import { parseDateLocal, timeZoneForPreference } from '@/lib/time'
import { validRequestOrigin } from '@/lib/request-origin'
import { plantName } from '@/lib/utils'
import { descendantLocationIds } from '@/lib/locations'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function POST(request: NextRequest) {
  try {
    if (!validRequestOrigin(request)) return json({ error: 'Invalid request origin.' }, 403)
    if (!(await getCurrentUser())) return json({ error: 'Sign in before reviewing care.' }, 401)
    const input = await request.json()
    if (typeof input.collectionSlug !== 'string' || typeof input.locationId !== 'string' || typeof input.careType !== 'string' || typeof input.performedAt !== 'string' || !Array.isArray(input.plantInstanceIds) || input.plantInstanceIds.length > 1000 || !input.plantInstanceIds.every((id: unknown) => typeof id === 'string' && id.length < 100)) return json({ error: 'Invalid care preview.' }, 400)
    const context = await requireCollectionLogger(input.collectionSlug)
    const careType = requireBulkCareType(input.careType)
    const timezone = timeZoneForPreference(await prisma.emailPreference.findUnique({ where: { userId: context.user.id } }))
    const referenceDate = parseDateLocal(input.performedAt, timezone)
    if (!referenceDate) return json({ error: 'Choose a valid performed date.' }, 400)
    const locations = await prisma.location.findMany({ where: { collectionId: context.collection.id }, select: { id: true, parentLocationId: true } })
    if (!locations.some(location => location.id === input.locationId)) return json({ error: 'Location unavailable.' }, 403)
    const locationIds = input.includeNested === true ? [input.locationId, ...descendantLocationIds(input.locationId, locations)] : [input.locationId]
    const plants = await prisma.plantInstance.findMany({ where: {
      collectionId: context.collection.id, id: { in: input.plantInstanceIds }, currentLocationId: { in: locationIds },
      ...(input.includeArchived === true ? {} : { status: { not: 'ARCHIVED' } }),
    }, select: { id: true, plantId: true, plantDefinition: { select: { genus: true, species: true, cultivarName: true } } } })
    const recipeId = typeof input.fertilizerRecipeId === 'string' ? input.fertilizerRecipeId : null
    if (recipeId && !(await prisma.fertilizerRecipe.findFirst({ where: { id: recipeId, collectionId: context.collection.id }, select: { id: true } }))) return json({ error: 'Recipe unavailable.' }, 400)
    const events = await findSameDayCareRecords(prisma, { collectionId: context.collection.id, plantInstanceIds: plants.map(plant => plant.id), careType, referenceDate, timezone, fertilizerRecipeId: recipeId })
    const byId = new Map(plants.map(plant => [plant.id, plant]))
    return json({ timezone, authorizedCount: plants.length, alreadyCompleted: events.map(event => ({
      plantInstanceId: event.plantInstanceId, plantId: byId.get(event.plantInstanceId)!.plantId,
      name: plantName(byId.get(event.plantInstanceId)!.plantDefinition),
      performedAt: event.performedAt,
      source: typeof event.metadata === 'object' && event.metadata && !Array.isArray(event.metadata) && typeof event.metadata.source === 'string' ? event.metadata.source : null,
    })) })
  } catch (error) {
    if (isRedirectError(error)) return json({ error: 'Collection logging permission required.' }, 403)
    return json({ error: 'Unable to review eligibility. Check your care details and try again.' }, 400)
  }
}
