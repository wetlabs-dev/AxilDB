import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { applyCareQueueMutation, type MutationContext } from '../lib/care-queue-mutations'
import { executeCareOperation } from '../lib/care-queue-operations'
import { loadQuickCare } from '../lib/quick-care'
import { getCareQueue } from '../lib/care-queue'
import { careDayBounds } from '../lib/bulk-care'
const url = new URL(process.env.DATABASE_URL || '')
assert.equal(url.hostname, 'localhost'); assert.equal(url.port, '55443'); assert.equal(url.pathname, '/axildb_quick_care')
const db = new PrismaClient()
async function main() {
 const collection = await db.collection.create({ data: { name: 'Quick care integration', slug: `quick-${randomUUID()}` } })
 const user = await db.user.create({ data: { email: `quick-${randomUUID()}@example.test`, passwordHash: 'unused' } })
 try {
  await db.emailPreference.create({ data: { userId: user.id, timezone: 'America/New_York' } })
  const membership = await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'LOGGER', status: 'ACTIVE' } })
  const context: MutationContext = { collection, user, membership, role: 'LOGGER' }
  const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Hoya', species: 'carnosa', careCadences: { create: [{ activity: 'WATERING', interval: 7, unit: 'DAY' }] } } })
  const plants = await Promise.all(Array.from({ length: 25 }, (_,i) => db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, plantId: `QUICK-${i}`, instanceType: 'ACQUIRED' } })))
  function fields(id: string, extra: Record<string,string> = {}) { const fd = new FormData(); Object.entries({ collectionSlug: collection.slug, plantInstanceId: id, taskType: 'WATER', quickCare: 'on', ...extra }).forEach(([k,v]) => fd.set(k,v)); return fd }
  const run = (fd: FormData, operationId = randomUUID()) => executeCareOperation(db, { collectionId: collection.id, userId: user.id, action: 'complete', fd, identity: { operationId, issuedAt: Date.now() } }, tx => applyCareQueueMutation(tx, context, 'complete', fd))
  const first = plants[0], old = new Date(Date.now()-20*86400000)
  await db.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: first.id, eventType: 'WATERED', performedAt: old, notes: 'Historical original' } })
  await db.plantCareAdjustment.create({ data: { collectionId: collection.id, plantInstanceId: first.id, taskType: 'WATER', nextDueAt: old } })
  await db.plantCareAdjustment.create({ data: { collectionId: collection.id, plantInstanceId: first.id, taskType: 'FERTILIZE', nextDueAt: old } })
  const op = randomUUID(), fd = fields(first.id)
  const results = await Promise.all([run(fd,op),run(fd,op),run(fd)])
  assert.equal(await db.plantCareEvent.count({ where: { plantInstanceId: first.id, eventType: 'WATERED' } }),2)
  assert.deepEqual(results[0],results[1]); assert(results.some(result=>result.skipped===1), 'Whichever independent request wins the lock, the other is skipped')
  const event = await db.plantCareEvent.findFirstOrThrow({ where: { plantInstanceId:first.id }, orderBy:{performedAt:'desc'} })
  assert.equal(event.userId,user.id); assert.equal((event.metadata as any).source,'QUICK_CARE'); assert(event.performedAt.getTime()>Date.now()-60000)
  const adjustments = await db.plantCareAdjustment.findMany({where:{plantInstanceId:first.id}})
  assert.equal(adjustments.find(a=>a.taskType==='WATER')!.nextDueAt,null); assert(adjustments.find(a=>a.taskType==='FERTILIZE')!.nextDueAt)
  assert.equal((await db.plantCareEvent.findFirstOrThrow({where:{plantInstanceId:first.id,performedAt:old}})).notes,'Historical original')
  assert.equal((await loadQuickCare(db,collection.id,first.id,'America/New_York')).watering,event.performedAt.toISOString())
  await run(fields(first.id,{intentionalRepeat:'on'})); assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:first.id,eventType:'WATERED'}}),3)
  assert.equal((await run(fields(first.id,{quickCare:'',queueCompletion:'on'}))).skipped,1,'Queue recognizes header care')
  const fert = await run(fields(first.id,{taskType:'FERTILIZE'})); assert(fert.eventId)
  assert.equal((await run(fields(first.id,{taskType:'FERTILIZE'}))).skipped,1)
  assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:first.id,eventType:'WATERED'}}),3,'Fertilizing does not water')
  await db.plantInstanceCareCadenceOverride.create({data:{plantInstanceId:first.id,activity:'FERTILIZING',mode:'NOT_APPLICABLE'}})
  await assert.rejects(run(fields(first.id,{taskType:'FERTILIZE'})),/not applicable/)
  assert.equal((await loadQuickCare(db,collection.id,first.id)).canFertilize,false)
  await db.plantInstanceCareCadenceOverride.create({data:{plantInstanceId:plants[1].id,activity:'WATERING',mode:'OVERRIDE',interval:2,unit:'DAY'}})
  // Quiet days constrain scheduling, never actual voluntary care.
  await db.collectionQuietDay.create({data:{collectionId:collection.id,name:'Today',quietType:'ONE_TIME',date:new Date(),timezone:'America/New_York'}})
  const latencies:number[]=[]
  for (const p of plants.slice(1)) { const start=Date.now(); await run(fields(p.id)); latencies.push(Date.now()-start) }
  const queue = await db.$transaction(tx=>getCareQueue(tx,{collectionId:collection.id,collectionSlug:collection.slug,userId:user.id,timezone:'America/New_York'}))
  assert(queue.find(item=>item.plantInstanceId===first.id&&item.taskType==='WATER')!.dueAt > new Date(), 'The overdue routine obligation is replaced by a future cadence occurrence')
  assert.equal(await db.plantInstanceCareCadenceOverride.count({where:{plantInstanceId:plants[1].id,interval:2}}),1)
  const noCadence=await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Aloe'}})
  await db.plantInstance.update({where:{id:plants[2].id},data:{plantDefinitionId:noCadence.id}})
  await run(fields(plants[2].id,{intentionalRepeat:'on'}))
  await db.plantInstance.update({where:{id:plants[3].id},data:{status:'ARCHIVED'}})
  await assert.rejects(run(fields(plants[3].id)))
  const other=await db.collection.create({data:{name:'Other',slug:`other-${randomUUID()}`}})
  try { const foreign=await db.plantInstance.create({data:{collectionId:other.id,plantDefinitionId:noCadence.id,plantId:'FOREIGN',instanceType:'ACQUIRED'}}); await assert.rejects(run(fields(foreign.id))) } finally { await db.collection.delete({where:{id:other.id}}) }
  for (const [date,hours] of [['2026-03-08T16:00Z',23],['2026-11-01T16:00Z',25]] as const) { const b=careDayBounds(new Date(date),'America/New_York'); assert.equal((b.lt.getTime()-b.gte.getTime())/3600000,hours) }
  console.log(JSON.stringify({passed:true,repeatedPlants:25,latencyMs:{min:Math.min(...latencies),max:Math.max(...latencies)},checks:'concurrency, retry receipts, queue overlap, intentional repeat, audit actor/source, N/A, unscheduled, override, no cadence, quiet day, historical preservation, unrelated tasks, DST, scope, archive'}))
 } finally { await db.collection.delete({where:{id:collection.id}}); await db.user.delete({where:{id:user.id}}) }
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e);process.exitCode=1})
