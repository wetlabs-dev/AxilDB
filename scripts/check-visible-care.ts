import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {reviewVisibleCare,completeVisibleCare} from '../lib/visible-care-service'
import {careQueueSummary} from '../lib/care-queue-view'
import {visibleCareUnavailable} from '../lib/visible-care'
import type {MutationContext} from '../lib/care-queue-mutations'
import type {CareQueueItem} from '../lib/care-queue'
async function main(){
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='localhost'&&url.port==='55444'&&url.pathname==='/axildb_care_view','Only the disposable care-view database is allowed.')
const db=new PrismaClient(),perf=[]
const user=await db.user.create({data:{email:`mixed-${randomUUID()}@example.test`,passwordHash:'fixture'}})
const collection=await db.collection.create({data:{name:'Mixed care tests',slug:`mixed-${randomUUID()}`,memberships:{create:{userId:user.id,role:'MANAGER',status:'ACTIVE'}}}})
const membership=await db.collectionMembership.findFirstOrThrow({where:{userId:user.id,collectionId:collection.id}})
const context={user,collection,membership,role:'MANAGER'} as MutationContext
const identity=()=>({operationId:randomUUID(),issuedAt:Date.now()})
try{
 await db.emailPreference.create({data:{userId:user.id,timezone:'America/New_York'}})
 const definition=await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Hoya',species:'carnosa',careCadences:{create:[{activity:'WATERING',interval:3,unit:'DAY',activatedAt:null},{activity:'PEST_INSPECTION',interval:3,unit:'DAY',activatedAt:null},{activity:'GENERAL_INSPECTION',interval:3,unit:'DAY',activatedAt:null},{activity:'REPOTTING',interval:3,unit:'DAY',activatedAt:null}]}}})
 async function plant(){return db.plantInstance.create({data:{collectionId:collection.id,plantDefinitionId:definition.id,plantId:randomUUID(),instanceType:'ACQUIRED',acquisitionDate:new Date(Date.now()-8*86400000)}})}
 const a=await plant(),b=await plant()
 const keys=[`WATER:${a.id}`,`PEST_CHECK:${a.id}`,`HEALTH_CHECK:${b.id}`]
 const rows=await reviewVisibleCare(db,context,keys);assert.equal(rows.length,3);assert(rows.every(r=>!r.unavailable))
 const entries=rows.map(r=>({key:r.item.key,occurrence:r.occurrence,fields:{notes:'Task note',fertilizerDose:'Unrelated data must not leak'}}))
 const receipt=identity(),result=await completeVisibleCare(db,context,entries,'Shared note',receipt)
 assert.equal(result.completed,3);assert.equal(result.plants,2);assert.equal(await db.plantCareEvent.count({where:{collectionId:collection.id}}),3)
 const events=await db.plantCareEvent.findMany({where:{collectionId:collection.id}});assert.deepEqual(events.map(e=>e.eventType).sort(),['HEALTH_CHECK','PEST_CHECK','WATERED']);assert(events.every(e=>e.notes==='Shared note\n\nTask note'));assert(events.every(e=>(e.metadata as Record<string,unknown>).fertilizerDose===null))
 assert.deepEqual(await completeVisibleCare(db,context,entries,'Shared note',receipt),result)
 await assert.rejects(completeVisibleCare(db,context,entries,'Shared note',identity()),/changed/)
 assert.equal(await db.plantCareEvent.count({where:{collectionId:collection.id}}),3)
 // A watering obligation and a repotting obligation are independent; missing required substrate rolls both back.
 const c=await plant(),atomicRows=await reviewVisibleCare(db,context,[`WATER:${c.id}`,`REPOT:${c.id}`]);const atomic=atomicRows.map(r=>({key:r.item.key,occurrence:r.occurrence,fields:{}}))
 await assert.rejects(completeVisibleCare(db,context,atomic,'',identity()),/substrate/);assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:c.id}}),0)
 const repot=atomic.find(e=>e.key.startsWith('REPOT'))!;repot.fields={substrateMode:'UNKNOWN'}
 const atomicReceipt=identity();const concurrent=await Promise.allSettled([completeVisibleCare(db,context,atomic,'',atomicReceipt),completeVisibleCare(db,context,atomic,'',atomicReceipt)])
 assert(concurrent.every(r=>r.status==='fulfilled'));assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:c.id}}),2)
 const d=await plant(),stale=await reviewVisibleCare(db,context,[`WATER:${d.id}`]);await db.plantCareAdjustment.create({data:{collectionId:collection.id,plantInstanceId:d.id,taskType:'WATER',nextDueAt:new Date(Date.now()+10*86400000)}})
 await assert.rejects(completeVisibleCare(db,context,stale.map(r=>({key:r.item.key,occurrence:r.occurrence,fields:{}})),'',identity()),/changed/)
 await assert.rejects(reviewVisibleCare(db,context,['WATER:other-collection']),/changed/)
 await assert.rejects(completeVisibleCare(db,context,Array(101).fill(entries[0]),'',identity()),/distinct/)
 for(const size of [1,5,20,50,100]){
  const batchKeys=[];for(let i=0;i<Math.ceil(size/3);i++){const p=await plant();batchKeys.push(...['WATER','PEST_CHECK','HEALTH_CHECK'].map(type=>`${type}:${p.id}`))}
  const review=await reviewVisibleCare(db,context,batchKeys.slice(0,size)),start=performance.now()
  const r=await completeVisibleCare(db,context,review.map(row=>({key:row.item.key,occurrence:row.occurrence,fields:{}})),'',identity());assert.equal(r.completed,size);perf.push({tasks:size,ms:Math.round(performance.now()-start)})
 }
 const sample=(key:string,type:string,due:string,completedAt?:Date)=>({key,taskType:type,plantInstanceId:'same-plant',dueAt:new Date(`${due}T12:00:00Z`),completedAt}) as CareQueueItem
 const sampleItems=[sample('future-condition','HEALTH_CHECK','2026-11-28'),sample('condition','HEALTH_CHECK','2026-11-24'),sample('quarantine','QUARANTINE_REVIEW','2026-11-29'),sample('water','WATER','2026-11-25'),sample('done','HEALTH_CHECK','2026-11-25',new Date())]
 assert.deepEqual(careQueueSummary(sampleItems,new Date('2026-11-25T17:00:00Z'),'America/New_York'),{today:2,overdue:1,health:3,propagation:0})
 assert.match(visibleCareUnavailable(sampleItems[0],new Date('2026-11-25T23:00Z'))!,/Future/)
 console.log(JSON.stringify({attention:'3 outstanding health/quarantine tasks across one plant, including future care; 1 overlaps overdue',atomicRollback:'passed',retryAndConcurrency:'passed',staleAndIsolation:'passed',batchTimings:perf},null,2))
}finally{await db.collection.delete({where:{id:collection.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect()}

}
main().catch(error=>{console.error(error);process.exitCode=1})
