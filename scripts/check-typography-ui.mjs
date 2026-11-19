// Run only against an explicitly configured disposable local database and localhost app.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { chromium, expect } from '@playwright/test'
const database = new URL(process.env.DATABASE_URL || '')
assert(database.hostname === 'localhost' && database.port === '55442' && database.pathname === '/axildb_typography', 'Disposable typography database only')
const base = 'http://localhost:3107', statePath = '/tmp/axildb-typography-fixtures.json'
const phase = process.env.TYPOGRAPHY_PHASE || 'after'
assert(['before','after'].includes(phase))
const out = process.env.TYPOGRAPHY_ARTIFACTS || '/tmp/axildb-typography-review'
await mkdir(out, { recursive: true })
const db = new PrismaClient()
let f
try { f = JSON.parse(await readFile(statePath, 'utf8')) } catch {
 const user = await db.user.create({ data: { email: 'typography@example.test', passwordHash: 'fixture-only', role: 'SERVER_ADMIN', emailVerifiedAt: new Date(), twoFactor: { create: { enabledAt: new Date(), secretCiphertext: 'fixture-only' } } } })
 const collection = await db.collection.create({ data: { name: 'Typography Review', slug: 'typography-review' } })
 await db.collectionMembership.create({ data: { collectionId: collection.id, userId: user.id, role: 'MANAGER', status: 'ACTIVE' } })
 const token = randomBytes(32).toString('hex')
 await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now()+86400000), twoFactorVerifiedAt: new Date() } })
 const definition = await db.plantDefinition.create({ data: { collectionId: collection.id, genus: 'Epipremnum', species: 'aureum', cultivarName: "N'Joy", description: 'The guide says, "Bright indirect light". It\'s growing well.', notes: "The plant's original record.", husbandryGuide: { create: { summaryCare: "Don't let the substrate stay wet.", wateringCadence: "Water when it's partly dry." } }, careCadences: { create: { activity: 'WATERING', interval: 7, unit: 'DAY' } } } })
 const type = await db.locationType.create({ data: { collectionId: collection.id, name: 'Room', abbreviation: 'RM' } })
 const location = await db.location.create({ data: { collectionId: collection.id, locationTypeId: type.id, name: "Damon's shelf", code: 'TYPO' } })
 const plant = await db.plantInstance.create({ data: { collectionId: collection.id, plantDefinitionId: definition.id, currentLocationId: location.id, plantId: 'TYPO-TEST-001', instanceType: 'ACQUIRED' } })
 await db.plantCareEvent.create({ data: { collectionId: collection.id, plantInstanceId: plant.id, eventType: 'WATERED', performedAt: new Date(Date.now()-14*86400000) } })
 f = { userId: user.id, token, collectionId: collection.id, definitionId: definition.id, plantId: plant.id }
 await writeFile(statePath, JSON.stringify(f), { mode: 0o600 })
}
if (phase === 'after' && !f.sheetId) {
 const sheet = await db.careSheet.create({ data: { collectionId:f.collectionId, createdById:f.userId, title:"Today's Care Sheet", status:'ACTIVE', sections:['water','light'], settings:{customInstructions:'Select "Water". Keep the 12″ pot on the 6′ shelf.'}, plants:{create:{collectionId:f.collectionId,plantInstanceId:f.plantId}} } })
 const longDefinition = await db.plantDefinition.create({ data:{ collectionId:f.collectionId,genus:'Hoya',species:'carnosa',cultivarName:"Marble Queen Variegata 12″" } })
 const longPlant = await db.plantInstance.create({data:{collectionId:f.collectionId,plantDefinitionId:longDefinition.id,plantId:'TYPO-LONG-002',instanceType:'ACQUIRED'}})
 await db.aiCuratorSuggestion.create({data:{collectionId:f.collectionId,plantDefinitionId:f.definitionId,phase:'ENRICHMENT',suggestionType:'HUSBANDRY',targetField:'husbandry',title:"Today's husbandry proposal",currentValue:{fields:{wateringCadence:null}},suggestedValue:{fields:{wateringCadence:"Water when it's partly dry."}},reasoning:'The guide states, "Don\'t overwater".',confidence:0.94}})
 Object.assign(f,{sheetId:sheet.id,longPlantId:longPlant.id})
 await writeFile(statePath,JSON.stringify(f),{mode:0o600})
}
if (phase === 'after' && !f.exhibitSlug) {
 await db.plantDefinition.update({where:{id:f.definitionId},data:{acquisitionStatus:'WISHLIST'}})
 const exhibit = await db.collectionExhibit.create({data:{collectionId:f.collectionId,title:'Botanical Typography',slug:'typography-exhibit',status:'PUBLISHED',accessMode:'PUBLIC',introMarkdown:'The guide says, "Bright indirect light". It is the plant\'s preferred spot.',plants:{create:{plantInstanceId:f.plantId}}}})
 f.exhibitSlug=exhibit.slug
 await writeFile(statePath,JSON.stringify(f),{mode:0o600})
}
if (phase === 'after') await db.plantDefinition.update({where:{id:f.definitionId},data:{desiredSpecimenSize:'3" pot'}})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = [], errors = []
try {
 const context = await browser.newContext()
 await context.addCookies([{ name: 'axildb_session', value: f.token, url: base }])
 await context.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort())
 const page = await context.newPage()
 page.on('pageerror', error => errors.push(error.message))
 for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(base+'/c/typography-review/care')
  await page.evaluate(theme => { localStorage.setItem('axildb-theme',theme); document.documentElement.dataset.theme=theme }, theme)
  await page.reload(); await page.waitForLoadState('networkidle'); await page.evaluate(()=>document.fonts.ready)
  await expect(page.getByRole('heading', { name: phase==='after' ? 'Today’s Care' : "Today's Care", exact:true })).toBeVisible()
  const text = await page.locator('main').innerText()
  assert(text.includes(phase==='after' ? 'Epipremnum aureum ‘N’Joy’' : "Epipremnum aureum 'N'Joy'"))
  assert(text.includes("Damon's shelf"), 'User-controlled location names remain exact')
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'No horizontal overflow')
  await page.screenshot({ path: `${out}/care-${theme}-${width}-${phase}.jpg`, type:'jpeg', quality:82, fullPage:await page.evaluate(()=>document.documentElement.scrollHeight<14000) })
  results.push({ surface:'care', theme, width })
 }
 await page.setViewportSize({ width:1440,height:1000 })
 for (const [name, route] of [['definitions','/c/typography-review/plants'],['instance',`/c/typography-review/instances/${f.plantId}`],['editor',`/c/typography-review/plants/${f.definitionId}/edit`],['splash','/splash'],['labels','/c/typography-review/labels']]) {
  await page.goto(base+route); await page.waitForLoadState('networkidle'); await page.evaluate(()=>document.fonts.ready)
  if (name==='editor') {
   const cultivar = page.locator('input[name="cultivarName"]').first()
   await expect(cultivar).toHaveValue("N'Joy")
   if(phase==='after') {
    await cultivar.fill("N'Joy's New Name")
    await expect(cultivar).toHaveValue("N'Joy's New Name")
    await expect(page.getByRole('heading',{name:'Epipremnum aureum ‘N’Joy’s New Name’',exact:true})).toBeVisible()
    await cultivar.fill("N'Joy")
   }
  }
  await page.screenshot({ path:`${out}/${name}-${phase}.jpg`,type:'jpeg',quality:80,fullPage:await page.evaluate(()=>document.documentElement.scrollHeight<14000) })
  results.push({surface:name})
 }
 if (phase==='after') {
  await page.goto(base+'/c/typography-review/wishlist')
  await expect(page.locator('main')).toContainText('Size: 3″ pot')
  const sizeOption=page.locator('select[name="size"] option').filter({hasText:'3″ pot'})
  await expect(sizeOption).toHaveAttribute('value','3" pot')
  const wishCsv=await context.request.get(base+'/api/exports/wishlist?collection=typography-review&format=csv')
  assert.equal(wishCsv.status(),200)
  assert((await wishCsv.text()).includes('3"" pot'),'CSV preserves ASCII measurement markers')
  const preview = await context.request.get(`${base}/api/plant-preview?collection=typography-review&plant=${f.plantId}`)
  assert.equal(preview.status(),200)
  const previewData=await preview.json()
  assert.equal(previewData.displayName,'Epipremnum aureum ‘N’Joy’')
  assert.equal(previewData.botanicalName,"Epipremnum aureum 'N'Joy'")
  await page.goto(`${base}/c/typography-review/graphs?root=${f.plantId}`)
  await expect(page.locator('.react-flow__node').first()).toContainText('Epipremnum aureum ‘N’Joy’')
  for(const [file,url] of [['wishlist.pdf','/api/exports/wishlist?collection=typography-review&format=pdf'],['exhibit.pdf',`/api/exhibits/${f.exhibitSlug}/pdf`]]) {
   const response=await context.request.get(base+url);assert.equal(response.status(),200);await writeFile(`${out}/${file}`,await response.body())
  }
  await page.goto(`${base}/exhibit/${f.exhibitSlug}`)
  await expect(page.locator('main')).toContainText('Epipremnum aureum ‘N’Joy’')
  await expect(page.locator('main')).toContainText('The guide says, “Bright indirect light”. It is the plant’s preferred spot.')
  await page.screenshot({path:`${out}/public-exhibit-after.jpg`,type:'jpeg',quality:80,fullPage:await page.evaluate(()=>document.documentElement.scrollHeight<14000)})
  results.push({surface:'public-exhibit'})
  await page.goto(base+'/server/ai-curator')
  await expect(page.locator('main')).toContainText('Today’s husbandry proposal')
  await expect(page.locator('main')).toContainText('The guide states, “Don’t overwater”.')
  await expect(page.locator('textarea[name="suggestedValueJson"]').first()).toHaveValue(/Water when it's partly dry/)
  await page.screenshot({path:`${out}/curator-after.jpg`,type:'jpeg',quality:80,fullPage:await page.evaluate(()=>document.documentElement.scrollHeight<14000)})
  results.push({surface:'curator'})
  const csv = await context.request.get(`${base}/api/exports/plant-definitions?collectionSlug=typography-review`)
  assert.equal(csv.status(),200)
  assert((await csv.text()).includes("Epipremnum aureum 'N'Joy'"), 'CSV canonical botanical name stays ASCII')
  assert((await csv.text()).includes("It's growing well."), 'CSV description stays unchanged')
  const carePdf = await context.request.get(`${base}/api/care-sheets/${f.sheetId}/pdf`)
  assert.equal(carePdf.status(),200)
  await writeFile(`${out}/care-sheet.pdf`,await carePdf.body())
  for (const q of ["Epipremnum aureum 'N'Joy'", 'Epipremnum aureum ‘N’Joy’']) {
   await page.goto(base+'/c/typography-review/search?q='+encodeURIComponent(q))
   await expect(page.locator('main')).toContainText('Epipremnum aureum ‘N’Joy’')
   await expect(page.getByRole('link',{name:'TYPO-TEST-001',exact:true}).first()).toBeVisible()
  }
  // Two quote forms locate the same stored cultivar through the definition filter.
  for (const q of ["N'Joy",'N’Joy']) {
   await page.goto(base+'/c/typography-review/plants?q='+encodeURIComponent(q))
   await expect(page.locator('main')).toContainText('Epipremnum aureum ‘N’Joy’')
  }
  for (const format of ['fixed','sheet','brother-dk-2210']) for (const orientation of ['portrait','landscape']) {
   const response = await context.request.get(`${base}/api/labels/bulk?collection=typography-review&target=plants&id=plant:${f.plantId}&format=${format}&orientation=${orientation}&download=1`)
   assert.equal(response.status(),200)
   const bytes = await response.body()
   assert.match(bytes.toString('latin1'), /\/Subtype \/Image/, 'QR image remains embedded')
   const box=bytes.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)
   assert(box,'PDF MediaBox')
   if(format==='brother-dk-2210') assert(Math.abs(Number(box[orientation==='portrait'?1:2])-82.285714)<0.001,'Brother tape width')
   if(format==='sheet') assert.deepEqual(box.slice(1).map(Number),orientation==='portrait'?[612,792]:[792,612])
   if(format==='fixed') assert.match(bytes.toString('latin1'), orientation==='portrait'?/\/MediaBox \[0 0 90 162\]/:/\/MediaBox \[0 0 162 90\]/)
   await writeFile(`${out}/labels-${format}-${orientation}.pdf`,bytes)
  }
  for (const format of ['fixed','sheet','brother-dk-2210']) for (const orientation of ['portrait','landscape']) {
   const response=await context.request.get(`${base}/api/labels/bulk?collection=typography-review&target=plants&id=plant:${f.longPlantId}&format=${format}&orientation=${orientation}&download=1`)
   assert.equal(response.status(),200)
   await writeFile(`${out}/labels-long-prime-${format}-${orientation}.pdf`,await response.body())
  }
  const record = await db.plantDefinition.findUniqueOrThrow({where:{id:f.definitionId},include:{husbandryGuide:true}})
  assert.equal(record.cultivarName,"N'Joy")
  assert.equal(record.desiredSpecimenSize,'3" pot')
  assert.equal(record.description,'The guide says, "Bright indirect light". It\'s growing well.')
  assert.equal(record.husbandryGuide.wateringCadence,"Water when it's partly dry.")
  // Semantic quotes, existing font glyphs and literal spans in browser-rendered isolated content.
  await page.goto(base+'/c/typography-review/care')
  await page.locator('main').evaluate(el=>{
   const section=document.createElement('section');section.id='typography-literal-fixture';
   const q=document.createElement('q');q.textContent='Outer ';const nested=document.createElement('q');nested.textContent='inner';q.append(nested);section.append(q)
   const pre=document.createElement('pre');pre.textContent='docker compose exec app sh -c "node --version"\n{"message":"Today\'s backup"}';section.append(pre)
   const p=document.createElement('p');p.textContent='‘ ’ “ ” ′ ″';section.append(p);el.prepend(section)
  })
  assert.equal(await page.locator('#typography-literal-fixture pre').textContent(),'docker compose exec app sh -c "node --version"\n{"message":"Today\'s backup"}')
  assert.equal(await page.locator('#typography-literal-fixture q').first().evaluate(el=>getComputedStyle(el).quotes),'"“" "”" "‘" "’"')
  await page.locator('#typography-literal-fixture').screenshot({path:`${out}/semantic-and-literal-after.jpg`,type:'jpeg',quality:88})
 }
 assert.deepEqual(errors,[])
 await writeFile(`${out}/browser-${phase}.json`,JSON.stringify({phase,results,errors},null,2))
 console.log(`Typography browser ${phase}: ${results.length} route/theme/viewport captures; ${phase==='after'?'search, raw input/storage, six label formats/orientations, literal spans and semantic quotes passed.':'baseline captured.'}`)
} finally { await browser.close(); await db.$disconnect() }
