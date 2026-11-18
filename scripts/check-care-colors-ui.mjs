import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'
const url=new URL(process.env.DATABASE_URL || '')
assert.ok(url.hostname==='localhost' && url.port==='55439' && url.pathname==='/axildb','Disposable database only')
const db=new PrismaClient(),base='http://localhost:3107',browser=await chromium.launch({channel:'chrome',headless:true})
const user=await db.user.create({data:{email:`colors-${randomUUID()}@example.test`,passwordHash:'fixture',emailVerifiedAt:new Date(),twoFactor:{create:{enabledAt:new Date(),secretCiphertext:'fixture'}}}})
const collection=await db.collection.create({data:{name:'Care color fixture',slug:`colors-${randomUUID()}`}})
try{
 await db.collectionMembership.create({data:{collectionId:collection.id,userId:user.id,role:'MANAGER',status:'ACTIVE'}})
 const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000),twoFactorVerifiedAt:new Date()}})
 const definition=await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Hoya',species:'carnosa',careCadences:{create:{activity:'WATERING',interval:7,unit:'DAY'}}}})
 const type=await db.locationType.create({data:{collectionId:collection.id,name:'Room',abbreviation:'RM'}})
 const location=await db.location.create({data:{collectionId:collection.id,locationTypeId:type.id,name:'Mixed care shelf',code:'COLOR'}})
 const plant=await db.plantInstance.create({data:{collectionId:collection.id,plantDefinitionId:definition.id,currentLocationId:location.id,plantId:'HOYA-LONG-ACCESSION-IDENTIFIER-COLOR-001',instanceType:'ACQUIRED'}})
 await db.plantCareEvent.create({data:{collectionId:collection.id,plantInstanceId:plant.id,eventType:'WATERED',performedAt:new Date(Date.now()-14*86400000)}})
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'axildb_session',value:token,url:base}])
 const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const types=['WATER','FERTILIZE','REPOT','TREATMENT','PROPAGATION_CHECK','HEALTH_CHECK','QUARANTINE_REVIEW','PEST_CHECK','BLOOM_CHECK','PRUNE','REMINDER','LEGACY_CARE']
 const families=['ocean','fern','terracotta','rose','sky','indigo','indigo','amber','violet','coral','stone','stone']
 await page.route('**/api/care-queue?*',async route=>{
  const response=await route.fetch(),snapshot=await response.json(),original=snapshot.items[0]
  await route.fulfill({json:{...snapshot,snapshotAt:Date.now(),items:types.map((taskType,i)=>({...original,key:`${taskType}:${plant.id}`,taskType,title:`${taskType}: fixture`,priority:i===3?180:55,reason:'Routine cadence fixture; category does not change urgency.',dueAt:new Date(Date.now()-86400000).toISOString()}))}})
 })
 await page.goto(`${base}/c/${collection.slug}/care`)
 await page.waitForLoadState('networkidle')
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.locator('.care-category-card')).toHaveCount(12)
 for(let i=0;i<types.length;i++) {
  const card=page.locator(`[data-care-key="${types[i]}:${plant.id}"] .care-category-card`)
  await expect(card).toHaveAttribute('data-semantic-color',families[i])
  await expect(card.locator('.semantic-chip').first()).toHaveAttribute('data-semantic-color',families[i])
  assert.equal(await card.evaluate(el=>getComputedStyle(el,'::before').width),'3px')
  await expect(card.locator('.semantic-chip svg').first()).toHaveAttribute('aria-hidden','true')
 }
 const water=page.locator(`[data-care-key="WATER:${plant.id}"] .care-category-card`)
 const primary=water.getByRole('button',{name:'Complete',exact:true}).filter({visible:true})
 const greenBefore=await primary.evaluate(el=>getComputedStyle(el).backgroundColor)
 await water.getByRole('button',{name:'Details',exact:true}).click()
 await expect(water.getByRole('button',{name:'Details',exact:true})).toHaveAttribute('aria-expanded','true')
 await water.getByRole('button',{name:'Details',exact:true}).click()
 for(const theme of ['light','dark']) {
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('axildb-theme',theme)},theme)
  for(const width of [390,768,1440]) {
   await page.setViewportSize({width,height:1000})
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} ${width} has no horizontal overflow`)
   await page.locator('[data-care-queue-root]').screenshot({path:`/tmp/axildb-care-colors-${theme}-${width}.png`})
  }
  assert.ok(await water.locator('.semantic-chip').first().evaluate(el=>getComputedStyle(el).color!=='rgb(0, 0, 0)'))
 }
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';localStorage.setItem('axildb-theme','light')})
 await page.setViewportSize({width:1440,height:1000})
 assert.equal(await primary.evaluate(el=>getComputedStyle(el).backgroundColor),greenBefore,'Category colors do not change primary action colors.')
 await page.getByRole('link',{name:'Water',exact:true}).click()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.getByRole('link',{name:'Water',exact:true})).toHaveAttribute('aria-current','page')
 await expect(page.getByRole('link',{name:'Water',exact:true})).toHaveAttribute('data-semantic-color','ocean')
 await expect(page.locator('.care-category-card:visible')).toHaveCount(1)
 await page.unroute('**/api/care-queue?*')
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 const actual=page.locator(`[data-care-key="WATER:${plant.id}"]`)
 await actual.getByRole('button',{name:'Complete',exact:true}).filter({visible:true}).click()
 await expect.poll(()=>db.plantCareEvent.count({where:{plantInstanceId:plant.id,eventType:'WATERED'}})).toBe(2)
 // Exercise the existing completed-item rendering contract without changing which historical events the queue includes.
 await page.route('**/api/care-queue?*',async route=>{const response=await route.fetch(),snapshot=await response.json();await route.fulfill({json:{...snapshot,snapshotAt:Date.now(),items:[{...snapshot.items[0],key:`completed:${plant.id}`,taskType:'WATER',completedAt:new Date().toISOString()}]}})})
 await page.getByRole('link',{name:'Completed',exact:true}).click()
 await page.waitForLoadState('networkidle')
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.locator('.care-category-card[data-care-completed="true"][data-semantic-color="ocean"]').first()).toBeVisible()
 assert.deepEqual(errors,[])
 console.log('Care colors browser: all 11 task types plus legacy fallback, shared badges/cards, accents, light/dark desktop/tablet/mobile layouts, expansion, filtering and real completion passed.')
}finally{await browser.close();await db.collection.delete({where:{id:collection.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect()}
