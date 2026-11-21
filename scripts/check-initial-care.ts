import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { cadenceActivities, resolveInitialCareSchedule, resolveCadence } from '../lib/care-cadences'
import { getCareQueue } from '../lib/care-queue'
import { loadCareForecast } from '../lib/care-forecast-service'
import { auditCareScheduleBatch } from '../lib/care-schedule-integrity'
import { configureDefinitionCadence } from '../lib/care-cadence-service'
import { executeCareOperation } from '../lib/care-queue-operations'
import { applyCareQueueMutation, type MutationContext } from '../lib/care-queue-mutations'
import { dateInputValue, parseDateLocal } from '../lib/time'
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid')
if (!['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '55444' || url.pathname !== '/axildb_initial_care') throw new Error('Only the isolated initial-care database is allowed.')
const db = new PrismaClient(), timezone = 'America/New_York', now = new Date('2026-11-21T17:00:00Z')
const date = (s:string) => parseDateLocal(s, timezone)!
async function main() {
  const cadence = { activity: 'WATERING', interval: 7, unit: 'DAY' }
  const base = { cadence, createdAt: date('2026-10-13'), timezone }
  assert.equal(dateInputValue(resolveInitialCareSchedule(base).dueAt,timezone),'2026-10-20')
  assert.equal(dateInputValue(resolveInitialCareSchedule({...base,activatedAt:date('2026-11-20')}).dueAt,timezone),'2026-11-27')
  assert.equal(dateInputValue(resolveInitialCareSchedule({...base,lastCompleted:date('2026-11-10'),activatedAt:date('2026-11-20')}).dueAt,timezone),'2026-11-17','Existing care history remains authoritative after a cadence edit.')
  assert.equal(dateInputValue(resolveInitialCareSchedule({...base,nextDueAt:date('2026-11-25'),snoozedUntil:date('2026-11-28')}).dueAt,timezone),'2026-11-28')
  assert.equal(resolveInitialCareSchedule({...base,disabled:true}).dueAt,null)
  assert.equal(resolveInitialCareSchedule({...base,cadence:null}).dueAt,null)
  for (const day of ['2026-03-07','2026-10-31']) assert.equal(dateInputValue(resolveInitialCareSchedule({...base,createdAt:date(day),cadence:{...cadence,interval:2}}).dueAt,timezone),day==='2026-03-07'?'2026-03-09':'2026-11-02')
  const user = await db.user.create({ data: { email: `initial-${randomUUID()}@example.test`, passwordHash: 'fixture' } })
  const collection = await db.collection.create({ data: { name: 'Initial-care regression', slug: `initial-${randomUUID()}` } })
  try {
    const membership = await db.collectionMembership.create({ data:{collectionId:collection.id,userId:user.id,role:'MANAGER',status:'ACTIVE'} })
    const context: MutationContext = {user,collection,membership,role:'MANAGER'}
    await db.emailPreference.create({data:{userId:user.id,timezone}})
    const definition = await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Monstera',species:'deliciosa',cultivarName:'Lemon Lime'}})
    await db.plantDefinitionCareCadence.createMany({data:cadenceActivities.filter(c=>c.activity!=='FERTILIZING').map(c=>({plantDefinitionId:definition.id,activity:c.activity,status:c.activity==='PRUNING'?'NOT_APPLICABLE':'SCHEDULED',interval:c.activity==='PRUNING'?null:7,unit:c.activity==='PRUNING'?null:'DAY',activatedAt:null}))})
    const plant = await db.plantInstance.create({data:{collectionId:collection.id,plantDefinitionId:definition.id,plantId:'MONDEL-LEM-20261014-AC-001',instanceType:'ACQUIRED',acquisitionDate:date('2026-10-13'),createdAt:date('2026-10-14')}})
    const scope = {collectionId:collection.id,collectionSlug:collection.slug,userId:user.id,timezone,now}
    const queue = () => getCareQueue(db,scope)
    let items = await queue()
    assert.equal(items.length,4,'Initial water, repot and both inspections; no N/A pruning or recipe-less fertilizer.')
    assert.equal(items.filter(i=>i.taskType==='WATER').length,1)
    assert.equal(dateInputValue(items.find(i=>i.taskType==='WATER')!.dueAt,timezone),'2026-10-20')
    assert.match(items[0].reason,/initial collection scheduling/)
    const beforeEvents = await db.plantCareEvent.count({where:{collectionId:collection.id}})
    const dry = await auditCareScheduleBatch(db,scope)
    assert.equal(dry.activeInstances,1);assert.equal(dry.discrepancies.filter(r=>r.discrepancy==='LEGACY_INITIAL_ANCHOR').length,4)
    assert.equal(resolveInitialCareSchedule({...base,cadence:{...cadence,activity:'FERTILIZING'},hasRecipe:false}).dueAt,null)
    assert.equal(await db.plantCareAdjustment.count({where:{collectionId:collection.id}}),0,'Dry run writes no anchors.')
    const applied = await auditCareScheduleBatch(db,{...scope,apply:true});assert.equal(applied.applied,4)
    assert.equal((await auditCareScheduleBatch(db,{...scope,apply:true})).applied,0)
    assert.equal(await db.plantCareEvent.count({where:{collectionId:collection.id}}),beforeEvents)
    assert.deepEqual((await queue()).map(i=>[i.key,i.dueAt]),items.map(i=>[i.key,i.dueAt]))
    await db.plantInstanceCareCadenceOverride.create({data:{plantInstanceId:plant.id,activity:'WATERING',mode:'OVERRIDE',interval:3,unit:'DAY',activatedAt:date('2026-11-20')}})
    assert.equal(dateInputValue((await queue()).find(i=>i.taskType==='WATER')!.dueAt,timezone),'2026-11-23')
    await db.plantInstanceCareCadenceOverride.deleteMany({where:{plantInstanceId:plant.id}})
    assert.equal(dateInputValue((await queue()).find(i=>i.taskType==='WATER')!.dueAt,timezone),'2026-10-20')
    const adjustment = await db.plantCareAdjustment.update({where:{collectionId_plantInstanceId_taskType:{collectionId:collection.id,plantInstanceId:plant.id,taskType:'WATER'}},data:{snoozedUntil:date('2026-11-28')}})
    await auditCareScheduleBatch(db,{...scope,apply:true})
    assert.equal(dateInputValue((await queue()).find(i=>i.taskType==='WATER')!.dueAt,timezone),'2026-11-28')
    assert.deepEqual(await db.plantCareAdjustment.findUnique({where:{id:adjustment.id}}),adjustment)
    await db.plantCareAdjustment.update({where:{id:adjustment.id},data:{snoozedUntil:null,disabled:true}})
    assert.equal((await queue()).some(i=>i.taskType==='WATER'),false)
    await auditCareScheduleBatch(db,{...scope,apply:true})
    assert.equal((await queue()).some(i=>i.taskType==='WATER'),false,'Reconciliation respects dismissal/disabled state.')
    await db.plantCareAdjustment.update({where:{id:adjustment.id},data:{disabled:false}})
    await db.plantInstanceCareCadenceOverride.deleteMany({where:{plantInstanceId:plant.id,activity:'WATERING'}})
    // First real completion establishes the usual subsequent schedule; never fabricate a completion.
    const complete = new FormData();complete.set('taskType','WATER');complete.set('plantInstanceId',plant.id)
    const identity = {operationId:randomUUID(),issuedAt:Date.now()}
    const operation=()=>executeCareOperation(db,{collectionId:collection.id,userId:user.id,action:'complete',fd:complete,identity},tx=>applyCareQueueMutation(tx,context,'complete',complete))
    await Promise.all([operation(),operation(),auditCareScheduleBatch(db,{...scope,apply:true})])
    const actual = await db.plantCareEvent.findFirstOrThrow({where:{plantInstanceId:plant.id,eventType:'WATERED'}})
    assert.ok((await queue()).find(i=>i.taskType==='WATER')!.dueAt > actual.performedAt)
    await auditCareScheduleBatch(db,{...scope,apply:true})
    assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:plant.id,eventType:'WATERED'}}),1)
    await db.plantInstance.update({where:{id:plant.id},data:{status:'DEAD'}})
    assert.equal((await queue()).length,0)
    await db.plantInstance.update({where:{id:plant.id},data:{status:'ACTIVE'}})
    assert.equal((await queue()).length,4,'Reactivation resumes existing obligations without fictional care or date reset.')
    // Newly applied cadence on an older plant is an onboarding decision, not legacy arrears.
    const freshDefinition=await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Hoya'}})
    await db.$transaction(tx=>configureDefinitionCadence(tx,{definitionId:freshDefinition.id,activity:'WATERING',interval:7,unit:'DAY'}))
    const fresh=await db.plantInstance.create({data:{collectionId:collection.id,plantDefinitionId:freshDefinition.id,plantId:'NEW-CADENCE',instanceType:'ACQUIRED',acquisitionDate:date('2026-01-01'),createdAt:date('2026-01-01')}})
    const firstDecision=await db.plantDefinitionCareCadence.findFirstOrThrow({where:{plantDefinitionId:freshDefinition.id}})
    assert.ok(firstDecision.activatedAt)
    await db.$transaction(tx=>configureDefinitionCadence(tx,{definitionId:freshDefinition.id,activity:'WATERING',interval:8,unit:'DAY'}))
    assert.equal((await db.plantDefinitionCareCadence.findFirstOrThrow({where:{plantDefinitionId:freshDefinition.id}})).activatedAt!.getTime(),firstDecision.activatedAt!.getTime(),'Interval edits do not drift initial activation.')
    assert.ok((await queue()).find(i=>i.plantInstanceId===fresh.id)!.dueAt > now)
    const locationType=await db.locationType.create({data:{collectionId:collection.id,name:'Room',abbreviation:'RM'}})
    const location=await db.location.create({data:{collectionId:collection.id,locationTypeId:locationType.id,name:'Office',code:'OFFICE'}})
    await db.plantInstance.update({where:{id:fresh.id},data:{currentLocationId:location.id}})
    const due=(await queue()).find(i=>i.plantInstanceId===fresh.id)!.dueAt
    await db.collectionQuietDay.create({data:{collectionId:collection.id,locationId:location.id,name:'Closed',quietType:'DATE_RANGE',startDate:due,endDate:new Date(due.getTime()+86400000),timezone}})
    const shifted=(await queue()).find(i=>i.plantInstanceId===fresh.id)!
    assert.notEqual(shifted.dueAt.getTime(),due.getTime());assert.ok(shifted.originalDueAt)
    const forecast=await loadCareForecast(db,scope)
    const forecastItems=forecast.days.flatMap(d=>d.tasks)
    // Check forecast under its actual seven-day horizon and identical projected occurrence keys.
    for(const item of await queue()) if(item.dueAt < date('2026-11-28')) assert.ok(forecastItems.some(f=>f.key===item.key && f.dueAt.getTime()===item.dueAt.getTime()), 'Forecast includes outstanding initial obligations with queue dates.')
    const stable = (await queue()).map(i=>[i.key,i.dueAt.toISOString()])
    assert.deepEqual((await queue()).map(i=>[i.key,i.dueAt.toISOString()]),stable)
    const recipe=await db.fertilizerRecipe.create({data:{collectionId:collection.id,name:'Fixture feed'}})
    await db.plantHusbandryGuide.create({data:{collectionId:collection.id,plantDefinitionId:freshDefinition.id,fertilizerRecipeId:recipe.id}})
    await db.plantDefinitionCareCadence.create({data:{plantDefinitionId:freshDefinition.id,activity:'FERTILIZING',interval:7,unit:'DAY',activatedAt:date('2026-11-20')}})
    assert.ok((await queue()).some(i=>i.plantInstanceId===fresh.id && i.taskType==='FERTILIZE' && i.fertilizerRecipeId===recipe.id))
    await db.plantHusbandryGuide.update({where:{plantDefinitionId:freshDefinition.id},data:{fertilizationCadenceDays:5}})
    assert.equal((await db.plantDefinitionCareCadence.findUniqueOrThrow({where:{plantDefinitionId_activity:{plantDefinitionId:freshDefinition.id,activity:'FERTILIZING'}}})).activatedAt!.getTime(),date('2026-11-20').getTime(),'Legacy interval edits preserve activation too.')
    // Hundreds of legacy plants: bounded cursor batches, bounded summaries, safe concurrent retries.
    await db.plantInstance.createMany({data:Array.from({length:300},(_,i)=>({id:`${collection.id}-${i.toString().padStart(4,'0')}`,collectionId:collection.id,plantDefinitionId:definition.id,plantId:`LOAD-${i}`,instanceType:'ACQUIRED',acquisitionDate:date('2026-10-13')}))})
    const started=performance.now();let after:string|undefined,count=0,pins=0
    do {const result=await auditCareScheduleBatch(db,{...scope,after,batchSize:50,apply:true});assert.ok(result.activeInstances<=50);count+=result.activeInstances;pins+=result.applied;after=result.nextCursor||undefined}while(after)
    assert.equal(count,302);assert.equal(pins,1200)
    const concurrent=await Promise.all([auditCareScheduleBatch(db,{...scope,batchSize:50,apply:true}),auditCareScheduleBatch(db,{...scope,batchSize:50,apply:true})]);assert.equal(concurrent.reduce((n,r)=>n+r.applied,0),0)
    console.log(`Initial-care DB: 302 plants audited in batches of 50 in ${Math.round(performance.now()-started)} ms; 1200 legacy anchors pinned without care events or duplicate tasks.`)
    console.log('Initial scheduling, onboarding, preserved activation, all categories, override removal, first completion, suppression, snooze, lifecycle, quiet dates and idempotent concurrent reconciliation passed.')
  }finally{await db.collection.delete({where:{id:collection.id}});await db.user.delete({where:{id:user.id}})}
}
main().finally(()=>db.$disconnect())
