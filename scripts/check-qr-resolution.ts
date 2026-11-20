import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { resolveQrTarget } from '../lib/qr-resolution'
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='localhost'&&url.port==='55444'&&url.pathname==='/axildb_qr')
const db=new PrismaClient()
async function main(){
 const user=await db.user.create({data:{email:`qr-${randomUUID()}@example.test`,passwordHash:'fixture'}}),collections=[]
 try{
  for(const [name,visibility,status,role]of [['First','PRIVATE','ACTIVE','MANAGER'],['Second','PRIVATE','ACTIVE','VIEWER'],['Denied','PRIVATE','ACTIVE',null],['Public','PUBLIC','ACTIVE',null],['Archived','PRIVATE','ARCHIVED','MANAGER']]as const){const c=await db.collection.create({data:{name,slug:`qr-${randomUUID()}`,visibility,status,...(role?{memberships:{create:{userId:user.id,role,status:'ACTIVE'}}}:{})}});collections.push(c)}
  const plants=[];const locations=[]
  for(const c of collections){const d=await db.plantDefinition.create({data:{collectionId:c.id,genus:'Hoya'}});plants.push(await db.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:d.id,plantId:'SAME-ACCESSION',instanceType:'ACQUIRED'}}));const t=await db.locationType.create({data:{collectionId:c.id,name:'Room',abbreviation:'RM'}});locations.push(await db.location.create({data:{collectionId:c.id,locationTypeId:t.id,name:'Shelf',code:'LOC-RM-01'}}))}
  const resolve=(kind:'plant'|'location'|'identifier',identifier:string,collectionSlug?:string)=>resolveQrTarget(db,user,{kind,identifier,...(collectionSlug?{collectionSlug}:{})})
  assert.equal((await resolve('plant',plants[0].id,collections[0].slug))[0].href,`/c/${collections[0].slug}/instances/${plants[0].id}`)
  assert.equal((await resolve('location',locations[1].id,collections[1].slug))[0].href,`/c/${collections[1].slug}/locations/${locations[1].id}`)
  assert.equal((await resolve('plant',plants[1].id))[0].collectionName,'Second','Unscoped legacy ID can cross accessible collections')
  await db.plantInstance.update({where:{id:plants[1].id},data:{plantId:plants[2].id}})
  assert.deepEqual(await resolve('plant',plants[2].id),[],'A private database-ID URL cannot fall back to a different accession ID')
  await db.plantInstance.update({where:{id:plants[1].id},data:{plantId:'SAME-ACCESSION'}})
  assert.deepEqual(await resolve('plant',plants[2].id,collections[2].slug),[])
  assert.deepEqual(await resolve('plant','deleted-record',collections[0].slug),[])
  assert.deepEqual(await resolve('plant',plants[4].id,collections[4].slug),[])
  assert.equal((await resolve('identifier','SAME-ACCESSION')).length,3,'Ambiguity includes only accessible records')
  assert.equal((await resolve('identifier','LOC-RM-01')).length,3)
  await db.plantInstance.update({where:{id:plants[0].id},data:{status:'ARCHIVED'}});assert.equal((await resolve('plant',plants[0].id,collections[0].slug)).length,1,'Archived specimen remains readable')
  await db.plantInstance.delete({where:{id:plants[0].id}});assert.deepEqual(await resolve('plant',plants[0].id,collections[0].slug),[])
  assert.deepEqual(await resolve('plant',plants[1].id,collections[0].slug),[],'Collection/path scope cannot be mixed')
  assert.equal(await db.plantCareEvent.count({where:{collectionId:{in:collections.map(c=>c.id)}}}),0,'Navigation never records care')
  assert.equal(await db.auditLog.count({where:{collectionId:{in:collections.map(c=>c.id)}}}),0,'No scan audit trail created')
  console.log('QR resolution: exact IDs/codes, location, cross-collection viewer, public collection, private non-disclosure, archived/deleted records, ambiguity and read-only behavior passed.')
 }finally{for(const c of collections.reverse())await db.collection.delete({where:{id:c.id}});await db.user.delete({where:{id:user.id}})}
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e);process.exitCode=1})
