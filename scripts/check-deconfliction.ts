import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {deconflictionSuggestions,manualCareKey} from '../lib/care-deconfliction-policy'
import {applyDeconfliction,deconflictionState,previewDeconfliction} from '../lib/care-deconfliction'
import {getCareQueue,type CareQueueItem} from '../lib/care-queue'
import {loadCareForecast} from '../lib/care-forecast-service'
import {parseDateLocal,dateInputValue} from '../lib/time'
import type {CalendarConfig} from '../lib/care-calendar'
const timezone='America/New_York',date=(s:string)=>parseDateLocal(s,timezone)!,now=date('2026-11-23')
const config:CalendarConfig={timezone,rules:[{careType:'HEALTH_CHECK',active:true,defaultShiftDirection:'SMART',maxShiftDaysBefore:1,maxShiftDaysAfter:1}],quietDays:[{id:'holiday',name:'Thanksgiving',quietType:'DATE_RANGE',startDate:date('2026-11-25'),endDate:date('2026-11-29'),date:null,dayOfWeek:null,active:true}]}
const item:CareQueueItem={key:'HEALTH_CHECK:one',taskType:'HEALTH_CHECK',source:'derived',title:'Inspect plant',reason:'',dueAt:date('2026-11-28'),priority:1,overdueDays:0,href:'/',cadenceDays:7,recurrenceCadence:{activity:'GENERAL_INSPECTION',interval:7,unit:'DAY'}}
let suggestion=deconflictionSuggestions(item,config,now)
assert.equal(suggestion.previous?.date,'2026-11-24');assert.equal(suggestion.next?.date,'2026-11-30');assert.equal(suggestion.next?.exception,true)
suggestion=deconflictionSuggestions(item,config,date('2026-11-26'));assert.equal(suggestion.previous,null);assert.equal(suggestion.recommended,'LATER')
const endless={...config,quietDays:Array.from({length:7},(_,dayOfWeek)=>({...config.quietDays[0],id:`week-${dayOfWeek}`,quietType:'WEEKLY_RECURRING',startDate:null,endDate:null,dayOfWeek}))}
assert.equal(deconflictionSuggestions(item,endless,now).next,null);assert.equal(deconflictionSuggestions(item,endless,now).previous,null)
assert.equal(deconflictionSuggestions({...item,taskType:'TREATMENT'},config,now).supported,false)
assert.equal(deconflictionSuggestions({...item,notBeforeDate:'2026-11-28'},config,now).previous,null)
assert.equal(manualCareKey({...item,key:item.key+':projection:projection'},timezone),manualCareKey(item,timezone))
const water={...item,key:'WATER:one',taskType:'WATER' as const,cadenceDays:7}
assert.equal(deconflictionSuggestions(water,config,now).recommended,'EARLIER')
assert.equal(deconflictionSuggestions({...water,cadenceDays:21},config,now).recommended,'LATER')
const local={...config,quietDays:[...config.quietDays,{...config.quietDays[0],id:'local',locationId:'office',startDate:date('2026-11-30'),endDate:date('2026-12-01')}]}
assert.equal(deconflictionSuggestions({...item,locationId:'office'},local,now).next?.date,'2026-12-02')
assert.equal(deconflictionSuggestions({...item,locationId:'home'},local,now).next?.date,'2026-11-30')
const dst={...config,quietDays:[{...config.quietDays[0],startDate:date('2026-03-07'),endDate:date('2026-03-08')}]}
assert.equal(deconflictionSuggestions({...item,dueAt:date('2026-03-08')},dst,date('2026-03-06')).next?.date,'2026-03-09')
assert.equal(deconflictionSuggestions({...item,dueAt:date('2025-01-01')},{...config,quietDays:[]},now).next?.date,'2026-11-23','Overdue next-date search begins at today, not an expired search window.')
const forwardBlocked={...config,quietDays:[{...config.quietDays[0],startDate:date('2026-11-28'),endDate:date('2028-01-01')}]}
assert.equal(deconflictionSuggestions(item,forwardBlocked,now).next,null)
assert.equal(deconflictionSuggestions(item,forwardBlocked,now).recommended,'EARLIER')
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');if(url.hostname!=='localhost'||url.port!=='55444'||url.pathname!=='/axildb_deconflict')throw new Error('Only the disposable deconfliction database is allowed.')
const db=new PrismaClient()
async function main(){
 const user=await db.user.create({data:{email:`deconflict-${randomUUID()}@example.test`,passwordHash:'fixture'}}),collection=await db.collection.create({data:{name:'Deconfliction checks',slug:`deconflict-${randomUUID()}`}})
 try{
  const definition=await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Hoya',species:'carnosa',careCadences:{create:{activity:'GENERAL_INSPECTION',interval:7,unit:'DAY',activatedAt:null}}}})
  const plant=await db.plantInstance.create({data:{collectionId:collection.id,plantDefinitionId:definition.id,plantId:'CONFLICT-1',instanceType:'ACQUIRED',acquisitionDate:date('2026-11-21')}})
  await db.collectionQuietDay.create({data:{collectionId:collection.id,name:'Thanksgiving',quietType:'DATE_RANGE',startDate:date('2026-11-25'),endDate:date('2026-11-29'),timezone}})
  await db.collectionQuietDayShiftRule.create({data:{collectionId:collection.id,careType:'HEALTH_CHECK',defaultShiftDirection:'SMART',maxShiftDaysBefore:1,maxShiftDaysAfter:1}})
  const scope={collectionId:collection.id,collectionSlug:collection.slug,userId:user.id,timezone,now}
  const state=()=>db.$transaction(tx=>deconflictionState(tx,scope))
  let state1=await state();assert.equal(state1.rows.length,1);assert.equal(state1.rows[0].next?.date,'2026-11-30')
  const selections=[{key:state1.rows[0].key,token:state1.rows[0].token,direction:'LATER' as const}]
  const preview=await db.$transaction(tx=>previewDeconfliction(tx,scope,selections));assert.equal(preview.exceptions,1);assert.equal(preview.impact.find(d=>d.date==='2026-11-30')?.after,1)
  const input={selections,hash:preview.hash,confirmExceptions:false,operationId:randomUUID(),issuedAt:Date.now()}
  assert.equal((await applyDeconfliction(db,scope,input)).reviewRequired,true)
  const approved={...input,confirmExceptions:true}
  let unlock!:()=>void,ready!:()=>void
  const gate=new Promise<void>(resolve=>{unlock=resolve}),acquired=new Promise<void>(resolve=>{ready=resolve})
  const held=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "PlantInstance" WHERE id=${plant.id} FOR UPDATE`;ready();await gate},{timeout:10000})
  await acquired
  try{await assert.rejects(applyDeconfliction(db,scope,approved),'Busy care rows reject safely without a deadlock or partial save.')}finally{unlock();await held}
  const results=await Promise.all([applyDeconfliction(db,scope,approved),applyDeconfliction(db,scope,approved)])
  assert.equal(results[0].applied.length,1);assert.deepEqual(results[0],results[1]);assert.equal(await db.auditLog.count({where:{collectionId:collection.id,entityType:'CARE_DECONFLICTION'}}),1)
  assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:plant.id}}),0)
  let queue=await getCareQueue(db,scope);assert.equal(queue.length,1);assert.equal(dateInputValue(queue[0].dueAt,timezone),'2026-11-30');assert.equal(queue[0].schedulingConflict,false)
  assert.equal((await state()).rows.length,0)
  assert.equal(dateInputValue((await getCareQueue(db,scope))[0].dueAt,timezone),'2026-11-30','A fresh read preserves the decision.')
  // A new quiet restriction invalidates eligibility without silently dropping or moving manual work.
  const extra=await db.collectionQuietDay.create({data:{collectionId:collection.id,name:'Extra closure',quietType:'ONE_TIME',date:date('2026-11-30'),timezone}})
  state1=await state();assert.equal(state1.rows.length,1);assert.equal(state1.rows[0].next?.date,'2026-12-01')
  const stale={key:state1.rows[0].key,token:state1.rows[0].token,direction:'LATER' as const},p=await db.$transaction(tx=>previewDeconfliction(tx,scope,[stale]))
  await db.collectionQuietDay.delete({where:{id:extra.id}})
  assert.equal((await applyDeconfliction(db,scope,{selections:[stale],hash:p.hash,confirmExceptions:true,operationId:randomUUID(),issuedAt:Date.now()})).reviewRequired,true)
  const blockedAgain=await db.collectionQuietDay.create({data:{collectionId:collection.id,name:'Changed closure',quietType:'ONE_TIME',date:date('2026-11-30'),timezone}})
  const changedRow=(await state()).rows[0],changedSelection={key:changedRow.key,token:changedRow.token,direction:'LATER' as const}
  const changedPreview=await db.$transaction(tx=>previewDeconfliction(tx,scope,[changedSelection]))
  assert.equal((await applyDeconfliction(db,scope,{selections:[changedSelection],hash:changedPreview.hash,confirmExceptions:true,operationId:randomUUID(),issuedAt:Date.now()})).applied.length,1)
  assert.equal(dateInputValue((await getCareQueue(db,scope))[0].dueAt,timezone),'2026-12-01','A reviewed replacement updates the existing manual record in a batch.')
  await db.collectionQuietDay.delete({where:{id:blockedAgain.id}})
  // Conditional future occurrence: no duplicate current queue task; decision carries into an actual matching occurrence.
  await db.plantDefinitionCareCadence.update({where:{plantDefinitionId_activity:{plantDefinitionId:definition.id,activity:'GENERAL_INSPECTION'}},data:{interval:4}})
  await db.plantInstance.update({where:{id:plant.id},data:{acquisitionDate:date('2026-11-20')}})
  state1=await state();const projection=state1.rows.find(r=>r.projected)!
  assert.ok(projection);assert.equal(projection.originalDate,'2026-11-28')
  const choice={key:projection.key,token:projection.token,direction:'LATER' as const},pp=await db.$transaction(tx=>previewDeconfliction(tx,scope,[choice]))
  await applyDeconfliction(db,scope,{selections:[choice],hash:pp.hash,confirmExceptions:true,operationId:randomUUID(),issuedAt:Date.now()})
  queue=await getCareQueue(db,scope);assert.equal(queue.length,1);assert.equal(dateInputValue(queue[0].dueAt,timezone),'2026-11-24')
  const forecast=await loadCareForecast(db,scope);assert.equal(forecast.days.flatMap(d=>d.conflicts).length,0)
  await db.plantCareEvent.create({data:{collectionId:collection.id,plantInstanceId:plant.id,eventType:'HEALTH_CHECK',performedAt:date('2026-11-24')}})
  queue=await getCareQueue(db,scope);assert.equal(dateInputValue(queue[0].dueAt,timezone),'2026-11-30')
  // Later explicit scheduling wins; completion supersedes the whole old occurrence.
  await db.plantCareAdjustment.create({data:{collectionId:collection.id,plantInstanceId:plant.id,taskType:'HEALTH_CHECK',nextDueAt:date('2026-12-02')}})
  assert.equal(dateInputValue((await getCareQueue(db,scope))[0].dueAt,timezone),'2026-12-02')
  await db.plantCareEvent.create({data:{collectionId:collection.id,plantInstanceId:plant.id,eventType:'HEALTH_CHECK',performedAt:date('2026-12-02')}})
  assert.equal(dateInputValue((await getCareQueue(db,scope))[0].dueAt,timezone),'2026-12-06')
  // Bounded bulk fixture.
  await db.plantInstance.createMany({data:Array.from({length:150},(_,i)=>({collectionId:collection.id,plantDefinitionId:definition.id,plantId:`BULK-${i}`,instanceType:'ACQUIRED',acquisitionDate:date('2026-11-24')}))})
  const started=performance.now(),many=await state();assert.ok(many.rows.length>=150)
  const choices=many.rows.slice(0,150).map(r=>({key:r.key,token:r.token,direction:'LATER' as const})),bulk=await db.$transaction(tx=>previewDeconfliction(tx,scope,choices),{timeout:30000})
  const done=await applyDeconfliction(db,scope,{selections:choices,hash:bulk.hash,confirmExceptions:true,operationId:randomUUID(),issuedAt:Date.now()});assert.equal(done.applied.length,150)
  console.log(`Deconfliction: 150 conflict resolutions previewed and applied in ${Math.round(performance.now()-started)} ms; actual/projected persistence, idempotent concurrent retry, stale quiet changes, explicit overrides, completion and zero fabricated care passed.`)
 }finally{await db.collection.delete({where:{id:collection.id}});await db.user.delete({where:{id:user.id}})}
}
main().finally(()=>db.$disconnect())
