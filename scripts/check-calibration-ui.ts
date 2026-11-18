import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'
import { queueCalibration, runCalibrationJob } from '../lib/cadence-calibration'
async function main(){
const databaseUrl=new URL(process.env.DATABASE_URL || '');assert.ok(['localhost','127.0.0.1'].includes(databaseUrl.hostname) && databaseUrl.pathname==='/axildb_calibration_test','Use the disposable calibration test database.')
const db=new PrismaClient(),baseURL='http://localhost:3107',now=new Date()
const browser=await chromium.launch({channel:'chrome',headless:true})
const user=await db.user.create({data:{email:`cal-ui-${randomUUID()}@example.test`,passwordHash:'fixture',role:'SERVER_ADMIN',emailVerifiedAt:now,twoFactor:{create:{enabledAt:now,secretCiphertext:'fixture'}}}})
const c=await db.collection.create({data:{name:'Observed care UI',slug:`cal-ui-${randomUUID()}`,aiFeaturesEnabled:true,aiCuratorEnabled:true}})
try {
 await db.collectionMembership.create({data:{collectionId:c.id,userId:user.id,role:'MANAGER',status:'ACTIVE'}})
 const token=randomBytes(32).toString('hex')
 await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000),twoFactorVerifiedAt:now}})
 const d=await db.plantDefinition.create({data:{collectionId:c.id,genus:'Hoya',species:'carnosa'}})
 await db.plantDefinitionCareCadence.create({data:{plantDefinitionId:d.id,activity:'WATERING',interval:7,unit:'DAY'}})
 const plant=await db.plantInstance.create({data:{collectionId:c.id,plantDefinitionId:d.id,plantId:'OBSERVED-HOYA',instanceType:'ACQUIRED',acquisitionDate:new Date(now.getTime()-300*86400000)}})
 await db.plantCareEvent.createMany({data:Array.from({length:10},(_,i)=>({collectionId:c.id,plantInstanceId:plant.id,eventType:'WATERED',performedAt:new Date(now.getTime()-(140-i*14)*86400000)}))})
 await db.aiCuratorSettings.upsert({where:{id:'global'},create:{id:'global'},update:{}})
 const job=await queueCalibration(db,{collectionId:c.id,definitionId:d.id,activity:'WATERING',manual:true})
 await db.aiCuratorJob.update({where:{id:job!.id},data:{status:'RUNNING',claimedBy:'ui'}})
 await runCalibrationJob(db,{...job!,claimedBy:'ui'})
 const context=await browser.newContext();await context.addCookies([{name:'axildb_session',value:token,url:baseURL}])
 const page=await context.newPage();page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${baseURL}/c/${c.slug}/plants/${d.id}/edit`)
 const cadenceModule=page.locator('#care-cadences')
 await cadenceModule.getByText(/Observed: 14.0 days/).waitFor()
 await cadenceModule.getByText('Observed care and cadence calibration',{exact:true}).click()
 await cadenceModule.getByText(/9 completed intervals/).waitFor()
 for(const width of [390,1280]) {await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await cadenceModule.screenshot({path:'/tmp/axildb-calibration-summary.png'})
 const api=await context.request.get(`${baseURL}/api/care/calibration?collectionSlug=${c.slug}&definitionId=${d.id}`)
 assert.equal(api.status(),200)
 const anon=await browser.newContext()
 assert.ok([401,403].includes((await anon.request.get(`${baseURL}/api/care/calibration?collectionSlug=${c.slug}&definitionId=${d.id}`)).status()))
 await page.goto(`${baseURL}/server/care-cadence-research?tab=review&collection=${c.slug}&source=CADENCE_CALIBRATION`)
 await page.getByText('Cadence calibration',{exact:true}).waitFor()
 await page.getByText(/heuristic confidence/).waitFor()
 await page.getByLabel('Approved interval',{exact:true}).fill('12')
 await page.getByRole('button',{name:'Approve',exact:true}).click()
 await expect.poll(async()=> (await db.plantDefinitionCareCadence.findFirstOrThrow({where:{plantDefinitionId:d.id,activity:'WATERING'}})).interval).toBe(12)
 assert.equal((await db.plantDefinitionCareCadence.findFirstOrThrow({where:{plantDefinitionId:d.id,activity:'WATERING'}})).interval,12)
 await page.goto(`${baseURL}/server/ai-curator`)
 await page.getByText('Cadence calibration · outcomes and priority research',{exact:true}).waitFor()
 await page.getByText('Cadence calibration policy',{exact:true}).click()
 await page.getByLabel('Calibration policy JSON').waitFor()
 assert.deepEqual(errors,[])
 console.log('Calibration browser: compact observed tiles/details, evidence review, modified human approval, admin controls, authenticated/private statistics, no client exceptions and desktop/mobile layout passed.')
}finally{await browser.close();await db.collection.delete({where:{id:c.id}});await db.user.delete({where:{id:user.id}});await db.$disconnect()}

}
main().catch(e=>{console.error(e);process.exitCode=1})
