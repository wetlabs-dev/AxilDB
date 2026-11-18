import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { PrismaClient } from '@prisma/client'
import { loadCareEvidence, policyFor } from '../lib/cadence-calibration'
const url=new URL(process.env.DATABASE_URL || '')
assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname==='/axildb_calibration_test','Use the disposable database.')
async function main(){
 const db=new PrismaClient(),now=new Date(),c=await db.collection.create({data:{name:'Calibration load test',slug:`load-${randomUUID()}`}})
 try{
  const defs=Array.from({length:200},()=>randomUUID()),plants=Array.from({length:1000},()=>randomUUID())
  await db.plantDefinition.createMany({data:defs.map(id=>({id,collectionId:c.id,genus:'Loadplant'}))})
  await db.plantDefinitionCareCadence.createMany({data:defs.map(plantDefinitionId=>({plantDefinitionId,activity:'WATERING',interval:7,unit:'DAY'}))})
  await db.plantInstance.createMany({data:plants.map((id,i)=>({id,collectionId:c.id,plantDefinitionId:defs[Math.floor(i/5)],plantId:`LOAD-${i}`,instanceType:'ACQUIRED',acquisitionDate:new Date(now.getTime()-300*86400000)}))})
  for(let chunk=0;chunk<20;chunk++) await db.plantCareEvent.createMany({data:plants.slice(chunk*50,chunk*50+50).flatMap(plantInstanceId=>Array.from({length:100},(_,i)=>({collectionId:c.id,plantInstanceId,eventType:'WATERED',performedAt:new Date(now.getTime()-(100-i)*86400000)})))})
  const policy=await policyFor(db),gc=(globalThis as typeof globalThis & {gc?:()=>void}).gc
  gc?.();const baseline=process.memoryUsage(),started=performance.now()
  for(let i=0;i<40;i++) {const e=await loadCareEvidence(db,c.id,defs[i%20],'WATERING',policy,now);assert.equal(e.summary.intervalCount,495)}
  gc?.();const settled=process.memoryUsage()
  const plans=await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM "PlantCareEvent" WHERE "collectionId"=$1 AND "plantInstanceId"=$2 AND "eventType"='WATERED' AND "performedAt">=$3 ORDER BY "performedAt" DESC LIMIT 10001`,c.id,plants[0],new Date(now.getTime()-180*86400000))
  console.log(JSON.stringify({definitions:200,instances:1000,careEvents:100000,assessments:40,totalMs:Math.round(performance.now()-started),heapBefore:baseline.heapUsed,heapAfter: settled.heapUsed,rssAfter:settled.rss,aiRequests:0,queryPlan:plans},null,2))
 }finally{await db.collection.delete({where:{id:c.id}});await db.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
