import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {careViewContinuation,careViewReturnQuery,applyCareViewCommand,careViewDefaults,decodeCareView,resolveCareView} from '../lib/care-view'
import {careViewSection,readCareViewPreference,writeCareViewPreference} from '../lib/care-view-preferences'
assert.equal(careViewReturnQuery('flat:items'),'?grouping=flat&locationSort=items')
assert.equal(careViewContinuation('flat:tree:extra'),'')
assert.equal(careViewReturnQuery('https://unrelated.test'),'')
const defaults=decodeCareView(),flat={grouping:'flat',locationSort:'tree'} as const,parent={grouping:'parent',locationSort:'alphabetical'} as const
assert.deepEqual(resolveCareView(defaults),careViewDefaults)
assert.deepEqual(decodeCareView('invalid'),defaults);assert.deepEqual(decodeCareView(JSON.stringify({version:9})),defaults)
const saved=applyCareViewCommand(defaults,{action:'saveDefault',view:flat}),temporary=applyCareViewCommand(saved,{action:'remember',view:parent})
assert.deepEqual(resolveCareView(temporary),flat);assert.deepEqual(temporary.last,parent)
assert.deepEqual(resolveCareView(temporary,{grouping:'hierarchy'}),{grouping:'hierarchy',locationSort:'tree'})
assert.deepEqual(resolveCareView(temporary,{grouping:'obsolete',locationSort:'obsolete'}),flat)
assert.deepEqual(resolveCareView(applyCareViewCommand(temporary,{action:'mode',mode:'last'})),parent)
assert.throws(()=>applyCareViewCommand(defaults,{action:'mode',mode:'default'}))
assert.throws(()=>applyCareViewCommand(defaults,{action:'remember',view:{grouping:'broken',locationSort:'tree'} as never}))
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');if(url.hostname!=='localhost'||url.port!=='55444'||url.pathname!=='/axildb_care_view')throw new Error('Only the disposable Care Queue view database is allowed.')
const db=new PrismaClient()
async function main(){
 const users=await Promise.all([1,2].map(()=>db.user.create({data:{email:`view-${randomUUID()}@example.test`,passwordHash:'fixture'}})))
 const collections=await Promise.all([1,2].map(()=>db.collection.create({data:{name:'View test',slug:`view-${randomUUID()}`}})))
 try{
  const [user,other]=users,[collection,second]=collections
  assert.deepEqual(await readCareViewPreference(db,user.id,collection.id),defaults)
  await writeCareViewPreference(db,user.id,collection.id,{action:'remember',view:flat})
  assert.deepEqual(resolveCareView(await readCareViewPreference(db,user.id,collection.id)),flat)
  assert.deepEqual(await readCareViewPreference(db,other.id,collection.id),defaults)
  assert.deepEqual(await readCareViewPreference(db,user.id,second.id),defaults)
  await writeCareViewPreference(db,user.id,collection.id,{action:'saveDefault',view:flat})
  await writeCareViewPreference(db,user.id,collection.id,{action:'remember',view:parent})
  assert.deepEqual(resolveCareView(await readCareViewPreference(db,user.id,collection.id)),flat)
  const before=await db.userSortPreference.findUniqueOrThrow({where:{userId_section:{userId:user.id,section:careViewSection(collection.id)}}})
  await writeCareViewPreference(db,user.id,collection.id,{action:'remember',view:parent})
  assert.deepEqual(await db.userSortPreference.findUniqueOrThrow({where:{id:before.id}}),before,'Identical preferences do not write again.')
  await db.userSortPreference.create({data:{userId:user.id,section:'plants',sortKey:'name'}})
  await writeCareViewPreference(db,user.id,collection.id,{action:'reset'})
  assert.deepEqual(await readCareViewPreference(db,user.id,collection.id),defaults)
  assert.equal(await db.userSortPreference.count({where:{userId:user.id,section:'plants'}}),1)
  await db.userSortPreference.create({data:{userId:user.id,section:careViewSection(collection.id),sortKey:JSON.stringify({version:1,mode:'default',saved:{grouping:'obsolete',locationSort:'tree'},last:parent})}})
  assert.deepEqual(resolveCareView(await readCareViewPreference(db,user.id,collection.id)),parent)
  const started=performance.now()
  await Promise.all(Array.from({length:80},(_,i)=>writeCareViewPreference(db,user.id,collection.id,{action:'remember',view:i%2?flat:parent})))
  await writeCareViewPreference(db,user.id,collection.id,{action:'remember',view:flat})
  assert.deepEqual((await readCareViewPreference(db,user.id,collection.id)).last,flat)
  assert.equal(await db.userSortPreference.count({where:{userId:user.id,section:careViewSection(collection.id)}}),1)
  console.log(`Care view: scoped persistence, fixed default, temporary URL precedence, invalid fallback, reset isolation, unchanged-write avoidance and 80 concurrent updates passed in ${Math.round(performance.now()-started)} ms.`)
 }finally{for(const c of collections)await db.collection.delete({where:{id:c.id}});for(const u of users)await db.user.delete({where:{id:u.id}})}
}
main().finally(()=>db.$disconnect())
