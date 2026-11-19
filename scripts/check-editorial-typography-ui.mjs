// Explicitly isolated fixtures; never run against a production database/server.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {PrismaClient} from '@prisma/client'
import {chromium,expect} from '@playwright/test'
const url=new URL(process.env.DATABASE_URL||'')
assert(url.hostname==='localhost'&&url.port==='55442'&&url.pathname==='/axildb_typography')
const phase=process.env.EDITORIAL_PHASE||'after',base='http://localhost:3107',out=`/tmp/axildb-editorial-${phase}`
assert(['before','after'].includes(phase));await mkdir(out,{recursive:true})
const f=JSON.parse(await readFile('/tmp/axildb-typography-fixtures.json','utf8')),db=new PrismaClient()
let hybrid=await db.plantDefinition.findFirst({where:{collectionId:f.collectionId,genus:'Hoya',species:'fungii x Hoya pubicalyx'}})
if(!hybrid){hybrid=await db.plantDefinition.create({data:{collectionId:f.collectionId,genus:'Hoya',species:'fungii x Hoya pubicalyx',cultivarName:"N'Joy's Long Botanical Form",description:'Apply 1/2 strength every 7-10 days. Researching...',husbandryGuide:{create:{wateringCadence:'18-24°C; 50-70% humidity; 150 umol/m2/s.',fertilizationType:'CO2 and NO3-',summaryCare:'Apply 1/2 strength every 7-10 days.'}},careCadences:{create:{activity:'WATERING',interval:1,unit:'DAY'}}}})
 const plant=await db.plantInstance.create({data:{collectionId:f.collectionId,plantDefinitionId:hybrid.id,plantId:'HYBRID-EDITORIAL-003',instanceType:'ACQUIRED'}})
 await db.plantCareEvent.create({data:{collectionId:f.collectionId,plantInstanceId:plant.id,eventType:'WATERED',performedAt:new Date(Date.now()-14*86400000)}})
 await db.collectionExhibitPlant.create({data:{exhibitId:(await db.collectionExhibit.findUniqueOrThrow({where:{slug:f.exhibitSlug}})).id,plantInstanceId:plant.id}})
 await db.plantDefinition.createMany({data:Array.from({length:200},(_,i)=>({collectionId:f.collectionId,genus:'Hoya',species:'carnosa',cultivarName:`Editorial Review ${i+1}`,description:'Measured at 25°C. Water every 7-10 days.'}))})
}
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],results=[]
try{
 const context=await browser.newContext();await context.addCookies([{name:'axildb_session',value:f.token,url:base}])
 await context.route('**/*',r=>r.request().url().startsWith(base)||r.request().url().startsWith('data:')?r.continue():r.abort())
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 const routes=[['dashboard','/c/typography-review'],['definitions','/c/typography-review/plants'],['editor',`/c/typography-review/plants/${hybrid.id}/edit`],['instance',`/c/typography-review/instances/${f.plantId}`],['care','/c/typography-review/care'],['husbandry',`/c/typography-review/plants/${hybrid.id}/husbandry`],['repotting','/c/typography-review/care/repotting'],['gallery','/c/typography-review/gallery'],['curator','/server/ai-curator'],['server','/server'],['deployment','/server/application-updates'],['splash','/splash'],['public',`/exhibit/${f.exhibitSlug}`],['labels','/c/typography-review/labels']]
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000})
  await page.addInitScript(theme=>localStorage.setItem('axildb-theme',theme),theme)
  for(const [id,path]of routes){const start=Date.now();const response=await page.goto(base+path);assert(response?.status()<400,`${id} status`);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready)
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
   // Existing wide data tables on server/deployment pages have their own scrolling contract.
   if(!['server','deployment'].includes(id))assert(!overflow,`${id} ${width} overflow`)
   const fullPage=await page.evaluate(()=>document.documentElement.scrollHeight<14000)
   await page.screenshot({path:`${out}/${id}-${theme}-${width}.jpg`,type:'jpeg',quality:65,fullPage})
   results.push({id,theme,width,durationMs:Date.now()-start,overflow,capture:fullPage?'full page':'viewport; large collection'})
   if(phase==='after'&&id==='editor'){
    const title=page.locator('h1').first();await expect(title).toContainText('Hoya fungii × Hoya pubicalyx')
    assert.equal(await title.locator('i').first().evaluate(e=>getComputedStyle(e).fontStyle),'italic')
    const cultivar=title.locator('.not-italic').filter({hasText:'‘N’Joy’s Long Botanical Form’'}).first();assert.equal(await cultivar.evaluate(e=>getComputedStyle(e).fontStyle),'normal')
    await expect(page.locator('input[name="species"]').first()).toHaveValue('fungii x Hoya pubicalyx')
   }
   if(phase==='after'&&id==='husbandry'){await expect(page.locator('main')).toContainText('18–24 °C');await expect(page.locator('main')).toContainText('μmol·m⁻²·s⁻¹');await expect(page.locator('main')).toContainText('CO₂ and NO₃⁻')}
  }
  console.log(`${phase}: ${theme} ${width} reviewed`)
 }
 if(phase==='after'){
  await page.setViewportSize({width:820,height:1000});await page.goto(`${base}/c/typography-review/plants/${hybrid.id}/husbandry`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/husbandry-tablet.jpg`,type:'jpeg',quality:75,fullPage:true})
  await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200% text scaling');await page.screenshot({path:`${out}/text-scaling.jpg`,type:'jpeg',quality:75,fullPage:true})
  const plant=await db.plantInstance.findFirstOrThrow({where:{collectionId:f.collectionId,plantDefinitionId:hybrid.id}})
  for(const format of ['fixed','sheet','brother-dk-2210'])for(const orientation of ['portrait','landscape']){const r=await context.request.get(`${base}/api/labels/bulk?collection=typography-review&target=plants&id=plant:${plant.id}&format=${format}&orientation=${orientation}&download=1`);assert.equal(r.status(),200);await writeFile(`${out}/hybrid-${format}-${orientation}.pdf`,await r.body())}
  const stored=await db.plantDefinition.findUniqueOrThrow({where:{id:hybrid.id},include:{husbandryGuide:true}});assert.equal(stored.species,'fungii x Hoya pubicalyx');assert.equal(stored.description,'Apply 1/2 strength every 7-10 days. Researching...');assert.equal(stored.husbandryGuide.wateringCadence,'18-24°C; 50-70% humidity; 150 umol/m2/s.')
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({phase,collectionDefinitions:await db.plantDefinition.count({where:{collectionId:f.collectionId}}),routes:results,errors},null,2));console.log(`Editorial ${phase}: ${results.length} real route/theme/viewport captures, no client errors.`)
}finally{await browser.close();await db.$disconnect()}
