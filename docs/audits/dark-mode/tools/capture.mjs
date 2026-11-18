import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const root='docs/audits/dark-mode', base='http://localhost:3107',fixture=JSON.parse(await readFile('/tmp/axildb-dark-audit-context.json','utf8'))
const pages=execFileSync('rg',['--files','app'],{encoding:'utf8'}).split('\n').filter(f=>f.endsWith('/page.tsx')).sort()
const globals=new Set(['account','account/security','collections','collections/new','login','register','two-factor','forgot-password','reset-password','verify-email','privacy','terms','splash','collection-access','exhibit-subscription/confirm','exhibit-subscription/unsubscribe'])
const auth=new Set(['login','register','two-factor','forgot-password','reset-password','verify-email','collection-access','exhibit-subscription/confirm','exhibit-subscription/unsubscribe'])
function resolve(source){
 let route=source.slice(4,-9).replace(/\/$/,'')
 const pattern='/'+route
 const ids={
  'plants/[id]':fixture.definition,'instances/[id]':fixture.plant,'locations/[id]':fixture.location,'propagations/[id]':fixture.propagation,'sports/[id]':fixture.sport,'labels/[id]':fixture.plant,
  'workflows/templates/[id]':fixture.template,'workflows/runs/[id]':fixture.run,'care-sheets/[id]':fixture.sheet,'exhibits/[id]':fixture.exhibit,'treatments/plans/[id]':fixture.plan,
  'server/validated-definitions/[id]':fixture.validated,'server/incidents/[id]':fixture.incident,'activity/[id]':fixture.event,'server/events/[id]':fixture.event,
 }
 for(const[prefix,id]of Object.entries(ids))if(route.startsWith(prefix))route=route.replace(prefix,prefix.replace('[id]',id))
 route=route.replace('care-sheet/[token]',`care-sheet/${fixture.sheetToken}`).replace('sitter/[token]',`sitter/${fixture.sheetToken}`).replace('exhibit/[slug]',`exhibit/${fixture.exhibitSlug}`)
 let missing=route.includes('['),url=(route.startsWith('server/')||route==='server'||globals.has(route)||route.startsWith('exhibit/')||route.startsWith('care-sheet/')||route.startsWith('sitter/'))?'/'+route:`/c/${fixture.slug}${route?'/'+route:''}`
 if(route==='care/quiet-day-review')url+='?draft='+encodeURIComponent(JSON.stringify({kind:'set',date:new Date(Date.now()+2*86400000).toISOString().slice(0,10)}))
 return {source,pattern,url,missing,role:auth.has(route)?'anonymous':route.startsWith('exhibit/')?'public':route.startsWith('server')?'server administrator':'collection manager',area:pattern.split('/')[1]||'dashboard'}
}
export async function inspectPage(page){return page.evaluate(()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true})
 function rgba(color){ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const d=ctx.getImageData(0,0,1,1).data;return[d[0],d[1],d[2],d[3]/255]}
 const over=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return[0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/(alpha||1)).concat(alpha)}
 const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
 const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05)
 const selector=el=>el.id?`#${CSS.escape(el.id)}`:el.tagName.toLowerCase()+(el.classList.length?'.'+[...el.classList].slice(0,3).map(CSS.escape).join('.'):'')
 const checks=[]
 for(const el of document.querySelectorAll('main *')){
  const style=getComputedStyle(el),rect=el.getBoundingClientRect(),text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()
  if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||!text||text.length>220||rect.width<2||rect.height<2||style.visibility==='hidden'||style.display==='none')continue
  const chain=[];let at=el,uncertain=[],inactive=Boolean(el.closest('[disabled],[aria-disabled="true"]'))
  while(at){const s=getComputedStyle(at),bg=rgba(s.backgroundColor);chain.push(bg);if(Number(s.opacity)<1)uncertain.push('group opacity');if(s.backgroundImage!=='none')uncertain.push('image or gradient');if(bg[3]>=.999)break;at=at.parentElement}
  if(!at)uncertain.push('root gradient/canvas estimate')
  let background=rgba(getComputedStyle(document.documentElement).getPropertyValue('--ax-bg').trim()||'#0f160f')
  for(const bg of chain.reverse())background=over(bg,background)
  const foreground=over(rgba(style.color),background),ratio=contrast(foreground,background),large=parseFloat(style.fontSize)>=24 || parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700,minimum=large?3:4.5
  checks.push({selector:selector(el),tag:el.tagName,text:text.slice(0,160),foreground:style.color,effectiveBackground:background.slice(0,3).map(Math.round),ratio:Number(ratio.toFixed(2)),minimum,passes:ratio>=minimum,inactive,uncertainty:[...new Set(uncertain)],rect:{x:Math.round(rect.x+scrollX),y:Math.round(rect.y+scrollY),width:Math.round(rect.width),height:Math.round(rect.height)}})
  if(checks.length>=550)break
 }
 const surfaces=[...document.querySelectorAll('main [class]')].filter(el=>el.getBoundingClientRect().height>20 && !['svg','path'].includes(el.tagName.toLowerCase())).map(el=>({selector:selector(el),background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color,label:el.textContent.trim().slice(0,90)})).filter(s=>!['rgba(0, 0, 0, 0)','rgb(0, 0, 0)'].includes(s.background)).slice(0,100)
 return{heading:document.querySelector('main h1,main h2')?.textContent||'',theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,checks,surfaces}
})}
async function sanitize(page){await page.evaluate(()=>{
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT)
 while(walker.nextNode()){const n=walker.currentNode;if(n.parentElement?.closest('script,style'))continue;n.textContent=n.textContent.replace(/\/Users\/[^\s<>]+/g,'[local fixture path]').replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[local fixture database]').replace(/(?:192\.168\.|10\.)\d+\.\d+(?:\.\d+)?/g,'[private fixture address]')}
})}
async function run(){
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({colorScheme:'dark',viewport:{width:1440,height:900}}),anon=await browser.newContext({colorScheme:'dark',viewport:{width:1440,height:900}})
await context.addCookies([{name:'axildb_session',value:fixture.token,url:base}])
if(fixture.challengeToken)await anon.addCookies([{name:'axildb_2fa',value:fixture.challengeToken,url:base}])
const blocked=[]
for(const c of[context,anon]){
 await c.addInitScript(()=>{localStorage.setItem('axildb-theme','dark')})
 await c.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());if(!['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol.startsWith('http')){blocked.push({kind:'external',host:'external asset blocked'});return route.abort()}
  if(!['GET','HEAD'].includes(req.method())){let input;try{input=req.postDataJSON()}catch{}if(url.pathname==='/api/care/forecast'&&input?.operation==='preview')return route.continue();blocked.push({kind:'mutation',path:url.pathname});return route.abort()}
  return route.continue()
 })
}
let previous;try{previous=JSON.parse(await readFile(`${root}/coverage.raw.json`,'utf8'))}catch{}
const coverage=previous?.routes || []
try{
 for(const source of pages){
  if(coverage.some(entry=>entry.source===source))continue
  const entry=resolve(source);entry.id=entry.pattern==='/'?'dashboard':entry.pattern.slice(1).replaceAll('/','-').replaceAll('[','').replaceAll(']','');entry.states=['default'];entry.issues=[]
  if(entry.missing){entry.auditStatus='Not reviewed — requires specific data';entry.reason='No matching validated global definition fixture; source inspected.';coverage.push(entry);continue}
  const page=await(entry.role==='anonymous'||entry.role==='public'?anon:context).newPage();page.setDefaultTimeout(8000)
  try{
   const response=await page.goto(base+entry.url,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForLoadState('networkidle',{timeout:3000}).catch(()=>{});await page.evaluate(()=>document.fonts.ready)
   await sanitize(page);entry.httpStatus=response?.status();entry.redirected=new URL(page.url()).pathname!==new URL(base+entry.url).pathname
   entry.actualPath=new URL(page.url()).pathname.replace(/cm[a-z0-9]+/g,'[fixture-id]');entry.desktop=await inspectPage(page)
   const name=`${entry.id}.desktop.dark.current.jpg`;await page.screenshot({path:`${root}/screenshots/current/${name}`,fullPage:true,type:'jpeg',quality:65,timeout:15000});entry.desktopScreenshot=`screenshots/current/${name}`
   await page.setViewportSize({width:390,height:844});await sanitize(page);entry.mobile=await inspectPage(page)
   const mobileName=`${entry.id}.mobile.dark.current.jpg`;await page.screenshot({path:`${root}/screenshots/current/${mobileName}`,fullPage:true,type:'jpeg',quality:65,timeout:15000});entry.mobileScreenshot=`screenshots/current/${mobileName}`
   entry.auditStatus=entry.redirected||entry.httpStatus>=400?'Partially reviewed':'Reviewed — initial state captured'
   if(entry.redirected)entry.reason='Redirect/permission/challenge state captured; requested interior is not counted as reviewed.'
   if(entry.httpStatus>=400)entry.reason='Error/permission/not-found response captured, not a successful interior review.'
   if(entry.desktop.theme==='light')entry.themePolicy='Intentional light/print surface; not automatically a dark-mode defect.'
  }catch(error){entry.auditStatus='Not reviewed — unavailable';entry.reason=error.message.slice(0,220)}finally{await page.close()}
  coverage.push(entry);await writeFile(`${root}/coverage.raw.json`,JSON.stringify({sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),version:'0.2.0',capturedAt:new Date().toISOString(),routes:coverage,blockedRequests:blocked},null,2));console.log(`${coverage.length}/${pages.length} ${entry.pattern} ${entry.auditStatus}`)
 }
}finally{await browser.close()}

}
if(process.argv[1]?.endsWith('capture.mjs'))await run()
