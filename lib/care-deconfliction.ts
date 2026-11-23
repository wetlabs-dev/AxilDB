import { Prisma, type PrismaClient } from '@prisma/client'
import { getCareQueue, type CareQueueItem } from '@/lib/care-queue'
import { forecastConfiguration, type ForecastScope } from '@/lib/care-forecast-service'
import { projectCareOccurrences, effectiveQuietRules, quietDateReasons } from '@/lib/care-calendar'
import { scheduleDigest, scheduleRevision } from '@/lib/care-calendar-store'
import { deconflictionSuggestions, manualCareKey, manualDeconflictionRule } from '@/lib/care-deconfliction-policy'
import { addCalendarDays, dateInputValue, parseDateLocal, startOfDayInTimeZone } from '@/lib/time'
export type ResolutionSelection = { key: string; token: string; direction: 'EARLIER' | 'LATER' }
export async function deconflictionState(db: Prisma.TransactionClient, scope: ForecastScope) {
  const now = scope.now || new Date(), config = await forecastConfiguration(db, scope)
  const items = await getCareQueue(db, { ...scope, now, persistQuietPlan: false })
  const occurrences = projectCareOccurrences(items, config, now)
  const today = startOfDayInTimeZone(now, config.timezone), end = addCalendarDays(today, 7, config.timezone)
  const conflicts = occurrences.filter(item => item.schedulingConflict && item.dueAt < end)
  const rows = conflicts.slice(0, 500).map(item => {
    const key = manualCareKey(item, config.timezone)
    return { key, token: scheduleDigest([key,item.scheduleAnchor,item.notBeforeDate,item.manualSchedule,scheduleRevision({...config,quietDays:effectiveQuietRules(config.quietDays,item.locationId)})]),
      title: item.title, plantName: item.plantName, plantId: item.plantId, href: item.href, taskType: item.taskType, location: item.locationName || 'No location', locationId: item.locationId, originalDate: dateInputValue(item.originalDueAt || item.dueAt,config.timezone), reason: item.quietDayReason, period: quietDateReasons(item.originalDueAt || item.dueAt,config,item.locationId).map(rule=>rule.name).join(' + ') || item.quietDayName || 'Quiet Days', projected: Boolean(item.projected), ...deconflictionSuggestions(item,config,now) }
  })
  return { now, config, items, occurrences, rows, total: conflicts.length }
}
export function publicDeconfliction(state: Awaited<ReturnType<typeof deconflictionState>>) {
  return { rows: state.rows, total: state.total, timezone: state.config.timezone, limited: state.total > state.rows.length }
}
function validateSelections(selections: ResolutionSelection[]) {
  if (!Array.isArray(selections) || selections.length > 200 || selections.some(s=>!s || typeof s.key!=='string' || s.key.length>2000 || typeof s.token!=='string' || !['EARLIER','LATER'].includes(s.direction)) || new Set(selections.map(s=>s.key)).size!==selections.length) throw new Error('Choose at most 200 distinct conflict resolutions.')
}
export async function previewDeconfliction(db: Prisma.TransactionClient, scope: ForecastScope, selections: ResolutionSelection[]) {
  validateSelections(selections)
  const state = await deconflictionState(db,scope), rows = new Map(state.rows.map(row=>[row.key,row]))
  const valid: Array<{ selection: ResolutionSelection; item: CareQueueItem; date: Date; exception: boolean; earlyWatering: boolean }> = [], changed: string[] = []
  const manual = new Map(state.config.manualResolutions || [])
  const occurrenceByKey = new Map(state.occurrences.map(item=>[manualCareKey(item,state.config.timezone),item]))
  for(const selection of selections) {
    const row=rows.get(selection.key), candidate=row && (selection.direction==='EARLIER'?row.previous:row.next)
    if(!row || row.token!==selection.token || !candidate) { changed.push(selection.key);continue }
    const item=occurrenceByKey.get(selection.key)!
    const date=parseDateLocal(candidate.date,state.config.timezone)!
    valid.push({selection,item,date,exception:candidate.exception,earlyWatering:candidate.earlyWatering})
    manual.set(selection.key,{originalDueAt:item.originalDueAt||item.dueAt,adjustedDueAt:date,ruleUsed:manualDeconflictionRule,shiftDirection:selection.direction,reason:candidate.earlyWatering?'Early watering: check substrate moisture before watering.':'Manually resolved around Quiet Days.',quietDayId:null})
  }
  const after=projectCareOccurrences(state.items,{...state.config,manualResolutions:manual},state.now)
  const horizon=dateInputValue(addCalendarDays(startOfDayInTimeZone(state.now,state.config.timezone),21,state.config.timezone),state.config.timezone)
  const dates=[...new Set(valid.flatMap(v=>[dateInputValue(v.item.dueAt,state.config.timezone),dateInputValue(v.date,state.config.timezone)]))].sort()
  const counts=(items:CareQueueItem[])=>{const result=new Map<string,number>();for(const item of items)if(!item.schedulingConflict){const date=dateInputValue(item.dueAt,state.config.timezone);result.set(date,(result.get(date)||0)+1)}return result}
  const beforeCounts=counts(state.occurrences),afterCounts=counts(after)
  const impact=dates.map(date=>({date,before:date<=horizon?beforeCounts.get(date)||0:null,after:date<=horizon?afterCounts.get(date)||0:null,staged:valid.filter(v=>dateInputValue(v.date,state.config.timezone)===date).length}))
  return {state,valid,changed,impact,hash:scheduleDigest(valid.map(v=>[v.selection,v.date,v.exception,v.earlyWatering])),exceptions:valid.filter(v=>v.exception).length,earlyWaterings:valid.filter(v=>v.earlyWatering).length}
}
export async function applyDeconfliction(db: PrismaClient, scope: ForecastScope & {userId:string}, input: {selections:ResolutionSelection[]; hash:string; confirmExceptions?:boolean; operationId:string; issuedAt:number}) {
  validateSelections(input.selections)
  if (!/^[0-9a-f-]{36}$/i.test(input.operationId || '') || !Number.isFinite(input.issuedAt) || Date.now()-input.issuedAt>7*86400000 || input.issuedAt>Date.now()+60000) throw new Error('This confirmation expired. Preview again.')
  const receiptKey={collectionId:scope.collectionId,userId:scope.userId,operationId:input.operationId}
  const payloadHash=scheduleDigest([input.selections,input.hash,input.confirmExceptions])
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`care-calendar:${scope.collectionId}`}, 0))`
    const receipt=await tx.careQueueOperation.findUnique({where:{collectionId_userId_operationId:receiptKey}})
    if(receipt){if(receipt.action!=='deconflict'||receipt.payloadHash!==payloadHash)throw new Error('Confirmation identifier already used. Preview again.');return receipt.result as {reviewRequired:boolean;changed:string[];applied:string[];notice:string}}
    // Freeze cadence/recipe decisions and selected plant rows before rebuilding the preview.
    // NOWAIT avoids waiting on a care writer that may itself need the dependency lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
    const plantIds=input.selections.map(selection=>{
      if(!selection.key.startsWith('deconflict:'))throw new Error('Refresh invalid conflict identity.')
      const root=JSON.parse(selection.key.slice('deconflict:'.length))[0]
      if(typeof root!=='string'||!root.includes(':'))throw new Error('Refresh invalid conflict identity.')
      return root.slice(root.indexOf(':')+1)
    })
    if(plantIds.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM "PlantInstance" WHERE "collectionId"=${scope.collectionId} AND id IN (${Prisma.join([...new Set(plantIds)].sort())}) ORDER BY id FOR UPDATE NOWAIT`)
    const preview=await previewDeconfliction(tx,scope,input.selections)
    if(preview.hash!==input.hash || preview.exceptions && input.confirmExceptions !== true) return {reviewRequired:true,changed:preview.changed,applied:[],notice:'The schedule changed or manual exceptions need confirmation. Review the refreshed suggestions.'}
    const decisions=preview.valid.map(({selection,item,date,earlyWatering})=>({collectionId:scope.collectionId,scheduleKey:selection.key,taskKey:item.key.replace(/(:projection)+$/,''),plantInstanceId:item.plantInstanceId||null,careType:item.taskType,timezone:preview.state.config.timezone,originalDueAt:item.originalDueAt||item.dueAt,adjustedDueAt:date,shiftDirection:selection.direction,ruleUsed:manualDeconflictionRule,reason:earlyWatering?'Early watering: check substrate moisture before watering.':'Manually resolved around Quiet Days.'}))
    const applied=decisions.map(row=>row.scheduleKey)
    const existing=applied.length?await tx.careQuietDayAdjustment.findMany({where:{collectionId:scope.collectionId,scheduleKey:{in:applied}},select:{scheduleKey:true}}):[]
    const existingKeys=new Set(existing.map(row=>row.scheduleKey))
    const creates=decisions.filter(row=>!existingKeys.has(row.scheduleKey)),updates=decisions.filter(row=>existingKeys.has(row.scheduleKey))
    if(creates.length)await tx.careQuietDayAdjustment.createMany({data:creates})
    if(updates.length)await tx.$executeRaw(Prisma.sql`
      UPDATE "CareQuietDayAdjustment" AS current
      SET "adjustedDueAt"=candidate.destination, "shiftDirection"=candidate.direction, "reason"=candidate.reason, "ruleUsed"=${manualDeconflictionRule}
      FROM (VALUES ${Prisma.join(updates.map(row=>Prisma.sql`(${row.scheduleKey}::text, ${row.adjustedDueAt}::timestamp, ${row.shiftDirection}::text, ${row.reason}::text)`))}) AS candidate(key,destination,direction,reason)
      WHERE current."collectionId"=${scope.collectionId} AND current."scheduleKey"=candidate.key
    `)
    if(applied.length) await tx.auditLog.create({data:{collectionId:scope.collectionId,userId:scope.userId,action:'UPDATE',entityType:'CARE_DECONFLICTION',summary:`Resolved ${applied.length} scheduling conflict(s)`,metadata:JSON.stringify({source:manualDeconflictionRule,approvedAt:new Date(),hash:input.hash,decisions:preview.valid.map(v=>({key:v.selection.key,direction:v.selection.direction,originalDate:v.item.originalDueAt||v.item.dueAt,destination:v.date,exception:v.exception,earlyWatering:v.earlyWatering}))})}})
    const result={reviewRequired:false,changed:preview.changed,applied,notice:`${applied.length} resolution(s) applied. ${preview.changed.length} changed task(s) need review.`}
    await tx.careQueueOperation.deleteMany({where:{collectionId:scope.collectionId,expiresAt:{lt:new Date()}}})
    await tx.careQueueOperation.create({data:{...receiptKey,action:'deconflict',payloadHash,result,expiresAt:new Date(input.issuedAt+7*86400000)}})
    return result
  },{maxWait:15000,timeout:30000})
}
