import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import postcss from 'postcss'
const css=postcss.parse(await readFile('app/globals.css','utf8')),light={},dark={}
for(const rule of css.nodes){if(rule.type!=='rule')continue;const target=rule.selector===":root[data-theme='dark']"?dark:rule.selector===':root'||rule.selector.startsWith(':root,')?light:null;if(target)rule.each(d=>{if(d.type==='decl'&&d.prop.startsWith('--'))target[d.prop]=d.value})}
function lum(hex){return[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)}
function ratio(a,b){return(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05)}
const resolve=(t,k)=>{const v=t[k];assert(v,`Missing ${k}`);return v.startsWith('var(')?resolve(t,v.slice(4,-1)):v}
const baseline=JSON.parse(await readFile('docs/audits/light-mode/source-inventory.json','utf8')).tokens.dark
for(const[k,v]of Object.entries(baseline))assert.equal(dark[k],v,`Accepted dark token changed: ${k}`)
for(const t of[light,dark]){
 for(const bg of['--ax-bg','--ax-surface-solid','--ax-field'])for(const fg of['--ax-text','--ax-muted'])assert(ratio(t[fg],t[bg])>=4.5,`${fg} on ${bg}`)
 assert(ratio(t['--ax-border-strong'],t['--ax-field'])>=3,'Interactive field boundary')
 assert(ratio(t['--ax-action-text'],t['--ax-action'])>=4.5,'Primary action')
 assert(ratio(t['--ax-focus'],t['--ax-field'])>=3,'Focus indicator')
 assert(ratio(t['--ax-chart-series'],t['--ax-chart-bg'])>=3,'Meaningful chart line')
 for(const name of['warning','success'])assert(ratio(t['--ax-chart-marker-text'],t[`--ax-chart-${name}`])>=4.5,`${name} chart symbol`)
 for(const[k]of Object.entries(t).filter(([k])=>/^--palette-.*-fg$/.test(k)))assert(ratio(t[k],t[k.replace(/-fg$/,'-bg')])>=4.5,`Category/tag ${k}`)
}
const source=await readFile('components/MetricChart.tsx','utf8');assert(!/bg-\[#10170f\]|stroke="#a8d08d"|fill="#fffdf7"/.test(source),'Metric chart bypasses theme roles')
assert(css.nodes.some(n=>n.type==='atrule'&&n.params==='print'),'Print treatment retained')
console.log('Existing accepted dark tokens unchanged; light/dark body, metadata, action, field/focus boundaries, chart lines/symbols and care/tag contrast passed.')
console.log('Light field boundary:',ratio(light['--ax-border-strong'],light['--ax-field']).toFixed(2)+':1; muted card text:',ratio(light['--ax-muted'],light['--ax-surface-solid']).toFixed(2)+':1')
