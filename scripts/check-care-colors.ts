import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { careTaskTypes } from '../lib/care-queue'
import { careCategoryPresentation, careCategoryPresentations, careFilterPresentation } from '../lib/care-category-presentation'
const css=readFileSync('app/globals.css','utf8').split('/* Shared semantic palette:')[1]
assert.ok(css)
const light=css.split(":root[data-theme='dark']")[0],dark=css.split(":root[data-theme='dark']")[1].split('}')[0]
const tokens=(text:string)=>Object.fromEntries([...text.matchAll(/--palette-([\w-]+):\s*(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]))
const palettes=[tokens(light),tokens(dark)]
export function contrast(a:string,b:string) {
 const luminance=(hex:string)=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
 const values=[luminance(a),luminance(b)].sort((a,b)=>b-a)
 return (values[0]+.05)/(values[1]+.05)
}
assert.deepEqual(Object.keys(careCategoryPresentations).sort(),[...careTaskTypes].sort())
for(const task of careTaskTypes) {
 const p=careCategoryPresentation(task)
 assert.ok(p.icon && p.label && p.category && p.color)
 assert.deepEqual(careCategoryPresentation(task),p)
 for(const palette of palettes) assert.ok(contrast(palette[`${p.color}-fg`],palette[`${p.color}-bg`])>=4.5,`${task} badge contrast in both themes`)
}
assert.equal(new Set(Object.values(careCategoryPresentations).map(p=>p.color)).size,10,'Ten intentional families; quarantine shares health.')
for(const key of ['unknown','LEGACY_CARE','__proto__','constructor','']) assert.equal(careCategoryPresentation(key).color,'stone')
assert.equal(careCategoryPresentation('LEGACY_CARE').label,'Legacy care')
assert.equal(careCategoryPresentation('legacy','Original label').label,'Original label')
for(const filter of ['today','overdue','completed','all','location']) assert.equal(careFilterPresentation(filter),null)
assert.equal(careFilterPresentation('water')?.color,'ocean')
assert.ok(css.includes('inset-inline-start: 0') && css.includes('width: 3px') && css.includes('forced-colors: active'))
console.log('Care category exhaustive mapping, unknown/prototype fallback, neutral status filters, shared identities and light/dark WCAG AA text contrast passed.')
for(const [theme,palette] of [['light',palettes[0]],['dark',palettes[1]]] as const) console.log(`${theme}: ${[...new Set(Object.values(careCategoryPresentations).map(p=>p.color))].map(color=>`${color} ${contrast(palette[`${color}-fg`],palette[`${color}-bg`]).toFixed(2)}:1`).join(', ')}`)
