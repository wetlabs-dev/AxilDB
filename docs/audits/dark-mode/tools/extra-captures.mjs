import {chromium}from'@playwright/test'
import{readFile,writeFile,readdir}from'node:fs/promises'
import{inspectPage}from'./capture.mjs'
const root='docs/audits/dark-mode',base='http://localhost:3107',f=JSON.parse(await readFile('/tmp/axildb-dark-audit-context.json','utf8'))
const common=`
:root[data-theme='dark'] body [class*='bg-[#2f6b45]']{background:var(--audit-action)!important;color:#f1f6ee!important}
:root[data-theme='dark'] .bg-neutral-50 {background:var(--ax-surface-solid)!important;color:var(--ax-text)!important}
:root[data-theme='dark'] .text-neutral-600 {color:var(--ax-muted)!important}
:root[data-theme='dark'] .bg-indigo-50 {background:#2a2d43!important;color:#c3c8f2!important}
:root[data-theme='dark'] .bg-rose-50 {background:#3c242e!important;color:#eab2c1!important}
:root[data-theme='dark'] .bg-emerald-50 {background:#233425!important;color:#b5d4ad!important}
:root[data-theme='dark'] [class*='bg-green-50']{background:#233425!important}
:root[data-theme='dark'] [class*='bg-amber-50']{background:#3c321e!important}
:root[data-theme='dark'] :is(.text-green-950,.text-green-900){color:#b5d4ad!important}
:root[data-theme='dark'] :is(.text-amber-950,.text-amber-900){color:#f0d28f!important}
:root[data-theme='dark'] #backup-storage {background:var(--ax-surface-solid)!important;color:var(--ax-text)!important}
:root[data-theme='dark'] [class*='bg-[#f7f4e8]/70'] {background:var(--audit-elevated)!important}
:root[data-theme='dark'] [class*='bg-white/35'],:root[data-theme='dark'] [class*='bg-white/40']{background:var(--ax-surface-solid)!important}
:root[data-theme='dark'] [class*='text-[#913e2d]'] {background:#3c321e!important;color:#f0d28f!important;border-color:#b8974e!important}
:root[data-theme='dark'] [class*='bg-[#6d7f6d]']{background:var(--audit-action)!important;color:#f1f6ee!important}
:root[data-theme='dark'] :is(input,textarea,select,button,a,summary):focus-visible{outline:2px solid var(--audit-focus)!important;outline-offset:3px}
`
const palettes={A:{'--audit-elevated':'#263029','--audit-action':'#315c42','--audit-focus':'#a0c69a'},B:{'--ax-bg':'#151a17','--ax-bg-soft':'#181e1a','--ax-bg-warm':'#191f1b','--ax-surface':'#202722','--ax-surface-solid':'#202722','--ax-surface-muted':'#263029','--ax-field':'#181e1a','--ax-text':'#e7ebe3','--ax-heading':'#f1f6ee','--ax-muted':'#bbc6ba','--ax-muted-strong':'#bbc6ba','--ax-border':'#39463c','--ax-border-strong':'#536457','--ax-primary':'#8ebb91','--audit-nav':'#191f1b','--audit-elevated':'#263029','--audit-action':'#315c42','--audit-focus':'#a0c69a'},C:{'--ax-bg':'#17191a','--ax-bg-soft':'#1b1d1f','--ax-bg-warm':'#202224','--ax-surface':'#232628','--ax-surface-solid':'#232628','--ax-surface-muted':'#2b3032','--ax-field':'#1b1d1f','--ax-text':'#e8e9e6','--ax-heading':'#f2f3ef','--ax-muted':'#adb4ae','--ax-muted-strong':'#c2c9c3','--ax-border':'#414946','--ax-border-strong':'#65716a','--ax-primary':'#a3c6a3','--audit-nav':'#1d2020','--audit-elevated':'#2b3032','--audit-action':'#315742','--audit-focus':'#b0d1aa'}}
const proposal=direction=>`:root[data-theme='dark']{${Object.entries(palettes[direction]).map(([k,v])=>`${k}:${v};`).join('')}}`+common+(direction==='A'?'':":root[data-theme='dark'] body{background:var(--ax-bg)!important}:root[data-theme='dark'] aside[class]{background:var(--audit-nav)!important}")
await writeFile(`${root}/assets/proposed-treatments.css`,Object.keys(palettes).map(k=>`/* PROPOSED ONLY — direction ${k}; browser-injected audit demonstration, not production CSS. */\n${proposal(k)}`).join('\n\n'))
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({bypassCSP:true,viewport:{width:1440,height:900},colorScheme:'dark'})
await context.addCookies([{name:'axildb_session',value:f.token,url:base}]);await context.addInitScript(()=>localStorage.setItem('axildb-theme','dark'))
await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(!['localhost','127.0.0.1'].includes(u.hostname)&&u.protocol.startsWith('http'))return route.abort();if(!['GET','HEAD'].includes(request.method()))return route.abort();return route.continue()})
const results=[]
async function ready(page,url){await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:25000});await page.waitForLoadState('networkidle',{timeout:2500}).catch(()=>{});await page.evaluate(()=>document.fonts.ready)}
async function record(page,id,kind,selector='main'){
 await page.waitForTimeout(400) // Settle theme/color transitions before measuring and capturing.
 const target=selector==='viewport'?page:page.locator(selector).first();if(selector!=='viewport')await target.waitFor({state:'visible',timeout:5000})
 const file=`screenshots/${kind==='light-reference'?'light-reference':kind==='proposed'?'proposed':kind==='annotated'?'annotated':'current'}/${id}.jpg`
 const measurements=await inspectPage(page)
 await target.screenshot({path:`${root}/${file}`,type:'jpeg',quality:76,...(selector==='viewport'?{fullPage:false}:{})})
 results.push({id,kind,file,selector,measurements});return results.at(-1)
}
try{
 const sample=[['dashboard',`/c/${f.slug}`,'main'],['plant-grid',`/c/${f.slug}/plants`,'main'],['definition-details',`/c/${f.slug}/plants/${f.definition}/edit`,'#care-cadences'],['care-queue',`/c/${f.slug}/care`,'main'],['server-backup','/server','#backup-storage']]
 for(const[id,url,selector]of sample){const p=await context.newPage();await ready(p,url);await record(p,`${id}.desktop.dark.current-detail`,'current',selector)
  for(const direction of['A','B','C']){const style=await p.addStyleTag({content:proposal(direction)});await record(p,`${id}.desktop.dark.proposed-${direction}`,'proposed',selector);await style.evaluate(el=>el.remove())}
  await p.evaluate(()=>document.documentElement.dataset.theme='light');await record(p,`${id}.desktop.light.reference`,'light-reference',selector)
  await p.close()
 }
 const p=await context.newPage();await ready(p,`/c/${f.slug}/plants/${f.definition}/edit`)
 await p.getByRole('button',{name:'Edit all care cadences',exact:true}).click();await p.getByRole('dialog').waitFor();await record(p,'cadence-dialog.desktop.dark.current','current','viewport')
 for(const direction of['A','B','C']){const style=await p.addStyleTag({content:proposal(direction)});await record(p,`cadence-dialog.desktop.dark.proposed-${direction}`,'proposed','viewport');await style.evaluate(el=>el.remove())}
 await p.setViewportSize({width:390,height:844});await record(p,'cadence-dialog.mobile.dark.current','current','viewport');const st=await p.addStyleTag({content:proposal('B')});await record(p,'cadence-dialog.mobile.dark.proposed-B','proposed','viewport');await st.evaluate(el=>el.remove());await p.close()
 const instance=await context.newPage();await ready(instance,`/c/${f.slug}/instances/${f.plant}`)
 await instance.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));await record(instance,'instance-expanded.desktop.dark.current','current','main')
 await instance.setViewportSize({width:390,height:844});await record(instance,'instance-expanded.mobile.dark.current','current','main');await instance.close()
 const loginContext=await browser.newContext({bypassCSP:true,viewport:{width:1440,height:900},colorScheme:'dark'});await loginContext.addInitScript(()=>localStorage.setItem('axildb-theme','dark'))
 const login=await loginContext.newPage();await ready(login,'/login?error=1&twoFactor=expired');await login.getByLabel('Email',{exact:true}).first().focus();await record(login,'login.keyboard-focus.dark.current','current','main')
 const focus=await login.getByLabel('Email',{exact:true}).first().evaluate(el=>{const s=getComputedStyle(el);return{outline:s.outline,boxShadow:s.boxShadow,border:s.borderColor,background:s.backgroundColor}});results.at(-1).focus=focus
 await login.addStyleTag({content:proposal('B')});await record(login,'login.keyboard-focus.dark.proposed-B','proposed','main');await login.close();await loginContext.close()
 const viewer=await browser.newContext({bypassCSP:true,viewport:{width:390,height:844},colorScheme:'dark'});await viewer.addCookies([{name:'axildb_session',value:f.viewerToken,url:base}]);await viewer.addInitScript(()=>localStorage.setItem('axildb-theme','dark'))
 const readOnly=await viewer.newPage();await ready(readOnly,`/c/${f.slug}/plants`);await record(readOnly,'plant-grid.viewer.mobile.dark.current','current','main');await viewer.close()
 const cssFiles=(await readdir('.next/static/css')).filter(file=>file.endsWith('.css')),styles=cssFiles.map(file=>`<link rel="stylesheet" href="${base}/_next/static/css/${file}">`).join(''),components=JSON.parse(await readFile('/tmp/axildb-dark-component-fixtures.json','utf8'))
 for(const[id,markup]of Object.entries(components)){const c=await context.newPage();await c.setContent(`<!doctype html><html data-theme="dark"><head><base href="${base}/">${styles}</head><body><main style="max-width:1040px;margin:auto;padding:24px"><p class="mb-4 text-sm">ACTUAL PRODUCTION COMPONENT · ISOLATED FICTIONAL FIXTURE · no operations executed</p>${markup}</main></body></html>`,{waitUntil:'networkidle'});await c.evaluate(()=>document.fonts.ready);await record(c,`${id}.component.desktop.dark.current`,'current','main');const st=await c.addStyleTag({content:proposal('B')});await record(c,`${id}.component.desktop.dark.proposed-B`,'proposed','main');await st.evaluate(el=>el.remove());await c.setViewportSize({width:390,height:844});await record(c,`${id}.component.mobile.dark.current`,'current','main');await c.close()}
 // Findings annotations are overlays on current rendered components, never silently applied corrections.
 for(const[id,url,selector]of [['backup-storage','/server','#backup-storage'],['activity-chips',`/c/${f.slug}`,'main'],['ai-review','/server/ai-curator','main'],['instance-surfaces',`/c/${f.slug}/instances/${f.plant}`,'main'],['care-overdue',`/c/${f.slug}/care`,'main']]){
  const a=await context.newPage();await ready(a,url);if(id==='instance-surfaces')await a.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true))
  await a.locator(selector).first().evaluate((el,id)=>{el.style.outline='3px solid #f5bd67';el.style.outlineOffset='-3px';const label=document.createElement('div');label.textContent=`AUDIT CALLOUT · ${id} · CURRENT APPEARANCE`;label.style.cssText='background:#1b251e;color:#f5ddad;font:600 14px sans-serif;padding:8px;border:2px solid #f5bd67;position:relative;z-index:999';el.prepend(label)},id)
  await record(a,`${id}.dark.annotated`,'annotated',selector);await a.close()
 }
}finally{await writeFile(`${root}/states.raw.json`,JSON.stringify({states:results,palettes},null,2));await browser.close()}
console.log(`Captured ${results.length} conditional, component and proposed-comparison views.`)
