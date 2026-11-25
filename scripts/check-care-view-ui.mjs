import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {PrismaClient} from '@prisma/client'
import {chromium,expect} from '@playwright/test'
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='localhost'&&url.port==='55444'&&url.pathname==='/axildb_care_view')
const phase=process.env.CARE_VIEW_PHASE||'after',base='http://localhost:3107',out=`/tmp/axildb-care-view-${phase}`,fixture='/tmp/axildb-care-view-fixture.json';await mkdir(out,{recursive:true})
const db=new PrismaClient();let f
try{f=JSON.parse(await readFile(fixture,'utf8'))}catch{
 const user=await db.user.create({data:{email:`care-view-${randomUUID()}@example.test`,passwordHash:'fixture',emailVerifiedAt:new Date(),twoFactor:{create:{enabledAt:new Date(),secretCiphertext:'fixture'}}}})
 const collection=await db.collection.create({data:{name:'Care view review',slug:`care-view-${randomUUID()}`,memberships:{create:{userId:user.id,role:'MANAGER',status:'ACTIVE'}}}})
 await db.emailPreference.create({data:{userId:user.id,timezone:'America/New_York'}})
 const other=await db.collection.create({data:{name:'Other collection',slug:`care-view-other-${randomUUID()}`,memberships:{create:{userId:user.id,role:'MANAGER',status:'ACTIVE'}}}})
 const definition=await db.plantDefinition.create({data:{collectionId:collection.id,genus:'Hoya',species:'carnosa',cultivarName:'Chelsea',careCadences:{create:{activity:'WATERING',interval:7,unit:'DAY',activatedAt:null}}}})
 const type=await db.locationType.create({data:{collectionId:collection.id,name:'Room',abbreviation:'RM'}})
 const kitchen=await db.location.create({data:{collectionId:collection.id,locationTypeId:type.id,name:'Kitchen',code:'KITCHEN'}}),office=await db.location.create({data:{collectionId:collection.id,locationTypeId:type.id,name:'Office',code:'OFFICE'}})
 const shelf=await db.location.create({data:{collectionId:collection.id,locationTypeId:type.id,parentLocationId:office.id,name:'Shelf',code:'SHELF'}})
 for(let i=0;i<8;i++)await db.plantInstance.create({data:{collectionId:collection.id,plantDefinitionId:definition.id,plantId:`HOYA-CARE-${i+1}`,instanceType:'ACQUIRED',currentLocationId:i<3?kitchen.id:i<6?shelf.id:office.id,acquisitionDate:new Date(Date.now()-8*86400000)}})
 const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000),twoFactorVerifiedAt:new Date()}})
 f={userId:user.id,collectionId:collection.id,slug:collection.slug,otherId:other.id,otherSlug:other.slug,token};await writeFile(fixture,JSON.stringify(f),{mode:0o600})
}
if(phase==='after'){
 await db.userSortPreference.deleteMany({where:{userId:f.userId,section:`care-queue:${f.collectionId}`}})
 await db.plantCareEvent.deleteMany({where:{collectionId:f.collectionId}})
}
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],measurements=[]
try{
 const context=await browser.newContext();await context.addCookies([{name:'axildb_session',value:f.token,url:base}]);const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.goto(`${base}/c/${f.slug}/care`,{waitUntil:'networkidle'});await page.evaluate(t=>{localStorage.setItem('axildb-theme',t);document.documentElement.dataset.theme=t},theme)
  const heading=await page.getByRole('heading',{name:'Today’s Care',exact:true}).boundingBox(),first=await page.locator('[data-care-key]').first().boundingBox()
  measurements.push({theme,width,firstTaskTop:first.y,headingToTask:first.y-heading.y});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:`${out}/${theme}-${width}.png`})
 }
 if(phase==='after'){
  const path=`${base}/c/${f.slug}/care`;await page.goto(path,{waitUntil:'networkidle'})
  const first=page.locator('[data-care-key]').first(),forecast=page.locator('[data-care-forecast]')
  assert.ok((await first.boundingBox()).y<(await forecast.boundingBox()).y)
  await expect(page.getByRole('heading',{name:'Start a workflow from the queue'})).toHaveCount(0)
  if(!(await page.locator('.care-view-menu').evaluate(el=>el.open)))await page.getByLabel('View settings',{exact:true}).click()
  let careReads=0;page.on('request',request=>{if(/\/api\/care(?:-queue|\/forecast)/.test(request.url()))careReads++})
  await page.getByLabel('Grouping',{exact:true}).selectOption('flat')
  await expect(page.getByText('View saved.',{exact:true})).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('grouping'),'flat');assert.equal(careReads,0,'Presentation changes do not refetch care schedules or forecasts.')
  await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('flat');await page.screenshot({path:`${out}/flat-paths.png`})
  if(!(await page.locator('.care-view-menu').evaluate(el=>el.open)))await page.getByLabel('View settings',{exact:true}).click()
  await page.getByRole('button',{name:'Save current view as default',exact:true}).click()
  await expect(page.getByText('Default view saved.',{exact:true})).toBeVisible()
  if(!(await page.locator('.care-view-menu').evaluate(el=>el.open)))await page.getByLabel('View settings',{exact:true}).click()
  await page.getByLabel('Grouping',{exact:true}).selectOption('parent')
  await expect(page.getByText('View saved.',{exact:true})).toBeVisible()
  await page.goto(path,{waitUntil:'networkidle'});await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('flat')
  const token2=randomBytes(32).toString('hex');await db.session.create({data:{userId:f.userId,tokenHash:createHash('sha256').update(token2).digest('hex'),expiresAt:new Date(Date.now()+3600000),twoFactorVerifiedAt:new Date()}})
  const device=await browser.newContext();await device.addCookies([{name:'axildb_session',value:token2,url:base}]);const devicePage=await device.newPage();await devicePage.goto(path,{waitUntil:'networkidle'});await expect(devicePage.getByLabel('Grouping',{exact:true})).toHaveValue('flat');await device.close()
  await page.goto(path+'?grouping=hierarchy&locationSort=alphabetical&filter=water&q=HOYA',{waitUntil:'networkidle'})
  await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('hierarchy')
  await page.goto(path,{waitUntil:'networkidle'});await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('flat');await expect(page.getByLabel('Search',{exact:true})).toHaveValue('')
  await page.goto(`${base}/c/${f.otherSlug}/care`,{waitUntil:'networkidle'});await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('parent');await expect(page.getByRole('heading',{name:'No care due today.'})).toBeVisible();await page.screenshot({path:`${out}/empty.png`})
  await page.goto(path,{waitUntil:'networkidle'});if(!(await page.locator('.care-view-menu').evaluate(el=>el.open)))await page.getByLabel('View settings',{exact:true}).click();await page.screenshot({path:`${out}/view-settings.png`})
  await page.getByRole('button',{name:'Reset to application defaults',exact:true}).click();await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('parent')
  if(!(await page.locator('.care-view-menu').evaluate(el=>el.open)))await page.getByLabel('View settings',{exact:true}).click()
  await page.getByLabel('Grouping',{exact:true}).selectOption('flat');await page.getByLabel('Location order',{exact:true}).selectOption('items');await page.getByLabel('Grouping',{exact:true}).selectOption('hierarchy');await expect(page.getByText('View saved.',{exact:true})).toBeVisible()
  await page.reload({waitUntil:'networkidle'});await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('hierarchy');await expect(page.getByLabel('Location order',{exact:true})).toHaveValue('items')
  let failedOnce=false;await page.route('**/api/care/view',route=>{if(route.request().method()==='POST'&&!failedOnce){failedOnce=true;return route.abort('failed')}return route.continue()})
  await page.getByLabel('View settings',{exact:true}).click();await page.getByLabel('Grouping',{exact:true}).selectOption('flat');await expect(page.getByRole('button',{name:'Retry saving view'})).toBeVisible();await page.getByRole('button',{name:'Retry saving view'}).click();await expect(page.getByText('View saved.',{exact:true})).toBeVisible()
  for(const name of ['Bulk care by location','Sync care schedules','Weekly checklist']){
   await page.getByRole('link',{name,exact:true}).click();await page.waitForLoadState('networkidle')
   await expect(page.getByRole('link',{name:/^Care queue$/i})).toHaveAttribute('href',/grouping=flat&locationSort=items/)
   await page.getByRole('link',{name:/^Care queue$/i}).click();await page.waitForLoadState('networkidle');await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('flat')
  }
  await page.locator('#care-forecast').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/forecast.png`});await page.evaluate(()=>scrollTo(0,0))
  const workflow=page.locator('[data-care-workflow]');await workflow.locator('summary').click();await expect(workflow.getByRole('button',{name:'Start workflow',exact:true})).toBeVisible();await page.screenshot({path:`${out}/workflow.png`})
  const guest=await browser.newContext();assert.notEqual((await guest.request.post(base+'/api/care/view',{headers:{Origin:base},data:{collectionSlug:f.slug,action:'reset'}})).status(),200);await guest.close()
  assert.equal((await context.request.post(base+'/api/care/view',{headers:{Origin:'https://unrelated.test'},data:{collectionSlug:f.slug,action:'reset'}})).status(),403)
  assert.equal(await db.plantCareEvent.count({where:{collectionId:f.collectionId}}),0)
  await workflow.locator('summary').click()
  const careCount=await page.locator('[data-care-key]:visible').count()
  await page.locator('[data-care-key]').first().getByRole('button',{name:'Complete',exact:true}).filter({visible:true}).click()
  await expect.poll(()=>db.plantCareEvent.count({where:{collectionId:f.collectionId}})).toBe(1)
  await expect(page.getByLabel('Grouping',{exact:true})).toHaveValue('flat')
  await expect(page.locator('[data-care-key]:visible')).toHaveCount(careCount-1)
 }
 await writeFile(`${out}/results.json`,JSON.stringify({phase,measurements,browserErrors:errors},null,2));assert.deepEqual(errors,[])
 await context.close();console.log(`Care view ${phase}: responsive screenshots and ${phase==='after'?'layout, scoped preferences, saved default, URL override, transient filters and origin/access checks':'baseline measurements'} passed.`)
}finally{await browser.close();await db.$disconnect()}
