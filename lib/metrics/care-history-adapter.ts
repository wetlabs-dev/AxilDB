import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { cadenceActivities, cadenceDueAt, type Cadence } from '@/lib/care-cadences'
import { calendarDayIndexInTimeZone, normalizeTimeZone } from '@/lib/time'
import { aggregateIntervals, analyzeIntervals, median, type Observation } from '@/lib/metrics/interval-analysis'
import type { CalibrationPolicy } from '@/lib/calibration-policy'
type DB = PrismaClient | Prisma.TransactionClient
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const afterDays = (date: Date, days: number) => new Date(date.getTime()+days*86400000)
export function cadenceBaseline(cadence: Cadence | undefined, recipeId?: string | null) { return digest([cadence || null, recipeId || null]) }
/** Care adapter: only completed events; no queue dates, unfinished planner items or snooze intervals. */
export async function loadCareEvidence(db: DB, collectionId: string, definitionId: string, activity: string, policy: CalibrationPolicy, now = new Date(), boundary?: Date | null) {
  const category = cadenceActivities.find(a=>a.activity === activity)
  if (!category) throw new Error('Invalid care category.')
  const timezone = normalizeTimeZone(), day = (date: Date) => calendarDayIndexInTimeZone(date,timezone), today = day(now)
  const definition = await db.plantDefinition.findFirstOrThrow({where:{id:definitionId,collectionId},include:{careCadences:true,husbandryGuide:{include:{fertilizerRecipe:true}}}})
  const current = definition.careCadences.find(c=>c.activity === activity)
  const recipe = definition.husbandryGuide?.fertilizerRecipe
  const hasRecipe = Boolean(recipe?.active && recipe.collectionId === collectionId)
  const baseline = cadenceBaseline(current, activity === 'FERTILIZING' ? recipe?.id : null)
  const windowDays = Math.min(36500, Math.max(policy.categories[activity].windowDays, (current?.interval || 1) * (current?.unit === 'YEAR' ? 366 : current?.unit === 'MONTH' ? 31 : current?.unit === 'WEEK' ? 7 : 1)*3))
  const start = new Date(Math.max(afterDays(now,-windowDays).getTime(),boundary?.getTime() || 0))
  const instances = await db.plantInstance.findMany({where:{collectionId,plantDefinitionId:definitionId},select:{id:true,status:true,currentLocationId:true,acquisitionDate:true,createdAt:true,careCadenceOverrides:{where:{activity}},husbandryOverride:{select:{fertilizerRecipeId:true}}},orderBy:{id:'asc'},take:policy.maxInstances+1})
  const active = instances.filter(i=>i.status === 'ACTIVE'), ids = active.map(i=>i.id)
  const [events,moves,substrates,adjustments,identityChanges,repottings] = await Promise.all([
    ids.length ? db.plantCareEvent.findMany({where:{collectionId,plantInstanceId:{in:ids},eventType:category.event,performedAt:{gte:start,lte:now}},select:{id:true,plantInstanceId:true,performedAt:true,createdAt:true,metadata:true,fertilizerRecipeId:true},orderBy:[{performedAt:'desc'},{id:'asc'}],take:policy.maxEvents+1}) : [],
    db.plantLocationMove.groupBy({by:['plantInstanceId'],where:{collectionId,plantInstanceId:{in:ids}},_max:{movedAt:true},orderBy:{plantInstanceId:'asc'}}),
    db.plantSubstrateHistory.groupBy({by:['plantInstanceId'],where:{collectionId,plantInstanceId:{in:ids}},_max:{changedAt:true},orderBy:{plantInstanceId:'asc'}}),
    db.careQuietDayAdjustment.findMany({where:{collectionId,plantInstanceId:{in:ids},careType:category.task,originalDueAt:{gte:start,lte:now}},select:{plantInstanceId:true,originalDueAt:true,adjustedDueAt:true},orderBy:{id:'asc'},take:policy.maxEvents}),
    // Re-identification lacks a dedicated temporal FK: conservatively segment at recorded identity edits.
    db.auditLog.groupBy({by:['entityId'],where:{collectionId,entityType:'PLANT_INSTANCE',entityId:{in:ids},OR:[{summary:{contains:'identif',mode:'insensitive'}},{summary:{contains:'definition',mode:'insensitive'}},{metadata:{contains:'plantDefinitionId'}}]},_max:{createdAt:true},orderBy:{entityId:'asc'}}),
    db.plantCareEvent.groupBy({by:['plantInstanceId'],where:{collectionId,plantInstanceId:{in:ids},eventType:'REPOTTED',performedAt:{lte:now}},_max:{performedAt:true},orderBy:{plantInstanceId:'asc'}}),
  ])
  const truncated = instances.length > policy.maxInstances || events.length > policy.maxEvents || adjustments.length >= policy.maxEvents
  const observations = new Map<string,Observation[]>(), excluded: Record<string,number> = {}, cohortCounts: Record<string,number> = {}
  const exclude = (reason: string) => { excluded[reason] = (excluded[reason] || 0)+1 }
  const shiftedDays = new Set(adjustments.filter(a=>day(a.originalDueAt)!==day(a.adjustedDueAt)).map(a=>`${a.plantInstanceId}:${day(a.adjustedDueAt)}`))
  const byInstance = new Map(active.map(i=>[i.id,i]))
  const boundaries = new Map(active.map(i=>[i.id,Math.max((i.acquisitionDate || i.createdAt).getTime(), moves.find(m=>m.plantInstanceId===i.id)?._max.movedAt?.getTime() || 0, (activity==='REPOTTING'?0:substrates.find(m=>m.plantInstanceId===i.id)?._max.changedAt?.getTime() || 0), (['WATERING','FERTILIZING'].includes(activity)?repottings.find(m=>m.plantInstanceId===i.id)?._max.performedAt?.getTime() || 0:0), identityChanges.find(m=>m.entityId===i.id)?._max.createdAt?.getTime() || 0, boundary?.getTime() || 0)]))
  const cohortFor = (id: string) => {
    const i = byInstance.get(id)!
    return i.careCadenceOverrides.length || activity === 'FERTILIZING' && i.husbandryOverride?.fertilizerRecipeId ? 'OVERRIDE' : 'INHERITED'
  }
  for (const e of events) {
    if (cohortFor(e.plantInstanceId) !== 'INHERITED') { exclude('Explicit instance override'); continue }
    if (e.performedAt.getTime() < boundaries.get(e.plantInstanceId)!) { exclude('Before acquisition or recorded identity/condition change'); continue }
    const metadata = e.metadata as Record<string,unknown> | null
    if (metadata?.exceptional || metadata?.emergency || metadata?.invalidated || metadata?.unreliableDate || metadata?.importedDateUncertain) { exclude('Exceptional or unreliable provenance'); continue }
    if (activity === 'FERTILIZING' && (!hasRecipe || e.fertilizerRecipeId !== recipe?.id)) { exclude('Different or unknown fertilizer recipe'); continue }
    const adjusted = shiftedDays.has(`${e.plantInstanceId}:${day(e.performedAt)}`)
    const list = observations.get(e.plantInstanceId) || []
    list.push({day:day(e.performedAt),recordedDay:day(e.createdAt),grouped:Boolean(metadata?.bulkCareBatchId),adjusted})
    observations.set(e.plantInstanceId,list)
  }
  const series = active.filter(i=>cohortFor(i.id)==='INHERITED').map(i=> {
    const cohort = i.currentLocationId || 'unassigned'
    cohortCounts[cohort] = (cohortCounts[cohort] || 0)+1
    return { cohort, ...analyzeIntervals(observations.get(i.id) || [],today,policy.halfLifeDays) }
  })
  const summary = aggregateIntervals(series)
  const cohortEstimates = Object.keys(cohortCounts).map(cohort=>({cohort,estimate:median(series.filter(s=>s.cohort===cohort && s.robustEstimate!=null).map(s=>s.robustEstimate!))})).filter(c=>c.estimate != null)
  const seasonal = series.some(s=>s.seasonal.length>=2 && Math.max(...s.seasonal.map(q=>q.median!))/Math.min(...s.seasonal.map(q=>q.median!)) > 1.5)
  const configuredDays = current?.interval && current.unit ? day(cadenceDueAt(now,current,timezone)!)-today : null
  const eligibleSeries = series.filter(s=>s.intervalCount >= Math.min(2,policy.categories[activity].minIntervals))
  const adjustedEvents = series.reduce((sum,s)=>sum+s.adjustedEvents,0), groupedEvents = series.reduce((sum,s)=>sum+s.groupedEvents,0)
  const warnings = [
    'Observed practice is not proof of botanically optimal care.',
    ...(summary.contributingInstances===1 ? ['Based on one specimen; confidence is limited.'] : []),
    ...(activity==='REPOTTING' || activity==='PRUNING' ? ['Physical interventions only; unrecorded assessment checks cannot be inferred.'] : []),
    ...(seasonal ? ['Seasonal differences detected; a permanent year-round change may be inappropriate.'] : []),
    ...(adjustedEvents ? ['Recorded Quiet Day shifts overlap completed care; schedule displacement may explain variation.'] : []),
    ...(groupedEvents ? ['Bulk care grouping may reflect convenience rather than independent plant needs.'] : []),
    ...(truncated ? ['Analysis cap reached. Narrow the cohort or review manually; no recommendation can be produced.'] : []),
    'Unmarked emergencies, uncertain imports and unrecorded identity/condition changes cannot be reliably distinguished in legacy history.',
  ]
  const fingerprint = digest([baseline,boundary,definition.genus,definition.species,definition.cultivarName,definition.husbandryGuide,instances,events,moves,substrates,identityChanges,repottings,adjustments,policy])
  return { activity, current, baseline, configuredDays, timezone, calculatedAt:now.toISOString(), fingerprint, observationBoundary:boundary?.toISOString() || null, summary, series, activeInstances:active.length, excludedInstances:instances.length-series.length,
    excluded, cohortEstimates, seasonal, adjustedEvents, groupedEvents, truncated, eligibleInstances:eligibleSeries.length, warnings, hasRecipe,
    husbandryContext:definition.husbandryGuide?{wateringCadence:definition.husbandryGuide.wateringCadence,wateringMoistureLevel:definition.husbandryGuide.wateringMoistureLevel,wateringSeasonalAdjustments:definition.husbandryGuide.wateringSeasonalAdjustments}:null,
    plantIdentity:{genus:definition.genus,species:definition.species,cultivarName:definition.cultivarName},
  }
}
export type CareEvidence = Awaited<ReturnType<typeof loadCareEvidence>>
export function assessCareEvidence(e: CareEvidence, policy: CalibrationPolicy) {
  const base = { outcome:'INSUFFICIENT_HISTORY', confidence:0, proposed:null as {interval:number;unit:string}|null, reason:'More completed care history is required.' }
  if (!e.current) return {...base,outcome:'NO_CADENCE',reason:'Initial botanical cadence research is required.'}
  if (e.current.status==='NOT_APPLICABLE') return {...base,outcome:'NOT_APPLICABLE',reason:'N/A is preserved; recorded physical care does not change applicability.'}
  if (!e.configuredDays || e.activity==='FERTILIZING' && !e.hasRecipe) return {...base,outcome:'INELIGIBLE',reason:'An active assigned fertilizer recipe and scheduled cadence are required.'}
  const required = policy.categories[e.activity]
  if (e.truncated || e.summary.intervalCount < Math.max(required.minIntervals,e.observationBoundary?policy.minNewIntervals:0) || e.summary.spanDays < Math.max(required.minSpanDays,e.configuredDays*2) || !e.eligibleInstances || !e.summary.robustEstimate) return base
  const estimate = e.summary.robustEstimate, delta = Math.abs(estimate-e.configuredDays), ratio = estimate/e.configuredDays
  if (e.series.filter(s=>s.intervalCount).some(s=>(s.standardDeviation || 0)/(s.median || 1)>.6 || s.ongoingDays!>Math.max(30,e.configuredDays!*3)) || e.summary.disagreement > .6 || e.seasonal || e.summary.outliers > e.summary.intervalCount*.25 || ratio>policy.maxRatio || ratio<1/policy.maxRatio) return {...base,outcome:'INCONCLUSIVE',reason:'Large, seasonal, inconsistent or heterogeneous deviations need manual investigation.'}
  const absoluteFloor = e.configuredDays <= 3 ? 1 : Math.max(2,e.configuredDays*.1)
  if (delta < absoluteFloor || delta/e.configuredDays < policy.relativeDeviation || e.adjustedEvents && delta <= 2) return {...base,outcome:'STABLE',confidence:Math.min(.9,.55+e.summary.intervalCount*.015),reason:'Sufficient observed history aligns within the stability band; recorded quiet-day displacement is considered.'}
  const consistent = e.series.filter(s=>s.intervalCount>=2 && s.robustEstimate!=null).every(s=>(s.robustEstimate!-e.configuredDays!)*(estimate-e.configuredDays!)>0)
  if (!consistent) return {...base,outcome:'INCONCLUSIVE',reason:'Instances do not agree on the direction of adjustment.'}
  const confidence = Math.min(e.summary.contributingInstances===1 ? .74 : .94,.55+Math.min(.2,e.summary.intervalCount*.01)+Math.min(.15,(e.summary.contributingInstances-1)*.05)-(e.groupedEvents ? .05 : 0)-(e.adjustedEvents ? .05 : 0))
  // Preserve calendar-month/year semantics by rounding in the configured unit.
  const unit = e.current.unit!, factor = e.configuredDays/e.current.interval!
  const interval = Math.max(1,Math.round(estimate/factor))
  if (interval === e.current.interval || interval>3650) return {...base,outcome:'STABLE',confidence,reason:'No meaningful change in the configured calendar unit.'}
  return {...base,outcome:'RECOMMENDED',confidence,proposed:{interval,unit},reason:`Recorded completed care consistently differs from the configured interval. Equal specimen weighting and a recency-weighted robust estimate support review; check botanical suitability before applying.`}
}


/** Store aggregates only; bounded raw analysis arrays are released after the assessment. */
export function careEvidenceSnapshot(evidence: CareEvidence) {
  const { series, ...snapshot } = evidence
  return { ...snapshot, specimenSample: series.slice(0,12).map(({mean,median,min,max,standardDeviation,iqr,intervalCount,spanDays})=>({mean,median,min,max,standardDeviation,iqr,intervalCount,spanDays})) }
}
