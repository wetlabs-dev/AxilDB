import {createHash} from 'node:crypto'
import type {PrismaClient,Prisma} from '@prisma/client'
import {getCareQueue,type CareQueueItem} from '@/lib/care-queue'
import {timeZoneForPreference,endOfDayInTimeZone} from '@/lib/time'
import {applyCareQueueMutation,type MutationContext} from '@/lib/care-queue-mutations'
import {executeCareOperation,type CareOperationIdentity,CareOperationConflict} from '@/lib/care-queue-operations'
import {visibleCareLimit,visibleCareUnavailable,type VisibleCareEntry} from '@/lib/visible-care'
// Includes the anchor, not just a stable task key: old reviews cannot complete a new occurrence.
export function careOccurrence(item:CareQueueItem){return createHash('sha256').update(JSON.stringify([item.key,item.scheduleAnchor,new Date(item.dueAt).toISOString(),item.locationId,item.lastCompletedCareAt,item.condition?.updatedAt,item.fertilizerRecipeId,item.recommendedSubstrateRecipeVersionId,item.recurrenceCadence,item.recurrenceRule,item.quietDayReason,item.originalDueAt,item.reason])).digest('hex')}
async function currentQueue(db:PrismaClient|Prisma.TransactionClient,context:MutationContext){
 const timezone=timeZoneForPreference(await db.emailPreference.findUnique({where:{userId:context.user.id}}))
 const items=await getCareQueue(db,{collectionId:context.collection.id,collectionSlug:context.collection.slug,userId:context.user.id,timezone,persistQuietPlan:false})
 return {items,end:endOfDayInTimeZone(new Date(),timezone)}
}
export async function reviewVisibleCare(db:PrismaClient,context:MutationContext,keys:string[]){
 if(!Array.isArray(keys)||!keys.length||keys.length>visibleCareLimit||keys.some(key=>typeof key!=='string'||key.length>250)||new Set(keys).size!==keys.length)throw new Error(`Choose 1–${visibleCareLimit} distinct tasks.`)
 const {items,end}=await currentQueue(db,context),byKey=new Map(items.map(item=>[item.key,item]))
 const active=new Set((await db.plantInstance.findMany({where:{collectionId:context.collection.id,status:'ACTIVE',id:{in:keys.flatMap(key=>byKey.get(key)?.plantInstanceId?[byKey.get(key)!.plantInstanceId!]:[])}},select:{id:true}})).map(p=>p.id))
 return keys.map(key=>{const item=byKey.get(key);if(!item)throw new CareOperationConflict('A task has changed. Refresh the queue and review again.');return {item,occurrence:careOccurrence(item),unavailable:item.plantInstanceId&&!active.has(item.plantInstanceId)?'The plant is no longer active.':visibleCareUnavailable(item,end)}})
}
const allowedFields=['notes','substrateMode','substrateRecipeVersionId','receivedSubstrateDescription','substrateNotes','fertilizerStrength','fertilizerDose','fertilizerWaterVolume']
export async function completeVisibleCare(db:PrismaClient,context:MutationContext,entries:VisibleCareEntry[],sharedNote:string,identity:CareOperationIdentity){
 if(!Array.isArray(entries)||!entries.length||entries.length>visibleCareLimit||new Set(entries.map(e=>e?.key)).size!==entries.length)throw new Error(`Choose 1–${visibleCareLimit} distinct tasks.`)
 if(typeof sharedNote!=='string'||sharedNote.length>4000)throw new Error('Keep the shared note within 4000 characters.')
 for(const entry of entries){if(!entry||typeof entry.key!=='string'||typeof entry.occurrence!=='string'||!entry.fields||Object.entries(entry.fields).some(([key,value])=>!allowedFields.includes(key)||typeof value!=='string'||value.length>4000))throw new Error('Invalid task completion details.')}
 const receipt=new FormData();receipt.set('visibleCare',JSON.stringify({entries,sharedNote}))
 return executeCareOperation(db,{collectionId:context.collection.id,userId:context.user.id,action:'bulk',fd:receipt,identity},async tx=>{
  const {items,end}=await currentQueue(tx,context),byKey=new Map(items.map(item=>[item.key,item]))
  // Validate every occurrence before writes. Any mutation failure rolls back the entire receipt and batch.
  const selected=entries.map(entry=>{const item=byKey.get(entry.key);if(!item||careOccurrence(item)!==entry.occurrence)throw new CareOperationConflict('A selected task was completed or changed. No tasks were recorded. Refresh the review.');const reason=visibleCareUnavailable(item,end);if(reason)throw new CareOperationConflict(`${reason} No tasks were recorded.`);return {item,entry}})
  const active=new Set((await tx.plantInstance.findMany({where:{collectionId:context.collection.id,status:'ACTIVE',id:{in:selected.flatMap(s=>s.item.plantInstanceId?[s.item.plantInstanceId]:[])}},select:{id:true}})).map(p=>p.id))
  if(selected.some(s=>s.item.plantInstanceId&&!active.has(s.item.plantInstanceId)))throw new CareOperationConflict('A selected plant is no longer active. No tasks were recorded.')
  const results=[]
  for(const {item,entry} of selected){
   const fd=new FormData();fd.set('taskType',item.taskType);fd.set('queueCompletion','on')
   for(const key of ['plantInstanceId','reminderId','bloomEventId','fertilizerRecipeId'] as const)if(item[key])fd.set(key,item[key]!)
   for(const [key,value] of Object.entries(entry.fields!)){
    if(key.startsWith('fertilizer')&&item.taskType!=='FERTILIZE')continue
    if(['substrateMode','substrateRecipeVersionId','receivedSubstrateDescription','substrateNotes'].includes(key)&&item.taskType!=='REPOT')continue
    fd.set(key,value)
   }
   // Shared prose is copied only to the canonical notes field, never category metadata.
   fd.set('notes',[sharedNote,entry.fields?.notes].filter(Boolean).join('\n\n'))
   const result=await applyCareQueueMutation(tx,context,'complete',fd)
   results.push({key:item.key,status:result.skipped?'already-completed':'completed',eventId:result.eventId})
  }
  return {results,completed:results.filter(r=>r.status==='completed').length,alreadyCompleted:results.filter(r=>r.status==='already-completed').length,plants:new Set(selected.map(s=>s.item.plantInstanceId).filter(Boolean)).size}
 })
}
