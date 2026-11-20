import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {PrismaClient} from '@prisma/client'
import {chromium,expect} from '@playwright/test'
import sharp from 'sharp'
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='localhost'&&url.port==='55443'&&url.pathname==='/axildb_quick_care')
const phase=process.env.QUICK_CARE_PHASE||'after',base='http://localhost:3107',out=`/tmp/axildb-quick-care-${phase}`,statePath='/tmp/axildb-quick-care-fixtures.json'
assert(['before','after'].includes(phase));await mkdir(out,{recursive:true})
const db=new PrismaClient();let f
try{f=JSON.parse(await readFile(statePath,'utf8'))}catch{
 const user=await db.user.create({data:{email:`quick-ui-${randomUUID()}@example.test`,passwordHash:'fixture',emailVerifiedAt:new Date(),twoFactor:{create:{enabledAt:new Date(),secretCiphertext:'fixture'}}}})
 const collection=await db.collection.create({data:{name:'Quick care review',slug:'quick-care-review'}})
 await db.emailPreference.create({data:{userId:user.id,timezone:'America/New_York'}})
 await db.collectionMembership.create({data:{collectionId:collection.id,userId:user.id,role:'MANAGER',status:'ACTIVE'}})
 const definition=await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Hoya',species:'carnosa x Hoya serpens',cultivarName:'Mathilde Splash With a Long Cultivar Name',careCadences:{create:{activity:'WATERING',interval:7,unit:'DAY'}}}})
 const plants=[];for(let i=0;i<23;i++)plants.push(await db.plantInstance.create({data:{collectionId:collection.id,plantDefinitionId:definition.id,plantId:`HOYCAR-MAT-20260815-AC-${String(i+1).padStart(3,'0')}`,instanceType:'ACQUIRED'}}))
 await db.plantInstanceCareCadenceOverride.create({data:{plantInstanceId:plants[1].id,activity:'FERTILIZING',mode:'NOT_APPLICABLE'}})
 const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000),twoFactorVerifiedAt:new Date()}})
 f={userId:user.id,collectionId:collection.id,definitionId:definition.id,plants:plants.map(p=>p.id),token};await writeFile(statePath,JSON.stringify(f),{mode:0o600})
}
if(phase==='after'){await db.plantCareEvent.deleteMany({where:{collectionId:f.collectionId}});await db.photo.deleteMany({where:{collectionId:f.collectionId}})}
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],captures=[]
try{
 const context=await browser.newContext();await context.addCookies([{name:'axildb_session',value:f.token,url:base}]);await context.route('**/*',r=>r.request().url().startsWith(base)||r.request().url().startsWith('data:')?r.continue():r.abort())
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 const path=id=>`${base}/c/quick-care-review/instances/${id}`
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});await page.addInitScript(t=>localStorage.setItem('axildb-theme',t),theme);await page.goto(path(f.plants[0]));await page.evaluate(()=>document.fonts.ready)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow')
  if(phase==='after'){await expect(page.locator('.ax-quick-care-attention')).toHaveCount(1);await expect(page.getByRole('button',{name:'Record watering',exact:true})).toBeVisible();assert((await page.getByRole('button',{name:'Record watering',exact:true}).boundingBox()).y<400)}
  const header=page.locator('main > div').first();await page.screenshot({path:`${out}/header-${theme}-${width}.jpg`,type:'jpeg',quality:85})
  captures.push({theme,width,headerHeight:await page.locator('h2').first().evaluate(e=>e.parentElement.parentElement.getBoundingClientRect().height)})
 }
 if(phase==='after'){
  await page.setViewportSize({width:390,height:1000});await page.goto(path(f.plants[0]));let held
  await page.route('**/api/care-queue',r=>{held=r})
  const water=page.getByRole('button',{name:'Record watering',exact:true});const box=await water.boundingBox();await water.click();await expect(water).toBeDisabled();await expect.poll(()=>Boolean(held)).toBe(true);assert.deepEqual(await water.boundingBox(),box)
  await page.screenshot({path:`${out}/pending.jpg`,type:'jpeg'});await held.continue();await page.unroute('**/api/care-queue');await expect(page.getByRole('button',{name:/Watered today at/})).toBeVisible()
  await page.screenshot({path:`${out}/completed.jpg`,type:'jpeg'})
  assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:f.plants[0],eventType:'WATERED'}}),1)
  await page.getByRole('button',{name:/Watered today at/}).click();await expect(page.getByRole('dialog',{name:'Care already recorded'})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click()
  assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:f.plants[0],eventType:'WATERED'}}),1)
  await page.getByRole('button',{name:'Record fertilization',exact:true}).click();await expect(page.getByRole('button',{name:/Fertilized today at/})).toBeVisible()
  await page.goto(path(f.plants[1]));await expect(page.getByRole('button',{name:'Record fertilization',exact:true})).toHaveCount(0);await page.screenshot({path:`${out}/not-applicable.jpg`,type:'jpeg'})
  await page.getByRole('button',{name:/Add photo to HOYCAR/}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.locator('dialog[open]').getByLabel('Photo note (optional)').fill('First image from header')
  await page.screenshot({path:`${out}/photo-dialog.jpg`,type:'jpeg'});const png=await sharp({create:{width:100,height:120,channels:3,background:'#609060'}}).png().toBuffer()
  await page.locator('dialog[open] input[type=file]').first().setInputFiles({name:'quick.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Save photo',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.ax-quick-care-attention')).toHaveCount(0);const photo=await db.photo.findFirstOrThrow({where:{entityId:f.plants[1]}});assert.equal(photo.caption,'First image from header')
  await page.getByRole('button',{name:/Add progress photo to HOYCAR/}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await db.photo.count({where:{entityId:f.plants[1]}}),1)
  await page.getByRole('button',{name:/Add progress photo to HOYCAR/}).click()
  await page.locator('dialog[open] input[type=file]').first().setInputFiles({name:'quick-progress.png',mimeType:'image/png',buffer:png})
  let rejectPhoto=true;await page.route('**/api/photos',r=>r.request().method()==='POST'&&rejectPhoto?(rejectPhoto=false,r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Test upload rejection.'})})):r.continue())
  await page.getByRole('button',{name:'Save photo',exact:true}).click();await expect(page.locator('dialog[open]').getByRole('alert')).toContainText('Test upload rejection')
  await page.getByRole('button',{name:'Save photo',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await page.unroute('**/api/photos')
  assert.equal(await db.photo.count({where:{entityId:f.plants[1]}}),2)
  assert.equal((await db.photo.findUniqueOrThrow({where:{id:photo.id}})).isCover,true,'Progress upload preserves representative')
  // Definite validation failure followed by safe retry; ambiguous success loses its response.
  await page.goto(path(f.plants[2]));let fail=true
  await page.route('**/api/care-queue',async r=>{if(fail){fail=false;await r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Test rejection. Please try again.'})})}else await r.continue()})
  await page.getByRole('button',{name:'Record watering',exact:true}).click();await expect(page.locator('.ax-quick-care-notice[role=alert]')).toContainText('Test rejection');await page.getByRole('button',{name:'Record watering',exact:true}).click();await expect(page.getByRole('button',{name:/Watered today at/})).toBeVisible();await page.unroute('**/api/care-queue')
  await page.goto(path(f.plants[1]));await page.getByRole('button',{name:'Record watering',exact:true}).click();await expect(page.getByRole('button',{name:/Watered today at/})).toBeVisible()
  // A committed request whose response is lost must retry its durable receipt.
  await page.goto(path(f.plants[2]));await page.getByRole('button',{name:/Watered today at/}).click()
  await page.route('**/api/care-queue',async r=>{await r.fetch();await r.abort('failed')})
  await page.getByRole('button',{name:'Record additional care'}).click();await expect(page.getByRole('dialog',{name:'Care already recorded'}).getByRole('alert')).toBeVisible()
  await page.unroute('**/api/care-queue');await page.getByRole('button',{name:'Record additional care'}).click();await expect(page.getByRole('dialog')).not.toBeVisible()
  assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:f.plants[2],eventType:'WATERED'}}),2,'Intentional repeat retry creates once')
  const latencies=[]
  for(const id of f.plants.slice(3)){const start=Date.now();await page.goto(path(id));await page.getByRole('button',{name:'Record watering',exact:true}).click();await expect(page.getByRole('button',{name:/Watered today at/})).toBeVisible();latencies.push(Date.now()-start)}
  for(const width of [320,820,844]){await page.setViewportSize({width,height:width===844?390:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/responsive-${width}.jpg`,type:'jpeg'})}
  // Exercise real workflow server actions in both directions of header overlap.
  async function workflow(id){return db.workflowRun.create({data:{collectionId:f.collectionId,title:'Quick Care overlap',startedByUserId:f.userId,scopeType:'PLANT_INSTANCE',plants:{create:{collectionId:f.collectionId,plantInstanceId:id}},steps:{create:{collectionId:f.collectionId,stepType:'WATER',title:'Water this plant'}}},include:{steps:true}})}
  const existingRun=await workflow(f.plants[0]);await page.goto(`${base}/c/quick-care-review/workflows/runs/${existingRun.id}`);await page.getByRole('button',{name:'Complete step',exact:true}).click();await expect.poll(async()=> (await db.workflowRunStep.findUniqueOrThrow({where:{id:existingRun.steps[0].id}})).status).toBe('COMPLETED')
  assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:f.plants[0],eventType:'WATERED'}}),1,'Workflow recognizes header watering')
  await db.plantCareEvent.deleteMany({where:{plantInstanceId:f.plants[3]}})
  const freshRun=await workflow(f.plants[3]);await page.goto(`${base}/c/quick-care-review/workflows/runs/${freshRun.id}`);await page.getByRole('button',{name:'Complete step',exact:true}).click();await expect.poll(async()=> (await db.workflowRunStep.findUniqueOrThrow({where:{id:freshRun.steps[0].id}})).status).toBe('COMPLETED')
  await page.goto(path(f.plants[3]));await expect(page.getByRole('button',{name:/Watered today at/})).toBeVisible();assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:f.plants[3],eventType:'WATERED'}}),1,'Header recognizes workflow watering')
  // Server authorization and stale/forged action protection use the actual API.
  const viewer=await db.user.create({data:{email:`viewer-${randomUUID()}@example.test`,passwordHash:'fixture',emailVerifiedAt:new Date(),twoFactor:{create:{enabledAt:new Date(),secretCiphertext:'fixture'}}}});await db.collectionMembership.create({data:{collectionId:f.collectionId,userId:viewer.id,role:'VIEWER',status:'ACTIVE'}})
  const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:viewer.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000),twoFactorVerifiedAt:new Date()}})
  const read=await browser.newContext();await read.addCookies([{name:'axildb_session',value:token,url:base}]);const rp=await read.newPage();await rp.goto(path(f.plants[0]));await expect(rp.getByRole('group',{name:'Plant care actions'})).toHaveCount(0)
  const fields=[['collectionSlug','quick-care-review'],['plantInstanceId',f.plants[0]],['taskType','WATER'],['quickCare','on']]
  const denied=await read.request.post(base+'/api/care-queue',{headers:{Origin:base},data:{action:'complete',operationId:randomUUID(),issuedAt:Date.now(),fields}});assert([401,403].includes(denied.status()));await read.close()
  const na=await context.request.post(base+'/api/care-queue',{headers:{Origin:base},data:{action:'complete',operationId:randomUUID(),issuedAt:Date.now(),fields:fields.map(([k,v])=>[k,k==='plantInstanceId'?f.plants[1]:k==='taskType'?'FERTILIZE':v])}});assert.equal(na.status(),400)
  console.log(JSON.stringify({browserRepeatedPlants:20,latenciesMs:{min:Math.min(...latencies),max:Math.max(...latencies)}}))
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({phase,captures,errors},null,2));console.log(`Quick Care ${phase} browser checks passed.`)
}finally{await browser.close();await db.$disconnect()}
