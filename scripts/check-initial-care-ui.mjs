import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {PrismaClient} from '@prisma/client'
import {chromium,expect} from '@playwright/test'
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='localhost'&&url.port==='55444'&&url.pathname==='/axildb_initial_care')
const db=new PrismaClient(),base='http://localhost:3107',out=process.env.CARE_ARTIFACTS||'/tmp/axildb-initial-care-ui'
await mkdir(out,{recursive:true})
const user=await db.user.create({data:{email:`initial-ui-${randomUUID()}@example.test`,passwordHash:'fixture',emailVerifiedAt:new Date(),twoFactor:{create:{enabledAt:new Date(),secretCiphertext:'fixture'}}}})
const c=await db.collection.create({data:{name:'Scheduling review',slug:`initial-ui-${randomUUID()}`,memberships:{create:{userId:user.id,role:'MANAGER',status:'ACTIVE'}}}})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 await db.emailPreference.create({data:{userId:user.id,timezone:'America/New_York'}})
 const definition=await db.plantDefinition.create({data:{collectionId:c.id,genus:'Monstera',species:'deliciosa',cultivarName:'Lemon Lime',careCadences:{create:[{activity:'WATERING',interval:7,unit:'DAY',activatedAt:null},{activity:'PRUNING',status:'NOT_APPLICABLE',activatedAt:null}]}}})
 const plant=await db.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:definition.id,plantId:'MONDEL-LEM-20261014-AC-001',instanceType:'ACQUIRED',acquisitionDate:new Date('2026-10-13T04:00:00Z')}})
 const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000),twoFactorVerifiedAt:new Date()}})
 const context=await browser.newContext();await context.addCookies([{name:'axildb_session',value:token,url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});await page.addInitScript(t=>localStorage.setItem('axildb-theme',t),theme)
  await page.goto(`${base}/c/${c.slug}/instances/${plant.id}`,{waitUntil:'networkidle'})
  await page.evaluate(t=>{localStorage.setItem('axildb-theme',t);document.documentElement.dataset.theme=t},theme)
  await expect(page.getByText(/Based on initial collection scheduling/)).toBeVisible()
  await expect(page.getByText(/Overdue · Oct 20, 2026/)).toBeVisible()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  const panel=page.locator('#care-cadences')
  await panel.screenshot({path:`${out}/cadences-${theme}-${width}.png`})
 }
 const response=await context.request.get(`${base}/api/care-queue?collectionSlug=${c.slug}&forecast=1`);assert.equal(response.status(),200)
 const payload=await response.json(),water=payload.items.filter(i=>i.plantInstanceId===plant.id&&i.taskType==='WATER')
 assert.equal(water.length,1);assert.equal(water[0].dueAt,'2026-10-20T04:00:00.000Z')
 assert.ok(payload.forecast.days[0].tasks.some(t=>t.key===water[0].key))
 assert.equal(await db.plantCareEvent.count({where:{plantInstanceId:plant.id}}),0)
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({viewports:[390,1440],themes:['light','dark'],initialDueAt:water[0].dueAt,matchingForecast:true,careEventsCreated:0,browserErrors:errors},null,2))
 console.log('Initial-care browser: detail due date, source explanation, authenticated queue/forecast agreement, responsive light/dark and no invented history passed.')
 await context.close()
}finally{await browser.close();await db.collection.delete({where:{id:c.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect()}
