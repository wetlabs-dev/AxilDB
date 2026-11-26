import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {PrismaClient} from '@prisma/client'
import {chromium,expect} from '@playwright/test'
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='localhost'&&url.port==='55444'&&url.pathname==='/axildb_care_view')
const f=JSON.parse(await readFile('/tmp/axildb-care-view-fixture.json','utf8')),db=new PrismaClient(),base='http://localhost:3107',path=`${base}/c/${f.slug}/care`,out='/tmp/axildb-care-refinement';await mkdir(out,{recursive:true})
const definition=await db.plantDefinition.findFirstOrThrow({where:{collectionId:f.collectionId}})
await db.plantCareEvent.deleteMany({where:{collectionId:f.collectionId}})
for(const activity of ['GENERAL_INSPECTION','PEST_INSPECTION'])await db.plantDefinitionCareCadence.upsert({where:{plantDefinitionId_activity:{plantDefinitionId:definition.id,activity}},create:{plantDefinitionId:definition.id,activity,interval:7,unit:'DAY',activatedAt:null},update:{}})
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.addCookies([{name:'axildb_session',value:f.token,url:base}]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000)
 await page.goto(path,{waitUntil:'networkidle'})
 await page.getByRole('button',{name:/About Attention/}).click();await expect(page.getByRole('dialog',{name:'About Attention'})).toBeVisible();await page.screenshot({path:`${out}/attention.png`});await page.getByRole('dialog',{name:'About Attention'}).getByRole('button',{name:'Close',exact:true}).click()
 await page.getByLabel('View settings',{exact:true}).click();await expect(page.locator('.care-view-menu')).toHaveAttribute('open','');await page.touchscreen.tap(2,600);assert.equal(await page.locator('.care-view-menu').evaluate(el=>el.open),false)
 await page.getByLabel('View settings',{exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('.care-view-menu').evaluate(el=>el.open),false)
 await page.getByLabel('View settings',{exact:true}).click();await page.screenshot({path:`${out}/view.png`});await page.getByRole('button',{name:'Save current view as default',exact:true}).click();await expect(page.getByText('Default view saved.',{exact:true})).toBeVisible();assert.equal(await page.locator('.care-view-menu').evaluate(el=>el.open),false)
 await page.screenshot({path:`${out}/saved.png`});await expect(page.getByText('Default view saved.',{exact:true})).toHaveCount(0,{timeout:7000})
 await page.getByLabel('Search',{exact:true}).fill('HOYA-CARE-1');await page.getByLabel('Search',{exact:true}).press('Enter');await page.waitForLoadState('networkidle')
 const section=page.locator('[data-care-section]:visible').first();await section.getByRole('button',{name:'Complete visible care',exact:true}).click();const dialog=page.getByRole('dialog',{name:/Complete visible care for/});await expect(dialog.locator('[data-review-key]')).toHaveCount(3)
 await expect(dialog.getByText(/3 selected tasks across 1 plant/)).toBeVisible();await page.screenshot({path:`${out}/mixed-review.png`})
 await dialog.getByRole('button',{name:'Deselect all',exact:true}).click();await expect(dialog.getByRole('button',{name:'Complete 0 tasks'})).toBeDisabled();await dialog.getByRole('button',{name:'Select all',exact:true}).click()
 await dialog.locator('[data-review-key]').filter({hasText:'Health check'}).getByRole('checkbox').uncheck();await expect(dialog.getByRole('button',{name:'Complete 2 tasks'})).toBeEnabled()
 await dialog.getByLabel('Shared note',{exact:true}).fill('Actually performed in UI regression')
 let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/care/complete-visible'))posts++})
 await dialog.getByRole('button',{name:'Complete 2 tasks',exact:true}).click();await expect(dialog).not.toBeVisible();assert.equal(posts,1)
 await expect.poll(()=>db.plantCareEvent.count({where:{collectionId:f.collectionId}})).toBe(2);assert.equal(await db.plantCareEvent.count({where:{collectionId:f.collectionId,eventType:'HEALTH_CHECK'}}),0)
 await expect(page.locator('[data-care-key]:visible')).toHaveCount(1);await page.screenshot({path:`${out}/success.png`})
 // A failed request keeps the review and selections. Same payload/identity can be retried.
 await section.getByRole('button',{name:'Complete visible care',exact:true}).click();await expect(dialog.locator('[data-review-key]')).toHaveCount(1)
 let failed=false;await page.route('**/api/care/complete-visible',async route=>{if(route.request().postDataJSON().action==='complete'&&!failed){failed=true;await route.abort('failed')}else await route.continue()})
 await dialog.getByRole('button',{name:'Complete 1 task',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.getByRole('button',{name:'Retry same selection'})).toBeVisible();await page.screenshot({path:`${out}/failure.png`});await dialog.getByRole('button',{name:'Retry same selection'}).click();await expect(dialog).not.toBeVisible();await expect.poll(()=>db.plantCareEvent.count({where:{collectionId:f.collectionId}})).toBe(3)
 await page.goto(path+'?filter=water',{waitUntil:'networkidle'});await page.locator('[data-care-section]:visible').first().getByRole('button',{name:'Complete visible care',exact:true}).click();await expect(dialog.locator('[data-review-key]')).toHaveCount(await page.locator('[data-care-section]:visible').first().locator('[data-care-key]:visible').count());assert((await dialog.locator('[data-review-key]').allTextContents()).every(text=>text.includes('Water')));await dialog.getByRole('button',{name:'Close care review'}).click()
 await page.goto(path,{waitUntil:'networkidle'})
 for(const width of [320,390,1440])for(const theme of ['light','dark']){await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const searchBox=await page.getByLabel('Search',{exact:true}).boundingBox(),viewBox=await page.getByLabel('View settings',{exact:true}).boundingBox();assert(Math.abs(searchBox.y-viewBox.y)<2);assert((await page.getByRole('button',{name:/About Attention/}).locator('span').boundingBox()).height<=20);const name=page.locator('[data-care-section]:visible').first().locator('strong').first();assert((await name.boundingBox()).width>80);await page.screenshot({path:`${out}/${theme}-${width}.png`})}
 const guest=await browser.newContext();assert.notEqual((await guest.request.post(base+'/api/care/complete-visible',{headers:{Origin:base},data:{collectionSlug:f.slug,action:'review',keys:[]}})).status(),200);await guest.close()
 assert.equal((await context.request.post(base+'/api/care/complete-visible',{headers:{Origin:'https://unrelated.test'},data:{collectionSlug:f.slug,action:'review',keys:[]}})).status(),403)
 assert.deepEqual(errors,[]);console.log('Care refinement UI: dismiss/save feedback, touch layout, mixed task selection, filters/search, one batch request, atomic failure/retry, queue update and API access checks passed.')
}finally{await browser.close();await db.$disconnect()}
