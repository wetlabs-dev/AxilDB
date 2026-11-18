import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { PrismaClient } from '@prisma/client'
import { loadCareEvidence, policyFor, queueCalibration, runCalibrationJob, reviewCalibration, ensureCalibrationStates, metricKey } from '../lib/cadence-calibration'
import { configureDefinitionCadence } from '../lib/care-cadence-service'
import { getCareQueue } from '../lib/care-queue'
import { processAiCuratorWake, recoverCadenceResearchLeases } from '../lib/ai-curator'
import { actionableCadenceWhere, isActionableCadenceProposal } from '../lib/cadence-review'
const url=new URL(process.env.DATABASE_URL || '')
assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname==='/axildb_calibration_test','Use the disposable calibration test database.')
const db=new PrismaClient(),now=new Date('2026-11-18T17:00:00Z'),days=(n:number)=>new Date(now.getTime()+n*86400000)
async function main(){
 const user=await db.user.create({data:{email:`cal-${randomUUID()}@example.test`,passwordHash:'fixture'}})
 const c=await db.collection.create({data:{name:'Calibration fixture',slug:`cal-${randomUUID()}`,aiFeaturesEnabled:true,aiCuratorEnabled:true}})
 const other=await db.collection.create({data:{name:'Private other',slug:`other-${randomUUID()}`}})
 try{
  await db.aiCuratorSettings.upsert({where:{id:'global'},create:{id:'global'},update:{}})
  const d=await db.plantDefinition.create({data:{collectionId:c.id,genus:'Hoya',species:'carnosa'}})
  await db.plantDefinitionCareCadence.create({data:{plantDefinitionId:d.id,activity:'WATERING',interval:7,unit:'DAY'}})
  const plant=await db.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:d.id,plantId:'CAL-1',instanceType:'ACQUIRED',acquisitionDate:days(-300)}})
  await db.plantCareEvent.createMany({data:Array.from({length:10},(_,i)=>({collectionId:c.id,plantInstanceId:plant.id,eventType:'WATERED',performedAt:days(-140+i*14)}))})
  await db.plantCareEvent.create({data:{collectionId:c.id,plantInstanceId:plant.id,eventType:'WATERED',performedAt:days(-14)}})
  const override=await db.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:d.id,plantId:'OVERRIDE',instanceType:'ACQUIRED',acquisitionDate:days(-300),careCadenceOverrides:{create:{activity:'WATERING',mode:'OVERRIDE',interval:3,unit:'DAY'}}}})
  await db.plantCareEvent.createMany({data:Array.from({length:30},(_,i)=>({collectionId:c.id,plantInstanceId:override.id,eventType:'WATERED',performedAt:days(-100+i*3)}))})
  const policy=await policyFor(db),e=await loadCareEvidence(db,c.id,d.id,'WATERING',policy,now)
  assert.equal(e.summary.mean,14);assert.equal(e.summary.contributingInstances,1);assert.equal(e.summary.intervalCount,9);assert.equal(e.summary.excluded,1)
  assert.equal(e.excludedInstances,1)
  await assert.rejects(loadCareEvidence(db,other.id,d.id,'WATERING',policy,now))
  const scope={collectionId:c.id,collectionSlug:c.slug,timezone:'America/New_York',now}
  const before=await getCareQueue(db,scope)
  const jobs=await Promise.all(Array.from({length:4},()=>queueCalibration(db,{collectionId:c.id,definitionId:d.id,activity:'WATERING',manual:true},now)))
  assert.equal(jobs.filter(Boolean).length,1)
  const job=jobs.find(Boolean)!
  await db.aiCuratorJob.update({where:{id:job.id},data:{status:'RUNNING',claimedBy:'fixture'}})
  await runCalibrationJob(db,{...job,claimedBy:'fixture'},undefined,now)
  const proposal=await db.careCadenceProposal.findFirstOrThrow({where:{plantDefinitionId:d.id,source:'CADENCE_CALIBRATION'}})
  assert.equal(proposal.interval,14)
  assert.equal(await db.careCadenceProposal.count({where:actionableCadenceWhere(c.id)}),1,'Dashboard includes replacements of configured care.')
  assert.equal(await db.careCadenceProposal.count({where:actionableCadenceWhere(other.id)}),0)
  assert.deepEqual((await getCareQueue(db,scope)).map(t=>[t.key,t.dueAt]),before.map(t=>[t.key,t.dueAt]),'Research alone never changes the queue.')
  assert.equal(await queueCalibration(db,{collectionId:c.id,definitionId:d.id,activity:'WATERING',manual:true},days(2)),null,'Pending review blocks duplicate research.')
  const originalEvents=await db.plantCareEvent.findMany({where:{collectionId:c.id},orderBy:{id:'asc'}})
  const approved=await Promise.all(Array.from({length:2},()=>reviewCalibration(db,{id:proposal.id,collectionId:c.id,reviewerId:user.id,decision:'approve',edit:{interval:12,unit:'DAY'}},now)))
  assert.equal(approved.filter(r=>r==='APPROVED').length,1)
  const applied=await db.plantDefinitionCareCadence.findUniqueOrThrow({where:{plantDefinitionId_activity:{plantDefinitionId:d.id,activity:'WATERING'}}})
  assert.equal(applied.interval,12)
  assert.equal((await db.plantInstanceCareCadenceOverride.findFirstOrThrow({where:{plantInstanceId:override.id}})).interval,3)
  const state=await db.metricCalibrationState.findUniqueOrThrow({where:{collectionId_plantDefinitionId_metricKey:{collectionId:c.id,plantDefinitionId:d.id,metricKey:metricKey('WATERING')}}})
  assert.equal(state.nextEligibleAt!.getTime(),days(30).getTime());assert.equal(state.observationBoundary!.getTime(),now.getTime())
  assert.deepEqual(await db.plantCareEvent.findMany({where:{collectionId:c.id},orderBy:{id:'asc'}}),originalEvents)
  assert.equal(await queueCalibration(db,{collectionId:c.id,definitionId:d.id,activity:'WATERING'},days(29)),null)
  const next=await queueCalibration(db,{collectionId:c.id,definitionId:d.id,activity:'WATERING'},days(31))
  assert.ok(next)
  await db.aiCuratorJob.update({where:{id:next!.id},data:{status:'RUNNING',claimedBy:'next'}})
  await runCalibrationJob(db,{...next!,claimedBy:'next'},undefined,days(31))
  assert.equal((await db.metricCalibrationState.findUniqueOrThrow({where:{id:state.id}})).outcome,'INSUFFICIENT_HISTORY','Old intervals cannot produce another correction after approval.')
  assert.equal(await db.careCadenceProposal.count({where:{plantDefinitionId:d.id,source:'CADENCE_CALIBRATION'}}),1)
  // Stale recommendation and rejection paths use separate independent category state.
  await db.plantDefinitionCareCadence.create({data:{plantDefinitionId:d.id,activity:'PEST_INSPECTION',interval:7,unit:'DAY'}})
  await db.plantCareEvent.createMany({data:Array.from({length:10},(_,i)=>({collectionId:c.id,plantInstanceId:plant.id,eventType:'PEST_CHECK',performedAt:days(-140+i*14)}))})
  const assess=async(time=now)=>{const j=await queueCalibration(db,{collectionId:c.id,definitionId:d.id,activity:'PEST_INSPECTION',manual:true},time);assert.ok(j);await db.aiCuratorJob.update({where:{id:j!.id},data:{status:'RUNNING',claimedBy:'pest'}});await runCalibrationJob(db,{...j!,claimedBy:'pest'},undefined,time);return db.careCadenceProposal.findFirstOrThrow({where:{plantDefinitionId:d.id,activity:'PEST_INSPECTION',status:'PENDING'}})}
  const stale=await assess()
  await db.plantCareEvent.create({data:{collectionId:c.id,plantInstanceId:plant.id,eventType:'PEST_CHECK',performedAt:days(-1)}})
  assert.match(await reviewCalibration(db,{id:stale.id,collectionId:c.id,reviewerId:user.id,decision:'approve'},now),/Stale/)
  const reject=await assess(days(2))
  await assert.rejects(reviewCalibration(db,{id:reject.id,collectionId:other.id,reviewerId:user.id,decision:'approve'},days(2)))
  assert.equal(await reviewCalibration(db,{id:reject.id,collectionId:c.id,reviewerId:user.id,decision:'reject',note:'Keep current'},days(2)),'REJECTED')
  const rejectedState=await db.metricCalibrationState.findFirstOrThrow({where:{plantDefinitionId:d.id,metricKey:metricKey('PEST_INSPECTION')}})
  assert.equal(rejectedState.nextEligibleAt!.getTime(),days(182).getTime())
  // Evidence can be inspected independently while the rejection cooldown remains unchanged.
  await loadCareEvidence(db,c.id,d.id,'PEST_INSPECTION',policy,days(4))
  assert.equal((await db.metricCalibrationState.findUniqueOrThrow({where:{id:rejectedState.id}})).nextEligibleAt!.getTime(),days(182).getTime())
  // Sparse long-interval and no-cadence/N/A records must not be called stable.
  await ensureCalibrationStates(db,c.id,d.id,now)
  const noHistory=await queueCalibration(db,{collectionId:c.id,definitionId:d.id,activity:'REPOTTING',manual:true},now)
  await db.aiCuratorJob.update({where:{id:noHistory!.id},data:{status:'RUNNING',claimedBy:'empty'}})
  await runCalibrationJob(db,{...noHistory!,claimedBy:'empty'},undefined,now)
  assert.equal((await db.metricCalibrationState.findFirstOrThrow({where:{plantDefinitionId:d.id,metricKey:metricKey('REPOTTING')}})).outcome,'NO_CADENCE')
  const wd=await db.plantDefinition.create({data:{collectionId:c.id,genus:'Workerplant'}})
  await db.plantDefinitionCareCadence.create({data:{plantDefinitionId:wd.id,activity:'WATERING',interval:7,unit:'DAY'}})
  const wp=await db.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:wd.id,plantId:'WORKER',instanceType:'ACQUIRED',acquisitionDate:days(-300)}})
  await db.plantCareEvent.createMany({data:Array.from({length:10},(_,i)=>({collectionId:c.id,plantInstanceId:wp.id,eventType:'WATERED',performedAt:days(-140+i*14)}))})
  const wj=await queueCalibration(db,{collectionId:c.id,definitionId:wd.id,activity:'WATERING',manual:true},now)
  await db.aiCuratorJob.update({where:{id:wj!.id},data:{priority:100000,status:'RUNNING',claimedAt:days(-1),claimedBy:'interrupted'}})
  assert.equal(await recoverCadenceResearchLeases(db,now),1,'Existing lease recovery includes calibration work.')
  await db.aiCuratorJob.update({where:{id:wj!.id},data:{status:'QUEUED',nextRetryAt:null}})
  await db.aiCuratorSettings.update({where:{id:'global'},data:{enabled:true,concurrency:1,dailyBudgetDollars:1000,monthlyBudgetDollars:10000}})
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY
  let calls=0
  try {
    process.env.OPENAI_API_KEY='fixture-not-a-real-key'
    globalThis.fetch=async(_url,init)=>{
      calls++
      const body=JSON.parse(String(init?.body)),text=JSON.stringify(body.input)
      assert.ok(!text.includes(wp.id) && !text.includes(user.id) && !text.includes(c.id),'Only anonymous aggregates reach the interpreter.')
      assert.match(body.instructions,/Do not calculate, invent or replace observations/)
      return new Response(JSON.stringify({status:'completed',output_text:JSON.stringify({title:'Cadence calibration',suggestedValue:{supportChange:true},reasoning:'Observed timing supports human review; check moisture before changing care.',confidence:.9,supportingReferences:[]}),usage:{input_tokens:100,output_tokens:100}}),{status:200})
    }
    await processAiCuratorWake(db)
  } finally { globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey }
  assert.equal(calls,1)
  assert.equal((await db.aiCuratorJob.findUniqueOrThrow({where:{id:wj!.id}})).status,'COMPLETED')
  assert.equal(await db.careCadenceProposal.count({where:{jobId:wj!.id,source:'CADENCE_CALIBRATION'}}),1)
  assert.equal((await db.aiUsageEvent.findFirstOrThrow({where:{collectionId:c.id}})).success,true)
  const sd=await db.plantDefinition.create({data:{collectionId:c.id,genus:'Stableplant'}})
  await db.plantDefinitionCareCadence.create({data:{plantDefinitionId:sd.id,activity:'WATERING',interval:14,unit:'DAY'}})
  const sp=await db.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:sd.id,plantId:'STABLE',instanceType:'ACQUIRED',acquisitionDate:days(-300)}})
  await db.plantCareEvent.createMany({data:Array.from({length:10},(_,i)=>({collectionId:c.id,plantInstanceId:sp.id,eventType:'WATERED',performedAt:days(-140+i*14)}))})
  const sj=await queueCalibration(db,{collectionId:c.id,definitionId:sd.id,activity:'WATERING',manual:true},now)
  await db.aiCuratorJob.update({where:{id:sj!.id},data:{status:'RUNNING',claimedBy:'stable'}})
  await runCalibrationJob(db,{...sj!,claimedBy:'stable'},async()=>{throw new Error('Stable assessments must not call AI')},now)
  const stable=await db.metricCalibrationState.findFirstOrThrow({where:{plantDefinitionId:sd.id,metricKey:metricKey('WATERING')}})
  assert.equal(stable.outcome,'STABLE');assert.equal(stable.nextEligibleAt!.getTime(),days(180).getTime())
  const started=performance.now(),memory=process.memoryUsage().heapUsed
  for(let i=0;i<15;i++) await loadCareEvidence(db,c.id,d.id,'WATERING',policy,now)
  console.log(`Calibration repeated reads: ${Math.round(performance.now()-started)}ms, heap delta ${Math.round((process.memoryUsage().heapUsed-memory)/1024)} KiB (GC-dependent).`)
  console.log('Calibration DB: scoped history, duplicate normalization, override exclusion, job dedupe, pending conflicts, human-only changes, edited/concurrent approval, cooldown/new evidence, rejection, staleness, private collection isolation and unchanged care history passed.')
 }finally{await db.collection.delete({where:{id:c.id}});await db.collection.delete({where:{id:other.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
